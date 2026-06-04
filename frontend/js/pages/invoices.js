/**
 * invoices.js － 請求管理画面（自動計算・採番・入金登録）
 */
App.pages.invoices = (function () {
  var STATUS = ['下書き', '発行済', '入金済', '一部入金', '遅延'].map(v => ({ value: v, label: v }));
  var projOpts = [];

  function render(content, actions) {
    actions.innerHTML = '<button class="btn btn-primary" id="new-btn">＋ 新規請求</button>';
    actions.querySelector('#new-btn').addEventListener('click', function () { openEditor(null); });
    content.innerHTML =
      '<div class="filter-bar">' +
        '<div class="field"><label>ステータス</label><select id="f-status"><option value="">すべて</option>' +
          STATUS.map(o => '<option value="' + o.value + '">' + o.label + '</option>').join('') + '</select></div>' +
        '<button class="btn btn-secondary" id="f-search">絞り込み</button>' +
      '</div><div id="inv-table"></div>';
    content.querySelector('#f-search').addEventListener('click', function () { load(content); });
    App.api.get('listProjects', { status: 'all' }).then(function (rows) {
      projOpts = rows.map(p => ({ value: p.project_id, label: p.name }));
      load(content);
    });
  }

  function load(content) {
    var box = content.querySelector('#inv-table');
    box.innerHTML = '<div class="flex" style="justify-content:center;padding:30px"><div class="spinner"></div></div>';
    App.api.get('listInvoices', { status: content.querySelector('#f-status').value }).then(function (rows) {
      App.table.render(box, {
        columns: [
          { key: 'invoice_id', label: '請求番号' },
          { key: 'customer_name', label: '顧客' },
          { key: 'project_name', label: '案件' },
          { key: 'invoice_date', label: '請求日', render: r => App.fmt.date(r.invoice_date) },
          { key: 'total', label: '合計', num: true, render: r => App.fmt.yen(r.total) },
          { key: 'paid_amount', label: '入金', num: true, render: r => App.fmt.yen(r.paid_amount) },
          { key: 'due_date', label: '支払期限', render: r => App.fmt.date(r.due_date) },
          { key: 'status', label: 'ステータス', render: r => App.table.invoiceStatusBadge(r.status) },
          { key: 'pay', label: '操作', render: r => '<button class="btn btn-sm btn-secondary" data-pay="' + r.invoice_id + '">入金登録</button>' }
        ],
        rows: rows,
        rowClass: function (r) { return r.status === '遅延' ? 'row-danger' : ''; },
        emptyText: '請求データがありません。',
        footerHtml: rows.length + ' 件',
        onRowClick: function (r) { openEditor(r); }
      });
      box.querySelectorAll('[data-pay]').forEach(function (b) {
        b.addEventListener('click', function (ev) { ev.stopPropagation(); openPayment(b.getAttribute('data-pay'), content); });
      });
    }).catch(function (e) { box.innerHTML = '<div class="card text-danger">読み込み失敗: ' + App.fmt.esc(e.message) + '</div>'; });
  }

  /** 新規/編集エディタ */
  function openEditor(row) {
    var isNew = !row;
    var data = row || { invoice_date: App.fmt.today(), status: '下書き' };
    var body =
      '<div class="form-grid">' +
        field('顧客', 'select', 'customer_id', data.customer_id, App.store.customerOptions(), true) +
        field('案件', 'select', 'project_id', data.project_id, projOpts, true) +
        field('請求日', 'date', 'invoice_date', data.invoice_date, null, true) +
        field('支払期限', 'date', 'due_date', data.due_date) +
        field('請求期間 FROM', 'date', 'period_from', data.period_from, null, true) +
        field('請求期間 TO', 'date', 'period_to', data.period_to, null, true) +
      '</div>' +
      '<div class="mt-8"><button class="btn btn-secondary" id="calc-btn">⚙ 自動計算</button></div>' +
      '<div class="form-grid mt-16">' +
        numField('基本報酬', 'base_fee', data.base_fee) +
        numField('タイムチャージ', 'time_charge', data.time_charge) +
        numField('実費金額', 'expense_amount', data.expense_amount) +
        field('ステータス', 'select', 'status', data.status || '下書き', STATUS, true) +
      '</div>' +
      '<div class="card mt-8" style="background:#f8fafc">' +
        '<div class="flex-between"><span>小計</span><b id="v-subtotal">' + App.fmt.yen(data.subtotal || 0) + '</b></div>' +
        '<div class="flex-between"><span>消費税</span><b id="v-tax">' + App.fmt.yen(data.tax || 0) + '</b></div>' +
        '<div class="flex-between" style="font-size:16px"><span>合計請求額</span><b id="v-total">' + App.fmt.yen(data.total || 0) + '</b></div>' +
      '</div>' +
      '<div class="section mt-16"><div class="section-title">明細</div><div id="inv-items"></div></div>';

    var itemsState = (data.items || []).slice();

    var buttons = [{ label: 'キャンセル', class: 'btn-secondary', onClick: c => c() }];
    if (!isNew) buttons.push({ label: '削除', class: 'btn-danger', onClick: function (close) {
      App.modal.confirm('この請求を削除します。よろしいですか？', function () {
        return App.api.post('deleteInvoice', { id: data.invoice_id }).then(function () { App.toast.success('削除しました'); close(); App.router.navigate(); }).catch(e => App.toast.error(e.message));
      });
    } });
    buttons.push({ label: '保存', class: 'btn-primary', onClick: function (close, btn) { return saveInvoice(isNew, data, itemsState, close); } });

    App.modal.open({
      title: isNew ? '新規請求' : ('請求 ' + data.invoice_id), wide: true,
      bodyHtml: '<form id="inv-form">' + body + '</form>',
      footerButtons: buttons,
      onMount: function (overlay) {
        renderItems(overlay, itemsState);
        // 自動計算
        overlay.querySelector('#calc-btn').addEventListener('click', function () {
          var f = App.form.read(overlay.querySelector('#inv-form'));
          if (!f.customer_id || !f.project_id || !f.period_from || !f.period_to || !f.invoice_date) {
            App.toast.error('顧客・案件・請求日・請求期間を入力してください'); return;
          }
          App.api.post('calculateInvoice', { customer_id: f.customer_id, project_id: f.project_id, period_from: f.period_from, period_to: f.period_to, invoice_date: f.invoice_date })
            .then(function (res) {
              overlay.querySelector('[data-key="base_fee"]').value = res.base_fee;
              overlay.querySelector('[data-key="time_charge"]').value = res.time_charge;
              overlay.querySelector('[data-key="expense_amount"]').value = res.expense_amount;
              itemsState = res.items || [];
              data.tax_rate = res.tax_rate;
              recompute(overlay);
              renderItems(overlay, itemsState);
              App.toast.success('自動計算しました');
            }).catch(e => App.toast.error(e.message));
        });
        // 金額変更で再計算
        ['base_fee', 'time_charge', 'expense_amount'].forEach(function (k) {
          overlay.querySelector('[data-key="' + k + '"]').addEventListener('input', function () { recompute(overlay); });
        });
        recompute(overlay);

        // 小計・消費税・合計を再計算して表示（金額編集・自動計算の両方から呼ぶ）
        function recompute(ov) {
          var taxRate = data.tax_rate != null ? Number(data.tax_rate) : Number(App.store.setting('tax_rate') || 0.10);
          var sub = num('base_fee', ov) + num('time_charge', ov) + num('expense_amount', ov);
          var tax = Math.round(sub * taxRate);
          ov.querySelector('#v-subtotal').textContent = App.fmt.yen(sub);
          ov.querySelector('#v-tax').textContent = App.fmt.yen(tax) + '（税率 ' + (taxRate * 100).toFixed(0) + '%）';
          ov.querySelector('#v-total').textContent = App.fmt.yen(sub + tax);
          ov._calc = { subtotal: sub, tax_rate: taxRate, tax: tax, total: sub + tax };
        }
      }
    });
  }

  function renderItems(overlay, items) {
    var box = overlay.querySelector('#inv-items');
    App.table.render(box, {
      columns: [
        { key: 'item_type', label: '種別' },
        { key: 'description', label: '内容' },
        { key: 'quantity', label: '数量', num: true },
        { key: 'amount', label: '金額', num: true, render: r => App.fmt.yen(r.amount) }
      ],
      rows: items, emptyText: '「自動計算」で明細が生成されます。'
    });
  }

  function saveInvoice(isNew, data, items, close) {
    var overlay = document.querySelector('.modal-overlay');
    var f = App.form.read(overlay.querySelector('#inv-form'));
    var calc = overlay._calc || {};
    var payload = Object.assign({}, f, {
      subtotal: calc.subtotal, tax_rate: calc.tax_rate, tax: calc.tax, total: calc.total,
      items: items
    });
    if (!isNew) payload.invoice_id = data.invoice_id;
    var action = isNew ? 'createInvoice' : 'updateInvoice';
    return App.api.post(action, payload).then(function () {
      App.toast.success(isNew ? '請求を作成しました' : '保存しました');
      close(); App.router.navigate();
    }).catch(function (e) {
      if (e.code === 'VALIDATION_ERROR' && e.details) App.form.showErrors(overlay.querySelector('#inv-form'), e.details);
      else App.toast.error(e.message);
      return Promise.reject(e);
    });
  }

  function openPayment(invoiceId, content) {
    App.api.get('getInvoice', { id: invoiceId }).then(function (inv) {
      App.modal.open({
        title: '入金登録 ' + invoiceId,
        bodyHtml: '<p>合計請求額: <b>' + App.fmt.yen(inv.total) + '</b></p>' +
          '<div class="field mt-8"><label>入金額</label><input type="number" id="pay-amount" min="0" step="1000" value="' + (inv.paid_amount || inv.total) + '"/></div>',
        footerButtons: [
          { label: 'キャンセル', class: 'btn-secondary', onClick: c => c() },
          { label: '登録', class: 'btn-primary', onClick: function (close) {
            var amt = document.getElementById('pay-amount').value;
            return App.api.post('recordPayment', { invoice_id: invoiceId, paid_amount: amt }).then(function () {
              App.toast.success('入金を登録しました'); close(); load(content);
            }).catch(e => App.toast.error(e.message));
          } }
        ]
      });
    }).catch(e => App.toast.error(e.message));
  }

  // ヘルパ
  function field(label, type, key, value, options, required) {
    return App.form.field({ label: label, type: type, key: key, value: value, options: options, required: required });
  }
  function numField(label, key, value) {
    return App.form.field({ label: label, type: 'number', key: key, value: value, min: 0, step: 1000 });
  }
  function num(key, overlay) { var el = overlay.querySelector('[data-key="' + key + '"]'); return el && el.value ? Number(el.value) : 0; }

  return { render: render };
})();
