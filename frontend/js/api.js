/**
 * api.js － GAS API 通信ラッパ
 * ------------------------------------------------------------------
 * エンベロープ {ok, data, error, meta} を解釈し、
 * 成功時は data を resolve、失敗時は AppError 風オブジェクトを reject する。
 *
 * CORS プリフライト回避のため POST は Content-Type: text/plain で送る
 *（GAS の doPost が body を JSON.parse する / API_DESIGN §2.5）。
 */
App.api = (function () {
  var BASE = App.config.API_BASE_URL;

  /** GET（参照系）。params はクエリ化される。 */
  function get(action, params) {
    var qs = toQuery(Object.assign({ action: action }, params || {}));
    return request(BASE + '?' + qs, { method: 'GET' });
  }

  /** POST（更新系）。payload は body に入れる。 */
  function post(action, payload) {
    var body = JSON.stringify({
      action: action,
      payload: payload || {},
      meta: { actor: App.config.ACTOR, requestId: genId() }
    });
    return request(BASE + '?action=' + encodeURIComponent(action), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body
    });
  }

  function request(url, opts) {
    return fetch(url, opts)
      .then(function (res) { return res.text(); })
      .then(function (text) {
        var env;
        try { env = JSON.parse(text); }
        catch (e) { throw { code: 'INTERNAL_ERROR', message: 'サーバー応答の解析に失敗しました' }; }
        if (env.ok) return env.data;
        throw env.error || { code: 'INTERNAL_ERROR', message: '不明なエラー' };
      })
      .catch(function (err) {
        // ネットワーク等の例外も AppError 風に正規化
        if (err && err.code) throw err;
        throw { code: 'NETWORK_ERROR', message: '通信に失敗しました。接続を確認してください。' };
      });
  }

  function toQuery(obj) {
    return Object.keys(obj)
      .filter(function (k) { return obj[k] !== undefined && obj[k] !== null && obj[k] !== ''; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]); })
      .join('&');
  }
  function genId() { return 'r' + Date.now() + Math.floor(Math.random() * 1000); }

  return { get: get, post: post };
})();
