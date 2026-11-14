/**
 * フィード投稿・リールのインサイトを取得してシートに反映する。
 * /media は投稿全件を返すため、直近 MEDIA_LOOKBACK_DAYS 日分だけインサイトを更新する
 * (古い投稿は数値がほぼ動かず、API呼び出し回数を節約できる)。
 * 初回だけ syncMediaBackfill で全期間を取得する。
 *
 * あわせて、投稿後 SNAPSHOT_DAYS 日時点の値を API_投稿推移 に記録する
 * (投稿からの経過日数を揃えて比べるため。累計値のままだと新しい投稿ほど不利になる)。
 */
const MEDIA_LOOKBACK_DAYS = 30;
const SNAPSHOT_DAYS = [1, 7, 28];
const SNAPSHOT_TOLERANCE_HOURS = 24; // チェックポイントを過ぎてからこの時間内に取れた値だけ記録する

const FEED_METRICS = [
  'views', 'reach', 'likes', 'comments', 'saved', 'shares', 'total_interactions', 'follows', 'profile_visits',
];
const REEL_METRICS = [
  'views', 'reach', 'likes', 'comments', 'saved', 'shares', 'total_interactions',
  'ig_reels_avg_watch_time', 'ig_reels_video_view_total_time', 'follows', 'profile_visits',
];

/** 定期実行用(6時間おき)。直近の投稿だけ更新し、スナップショットを記録する。 */
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
  const nowMs = Date.now();
  const cutoff = days ? nowMs - days * 86400000 : 0;
  const now = formatJst_(new Date(nowMs).toISOString());
  const snapped = existingKeys_(TABLES.mediaSnapshots);

  const feedRows = [];
  const reelRows = [];
  const snapRows = [];
  media.forEach(function (m) {
    const posted = new Date(String(m.timestamp).replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
    if (posted.getTime() < cutoff) return;
    const isReel = m.media_product_type === 'REELS';
    const ins = fetchInsightsSafe_(m.id, isReel ? REEL_METRICS : FEED_METRICS, isReel ? 'REELS' : 'FEED');
    const row = {
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
      'フォロー': ins.follows,
      'プロフィール訪問': ins.profile_visits,
      '取得日時': now,
    };
    if (isReel) {
      row['平均視聴時間(秒)'] = msToSec_(ins.ig_reels_avg_watch_time);
      row['合計視聴時間(秒)'] = msToSec_(ins.ig_reels_video_view_total_time);
      reelRows.push(row);
    } else {
      row['種類'] = m.media_type; // IMAGE / VIDEO / CAROUSEL_ALBUM
      feedRows.push(row);
    }

    const ageHours = (nowMs - posted.getTime()) / 3600000;
    const checkpoint = dueCheckpoint_(ageHours);
    if (checkpoint && !snapped[m.id + '|' + checkpoint]) {
      snapRows.push({
        'キー': m.id + '|' + checkpoint,
        'メディアID': m.id,
        '形式': isReel ? 'リール' : 'フィード',
        '投稿日時': row['投稿日時'],
        '経過日数': checkpoint,
        '経過時間(h)': Math.round(ageHours * 10) / 10,
        '閲覧数': row['閲覧数'],
        'リーチ': row['リーチ'],
        'いいね': row['いいね'],
        'コメント': row['コメント'],
        '保存': row['保存'],
        'シェア': row['シェア'],
        'インタラクション合計': row['インタラクション合計'],
        'フォロー': row['フォロー'],
        'プロフィール訪問': row['プロフィール訪問'],
        '平均視聴時間(秒)': row['平均視聴時間(秒)'],
        '取得日時': now,
      });
    }
  });
  const f = upsertRows_(TABLES.feed, feedRows);
  const r = upsertRows_(TABLES.reels, reelRows);
  const s = upsertRows_(TABLES.mediaSnapshots, snapRows);
  console.log('フィード: 追加 ' + f.added + ' / 更新 ' + f.updated + ' | リール: 追加 ' + r.added + ' / 更新 ' + r.updated +
    ' | 投稿推移: 追加 ' + s.added);
}

/** 経過時間が「チェックポイント〜チェックポイント+許容時間」に入っていれば、そのチェックポイント(日数)を返す。 */
function dueCheckpoint_(ageHours) {
  for (let i = SNAPSHOT_DAYS.length - 1; i >= 0; i--) {
    const h = SNAPSHOT_DAYS[i] * 24;
    if (ageHours >= h && ageHours < h + SNAPSHOT_TOLERANCE_HOURS) return SNAPSHOT_DAYS[i];
  }
  return null;
}

function msToSec_(ms) {
  return ms === undefined ? undefined : Math.round(ms) / 1000;
}
