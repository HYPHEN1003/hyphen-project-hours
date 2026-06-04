/**
 * projects.js － 案件管理画面
 */
App.pages.projects = (function () {
  var CONTRACT = ['スポット', '顧問', 'タイムチャージ', '固定'].map(v => ({ value: v, label: v }));
  var STATUS = ['見積中', '進行中', '完了', '請求済', '入金済', '中止'].map(v => ({ value: v, label: v }));
  var curStatus = '進行中';

  function render(content, actions) {
    actions.innerHTML = '<button class="btn btn-primary" id="new-btn">＋ 新規</button>';
    actions.querySelector('#new-btn').addEventListener('click', function () { openModal(null); });
    content.innerHTML =
      '<div class="filter-bar">' +
        '<div class="field"><label>ステータス</label>' + statusSelect() + '</div>' +
      '</div><div id="proj-table"></div>';
    content.querySelector('#status-filter').addEventListener('change', function (e) {
      curStatus = e.target.value; load(content);
    });
    load(content);
  }

  function statusSelect() {
    var opts = '<option value="進行中">進行中</option><option value="all">すべて</option>' +
      STATUS.filter(s => s.value !== '進行中').map(s => '<option value="' + s.value + '">' + s.label + '</option>').join('');
    return '<select id="status-filter">' + opts.replace('value="' + curStatus + '"', 'value="' + curStatus + '" selected') + '</select>';
  }

  function load(content) {
    var box = content.querySelector('#proj-table');
    box.innerHTML = '<div class="flex" style="justify-content:center;padding:30px"><div class="spinner"></div></div>';
    App.api.get('listProjects', { status: curStatus }).then(function (rows) {
      var cfg = App.store.get().settings;
      App.table.render(box, {
        columns: [
          { key: 'project_id', label: 'ID', width: '78px' },
          { key: 'name', label: '案件名' },
          { key: 'customer_name', label: '顧客' },
          { key: 'type_name', label: '種別', render: r => r.type_name || '—' },
          { key: 'owner_name', label: '主担当', render: r => r.owner_name || '—' },
          { key: 'contract_amount', label: '契約金額', num: true, render: r => App.fmt.yen(r.contract_amount) },
          { key: 'progress', label: '消化率', render: r => App.table.progressBar(r.progress_rate) },
          { key: 'due_date', label: '納期', render: r => App.fmt.date(r.due_date) },
          { key: 'status', label: 'ステータス', render: r => App.table.projectStatusBadge(r.status) },
          { key: 'alert', label: 'アラート', render: r => App.table.alertBadge(r.alert) }
        ],
        rows: rows,
        emptyText: '該当する案件がありません。',
        footerHtml: rows.length + ' 件',
        onRowClick: function (r) { openModal(r); }
      });
    }).catch(function (e) { box.innerHTML = '<div class="card text-danger">読み込み失敗: ' + App.fmt.esc(e.message) + '</div>'; });
  }

  function openModal(row) {
    var isNew = !row; row = row || {};
    var fields = [
      { key: 'name', label: '案件名', type: 'text', required: true, value: row.name, full: true, placeholder: '例: ○○株式会社 決算申告' },
      { key: 'customer_id', label: '顧客', type: 'select', required: true, options: App.store.customerOptions(), value: row.customer_id },
      { key: 'type_id', label: '案件種別', type: 'select', options: App.store.typeOptions(), value: row.type_id },
      { key: 'contract_type', label: '契約形態', type: 'select', options: CONTRACT, value: row.contract_type },
      { key: 'owner_staff_id', label: '主担当', type: 'select', options: App.store.staffOptions(), value: row.owner_staff_id },
      { key: 'contract_amount', label: '契約金額（円）', type: 'number', min: 0, step: 1000, value: row.contract_amount },
      { key: 'estimated_hours', label: '見積工数（時間）', type: 'number', min: 0, step: 0.5, value: row.estimated_hours },
      { key: 'start_date', label: '開始日', type: 'date', value: row.start_date },
      { key: 'due_date', label: '納期', type: 'date', value: row.due_date },
      { key: 'status', label: 'ステータス', type: 'select', required: true, options: STATUS, value: row.status || '進行中' },
      { key: 'note', label: '備考', type: 'textarea', value: row.note, full: true }
    ];
    var ref = App.crud.editModal({
      title: isNew ? '案件 新規登録' : '案件 編集',
      fields: fields, isNew: isNew, wide: true,
      createAction: 'createProject', updateAction: 'updateProject', deleteAction: 'deleteProject',
      idKey: 'project_id', idValue: row.project_id,
      onDone: function () { App.router.navigate(); },
      onMount: function (overlay) {
        // 種別選択時、標準工数/単価を初期提案（未入力時のみ）
        var typeSel = overlay.querySelector('[data-key="type_id"]');
        typeSel.addEventListener('change', function () {
          var t = App.store.get().projectTypes.filter(function (x) { return x.type_id === typeSel.value; })[0];
          if (!t) return;
          var est = overlay.querySelector('[data-key="estimated_hours"]');
          var amt = overlay.querySelector('[data-key="contract_amount"]');
          if (est && !est.value && t.standard_hours) est.value = t.standard_hours;
          if (amt && !amt.value && t.standard_price) amt.value = t.standard_price;
        });
      }
    });
    return ref;
  }
  return { render: render };
})();
