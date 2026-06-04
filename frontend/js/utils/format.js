/**
 * format.js － 表示整形ユーティリティ
 */
App.fmt = (function () {
  /** 3桁区切り。null/空は '—' */
  function num(v) {
    if (v === null || v === undefined || v === '') return '—';
    return Number(v).toLocaleString('ja-JP');
  }
  /** 金額 ¥ 付き */
  function yen(v) {
    if (v === null || v === undefined || v === '') return '—';
    return '¥' + Number(v).toLocaleString('ja-JP');
  }
  /** 時間 h 付き（小数1桁まで） */
  function hours(v) {
    if (v === null || v === undefined || v === '') return '—';
    return (Math.round(Number(v) * 10) / 10).toLocaleString('ja-JP') + 'h';
  }
  /** 率 → % 表示（0.8 → 80%）。null は '—' */
  function pct(v, digits) {
    if (v === null || v === undefined || v === '') return '—';
    var d = digits === undefined ? 0 : digits;
    return (Number(v) * 100).toFixed(d) + '%';
  }
  /** YYYY-MM-DD → YYYY/MM/DD */
  function date(v) {
    if (!v) return '—';
    return String(v).replace(/-/g, '/');
  }
  /** HTMLエスケープ */
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /** 秒 → HH:mm:ss */
  function clock(totalSec) {
    var s = Math.floor(totalSec % 60), m = Math.floor((totalSec / 60) % 60), h = Math.floor(totalSec / 3600);
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return p(h) + ':' + p(m) + ':' + p(s);
  }
  /** 今日 YYYY-MM-DD（ローカル） */
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }
  /** 今月 YYYY-MM */
  function thisMonth() {
    var d = new Date();
    return d.getFullYear() + '-' + p2(d.getMonth() + 1);
  }
  /** 来月 YYYY-MM */
  function nextMonth() {
    var d = new Date(); d.setMonth(d.getMonth() + 1);
    return d.getFullYear() + '-' + p2(d.getMonth() + 1);
  }
  function p2(n) { return n < 10 ? '0' + n : '' + n; }

  return { num: num, yen: yen, hours: hours, pct: pct, date: date, esc: esc, clock: clock, today: today, thisMonth: thisMonth, nextMonth: nextMonth };
})();
