/**
 * ストーリーズのインサイトを取得してシートに反映する。
 * ストーリーは投稿から24時間で取得できなくなるため、数時間おきに実行して最新値で更新する。
 * 取得できなかった指標は書き込まず、既存の値を残す。
 */
const STORY_METRICS = [
  'views', 'reach', 'replies', 'shares', 'total_interactions', 'follows', 'profile_visits',
];

function syncStories() {
  const cfg = getConfig_();
  const stories = apiGetAll_('/' + cfg.userId + '/stories', {
    fields: 'id,media_type,timestamp,permalink',
    limit: 50,
  });
  console.log('取得したストーリー数: ' + stories.length);

  const now = formatJst_(new Date().toISOString());
  const rows = stories.map(function (s) {
    const m = fetchInsightsSafe_(s.id, STORY_METRICS);
    const nav = fetchBreakdownSafe_(s.id, 'navigation', 'story_navigation_action_type');
    const posted = new Date(String(s.timestamp).replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
    return {
      'ストーリーID': s.id,
      '投稿日時': formatJst_(s.timestamp),
      '月': Number(Utilities.formatDate(posted, TZ, 'M')),
      '曜日': weekdayJa_(posted),
      'URL': s.permalink,
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
      '取得日時': now,
    };
  });
  const result = upsertRows_(TABLES.stories, rows);
  console.log('ストーリーズ: 追加 ' + result.added + ' / 更新 ' + result.updated);
}
