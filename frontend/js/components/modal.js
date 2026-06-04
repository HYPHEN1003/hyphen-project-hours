/**
 * modal.js － モーダルダイアログ
 * ------------------------------------------------------------------
 * open({title, bodyHtml, wide, onMount, footerButtons}) でモーダルを表示。
 * footerButtons: [{label, class, onClick(close), keepOpen}]
 * onClick は close 関数を受け取り、Promise を返せば完了まで二重押下を防ぐ。
 */
App.modal = (function () {
  function open(opts) {
    var root = document.getElementById('modal-root');
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    var footer = (opts.footerButtons || []).map(function (b, i) {
      return '<button class="btn ' + (b.class || 'btn-secondary') + '" data-btn="' + i + '">' + App.fmt.esc(b.label) + '</button>';
    }).join('');

    overlay.innerHTML =
      '<div class="modal ' + (opts.wide ? 'wide' : '') + '" role="dialog" aria-modal="true">' +
        '<div class="modal-header"><h2>' + App.fmt.esc(opts.title || '') + '</h2>' +
        '<button class="modal-close" aria-label="閉じる">×</button></div>' +
        '<div class="modal-body">' + (opts.bodyHtml || '') + '</div>' +
        (footer ? '<div class="modal-footer">' + footer + '</div>' : '') +
      '</div>';
    root.appendChild(overlay);

    function close() { overlay.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);

    overlay.querySelector('.modal-close').addEventListener('click', close);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });

    (opts.footerButtons || []).forEach(function (b, i) {
      var btn = overlay.querySelector('[data-btn="' + i + '"]');
      btn.addEventListener('click', function () {
        var ret = b.onClick ? b.onClick(close, btn) : null;
        if (ret && typeof ret.then === 'function') {
          setLoading(btn, true);
          ret.then(function () { setLoading(btn, false); })
             .catch(function () { setLoading(btn, false); });
        }
      });
    });

    if (opts.onMount) opts.onMount(overlay, close);
    return { overlay: overlay, close: close };
  }

  function setLoading(btn, on) {
    if (on) { btn.dataset.label = btn.innerHTML; btn.innerHTML = '<span class="spinner btn-spinner"></span>'; btn.disabled = true; }
    else if (btn.dataset.label) { btn.innerHTML = btn.dataset.label; btn.disabled = false; }
  }

  /** 確認ダイアログ */
  function confirm(message, onYes) {
    open({
      title: '確認',
      bodyHtml: '<p>' + App.fmt.esc(message) + '</p>',
      footerButtons: [
        { label: 'キャンセル', class: 'btn-secondary', onClick: function (close) { close(); } },
        { label: 'OK', class: 'btn-danger', onClick: function (close) { var r = onYes(); if (r && r.then) return r.then(close); close(); } }
      ]
    });
  }

  return { open: open, confirm: confirm };
})();
