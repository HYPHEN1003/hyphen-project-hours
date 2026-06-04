/**
 * expenses.js － 経費管理画面
 */
App.pages.expenses = (function () {
  var TYPE = ['交通費', '宿泊費', '印紙代', '登録免許税', '外注費', '通信費', '消耗品費', 'その他'].map(v => ({ value: v, label: v }));
  var BILLING = ['実費請求', '含む', '自社負担'].map(v => ({ value: v, label: v }));
  var APPROVAL = ['申請中', '承認', '却下'].map(v => ({ value: v, label: v }));
  var RECEIPT = [{ value: 'true', label: '有' }, { value: 'false', label: '無' }];
  var projOpts = [];

  function render(content, actions) {
    actions.innerHTML = '<button class="btn btn-primary" id="new-btn">＋ 新規</button>';
    actions.querySelector('#new-btn').addEventListener('click', function () { openModal(null); });
    content.innerHTML =
      '<div class="filter-bar">' +
        '<div class="field"><label>承認状態</label><select id="f-approval"><option value="">すべて</option>' +
          APPROVAL.map(o => '<option value="' + o.value + '">' + o.label + '</option>').join('') + '</select></div>' +
        '<div class="field"><label>請求区分</label><select id="f-billing"><option value="">すべて</option>' +
          BILLING.map(o => '<option value="' + o.value + '">' + o.label + '</option>').join('') + '</select></div>' +
        '<button class="btn btn-secondary" id="f-search">絞り込み</button>' +
      '</div><div id="exp-table"></div>';
    content.querySelector('#f-search').addEventListener('click', function () { load(content); });

    App.api.get('listProjects', { status: 'all' }).then(function (rows) {
      projOpts = rows.map(p => ({ value: p.project_id, label: p.name }));
      load(content);
    });
  }

  function load(content) {
    var box = content.querySelector('#exp-table');
    box.innerHTML = '<div class="flex" style="justify-content:center;padding:30px"><div class="spinner"></div></div>';
    var params = {
      approval_status: content.querySelector('#f-approval').value,
      billing_type: content.querySelector('#f-billing').value
    };
    App.api.get('listExpenses', params).then(function (rows) {
      var total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
      App.table.render(box, {
        columns: [
          { key: 'expense_date', label: '発生日', render: r => App.fmt.date(r.expense_date) },
          { key: 'staff_name', label: 'スタッフ' },
          { key: 'project_name', label: '案件' },
          { key: 'expense_type', label: '種別' },
          { key: 'amount', label: '金額', num: true, render: r => App.fmt.yen(r.amount) },
          { key: 'billing_type', label: '請求区分' },
          { key: 'has_receipt', label: '領収書', render: r => r.has_receipt ? '有' : '無' },
          { key: 'approval_status', label: '承認', render: r => App.table.approvalBadge(r.approval_status) },
          { key: 'quick', label: '操作', render: r => quickButtons(r) }
        ],
        rows: rows, emptyText: '経費が登録されていません。',
        footerHtml: rows.length + ' 件 ／ 合計 ' + App.fmt.yen(total),
        onRowClick: function (r) { openModal(r); }
      });
      // クイック承認ボタン
      box.querySelectorAll('[data-approve]').forEach(function (b) {
        b.addEventListener('click', function (ev) {
          ev.stopPropagation();
          var id = b.getAttribute('data-id'), st = b.getAttribute('data-approve');
          App.api.post('approveExpense', { expense_id: id, approval_status: st }).then(function () {
            App.toast.success(st + 'しました'); load(content);
          }).catch(e => App.toast.error(e.message));
        });
      });
    }).catch(function (e) { box.innerHTML = '<div class="card text-danger">読み込み失敗: ' + App.fmt.esc(e.message) + '</div>'; });
  }

  function quickButtons(r) {
    if (r.approval_status !== '申請中') return '—';
    return '<button class="btn btn-sm btn-secondary" data-approve="承認" data-id="' + r.expense_id + '">承認</button> ' +
      '<button class="btn btn-sm btn-ghost" data-approve="却下" data-id="' + r.expense_id + '">却下</button>';
  }

  function openModal(row) {
    var isNew = !row; row = row || {};
    var fields = [
      { key: 'expense_date', label: '発生日', type: 'date', required: true, value: row.expense_date || App.fmt.today() },
      { key: 'staff_id', label: 'スタッフ', type: 'select', required: true, options: App.store.staffOptions(), value: row.staff_id },
      { key: 'project_id', label: '案件', type: 'select', required: true, options: projOpts, value: row.project_id },
      { key: 'expense_type', label: '経費種別', type: 'select', required: true, options: TYPE, value: row.expense_type },
      { key: 'amount', label: '金額（円）', type: 'number', min: 1, step: 100, required: true, value: row.amount },
      { key: 'billing_type', label: '請求区分', type: 'select', required: true, options: BILLING, value: row.billing_type || '実費請求', hint: '実費請求＝顧客に請求 / 含む・自社負担＝原価算入' },
      { key: 'has_receipt', label: '領収書', type: 'select', options: RECEIPT, value: row.has_receipt === undefined ? '' : String(row.has_receipt) },
      { key: 'approval_status', label: '承認状態', type: 'select', required: true, options: APPROVAL, value: row.approval_status || '申請中' },
      { key: 'description', label: '内容', type: 'textarea', value: row.description, full: true }
    ];
    App.crud.editModal({
      title: isNew ? '経費 新規登録' : '経費 編集',
      fields: fields, isNew: isNew, wide: true,
      createAction: 'createExpense', updateAction: 'updateExpense', deleteAction: 'deleteExpense',
      idKey: 'expense_id', idValue: row.expense_id,
      beforeSave: function (p) { p.has_receipt = (p.has_receipt === 'true'); return p; },
      onDone: function () { App.router.navigate(); }
    });
  }
  return { render: render };
})();
