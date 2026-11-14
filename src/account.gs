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
