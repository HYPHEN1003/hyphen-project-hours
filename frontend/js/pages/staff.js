/**
 * staff.js － スタッフマスタ画面
 */
App.pages.staff = (function () {
  var ROLE = ['代表', 'パートナー', 'マネージャー', 'スタッフ', 'アシスタント'].map(v => ({ value: v, label: v }));
  var STATUS = ['在籍', '休職', '退職'].map(v => ({ value: v, label: v }));

  function render(content, actions) {
    actions.innerHTML = '<button class="btn btn-primary" id="new-btn">＋ 新規</button>';
    actions.querySelector('#new-btn').addEventListener('click', function () { openModal(null); });
    load(content);
  }

  function load(content) {
    App.api.get('listStaff').then(function (rows) {
      App.table.render(content, {
        columns: [
          { key: 'staff_id', label: 'ID', width: '80px' },
          { key: 'name', label: '氏名' },
          { key: 'role', label: '役職', render: r => r.role || '—' },
          { key: 'job_type', label: '職種', render: r => r.job_type || '—' },
          { key: 'cost_rate', label: '原価単価', num: true, render: r => App.fmt.yen(r.cost_rate) },
          { key: 'bill_rate', label: '請求単価', num: true, render: r => App.fmt.yen(r.bill_rate) },
          { key: 'standard_hours', label: '標準稼働h', num: true, render: r => App.fmt.hours(r.standard_hours) },
          { key: 'target_utilization', label: '稼働率目標', num: true, render: r => App.fmt.pct(r.target_utilization) },
          { key: 'status', label: '状態', render: r => App.table.badge(r.status, r.status === '在籍' ? 'success' : 'muted') }
        ],
        rows: rows,
        emptyText: 'スタッフが登録されていません。',
        footerHtml: rows.length + ' 名',
        onRowClick: function (r) { openModal(r); }
      });
    }).catch(function (e) { content.innerHTML = '<div class="card text-danger">読み込み失敗: ' + App.fmt.esc(e.message) + '</div>'; });
  }

  function openModal(row) {
    var isNew = !row; row = row || {};
    var fields = [
      { key: 'name', label: '氏名', type: 'text', required: true, value: row.name },
      { key: 'role', label: '役職', type: 'select', options: ROLE, value: row.role },
      { key: 'job_type', label: '職種', type: 'text', value: row.job_type, placeholder: '税理士 / エンジニア など' },
      { key: 'email', label: 'メールアドレス', type: 'email', value: row.email },
      { key: 'cost_rate', label: '原価単価（円/時）', type: 'number', min: 0, step: 100, value: row.cost_rate, hint: '人件費ベースの時間あたりコスト' },
      { key: 'bill_rate', label: '請求単価（円/時）', type: 'number', min: 0, step: 100, value: row.bill_rate, hint: '顧客への請求ベースの時間単価' },
      { key: 'standard_hours', label: '月間標準稼働時間', type: 'number', min: 0, step: 1, value: row.standard_hours === undefined ? 160 : row.standard_hours },
      { key: 'target_utilization', label: '稼働率目標（0〜1）', type: 'number', min: 0, step: 0.05, value: row.target_utilization === undefined ? 0.8 : row.target_utilization, hint: '例: 0.80 = 80%' },
      { key: 'status', label: 'ステータス', type: 'select', options: STATUS, required: true, value: row.status || '在籍' }
    ];
    App.crud.editModal({
      title: isNew ? 'スタッフ 新規登録' : 'スタッフ 編集',
      fields: fields, isNew: isNew,
      createAction: 'createStaff', updateAction: 'updateStaff', deleteAction: 'deleteStaff',
      idKey: 'staff_id', idValue: row.staff_id,
      onDone: function () { App.store.reload(); App.router.navigate(); }
    });
  }
  return { render: render };
})();
