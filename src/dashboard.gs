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

function readTable_(ss, table) {
  const sheet = ss.getSheetByName(table.name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const head = values[0];
  const idx = table.headers.filter(function (h) { return head.indexOf(h) !== -1; });
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    if (values[r][head.indexOf(table.key)] === '') continue;
    const row = {};
    idx.forEach(function (h) {
      const v = values[r][head.indexOf(h)];
      row[h] = v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm') : v;
    });
    rows.push(row);
  }
  return rows;
}
