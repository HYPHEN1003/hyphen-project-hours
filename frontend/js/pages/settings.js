/**
 * settings.js － 設定画面（手動集計 / システム設定 / 作業項目マスタ / ブランド）
 */
App.pages.settings = (function () {
  var BILLING = ['請求対象', '内部', 'サービス'].map(v => ({ value: v, label: v }));

  function render(content, actions) {
    actions.innerHTML = '';
    content.innerHTML =
      aggSection() +
      '<div class="section"><div class="section-title">システム設定</div><div class="card" id="sys-card"></div></div>' +
      '<div class="section"><div class="section-title">作業項目マスタ</div>' +
        '<div class="mb-8"><button class="btn btn-primary btn-sm" id="wi-new">＋ 作業項目を追加</button></div>' +
        '<div id="wi-table"></div></div>' +
      brandSection();

    bindAgg(content);
    loadSettings(content);
    loadWorkItems(content);
    content.querySelector('#wi-new').addEventListener('click', function () { openWorkItem(null, content); });
  }

  /* ---- 手動集計 ---- */
  function aggSection() {
    return '<div class="section"><div class="section-title">手動集計</div>' +
      '<div class="card"><p class="text-mute mb-16">通常は自動集計されますが、すぐに最新化したい場合は実行してください。</p>' +
      '<div class="flex gap-8" style="flex-wrap:wrap">' +
        aggBtn('agg-proj', '案件別集計を実行') +
        aggBtn('agg-month', '月次集計を実行（先月）') +
        aggBtn('agg-staff', 'スタッフ別集計（先月）') +
        aggBtn('agg-est', '見積精度分析') +
        aggBtn('agg-fc', '稼働予測（今月）') +
      '</div></div></div>';
  }
  function aggBtn(id, label) { return '<button class="btn btn-secondary" id="' + id + '">' + label + '</button>'; }

  function bindAgg(content) {
    runBtn(content, '#agg-proj', 'runAggregateProjects', {});
    runBtn(content, '#agg-month', 'runAggregateMonthly', {});
    runBtn(content, '#agg-staff', 'runAggregateStaff', {});
    runBtn(content, '#agg-est', 'runAnalyzeEstimate', {});
    runBtn(content, '#agg-fc', 'runForecastCapacity', { yearMonth: App.fmt.thisMonth() });
  }
  function runBtn(content, sel, action, payload) {
    var btn = content.querySelector(sel);
    btn.addEventListener('click', function () {
      var orig = btn.textContent; btn.disabled = true; btn.innerHTML = '<span class="spinner btn-spinner"></span>';
      App.api.post(action, payload).then(function (res) {
        App.toast.success('完了: ' + (res.updatedRows != null ? res.updatedRows + ' 件更新' : '集計しました'));
      }).catch(function (e) { App.toast.error(e.message); })
        .then(function () { btn.disabled = false; btn.textContent = orig; });
    });
  }

  /* ---- システム設定 ---- */
  function loadSettings(content) {
    App.api.get('getSettings').then(function (m) {
      var fields = [
        { key: 'tax_rate', label: '消費税率', type: 'number', step: 0.01, min: 0, value: m.tax_rate, hint: '例: 0.10 = 10%' },
        { key: 'min_input_minutes', label: '最小入力単位（分）', type: 'number', step: 1, min: 1, value: m.min_input_minutes },
        { key: 'alert_warn_rate', label: '消化率 警告閾値', type: 'number', step: 0.05, value: m.alert_warn_rate, hint: '例: 0.80' },
        { key: 'alert_over_rate', label: '消化率 超過閾値', type: 'number', step: 0.05, value: m.alert_over_rate, hint: '例: 1.00' },
        { key: 'util_over_rate', label: '稼働率 過負荷閾値', type: 'number', step: 0.05, value: m.util_over_rate },
        { key: 'util_low_rate', label: '稼働率 余裕閾値', type: 'number', step: 0.05, value: m.util_low_rate },
        { key: 'margin_good_rate', label: '粗利益率 良好閾値', type: 'number', step: 0.05, value: m.margin_good_rate },
        { key: 'margin_warn_rate', label: '粗利益率 要注意閾値', type: 'number', step: 0.05, value: m.margin_warn_rate },
        { key: 'invoice_prefix', label: '請求番号プレフィックス', type: 'text', value: m.invoice_prefix },
        { key: 'alert_email', label: 'アラート通知先メール', type: 'email', value: m.alert_email }
      ];
      var card = content.querySelector('#sys-card');
      card.innerHTML = '<form id="sys-form">' + App.form.build(fields) + '</form>' +
        '<div class="mt-8"><button class="btn btn-primary" id="save-sys">設定を保存</button></div>';
      card.querySelector('#save-sys').addEventListener('click', function () {
        var patch = App.form.read(card.querySelector('#sys-form'));
        App.api.post('updateSettings', patch).then(function () {
          App.toast.success('設定を保存しました'); App.store.reload();
        }).catch(e => App.toast.error(e.message));
      });
    });
  }

  /* ---- 作業項目マスタ ---- */
  function loadWorkItems(content) {
    App.api.get('listWorkItems').then(function (rows) {
      App.table.render(content.querySelector('#wi-table'), {
        columns: [
          { key: 'work_item_id', label: 'ID', width: '80px' },
          { key: 'name', label: '作業項目名' },
          { key: 'category', label: 'カテゴリ', render: r => r.category || '—' },
          { key: 'default_billing_type', label: '既定請求区分', render: r => r.default_billing_type || '—' },
          { key: 'sort_order', label: '表示順', num: true }
        ],
        rows: rows, emptyText: '作業項目がありません。',
        onRowClick: function (r) { openWorkItem(r, content); }
      });
    });
  }
  function openWorkItem(row, content) {
    var isNew = !row; row = row || {};
    var fields = [
      { key: 'name', label: '作業項目名', type: 'text', required: true, value: row.name, full: true },
      { key: 'category', label: 'カテゴリ', type: 'text', value: row.category },
      { key: 'default_billing_type', label: '既定請求区分', type: 'select', options: BILLING, value: row.default_billing_type },
      { key: 'sort_order', label: '表示順', type: 'number', step: 1, value: row.sort_order }
    ];
    App.crud.editModal({
      title: isNew ? '作業項目 追加' : '作業項目 編集',
      fields: fields, isNew: isNew,
      createAction: 'createWorkItem', updateAction: 'updateWorkItem', deleteAction: 'deleteWorkItem',
      idKey: 'work_item_id', idValue: row.work_item_id,
      onDone: function () { App.store.reload(); loadWorkItems(content); }
    });
  }

  /* ---- ブランド設定（表示のみ・差し替え案内） ---- */
  function brandSection() {
    return '<div class="section"><div class="section-title">ブランド設定</div>' +
      '<div class="card"><p class="text-mute">ロゴ・社名・メインカラーは以下で集中管理しています（コード差し替え）。</p>' +
      '<ul style="margin:8px 0 0 18px;font-size:13px;color:var(--text-mute)">' +
      '<li><code>frontend/css/tokens.css</code> の <code>--brand-*</code>（メインカラー）</li>' +
      '<li><code>frontend/js/config.js</code> の <code>APP_NAME</code> / <code>COMPANY_NAME</code></li>' +
      '<li><code>frontend/assets/logo.svg</code>（ロゴ画像）</li>' +
      '</ul></div></div>';
  }

  return { render: render };
})();
