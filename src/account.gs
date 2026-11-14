/**
 * アカウントインサイト(日次)とオーディエンス属性を取得してシートに反映する。
 * 週間・月間の集計は、ダッシュボード側で日次の値を合算して作る。
 * 日次の取得は API の制約で直近30日程度までしか遡れないため、毎日実行して蓄積する。
 */
const ACCOUNT_TOTAL_METRICS = {
  reach: 'リーチ',
  views: '閲覧数',
  accounts_engaged: 'エンゲージしたアカウント',
  total_interactions: 'インタラクション合計',
  likes: 'いいね',
  comments: 'コメント',
  saves: '保存',
  shares: 'シェア',
  replies: '返信',
  profile_views: 'プロフィール訪問',
  profile_links_taps: 'プロフィールリンクタップ',
};

const DEMOGRAPHIC_METRICS = {
  follower_demographics: 'フォロワー',
  engaged_audience_demographics: 'エンゲージしたオーディエンス',
  reached_audience_demographics: 'リーチしたオーディエンス',
};
const DEMOGRAPHIC_BREAKDOWNS = { age: '年齢層', gender: '性別', city: '都市', country: '国' };

/** 日次トリガー用。直近 days 日分(既定3日)を更新する。 */
function syncAccountDaily(days) {
  // トリガー経由ではイベントオブジェクトが渡されるため、数値のときだけ採用する
  syncAccountRange_(typeof days === 'number' ? days : 3);
}

/** 初回用。API が許す最大の30日分を取得する。 */
function syncAccountBackfill() {
  syncAccountRange_(30);
}

function syncAccountRange_(days) {
  const cfg = getConfig_();
  const now = formatJst_(new Date().toISOString());
  const rows = {};
  const base = Date.now();

  // フォロワー純増: period=day の時系列を1回で取得
  const nowSec = Math.floor(base / 1000);
  const series = {};
  try {
    const body = apiGet_('/' + cfg.userId + '/insights', {
      metric: 'follower_count', period: 'day',
      since: nowSec - days * 86400, until: nowSec,
    });
    ((body.data[0] || {}).values || []).forEach(function (v) {
      // end_time は翌日0時(JST換算)。値は「その前日分」なので1日戻す。
      const end = new Date(String(v.end_time).replace(/([+-]\d{2})(\d{2})$/, '$1:$2')); // "+0000" を "+00:00" に正規化
      const d = Utilities.formatDate(new Date(end.getTime() - 86400000), TZ, 'yyyy-MM-dd');
      series[d] = v.value;
    });
  } catch (e) {
    console.warn('follower_count の取得に失敗: ' + e.message);
  }

  // 他の指標は日ごとに total_value で取得(日付境界はJST)
  for (let i = days; i >= 1; i--) {
    const day = Utilities.formatDate(new Date(base - i * 86400000), TZ, 'yyyy-MM-dd');
    const since = Math.floor(new Date(day + 'T00:00:00+09:00').getTime() / 1000);
    const until = since + 86400;
    const row = { '日付': day, '取得日時': now, 'フォロワー純増': series[day] };

    const ins = fetchAccountTotals_(Object.keys(ACCOUNT_TOTAL_METRICS), since, until);
    Object.keys(ACCOUNT_TOTAL_METRICS).forEach(function (m) {
      row[ACCOUNT_TOTAL_METRICS[m]] = ins[m];
    });
    const fu = fetchAccountTotals_(['follows_and_unfollows'], since, until, 'follow_type')['follows_and_unfollows'] || {};
    row['フォロー増'] = fu.FOLLOWER;
    row['フォロー解除'] = fu.NON_FOLLOWER === undefined ? fu.UNFOLLOWER : fu.NON_FOLLOWER;
    rows[day] = row;
  }
  const result = upsertRows_(TABLES.accountDaily, Object.keys(rows).sort().map(function (d) { return rows[d]; }));
  console.log('アカウント日次: 追加 ' + result.added + ' / 更新 ' + result.updated);
}

/**
 * 期間のユニーク値(リーチ・エンゲージしたアカウント)を取得する。
 * これらは日次値を足すと同じ人を重複して数えるため、期間を指定して API から取り直す。
 * API の上限で1回あたり30日までしか指定できないため、次の単位で保存する。
 *   直近: R7 / R7前 / R30 / R30前(今日0時までの直近 N 日と、その前の N 日)
 *   週  : W|月曜日の日付(月〜日)
 *   月  : M|yyyy-MM(31日ある月は末尾30日分で近似)
 */
function syncAccountPeriods(weeks, months) {
  // トリガー経由ではイベントオブジェクトが渡されるため、数値のときだけ採用する
  weeks = typeof weeks === 'number' ? weeks : 2;
  months = typeof months === 'number' ? months : 2;
  const now = formatJst_(new Date().toISOString());
  const todayStr = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const today0 = jstMidnightSec_(todayStr);
  const rows = [];

  const add = function (key, unit, since, until, state) {
    const ins = fetchAccountTotals_(['reach', 'accounts_engaged'], since, until);
    if (ins.reach === undefined && ins.accounts_engaged === undefined) return;
    rows.push({
      '期間キー': key,
      '粒度': unit,
      '開始日': secToDate_(since),
      '終了日': secToDate_(until - 86400), // 終了日はその日を含む最終日
      'リーチ': ins.reach,
      'エンゲージしたアカウント': ins.accounts_engaged,
      '状態': state,
      '取得日時': now,
    });
  };

  [7, 30].forEach(function (n) {
    add('R' + n, '直近', today0 - n * 86400, today0, '確定');
    add('R' + n + '前', '直近', today0 - 2 * n * 86400, today0 - n * 86400, '確定');
  });

  // 週(月曜始まり)。今週は今日0時までの途中集計。
  const dow = Number(Utilities.formatDate(new Date(), TZ, 'u')); // 1=月 ... 7=日
  const thisMonday = today0 - (dow - 1) * 86400;
  for (let i = 0; i < weeks; i++) {
    const since = thisMonday - i * 7 * 86400;
    const until = Math.min(since + 7 * 86400, today0);
    if (until <= since) continue; // 月曜0時ちょうどは今週分がまだ無い
    add('W|' + secToDate_(since), '週', since, until, until < since + 7 * 86400 ? '途中' : '確定');
  }

  // 月。31日ある月は API 上限のため末尾30日分で近似する。
  const ym = todayStr.slice(0, 7).split('-').map(Number);
  for (let i = 0; i < months; i++) {
    const y = ym[0], m = ym[1] - i;
    const start = new Date(Date.UTC(y, m - 1, 1));
    const next = new Date(Date.UTC(y, m, 1));
    const startStr = Utilities.formatDate(start, 'UTC', 'yyyy-MM-dd');
    const nextStr = Utilities.formatDate(next, 'UTC', 'yyyy-MM-dd');
    let since = jstMidnightSec_(startStr);
    const fullUntil = jstMidnightSec_(nextStr);
    const until = Math.min(fullUntil, today0);
    if (until <= since) continue;
    let state = until < fullUntil ? '途中' : '確定';
    if (until - since > 30 * 86400) {
      since = until - 30 * 86400;
      state = state === '途中' ? '途中' : '近似(30日分)';
    }
    add('M|' + startStr.slice(0, 7), '月', since, until, state);
  }

  const result = upsertRows_(TABLES.accountPeriod, rows);
  console.log('アカウント期間: 追加 ' + result.added + ' / 更新 ' + result.updated);
}

/** 初回用。直近26週・6か月分を取得する。 */
function syncAccountPeriodsBackfill() {
  syncAccountPeriods(26, 6);
}

function jstMidnightSec_(dateStr) {
  return Math.floor(new Date(dateStr + 'T00:00:00+09:00').getTime() / 1000);
}

function secToDate_(sec) {
  return Utilities.formatDate(new Date(sec * 1000), TZ, 'yyyy-MM-dd');
}

/**
 * アカウントの total_value 指標を取得。まとめて失敗したら1指標ずつ取り直す。
 * breakdown を指定した場合は { dimension: value } を指標ごとに返す。
 */
function fetchAccountTotals_(metrics, since, until, breakdown, extra) {
  const cfg = getConfig_();
  const path = '/' + cfg.userId + '/insights';
  const build = function (ms) {
    const p = { metric: ms.join(','), metric_type: 'total_value', period: 'day' };
    if (since) { p.since = since; p.until = until; }
    if (breakdown) p.breakdown = breakdown;
    return Object.assign(p, extra || {});
  };
  try {
    return parseInsights_(apiGet_(path, build(metrics)).data);
  } catch (e) {
    if (metrics.length === 1) {
      console.warn('アカウント指標の取得失敗: ' + metrics[0] + ' ' + e.message);
      return {};
    }
  }
  const out = {};
  metrics.forEach(function (m) { Object.assign(out, fetchAccountTotals_([m], since, until, breakdown, extra)); });
  return out;
}

/** オーディエンス属性(年齢層・性別・都市・国)の最新スナップショットを保存する。フォロワー100人未満だと取得できない。 */
function syncAudience() {
  const now = formatJst_(new Date().toISOString());
  const rows = [];
  Object.keys(DEMOGRAPHIC_METRICS).forEach(function (metric) {
    Object.keys(DEMOGRAPHIC_BREAKDOWNS).forEach(function (bd) {
      const extra = metric === 'follower_demographics' ? {} : { timeframe: 'this_month' } // v20以降は last_30_days 等が廃止され、this_week / this_month のみ;
      const map = fetchAccountTotals_([metric], null, null, bd, Object.assign({ period: 'lifetime' }, extra))[metric] || {};
      Object.keys(map).forEach(function (label) {
        rows.push({
          'キー': metric + '|' + bd + '|' + label,
          '対象': DEMOGRAPHIC_METRICS[metric],
          '区分': DEMOGRAPHIC_BREAKDOWNS[bd],
          '項目': label,
          '人数': map[label],
          '取得日時': now,
        });
      });
    });
  });
  const result = upsertRows_(TABLES.audience, rows);
  console.log('オーディエンス: 追加 ' + result.added + ' / 更新 ' + result.updated);
}
