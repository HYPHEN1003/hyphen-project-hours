/**
 * validate.js － クライアント側の簡易バリデーション
 * （サーバ側 Validator が正本。ここは即時フィードバック用）
 */
App.validate = (function () {
  function required(v) { return !(v === null || v === undefined || String(v).trim() === ''); }
  function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)); }
  function isNonNegNumber(v) { return v === '' || (!isNaN(Number(v)) && Number(v) >= 0); }
  return { required: required, isEmail: isEmail, isNonNegNumber: isNonNegNumber };
})();
