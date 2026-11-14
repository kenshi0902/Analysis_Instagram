/**
 * フィード投稿・リールのインサイトを取得してシートに反映する。
 * /media は投稿全件を返すため、直近 MEDIA_LOOKBACK_DAYS 日分だけインサイトを更新する
 * (古い投稿は数値がほぼ動かず、API呼び出し回数を節約できる)。
 * 初回だけ syncMediaBackfill で全期間を取得する。
 */
const MEDIA_LOOKBACK_DAYS = 30;

const FEED_METRICS = [
  'views', 'reach', 'likes', 'comments', 'saved', 'shares', 'total_interactions', 'follows', 'profile_visits',
];
const REEL_METRICS = [
  'views', 'reach', 'likes', 'comments', 'saved', 'shares', 'total_interactions',
  'ig_reels_avg_watch_time', 'ig_reels_video_view_total_time',
];

/** 日次トリガー用。直近の投稿だけ更新する。 */
function syncMedia() {
  syncMediaSince_(MEDIA_LOOKBACK_DAYS);
}

/** 初回用。全期間の投稿を取得する(投稿数が多いと時間がかかる)。 */
function syncMediaBackfill() {
  syncMediaSince_(null);
}

function syncMediaSince_(days) {
  const cfg = getConfig_();
  const media = apiGetAll_('/' + cfg.userId + '/media', {
    fields: 'id,media_type,media_product_type,timestamp,permalink,caption,thumbnail_url,media_url',
    limit: 50,
  });
  const cutoff = days ? Date.now() - days * 86400000 : 0;
  const now = formatJst_(new Date().toISOString());

  const feedRows = [];
  const reelRows = [];
  media.forEach(function (m) {
    const posted = new Date(String(m.timestamp).replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
    if (posted.getTime() < cutoff) return;
    const isReel = m.media_product_type === 'REELS';
    const ins = fetchInsightsSafe_(m.id, isReel ? REEL_METRICS : FEED_METRICS);
    const common = {
      'メディアID': m.id,
      '投稿日時': formatJst_(m.timestamp),
      'URL': m.permalink,
      'キャプション': m.caption || '',
      'サムネイルURL': m.thumbnail_url || (m.media_type === 'VIDEO' ? '' : m.media_url) || '',
      '閲覧数': ins.views,
      'リーチ': ins.reach,
      'いいね': ins.likes,
      'コメント': ins.comments,
      '保存': ins.saved,
      'シェア': ins.shares,
      'インタラクション合計': ins.total_interactions,
      '取得日時': now,
    };
    if (isReel) {
      common['平均視聴時間(秒)'] = ins.ig_reels_avg_watch_time === undefined
        ? undefined : Math.round(ins.ig_reels_avg_watch_time) / 1000;
      common['合計視聴時間(秒)'] = ins.ig_reels_video_view_total_time === undefined
        ? undefined : Math.round(ins.ig_reels_video_view_total_time) / 1000;
      reelRows.push(common);
    } else {
      common['種類'] = m.media_type; // IMAGE / VIDEO / CAROUSEL_ALBUM
      common['フォロー'] = ins.follows;
      common['プロフィール訪問'] = ins.profile_visits;
      feedRows.push(common);
    }
  });
  const f = upsertRows_(TABLES.feed, feedRows);
  const r = upsertRows_(TABLES.reels, reelRows);
  console.log('フィード: 追加 ' + f.added + ' / 更新 ' + f.updated + ' | リール: 追加 ' + r.added + ' / 更新 ' + r.updated);
}
