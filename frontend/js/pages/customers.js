/**
 * customers.js － 顧客マスタ画面
 */
App.pages.customers = (function () {
  var ENTITY = [{ value: '法人', label: '法人' }, { value: '個人', label: '個人' }];
  var RANK = ['A', 'B', 'C'].map(v => ({ value: v, label: v }));
  var PAY = ['翌月末', '翌々月末', '当月末'].map(v => ({ value: v, label: v }));
  var CLOSE = ['末日', '15日', '20日', '25日'].map(v => ({ value: v, label: v }));
  var STATUS = ['取引中', '休止', '解約'].map(v => ({ value: v, label: v }));

  function render(content, actions) {
    actions.innerHTML = '<button class="btn btn-primary" id="new-btn">＋ 新規</button>';
    actions.querySelector('#new-btn').addEventListener('click', function () { openModal(null); });
    load(content);
  }

  function load(content) {
    App.api.get('listCustomers').then(function (rows) {
      App.table.render(content, {
        columns: [
          { key: 'customer_id', label: 'ID', width: '80px' },
          { key: 'name', label: '顧客名' },
          { key: 'name_kana', label: 'カナ' },
          { key: 'entity_type', label: '区分', render: r => r.entity_type || '—' },
          { key: 'industry', label: '業種', render: r => r.industry || '—' },
          { key: 'rank', label: 'ランク', render: r => r.rank ? App.table.badge(r.rank, r.rank === 'A' ? 'success' : (r.rank === 'C' ? 'muted' : 'info')) : '—' },
          { key: 'payment_terms', label: '支払条件', render: r => r.payment_terms || '—' },
          { key: 'status', label: 'ステータス', render: r => App.table.badge(r.status, r.status === '取引中' ? 'success' : 'muted') }
        ],
        rows: rows,
        emptyText: '顧客が登録されていません。「＋ 新規」から登録してください。',
        footerHtml: rows.length + ' 件',
        onRowClick: function (r) { openModal(r); }
      });
    }).catch(showError(content));
  }

  function openModal(row) {
    var isNew = !row;
    row = row || {};
    var fields = [
      { key: 'name', label: '顧客名', type: 'text', required: true, value: row.name, full: true },
      { key: 'name_kana', label: 'カナ', type: 'text', value: row.name_kana },
      { key: 'entity_type', label: '区分', type: 'select', options: ENTITY, value: row.entity_type },
      { key: 'industry', label: '業種', type: 'text', value: row.industry },
      { key: 'representative', label: '代表者名', type: 'text', value: row.representative },
      { key: 'contact_person', label: '担当者名', type: 'text', value: row.contact_person },
      { key: 'phone', label: '電話番号', type: 'tel', value: row.phone },
      { key: 'email', label: 'メールアドレス', type: 'email', value: row.email },
      { key: 'address', label: '住所', type: 'text', value: row.address, full: true },
      { key: 'rank', label: '顧客ランク', type: 'select', options: RANK, value: row.rank },
      { key: 'payment_terms', label: '支払条件', type: 'select', options: PAY, value: row.payment_terms },
      { key: 'closing_day', label: '請求締日', type: 'select', options: CLOSE, value: row.closing_day },
      { key: 'status', label: 'ステータス', type: 'select', options: STATUS, required: true, value: row.status || '取引中' }
    ];
    App.crud.editModal({
      title: isNew ? '顧客 新規登録' : '顧客 編集',
      fields: fields, isNew: isNew,
      createAction: 'createCustomer', updateAction: 'updateCustomer', deleteAction: 'deleteCustomer',
      idKey: 'customer_id', idValue: row.customer_id,
      onDone: function () { App.store.reload(); App.router.navigate(); }
    });
  }

  function showError(content) { return function (e) { content.innerHTML = '<div class="card text-danger">読み込みに失敗しました: ' + App.fmt.esc(e.message) + '</div>'; }; }
  return { render: render };
})();
