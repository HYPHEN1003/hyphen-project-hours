/**
 * timer.js － タイマー計測の状態管理（localStorage 永続化）
 * ------------------------------------------------------------------
 * ブラウザのリロード/タブ復帰でも計測を継続できるよう、
 * 開始時刻・累積秒・一時停止状態を localStorage に保持する。
 */
App.timer = (function () {
  var KEY = 'hyphen_timer_state';

  /** 状態: { running, startedAt(ms), accumSec, project_id, work_item_id, billing_type, description } */
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; }
  }
  function save(st) { localStorage.setItem(KEY, JSON.stringify(st)); }
  function clear() { localStorage.removeItem(KEY); }

  /** 現在の経過秒（累積 + 計測中なら現在までの差分） */
  function elapsedSec(st) {
    if (!st) return 0;
    var base = st.accumSec || 0;
    if (st.running && st.startedAt) base += Math.floor((Date.now() - st.startedAt) / 1000);
    return base;
  }

  function start(meta) {
    var st = load() || { accumSec: 0 };
    st.running = true;
    st.startedAt = Date.now();
    st.project_id = meta.project_id;
    st.work_item_id = meta.work_item_id;
    st.billing_type = meta.billing_type;
    st.description = meta.description || '';
    save(st);
    return st;
  }
  function pause() {
    var st = load();
    if (!st || !st.running) return st;
    st.accumSec = elapsedSec(st);
    st.running = false;
    st.startedAt = null;
    save(st);
    return st;
  }
  function resume() {
    var st = load();
    if (!st || st.running) return st;
    st.running = true;
    st.startedAt = Date.now();
    save(st);
    return st;
  }
  function updateMeta(meta) {
    var st = load();
    if (!st) return null;
    Object.keys(meta).forEach(function (k) { st[k] = meta[k]; });
    save(st);
    return st;
  }

  return { load: load, save: save, clear: clear, elapsedSec: elapsedSec, start: start, pause: pause, resume: resume, updateMeta: updateMeta };
})();
