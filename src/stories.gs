/**
 * ストーリーズのインサイトを取得してシートに反映する。
 * ストーリーは投稿から24時間で取得できなくなるため、STORY_SYNC_MINUTES おきに実行する。
 * - ストーリーズインサイト: ストーリーごとの最新値で更新する
 * - API_ストーリー推移: 実行ごとの値を追記し、投稿からの時間推移を残す
 * - ストーリーの画像: 公開中に1回だけ Google ドライブへ保存する(公開終了後は API から取れず、
 *   media_url も期限付きのため、URL を残すだけでは後から表示できない)
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
    fields: 'id,media_type,timestamp,permalink,media_url,thumbnail_url',
    limit: 50,
  });
  console.log('取得したストーリー数: ' + stories.length);

  const savedImages = columnByKey_(TABLES.stories, '画像ファイルID');
  const nowMs = Date.now();
  const now = formatJst_(new Date(nowMs).toISOString());
  const rows = [];
  const snaps = [];
  let imagesSaved = 0;
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
    const row = Object.assign({
      'ストーリーID': s.id,
      '投稿日時': formatJst_(s.timestamp),
      '月': Number(Utilities.formatDate(posted, TZ, 'M')),
      '曜日': weekdayJa_(posted),
      'URL': s.permalink,
      '取得日時': now,
    }, values);
    if (!savedImages[s.id]) {
      const fileId = saveStoryImage_(s);
      if (fileId) { row['画像ファイルID'] = fileId; imagesSaved++; }
    }
    rows.push(row);

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
  console.log('ストーリーズ: 追加 ' + result.added + ' / 更新 ' + result.updated +
    ' | 推移: 追加 ' + snap.added + ' | 画像保存: ' + imagesSaved);
}

/**
 * ストーリーの画像(動画はサムネイル)をドライブに保存してファイルIDを返す。失敗しても取得処理は止めない。
 * 画像URLにはアクセストークンが含まれないため、そのまま取得してよい。
 */
function saveStoryImage_(story) {
  const url = story.media_type === 'VIDEO' ? story.thumbnail_url : story.media_url;
  if (!url) return null;
  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) {
      console.warn('ストーリー画像の取得に失敗: ' + story.id + ' (HTTP ' + res.getResponseCode() + ')');
      return null;
    }
    const blob = res.getBlob();
    const ext = /png/.test(blob.getContentType()) ? '.png' : '.jpg';
    blob.setName(formatJst_(story.timestamp, 'yyyyMMdd_HHmm') + '_' + story.id + ext);
    return storyImageFolder_().createFile(blob).getId();
  } catch (e) {
    console.warn('ストーリー画像の保存に失敗: ' + story.id + ' / ' + e.message);
    return null;
  }
}

/** 画像の保存フォルダ。スクリプトプロパティのIDで開き、無ければ作成して記録する。 */
function storyImageFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('STORY_IMAGE_FOLDER_ID');
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (e) {
      console.warn('STORY_IMAGE_FOLDER_ID のフォルダを開けないため作り直します: ' + e.message);
    }
  }
  const folder = DriveApp.createFolder(STORY_IMAGE_FOLDER_NAME);
  props.setProperty('STORY_IMAGE_FOLDER_ID', folder.getId());
  return folder;
}
