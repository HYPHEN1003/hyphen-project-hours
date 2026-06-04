/**
 * crud.js － マスタ系の共通編集モーダル（新規/編集/削除）
 * ------------------------------------------------------------------
 * editModal({ title, fields, isNew, createAction, updateAction, deleteAction,
 *             idKey, idValue, onDone, wide, beforeSave })
 *  - フォーム生成 → 保存（create/update）→ 削除（論理削除）を一括で扱う。
 *  - サーバの VALIDATION_ERROR はフィールド単位で表示。
 */
App.crud = (function () {
  function editModal(opts) {
    var buttons = [
      { label: 'キャンセル', class: 'btn-secondary', onClick: function (close) { close(); } }
    ];
    if (!opts.isNew && opts.deleteAction) {
      buttons.push({ label: '削除', class: 'btn-danger', onClick: function (close, btn) {
        App.modal.confirm('このデータを削除します。よろしいですか？', function () {
          return App.api.post(opts.deleteAction, { id: opts.idValue }).then(function () {
            App.toast.success('削除しました');
            close();
            if (opts.onDone) opts.onDone();
          }).catch(function (e) { App.toast.error(e.message); });
        });
      } });
    }
    buttons.push({ label: '保存', class: 'btn-primary', onClick: function (close, btn) {
      return save(opts, close);
    } });

    var ref = App.modal.open({
      title: opts.title, wide: opts.wide,
      bodyHtml: '<form id="crud-form">' + App.form.build(opts.fields) + '</form>',
      footerButtons: buttons,
      onMount: function (overlay) {
        if (opts.onMount) opts.onMount(overlay);
      }
    });
    ref._opts = opts;
    return ref;
  }

  function save(opts, close) {
    var form = document.getElementById('crud-form');
    App.form.clearErrors(form);
    var reqErr = App.form.checkRequired(form, opts.fields);
    if (reqErr.length) { App.form.showErrors(form, reqErr); return Promise.reject(); }

    var payload = App.form.read(form);
    if (!opts.isNew && opts.idKey) payload[opts.idKey] = opts.idValue;
    if (opts.beforeSave) payload = opts.beforeSave(payload) || payload;

    var action = opts.isNew ? opts.createAction : opts.updateAction;
    return App.api.post(action, payload).then(function () {
      App.toast.success(opts.isNew ? '登録しました' : '保存しました');
      close();
      if (opts.onDone) opts.onDone();
    }).catch(function (e) {
      if (e.code === 'VALIDATION_ERROR' && e.details) App.form.showErrors(form, e.details);
      else App.toast.error(e.message || '保存に失敗しました');
      return Promise.reject(e);
    });
  }

  return { editModal: editModal };
})();
