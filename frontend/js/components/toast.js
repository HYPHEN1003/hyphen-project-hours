/**
 * toast.js － トースト通知
 */
App.toast = (function () {
  function show(message, type, ms) {
    var root = document.getElementById('toast-root');
    var t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.textContent = message;
    root.appendChild(t);
    setTimeout(function () {
      t.style.transition = 'opacity .3s';
      t.style.opacity = '0';
      setTimeout(function () { t.remove(); }, 300);
    }, ms || 3000);
  }
  return {
    success: function (m) { show(m, 'success'); },
    error: function (m) { show(m, 'error', 4500); },
    warn: function (m) { show(m, 'warn'); },
    info: function (m) { show(m, ''); }
  };
})();
