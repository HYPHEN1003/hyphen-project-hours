/**
 * projectTypes.js － 案件種別マスタ画面
 */
App.pages.projectTypes = (function () {
  var DIFF = [1, 2, 3, 4, 5].map(v => ({ value: v, label: '★'.repeat(v) + '（' + v + '）' }));

  function render(content, actions) {
    actions.innerHTML = '<button class="btn btn-primary" id="new-btn">＋ 新規</button>';
    actions.querySelector('#new-btn').addEventListener('click', function () { openModal(null); });
    load(content);
  }

  function load(content) {
    App.api.get('listProjectTypes').then(function (rows) {
      App.table.render(content, {
        columns: [
          { key: 'type_id', label: 'ID', width: '80px' },
          { key: 'name', label: '種別名' },
          { key: 'category', label: 'カテゴリ大', render: r => r.category || '—' },
          { key: 'standard_hours', label: '標準工数', num: true, render: r => App.fmt.hours(r.standard_hours) },
          { key: 'standard_price', label: '標準単価', num: true, render: r => App.fmt.yen(r.standard_price) },
          { key: 'difficulty', label: '難易度', render: r => r.difficulty ? '★'.repeat(r.difficulty) : '—' }
        ],
        rows: rows,
        emptyText: '案件種別が登録されていません。',
        footerHtml: rows.length + ' 件',
        onRowClick: function (r) { openModal(r); }
      });
    }).catch(function (e) { content.innerHTML = '<div class="card text-danger">読み込み失敗: ' + App.fmt.esc(e.message) + '</div>'; });
  }

  function openModal(row) {
    var isNew = !row; row = row || {};
    var fields = [
      { key: 'name', label: '種別名', type: 'text', required: true, value: row.name, full: true, placeholder: '例: 法人決算申告' },
      { key: 'category', label: 'カテゴリ大', type: 'text', value: row.category, placeholder: '税務 / 法務 / コンサル' },
      { key: 'difficulty', label: '難易度', type: 'select', options: DIFF, value: row.difficulty },
      { key: 'standard_hours', label: '標準工数（時間）', type: 'number', min: 0, step: 0.5, value: row.standard_hours },
      { key: 'standard_price', label: '標準単価（円）', type: 'number', min: 0, step: 1000, value: row.standard_price }
    ];
    App.crud.editModal({
      title: isNew ? '案件種別 新規登録' : '案件種別 編集',
      fields: fields, isNew: isNew,
      createAction: 'createProjectType', updateAction: 'updateProjectType', deleteAction: 'deleteProjectType',
      idKey: 'type_id', idValue: row.type_id,
      onDone: function () { App.store.reload(); App.router.navigate(); }
    });
  }
  return { render: render };
})();
