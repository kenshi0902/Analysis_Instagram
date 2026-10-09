/**
 * フォロワー数などを日次でスナップショット保存する。
 * フォロワー数の履歴は API から過去分を取れないため、毎日の実行で自前で蓄積する。
 */
function syncFollowers() {
  const cfg = getConfig_();
  const profile = apiGet_('/' + cfg.userId, { fields: 'followers_count,follows_count,media_count' });
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');

  const row = {
    '日付': today,
    'フォロワー数': profile.followers_count,
    'フォロー数': profile.follows_count,
    '投稿数': profile.media_count,
    '前日比': diffFromPrevious_(today, profile.followers_count),
    '取得日時': formatJst_(new Date().toISOString()),
  };
  const result = upsertRows_(TABLES.followers, [row]);
  console.log('フォロワー数: ' + profile.followers_count + ' (追加 ' + result.added + ' / 更新 ' + result.updated + ')');
}

/** 当日より前で最も新しい日のフォロワー数との差。比較対象が無ければ undefined(書き込まない)。 */
function diffFromPrevious_(today, current) {
  const t = openSheet_(TABLES.followers);
  const last = t.sheet.getLastRow();
  if (last < 2) return undefined;
  const dateCol = t.columns['日付'];
  const countCol = t.columns['フォロワー数'];
  const dates = t.sheet.getRange(2, dateCol, last - 1, 1).getValues();
  const counts = t.sheet.getRange(2, countCol, last - 1, 1).getValues();

  let bestDate = '';
  let bestCount;
  dates.forEach(function (r, i) {
    const d = keyOf_(r[0]);
    if (d && d < today && d > bestDate && counts[i][0] !== '') {
      bestDate = d;
      bestCount = Number(counts[i][0]);
    }
  });
  return bestDate ? current - bestCount : undefined;
}
