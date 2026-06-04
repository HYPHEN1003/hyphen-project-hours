/**
 * AppError.gs － アプリ共通の例外型とエラーコード
 * ------------------------------------------------------------------
 * Service / Repository から throw し、Main.gs で捕捉してエンベロープ化する。
 * GAS の ContentService は HTTP ステータスを自由に返せないため、
 * レスポンスは常に 200 とし、error.code で種別を表現する（API_DESIGN §2.4）。
 */

/** エラーコード定義（フロントの分岐に使用） */
var ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR', // 入力検証エラー
  NOT_FOUND: 'NOT_FOUND',               // 対象なし
  CONFLICT: 'CONFLICT',                 // 排他/重複（採番衝突・楽観ロック失敗）
  LOCK_TIMEOUT: 'LOCK_TIMEOUT',         // LockService 取得失敗
  FK_VIOLATION: 'FK_VIOLATION',         // 参照先が存在しない/論理削除済
  INTERNAL_ERROR: 'INTERNAL_ERROR'      // 想定外
};

/**
 * アプリ例外。
 * @param {string} code  ERROR_CODES のいずれか
 * @param {string} message ユーザー向け日本語メッセージ
 * @param {Array} [details] フィールド単位の詳細 [{field, message}]
 */
function AppError(code, message, details) {
  this.name = 'AppError';
  this.code = code || ERROR_CODES.INTERNAL_ERROR;
  this.message = message || 'エラーが発生しました';
  this.details = details || null;
  this.isAppError = true;
}
AppError.prototype = Object.create(Error.prototype);
AppError.prototype.constructor = AppError;
