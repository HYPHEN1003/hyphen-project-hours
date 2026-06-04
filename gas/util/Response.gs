/**
 * Response.gs － レスポンスエンベロープ生成（Supabase Edge Function 互換）
 * ------------------------------------------------------------------
 * 成功: { ok:true, data, error:null, meta:{count, requestId, serverTime} }
 * 失敗: { ok:false, data:null, error:{code,message,details}, meta:{...} }
 */

/** ISO8601（JST）の現在時刻文字列を返す */
function nowIso() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/** 成功エンベロープを ContentService 出力にして返す */
function ok(data, meta) {
  meta = meta || {};
  if (Array.isArray(data) && meta.count === undefined) meta.count = data.length;
  meta.serverTime = nowIso();
  return jsonOutput({ ok: true, data: data === undefined ? null : data, error: null, meta: meta });
}

/** 失敗エンベロープを ContentService 出力にして返す */
function fail(code, message, details, meta) {
  meta = meta || {};
  meta.serverTime = nowIso();
  return jsonOutput({
    ok: false,
    data: null,
    error: { code: code, message: message, details: details || null },
    meta: meta
  });
}

/** AppError / 一般 Error を失敗エンベロープへ変換 */
function failFromError(err, meta) {
  if (err && err.isAppError) {
    return fail(err.code, err.message, err.details, meta);
  }
  // 想定外の例外はログに残し、汎用メッセージを返す
  console.error('Unhandled error: ' + (err && err.stack ? err.stack : err));
  return fail(ERROR_CODES.INTERNAL_ERROR, 'サーバー内部エラーが発生しました。', null, meta);
}

/** オブジェクトを JSON の TextOutput にする（CORS は GAS デプロイ設定側で許可） */
function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
