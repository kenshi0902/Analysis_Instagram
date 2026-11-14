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

/** testConnection が失敗したときの切り分け用。トークンはログに出さない。 */
function diagnose() {
  const cfg = getConfig_();
  const tryGet = function (label, path, params) {
    try {
      console.log(label + ': ' + JSON.stringify(apiGet_(path, params)));
    } catch (e) {
      console.log(label + ': 失敗 ' + e.message);
    }
  };
  tryGet('トークンの持ち主', '/me', { fields: 'id,name' });
  tryGet('権限', '/me/permissions', {});
  tryGet('見えるページとIG', '/me/accounts', { fields: 'name,instagram_business_account' });
  tryGet('IDの基本情報', '/' + cfg.userId, { fields: 'id' });
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
  syncMedia();
  syncAccountAll();
  syncAudience();
}

/** アカウント系の日次処理。順序に依存するため1つのトリガーでまとめて実行する。 */
function syncAccountAll() {
  syncAccountDaily();
  syncAccountPeriods();
  backfillFollowers(); // 反映が遅れていた日の純増が取れたら推定値を更新する(実測は上書きしない)
}

/** 初回用。過去分(投稿は全件、アカウントは30日分)をまとめて取得する。 */
function runBackfill() {
  syncFollowers();
  syncStories();
  syncMediaBackfill();
  syncAccountBackfill();
  syncAccountPeriodsBackfill();
  backfillFollowers();
  syncAudience();
}
