/**
 * ストーリーズのインサイトを取得してシートに反映する。
 * ストーリーは投稿から24時間で取得できなくなるため、STORY_SYNC_MINUTES おきに実行する。
 * - ストーリーズインサイト: ストーリーごとの最新値で更新する
 * - API_ストーリー推移: 実行ごとの値を追記し、投稿からの時間推移を残す
 * 取得できなかった指標は書き込まず、既存の値を残す。
 */
const STORY_METRICS = [
  'views', 'reach', 'replies', 'shares', 'total_interactions', 'follows', 'profile_visits',
];

/**
 * 実行間隔(分)。60(1時間)を既定とする。GAS の制約で 1 / 5 / 10 / 15 / 30 / 60 のいずれか。
 * 短くすると投稿直後の推移が細かく見えるが、API 呼び出しとシートの行数が増える(README「3-7」参照)。
 */
const STORY_SYNC_MINUTES = 60;

function syncStories() {
  const cfg = getConfig_();
  const stories = apiGetAll_('/' + cfg.userId + '/stories', {
    fields: 'id,media_type,timestamp,permalink',
    limit: 50,
  });
  console.log('取得したストーリー数: ' + stories.length);

  const nowMs = Date.now();
  const now = formatJst_(new Date(nowMs).toISOString());
  const rows = [];
  const snaps = [];
  stories.forEach(function (s) {
    const m = fetchInsightsSafe_(s.id, STORY_METRICS, 'STORY');
    const nav = fetchBreakdownSafe_(s.id, 'navigation', 'story_navigation_action_type');
    const posted = new Date(String(s.timestamp).replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
    const values = {
      '閲覧数': m.views,
      'リーチ': m.reach,
      '返信': m.replies,
      'シェア': m.shares,
      'インタラクション合計': m.total_interactions,
      'フォロー': m.follows,
      'プロフィール訪問': m.profile_visits,
      '次へ': nav.tap_forward,
      '戻る': nav.tap_back,
      '終了': nav.tap_exit,
      '次のアカウントへ': nav.swipe_forward,
    };
    rows.push(Object.assign({
      'ストーリーID': s.id,
      '投稿日時': formatJst_(s.timestamp),
      '月': Number(Utilities.formatDate(posted, TZ, 'M')),
      '曜日': weekdayJa_(posted),
      'URL': s.permalink,
      '取得日時': now,
    }, values));

    // 指標が1つも取れなかった回は推移に残さない(空の点が混ざると曲線が崩れるため)
    if (m.views === undefined && m.reach === undefined) return;
    const elapsedMin = Math.max(0, Math.round((nowMs - posted.getTime()) / 60000));
    snaps.push(Object.assign({
      'キー': s.id + '|' + elapsedMin,
      'ストーリーID': s.id,
      '投稿日時': formatJst_(s.timestamp),
      '取得日時': now,
      '経過分': elapsedMin,
    }, values));
  });
  const result = upsertRows_(TABLES.stories, rows);
  const snap = upsertRows_(TABLES.storySnapshots, snaps);
  console.log('ストーリーズ: 追加 ' + result.added + ' / 更新 ' + result.updated + ' | 推移: 追加 ' + snap.added);
}
