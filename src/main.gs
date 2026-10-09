/** セットアップ確認用の関数。GAS エディタから手動で実行する。 */

/** スクリプトプロパティが揃っているか確認する。 */
function checkConfig() {
  const cfg = getConfig_();
  console.log('設定OK: host=' + cfg.host + ' version=' + cfg.version + ' userId=' + cfg.userId);
}

/** API に接続できるか確認する(ユーザー名とフォロワー数を表示)。 */
function testConnection() {
  const cfg = getConfig_();
  const me = apiGet_('/' + cfg.userId, { fields: 'username,followers_count,media_count' });
  console.log('接続OK: @' + me.username + ' / フォロワー ' + me.followers_count + ' / 投稿 ' + me.media_count);
}

/** 書き込み先シートのタブとヘッダー行を作成する。 */
function initSheets() {
  Object.keys(TABLES).forEach(function (k) { openSheet_(TABLES[k]); });
  console.log('シートを初期化しました: ' + Object.keys(TABLES).map(function (k) { return TABLES[k].name; }).join(', '));
}

/** すべて一度に実行する。 */
function runAll() {
  syncFollowers();
  syncStories();
}
