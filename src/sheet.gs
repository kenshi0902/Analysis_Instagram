/**
 * シート書き込みの共通処理。
 * - ヘッダー名で列を特定するので、列の並べ替えや手入力列の追加をしても壊れない
 * - 管理対象の列だけ書き込み、手入力列・数式列には触れない
 * - キー列で突き合わせて、あれば更新・無ければ追記(upsert)
 */
function openSheet_(table) {
  const ss = SpreadsheetApp.openById(getConfig_().spreadsheetId);
  const sheet = ss.getSheetByName(table.name) || ss.insertSheet(table.name);
  return { sheet: sheet, columns: ensureHeaders_(sheet, table) };
}

/** 1行目のヘッダーを確認し、足りない管理列を末尾に追加する。{ ヘッダー名: 列番号(1始まり) } を返す。 */
function ensureHeaders_(sheet, table) {
  const lastCol = sheet.getLastColumn();
  const existing = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  const columns = {};
  existing.forEach(function (h, i) { if (h !== '') columns[h] = i + 1; });

  let nextCol = existing.length + 1;
  table.headers.forEach(function (h) {
    if (!columns[h]) {
      sheet.getRange(1, nextCol).setValue(h).setFontWeight('bold');
      columns[h] = nextCol++;
    }
  });
  sheet.setFrozenRows(1);
  return columns;
}

function keyOf_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return String(v === null || v === undefined ? '' : v);
}

/**
 * rows: [{ ヘッダー名: 値 }]。undefined / null の値は書き込まない(既存値を残す)。
 * キー列は文字列として保存する(ストーリーIDが数値に変換されて桁落ちするのを防ぐ)。
 */
function upsertRows_(table, rows) {
  if (!rows.length) return { updated: 0, added: 0 };
  const t = openSheet_(table);
  const sheet = t.sheet;
  const columns = t.columns;
  const keyCol = columns[table.key];

  const last = sheet.getLastRow();
  const keys = last > 1 ? sheet.getRange(2, keyCol, last - 1, 1).getValues() : [];
  const rowIndex = {};
  let lastFilled = 1;
  keys.forEach(function (r, i) {
    const k = keyOf_(r[0]);
    if (k !== '') {
      rowIndex[k] = i + 2;
      lastFilled = i + 2;
    }
  });

  let nextRow = lastFilled + 1;
  let updated = 0;
  let added = 0;
  rows.forEach(function (row) {
    const key = keyOf_(row[table.key]);
    let target = rowIndex[key];
    if (target) {
      updated++;
    } else {
      target = nextRow++;
      rowIndex[key] = target;
      sheet.getRange(target, keyCol).setNumberFormat('@').setValue(key);
      added++;
    }
    Object.keys(row).forEach(function (h) {
      if (h === table.key || !columns[h]) return;
      const v = row[h];
      if (v === undefined || v === null) return;
      sheet.getRange(target, columns[h]).setValue(v);
    });
  });
  SpreadsheetApp.flush();
  return { updated: updated, added: added };
}

/** キー列の値の集合 { key: true } を返す(既に記録済みかの判定用)。 */
function existingKeys_(table) {
  const t = openSheet_(table);
  const last = t.sheet.getLastRow();
  const out = {};
  if (last < 2) return out;
  t.sheet.getRange(2, t.columns[table.key], last - 1, 1).getValues().forEach(function (r) {
    const k = keyOf_(r[0]);
    if (k) out[k] = true;
  });
  return out;
}

/** 指定列の値を { キー: 値 } で返す(空の値は含めない)。既存の値を引き継ぐかの判定用。 */
function columnByKey_(table, header) {
  const t = openSheet_(table);
  const last = t.sheet.getLastRow();
  const out = {};
  if (last < 2 || !t.columns[header]) return out;
  const keys = t.sheet.getRange(2, t.columns[table.key], last - 1, 1).getValues();
  const vals = t.sheet.getRange(2, t.columns[header], last - 1, 1).getValues();
  keys.forEach(function (r, i) {
    const k = keyOf_(r[0]);
    if (k && vals[i][0] !== '') out[k] = vals[i][0];
  });
  return out;
}

/** 'yyyy-MM-dd HH:mm' 形式(日本時間)。API の "+0000" 形式のタイムスタンプも受け付ける。 */
function formatJst_(isoLike, pattern) {
  const normalized = String(isoLike).replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  return Utilities.formatDate(new Date(normalized), TZ, pattern || 'yyyy-MM-dd HH:mm');
}

function weekdayJa_(date) {
  return ['日', '月', '火', '水', '木', '金', '土'][Number(Utilities.formatDate(date, TZ, 'u')) % 7];
}
