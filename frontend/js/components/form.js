/**
 * form.js － フォーム生成・値取得・エラー表示ヘルパ
 * ------------------------------------------------------------------
 * フィールド仕様(配列)から HTML を生成し、入力値の取得とサーバ検証エラーの
 * フィールド単位表示を行う。
 *
 * field: { key, label, type, required, options:[{value,label}], value,
 *          min, step, placeholder, disabled, full, hint }
 *   type: 'text'|'number'|'date'|'time'|'select'|'textarea'|'checkbox'|'email'|'tel'
 */
App.form = (function () {
  function build(fields, opts) {
    opts = opts || {};
    var inner = fields.map(function (f) { return fieldHtml(f); }).join('');
    return '<div class="' + (opts.grid === false ? '' : 'form-grid') + '">' + inner + '</div>';
  }

  function fieldHtml(f) {
    var id = 'f_' + f.key;
    var req = f.required ? '<span class="req">*</span>' : '';
    var cls = 'field' + (f.full ? ' full' : '');
    var v = (f.value === null || f.value === undefined) ? '' : f.value;
    var control;
    if (f.type === 'select') {
      var opts = (f.options || []).map(function (o) {
        return '<option value="' + App.fmt.esc(o.value) + '"' + (String(v) === String(o.value) ? ' selected' : '') + '>' + App.fmt.esc(o.label) + '</option>';
      }).join('');
      var placeholder = f.required ? '<option value="">選択してください</option>' : '<option value="">（未選択）</option>';
      control = '<select id="' + id + '" data-key="' + f.key + '"' + (f.disabled ? ' disabled' : '') + '>' + placeholder + opts + '</select>';
    } else if (f.type === 'textarea') {
      control = '<textarea id="' + id + '" data-key="' + f.key + '" rows="3"' + (f.disabled ? ' disabled' : '') + '>' + App.fmt.esc(v) + '</textarea>';
    } else if (f.type === 'checkbox') {
      control = '<input type="checkbox" id="' + id + '" data-key="' + f.key + '"' + (v === true || v === 'true' ? ' checked' : '') + '/>';
    } else {
      var t = f.type === 'number' ? 'number' : (f.type || 'text');
      var attrs = '';
      if (f.type === 'number') { if (f.min !== undefined) attrs += ' min="' + f.min + '"'; if (f.step !== undefined) attrs += ' step="' + f.step + '"'; }
      if (f.placeholder) attrs += ' placeholder="' + App.fmt.esc(f.placeholder) + '"';
      if (f.type === 'number') attrs += ' inputmode="decimal"';
      control = '<input type="' + t + '" id="' + id + '" data-key="' + f.key + '" value="' + App.fmt.esc(v) + '"' + (f.disabled ? ' disabled' : '') + attrs + '/>';
    }
    var hint = f.hint ? '<div class="form-hint">' + App.fmt.esc(f.hint) + '</div>' : '';
    return '<div class="' + cls + '" data-field="' + f.key + '">' +
      '<label for="' + id + '">' + App.fmt.esc(f.label) + req + '</label>' +
      control + '<div class="err-msg"></div>' + hint + '</div>';
  }

  /** コンテナから値オブジェクトを取得 */
  function read(container) {
    var out = {};
    container.querySelectorAll('[data-key]').forEach(function (el) {
      var key = el.getAttribute('data-key');
      if (el.type === 'checkbox') out[key] = el.checked;
      else out[key] = el.value;
    });
    return out;
  }

  /** サーバ検証エラー(details) をフィールド下に表示。先頭フィールドにフォーカス。 */
  function showErrors(container, details) {
    clearErrors(container);
    if (!details) return;
    var first = null;
    details.forEach(function (d) {
      var fld = container.querySelector('[data-field="' + d.field + '"]');
      if (fld) {
        fld.classList.add('has-error');
        var msg = fld.querySelector('.err-msg');
        if (msg) msg.textContent = d.message;
        if (!first) first = fld.querySelector('[data-key]');
      }
    });
    if (first) first.focus();
  }
  function clearErrors(container) {
    container.querySelectorAll('.field.has-error').forEach(function (f) {
      f.classList.remove('has-error');
      var m = f.querySelector('.err-msg'); if (m) m.textContent = '';
    });
  }

  /** クライアント必須チェック。NG なら details を返す */
  function checkRequired(container, fields) {
    var vals = read(container);
    var details = [];
    fields.forEach(function (f) {
      if (f.required && !App.validate.required(vals[f.key])) {
        details.push({ field: f.key, message: f.label + 'は必須です' });
      }
    });
    return details;
  }

  return { build: build, field: fieldHtml, read: read, showErrors: showErrors, clearErrors: clearErrors, checkRequired: checkRequired };
})();
