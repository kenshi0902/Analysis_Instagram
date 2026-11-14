/**
 * フォロワー数などを日次でスナップショット保存する。
 * フォロワー数の履歴は API から過去分を取れないため、毎日の実行で自前で蓄積する。
 */
function syncFollowers() {
  const cfg = getConfig_();
  const profile = apiGet_('/' + cfg.userId, { fields: 'followers_count,follows_count,media_count' });
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');

  const row = {
    '日付': today,
    'フォロワー数': profile.followers_count,
    'フォロー数': profile.follows_count,
    '投稿数': profile.media_count,
    '前日比': diffFromPrevious_(today, profile.followers_count),
    '種別': ACTUAL_LABEL,
    '取得日時': formatJst_(new Date().toISOString()),
  };
  const result = upsertRows_(TABLES.followers, [row]);
  console.log('フォロワー数: ' + profile.followers_count + ' (追加 ' + result.added + ' / 更新 ' + result.updated + ')');
}

const ACTUAL_LABEL = '実測';
const ESTIMATE_LABEL = '推定';

/**
 * 過去のフォロワー数を、日次の純増(API_アカウント日次)から逆算して補完する。
 * 毎日 1時台のスナップショットは「前日終了時点」の値に近いので、
 *   前日の行 = その日の行 − 前日の純増
 * を今日から遡って計算する。実測の行(種別が空または「実測」)は上書きしない。
 * 事前に syncAccountBackfill で純増を取得しておくこと。
 */
function backfillFollowers() {
  const cfg = getConfig_();
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');

  // 日付 → 純増
  const acc = openSheet_(TABLES.accountDaily);
  const net = {};
  const accLast = acc.sheet.getLastRow();
  if (accLast >= 2) {
    const dates = acc.sheet.getRange(2, acc.columns['日付'], accLast - 1, 1).getValues();
    const nets = acc.sheet.getRange(2, acc.columns['フォロワー純増'], accLast - 1, 1).getValues();
    dates.forEach(function (r, i) {
      if (nets[i][0] !== '' && !isNaN(Number(nets[i][0]))) net[keyOf_(r[0])] = Number(nets[i][0]);
    });
  }

  const netDates = Object.keys(net).sort();
  console.log('純増のある日付: ' + netDates.length + '件 (' + netDates[0] + ' 〜 ' + netDates[netDates.length - 1] + ') / 今日: ' + today);
  if (!Object.keys(net).length) {
    console.warn('API_アカウント日次に「フォロワー純増」の値がありません。先に syncAccountBackfill を実行してください。');
    return;
  }

  // 既存のフォロワー数シート: 日付 → { count, kind }
  const t = openSheet_(TABLES.followers);
  const existing = {};
  const last = t.sheet.getLastRow();
  if (last >= 2) {
    const width = t.sheet.getLastColumn();
    t.sheet.getRange(2, 1, last - 1, width).getValues().forEach(function (r) {
      const d = keyOf_(r[t.columns['日付'] - 1]);
      if (d) existing[d] = { count: r[t.columns['フォロワー数'] - 1], kind: r[t.columns['種別'] - 1] };
    });
  }

  // 起点は今日の実測値(無ければAPIで取得)
  let current = existing[today] && existing[today].count !== '' ? Number(existing[today].count) : undefined;
  if (current === undefined) {
    current = apiGet_('/' + cfg.userId, { fields: 'followers_count' }).followers_count;
  }

  const shiftDay_ = function (d, delta) {
    return Utilities.formatDate(new Date(new Date(d + 'T12:00:00+09:00').getTime() + delta * 86400000), TZ, 'yyyy-MM-dd');
  };

  const rows = [];
  const now = formatJst_(new Date().toISOString());
  let day = today;
  let count = current;
  for (;;) {
    const prevDay = shiftDay_(day, -1);
    // 直近の日は API の反映が遅れて純増が無いことがある。その分は純増0と仮定して値を引き継ぐ
    // (後日、純増が取れた時点で再実行すると正しい推定値に更新される)。
    const lagging = net[prevDay] === undefined && prevDay > netDates[netDates.length - 1];
    if (net[prevDay] === undefined && !lagging) {  // 純増が途切れた日より先は遡れない
      console.log('遡りを終了: ' + prevDay + ' の純増がありません');
      break;
    }
    const delta = lagging ? 0 : net[prevDay];
    const prevCount = count - delta;
    const e = existing[prevDay];
    const isActual = e && e.count !== '' && e.kind !== ESTIMATE_LABEL;
    if (isActual) {
      console.log(prevDay + ' は実測の行があるため推定しません(種別: "' + e.kind + '")');
      count = Number(e.count);                  // 実測があればそこから先は実測を基準にする
    } else {
      rows.push({ '日付': prevDay, 'フォロワー数': prevCount, '前日比': lagging ? undefined : delta, '種別': ESTIMATE_LABEL, '取得日時': now });
      count = prevCount;
    }
    day = prevDay;
  }
  const result = upsertRows_(TABLES.followers, rows);
  console.log('フォロワー数の補完: 追加 ' + result.added + ' / 更新 ' + result.updated + '(推定値)');
}

/** 当日より前で最も新しい日のフォロワー数との差。比較対象が無ければ undefined(書き込まない)。 */
function diffFromPrevious_(today, current) {
  const t = openSheet_(TABLES.followers);
  const last = t.sheet.getLastRow();
  if (last < 2) return undefined;
  const dateCol = t.columns['日付'];
  const countCol = t.columns['フォロワー数'];
  const dates = t.sheet.getRange(2, dateCol, last - 1, 1).getValues();
  const counts = t.sheet.getRange(2, countCol, last - 1, 1).getValues();

  let bestDate = '';
  let bestCount;
  dates.forEach(function (r, i) {
    const d = keyOf_(r[0]);
    if (d && d < today && d > bestDate && counts[i][0] !== '') {
      bestDate = d;
      bestCount = Number(counts[i][0]);
    }
  });
  return bestDate ? current - bestCount : undefined;
}
