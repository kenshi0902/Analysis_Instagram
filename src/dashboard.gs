/**
 * ダッシュボード(GASウェブアプリ)。シートの値を読み、Index.html に渡して描画する。
 * デプロイ: clasp deploy、または GAS エディタの「デプロイ」→「ウェブアプリ」。
 */
function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Instagram ダッシュボード')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** 全テーブルを { テーブルキー: [{ヘッダー: 値}] } で返す。ブラウザから google.script.run で呼ぶ。 */
function getDashboardData() {
  const ss = SpreadsheetApp.openById(getConfig_().spreadsheetId);
  const out = {};
  Object.keys(TABLES).forEach(function (k) {
    out[k] = readTable_(ss, TABLES[k]);
  });
  out.generatedAt = formatJst_(new Date().toISOString());
  return out;
}

/** 保存済みのストーリー画像(元のサイズ)を data URL で返す。個別表示用。ブラウザから google.script.run で呼ぶ。 */
function getStoryImage(fileId) {
  const folderId = PropertiesService.getScriptProperties().getProperty('STORY_IMAGE_FOLDER_ID');
  return toDataUrl_(storyImageFile_(fileId, folderId).getBlob());
}

/** 一覧のアイコン用。1回に返す最大件数(呼び出し側で分割して呼ぶ) */
const STORY_THUMB_MAX = 30;
const STORY_THUMB_FALLBACK_BYTES = 150000; // 縮小版がまだ無いとき、これ以下なら元画像を返す

/**
 * 保存済みのストーリー画像の縮小版を { ファイルID: data URL | null } で返す。ブラウザから google.script.run で呼ぶ。
 * 縮小版はドライブが自動生成する(1枚数KB〜十数KB)。取得できないものは null(画面では「画像なし」の枠を出す)。
 */
function getStoryThumbnails(ids) {
  if (!Array.isArray(ids)) throw new Error('ファイルIDの配列を渡してください');
  const folderId = PropertiesService.getScriptProperties().getProperty('STORY_IMAGE_FOLDER_ID');
  const out = {};
  ids.slice(0, STORY_THUMB_MAX).forEach(function (id) {
    try {
      const file = storyImageFile_(id, folderId);
      const thumb = file.getThumbnail();
      if (thumb) out[id] = toDataUrl_(thumb);
      else out[id] = file.getSize() <= STORY_THUMB_FALLBACK_BYTES ? toDataUrl_(file.getBlob()) : null;
    } catch (e) {
      out[id] = null;
    }
  });
  return out;
}

/**
 * ストーリー画像の保存フォルダ内のファイルだけを返す。
 * ウェブアプリはオーナー権限で動くため、任意のファイルIDを渡されてもオーナーのドライブ上の他のファイルを読めないようにする。
 */
function storyImageFile_(fileId, folderId) {
  if (!/^[\w-]{10,}$/.test(String(fileId))) throw new Error('不正なファイルIDです');
  if (!folderId) throw new Error('ストーリー画像の保存フォルダがまだありません');
  const file = DriveApp.getFileById(fileId);
  const parents = file.getParents();
  while (parents.hasNext()) {
    if (parents.next().getId() === folderId) return file;
  }
  throw new Error('ストーリー画像の保存フォルダ外のファイルは表示できません');
}

function toDataUrl_(blob) {
  return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
}

function readTable_(ss, table) {
  const sheet = ss.getSheetByName(table.name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const head = values[0];
  const idx = table.headers.filter(function (h) { return head.indexOf(h) !== -1; });
  // 行が増え続けるテーブルは、直近 maxAgeDays 日分だけ返す(ブラウザへの転送量を抑える)
  const dateCol = table.maxAgeDays ? head.indexOf(table.dateColumn) : -1;
  const cutoff = dateCol !== -1
    ? Utilities.formatDate(new Date(Date.now() - table.maxAgeDays * 86400000), TZ, 'yyyy-MM-dd') : '';
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    if (values[r][head.indexOf(table.key)] === '') continue;
    if (dateCol !== -1) {
      const d = values[r][dateCol];
      const ds = d instanceof Date ? Utilities.formatDate(d, TZ, 'yyyy-MM-dd') : String(d).slice(0, 10);
      if (ds < cutoff) continue;
    }
    const row = {};
    idx.forEach(function (h) {
      const v = values[r][head.indexOf(h)];
      row[h] = v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm') : v;
    });
    rows.push(row);
  }
  return rows;
}
