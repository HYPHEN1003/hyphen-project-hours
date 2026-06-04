/**
 * Lock.gs － LockService ラッパ（排他制御）
 * ------------------------------------------------------------------
 * 全書き込み系処理・採番・集計はこの withLock 内で直列化する。
 * 読み取り系はロック不要（高速）。API_DESIGN §6 準拠。
 *
 * 将来 Supabase へ移行する際は、この関数の中身を
 * DBトランザクション/行ロックへ差し替えるだけでよい（呼び出し側は不変）。
 */

/**
 * スクリプトロックを取得して fn を実行し、必ず解放する。
 * @param {Function} fn ロック下で実行する処理
 * @param {number} [timeoutMs] 取得待ちタイムアウト（既定10秒）
 * @returns {*} fn の戻り値
 * @throws {AppError} LOCK_TIMEOUT
 */
function withLock(fn, timeoutMs) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(timeoutMs || 10000)) {
    throw new AppError(
      ERROR_CODES.LOCK_TIMEOUT,
      '処理が混み合っています。少し待ってから再実行してください。'
    );
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
