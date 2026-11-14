/**
 * アクセストークンの更新。
 * Instagram ログイン(graph.instagram.com)の長期トークンのみ更新が必要(有効期間 約60日)。
 * Facebook ログイン経由のページトークンは通常期限切れにならないため何もしない。
 */
function refreshToken() {
  const cfg = getConfig_();
  if (cfg.host !== 'graph.instagram.com') {
    console.log('IG_API_HOST が graph.instagram.com ではないため、トークン更新はスキップします。');
    return;
  }
  const url = 'https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=' +
    encodeURIComponent(cfg.token);
  const body = fetchJson_(url, '/refresh_access_token');
  if (!body.access_token) throw new Error('トークン更新のレスポンスに access_token がありません');
  PropertiesService.getScriptProperties().setProperty('IG_ACCESS_TOKEN', body.access_token);
  console.log('トークンを更新しました。有効期間(秒): ' + body.expires_in);
}
