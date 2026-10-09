/**
 * Instagram Graph API クライアント。
 * リトライ・ページネーション・インサイト取得の共通処理を持つ。
 */
const RETRYABLE_API_CODES = [4, 17, 32, 613]; // レート制限系
const MAX_ATTEMPTS = 4;
const MAX_PAGES = 20;

function buildUrl_(path, params) {
  const cfg = getConfig_();
  const query = Object.assign({}, params, { access_token: cfg.token });
  const qs = Object.keys(query)
    .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(query[k]); })
    .join('&');
  return 'https://' + cfg.host + '/' + cfg.version + path + '?' + qs;
}

function apiGet_(path, params) {
  return fetchJson_(buildUrl_(path, params || {}), path);
}

/** 失敗時のエラーメッセージにトークンを含めないよう、path のみを渡す。 */
function fetchJson_(url, label) {
  let lastError;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const status = res.getResponseCode();
    let body = {};
    try {
      body = JSON.parse(res.getContentText());
    } catch (e) {
      body = {};
    }
    if (status === 200) return body;

    const err = body.error || {};
    lastError = new Error('API error ' + status + ' (code ' + err.code + '): ' + err.message + ' [' + label + ']');
    lastError.apiCode = err.code;
    lastError.status = status;

    const retryable = status >= 500 || RETRYABLE_API_CODES.indexOf(err.code) !== -1;
    if (!retryable || attempt === MAX_ATTEMPTS - 1) break;
    Utilities.sleep(2000 * Math.pow(2, attempt));
  }
  throw lastError;
}

/** paging.next をたどって data を全件結合する。 */
function apiGetAll_(path, params) {
  let body = apiGet_(path, params);
  let items = body.data || [];
  let pages = 1;
  while (body.paging && body.paging.next && pages < MAX_PAGES) {
    body = fetchJson_(body.paging.next, path);
    items = items.concat(body.data || []);
    pages++;
  }
  return items;
}

/**
 * メディアのインサイトを取得して { metric: value } で返す。
 * まとめて取得し、失敗したら1指標ずつ取得し直す(未対応の指標が混ざっていても取れる分は取る)。
 */
function fetchInsightsSafe_(mediaId, metrics) {
  try {
    return parseInsights_(apiGet_('/' + mediaId + '/insights', { metric: metrics.join(',') }).data);
  } catch (e) {
    console.warn('まとめ取得に失敗、個別取得に切り替え: ' + mediaId + ' / ' + e.message);
  }
  const result = {};
  let failed = 0;
  metrics.forEach(function (m) {
    try {
      Object.assign(result, parseInsights_(apiGet_('/' + mediaId + '/insights', { metric: m }).data));
    } catch (e) {
      failed++;
    }
  });
  if (failed) console.warn('取得できなかった指標: ' + failed + '/' + metrics.length + ' (' + mediaId + ')');
  return result;
}

/** breakdown 付きの指標を { dimension: value } で返す。 */
function fetchBreakdownSafe_(mediaId, metric, breakdown) {
  try {
    const body = apiGet_('/' + mediaId + '/insights', { metric: metric, breakdown: breakdown });
    return (parseInsights_(body.data)[metric]) || {};
  } catch (e) {
    console.warn('breakdown取得失敗: ' + metric + ' (' + mediaId + ') ' + e.message);
    return {};
  }
}

function parseInsights_(data) {
  const out = {};
  (data || []).forEach(function (item) {
    if (item.total_value) {
      const breakdowns = item.total_value.breakdowns;
      if (breakdowns && breakdowns.length) {
        const map = {};
        (breakdowns[0].results || []).forEach(function (r) {
          map[r.dimension_values[0]] = r.value;
        });
        out[item.name] = map;
      } else {
        out[item.name] = item.total_value.value;
      }
    } else if (item.values && item.values.length) {
      out[item.name] = item.values[0].value;
    }
  });
  return out;
}
