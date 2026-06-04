/**
 * time.js － 工数入力画面（個別 / 一括 / タイマー / 履歴）
 */
App.pages.time = (function () {
  var BILLING = ['請求対象', '内部', 'サービス'].map(v => ({ value: v, label: v }));
  var projectOptionsCache = null;
  var tickHandle = null;

  function render(content, actions) {
    actions.innerHTML = '';
    content.innerHTML =
      '<div class="tabs">' +
        '<button class="tab active" data-tab="single">個別入力</button>' +
        '<button class="tab" data-tab="bulk">一括入力</button>' +
        '<button class="tab" data-tab="timer">タイマー</button>' +
        '<button class="tab" data-tab="history">履歴</button>' +
      '</div><div id="tab-body"></div>';
    content.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () {
        content.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        switchTab(t.getAttribute('data-tab'));
      });
    });
    // プロジェクト選択肢を取得してから初期タブ
    loadProjectOptions().then(function () { switchTab('single'); });
  }

  function loadProjectOptions() {
    return App.api.get('listProjects', { status: 'all' }).then(function (rows) {
      projectOptionsCache = rows.map(function (p) { return { value: p.project_id, label: p.name }; });
    });
  }
  function projOpts() { return projectOptionsCache || []; }

  function switchTab(tab) {
    if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
    var body = document.getElementById('tab-body');
    if (tab === 'single') renderSingle(body);
    else if (tab === 'bulk') renderBulk(body);
    else if (tab === 'timer') renderTimer(body);
    else renderHistory(body);
  }

  /* ===== (A) 個別入力 ===== */
  function renderSingle(body) {
    var fields = [
      { key: 'work_date', label: '記録日', type: 'date', required: true, value: App.fmt.today() },
      { key: 'staff_id', label: 'スタッフ', type: 'select', required: true, options: App.store.staffOptions() },
      { key: 'project_id', label: '案件', type: 'select', required: true, options: projOpts() },
      { key: 'work_item_id', label: '作業項目', type: 'select', required: true, options: App.store.workItemOptions() },
      { key: 'start_time', label: '開始時刻', type: 'time' },
      { key: 'end_time', label: '終了時刻', type: 'time' },
      { key: 'minutes', label: '作業時間（分）', type: 'number', min: 0, step: 5, hint: '時刻入力の代わりに分で直接入力も可' },
      { key: 'billing_type', label: '請求区分', type: 'select', required: true, options: BILLING, value: '請求対象' },
      { key: 'description', label: '作業内容', type: 'textarea', full: true }
    ];
    body.innerHTML =
      '<div class="card"><h2>個別入力</h2><form id="single-form">' + App.form.build(fields) + '</form>' +
      '<div class="modal-footer" style="border:0;padding:0;margin-top:8px"><button class="btn btn-primary" id="save-single">保存</button></div></div>' +
      '<div class="section mt-16"><div class="section-title">本日の入力</div><div id="today-list"></div></div>';

    var form = body.querySelector('#single-form');
    bindTimeAutoCalc(form);
    bindWorkItemBilling(form);
    body.querySelector('#save-single').addEventListener('click', function (btn) {
      saveSingle(form, body);
    });
    refreshTodayList(body, form);
    form.querySelector('[data-key="staff_id"]').addEventListener('change', function () { refreshTodayList(body, form); });
    form.querySelector('[data-key="work_date"]').addEventListener('change', function () { refreshTodayList(body, form); });
  }

  function saveSingle(form, body) {
    App.form.clearErrors(form);
    var payload = App.form.read(form);
    payload.input_method = '個別';
    App.api.post('createTimeEntry', payload).then(function () {
      App.toast.success('工数を保存しました');
      // 入力項目の一部をリセット（連続入力しやすく）
      form.querySelector('[data-key="minutes"]').value = '';
      form.querySelector('[data-key="start_time"]').value = '';
      form.querySelector('[data-key="end_time"]').value = '';
      form.querySelector('[data-key="description"]').value = '';
      refreshTodayList(body, form);
    }).catch(function (e) {
      if (e.code === 'VALIDATION_ERROR' && e.details) App.form.showErrors(form, e.details);
      else App.toast.error(e.message);
    });
  }

  function refreshTodayList(body, form) {
    var staff = form.querySelector('[data-key="staff_id"]').value;
    var date = form.querySelector('[data-key="work_date"]').value;
    var box = body.querySelector('#today-list');
    if (!staff || !date) { box.innerHTML = '<div class="text-mute">スタッフと記録日を選択すると当日の入力が表示されます。</div>'; return; }
    App.api.get('listTimeEntries', { staff_id: staff, from: date, to: date }).then(function (rows) {
      var total = rows.reduce(function (s, r) { return s + Number(r.hours || 0); }, 0);
      App.table.render(box, {
        columns: [
          { key: 'project_name', label: '案件' },
          { key: 'work_item_name', label: '作業項目' },
          { key: 'hours', label: '時間', num: true, render: r => App.fmt.hours(r.hours) },
          { key: 'billing_type', label: '請求区分' },
          { key: 'description', label: '内容', render: r => App.fmt.esc(r.description) }
        ],
        rows: rows, emptyText: '当日の入力はまだありません。',
        footerHtml: '合計 ' + App.fmt.hours(total)
      });
    });
  }

  /* ===== (B) 一括入力 ===== */
  function renderBulk(body) {
    body.innerHTML =
      '<div class="card"><h2>一括入力</h2>' +
      '<div class="form-grid">' +
        '<div class="field"><label>スタッフ<span class="req">*</span></label><select id="bulk-staff" data-key="staff_id">' + selOptions(App.store.staffOptions(), true) + '</select></div>' +
        '<div class="field"><label>記録日<span class="req">*</span></label><input type="date" id="bulk-date" value="' + App.fmt.today() + '"/></div>' +
      '</div>' +
      '<table class="data bulk-table" id="bulk-rows"><thead><tr><th>案件</th><th>作業項目</th><th>作業時間(分)</th><th>請求区分</th><th>作業内容</th><th></th></tr></thead><tbody></tbody></table>' +
      '<div class="mt-8"><button class="btn btn-secondary btn-sm" id="add-row">＋ 行追加</button></div>' +
      '<div class="modal-footer" style="border:0;padding:0;margin-top:12px"><button class="btn btn-primary" id="save-bulk">一括登録</button></div></div>';

    var tbody = body.querySelector('#bulk-rows tbody');
    function addRow() {
      var tr = document.createElement('tr');
      tr.className = 'bulk-row';
      tr.innerHTML =
        '<td><select data-k="project_id">' + selOptions(projOpts(), true) + '</select></td>' +
        '<td><select data-k="work_item_id">' + selOptions(App.store.workItemOptions(), true) + '</select></td>' +
        '<td><input type="number" data-k="minutes" min="0" step="5" style="width:90px"/></td>' +
        '<td><select data-k="billing_type">' + selOptions(BILLING, false) + '</select></td>' +
        '<td><input type="text" data-k="description"/></td>' +
        '<td><button class="btn btn-ghost btn-sm del">×</button></td>';
      tr.querySelector('.del').addEventListener('click', function () { tr.remove(); });
      tbody.appendChild(tr);
    }
    addRow(); addRow();
    body.querySelector('#add-row').addEventListener('click', addRow);
    body.querySelector('#save-bulk').addEventListener('click', function () { saveBulk(body); });
  }

  function saveBulk(body) {
    var staff = body.querySelector('#bulk-staff').value;
    var date = body.querySelector('#bulk-date').value;
    if (!staff || !date) { App.toast.error('スタッフと記録日を選択してください'); return; }
    var rows = [];
    body.querySelectorAll('#bulk-rows tbody tr').forEach(function (tr) {
      var r = {};
      tr.querySelectorAll('[data-k]').forEach(function (el) { r[el.getAttribute('data-k')] = el.value; });
      // 空行（案件も分も未入力）はスキップ
      if (!r.project_id && !r.minutes) return;
      rows.push(r);
    });
    if (!rows.length) { App.toast.error('入力行がありません'); return; }
    App.api.post('bulkCreateTimeEntries', { staff_id: staff, work_date: date, rows: rows }).then(function (res) {
      App.toast.success(res.count + ' 件を登録しました');
      renderBulk(body);
    }).catch(function (e) {
      if (e.code === 'VALIDATION_ERROR' && e.details) App.toast.error(e.details[0].message);
      else App.toast.error(e.message);
    });
  }

  /* ===== (C) タイマー ===== */
  function renderTimer(body) {
    body.innerHTML =
      '<div class="card" style="max-width:560px;margin:0 auto"><h2>タイマー</h2>' +
      '<div class="field"><label>案件<span class="req">*</span></label><select id="t-project">' + selOptions(projOpts(), true) + '</select></div>' +
      '<div class="field"><label>作業項目<span class="req">*</span></label><select id="t-work">' + selOptions(App.store.workItemOptions(), true) + '</select></div>' +
      '<div id="t-display" class="timer-display">00:00:00</div>' +
      '<div class="timer-controls">' +
        '<button class="btn btn-primary" id="t-start">▶ 開始</button>' +
        '<button class="btn btn-secondary" id="t-pause" disabled>⏸ 一時停止</button>' +
        '<button class="btn btn-danger" id="t-stop" disabled>■ 停止・保存</button>' +
      '</div>' +
      '<div class="field"><label>請求区分</label><select id="t-billing">' + selOptions(BILLING, false) + '</select></div>' +
      '<div class="field"><label>作業内容</label><input type="text" id="t-desc"/></div>' +
      '<p class="text-mute" style="font-size:12px">※ ブラウザを閉じても計測は保持されます（最小入力単位で丸めて保存）。</p>' +
      '</div>';

    var disp = body.querySelector('#t-display');
    var bStart = body.querySelector('#t-start'), bPause = body.querySelector('#t-pause'), bStop = body.querySelector('#t-stop');
    var elP = body.querySelector('#t-project'), elW = body.querySelector('#t-work'), elB = body.querySelector('#t-billing'), elD = body.querySelector('#t-desc');

    // 既存の計測状態を復元
    var st = App.timer.load();
    if (st) {
      if (st.project_id) elP.value = st.project_id;
      if (st.work_item_id) elW.value = st.work_item_id;
      if (st.billing_type) elB.value = st.billing_type;
      if (st.description) elD.value = st.description;
    }
    updateUI();

    function updateUI() {
      var s = App.timer.load();
      var running = s && s.running;
      var paused = s && !s.running && (s.accumSec > 0);
      disp.textContent = App.fmt.clock(App.timer.elapsedSec(s));
      disp.className = 'timer-display' + (running ? ' running' : (paused ? ' paused' : ''));
      disp.innerHTML = (running ? '<span class="rec-dot"></span>' : '') + App.fmt.clock(App.timer.elapsedSec(s));
      bStart.disabled = running;
      bStart.textContent = paused ? '▶ 再開' : '▶ 開始';
      bPause.disabled = !running;
      bStop.disabled = !(running || paused);
      elP.disabled = running || paused; elW.disabled = running || paused;
    }

    function tick() { disp.innerHTML = '<span class="rec-dot"></span>' + App.fmt.clock(App.timer.elapsedSec(App.timer.load())); }

    bStart.addEventListener('click', function () {
      if (!elP.value || !elW.value) { App.toast.error('案件と作業項目を選択してください'); return; }
      var existing = App.timer.load();
      if (existing && !existing.running && existing.accumSec > 0) App.timer.resume();
      else App.timer.start({ project_id: elP.value, work_item_id: elW.value, billing_type: elB.value, description: elD.value });
      if (tickHandle) clearInterval(tickHandle);
      tickHandle = setInterval(tick, 1000);
      updateUI();
    });
    bPause.addEventListener('click', function () {
      App.timer.pause(); if (tickHandle) { clearInterval(tickHandle); tickHandle = null; } updateUI();
    });
    bStop.addEventListener('click', function () {
      var s = App.timer.pause();
      if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
      var elapsed = App.timer.elapsedSec(s);
      if (elapsed < 1) { App.toast.error('計測時間がありません'); return; }
      var payload = {
        staff_id: App.store.staffOptions()[0] ? null : null, // スタッフは下で選択させる
      };
      // 停止時にスタッフを選ばせる（タイマーは個人利用想定だが明示選択）
      App.modal.open({
        title: '工数として保存',
        bodyHtml: '<p>計測時間: <b>' + App.fmt.clock(elapsed) + '</b>（最小入力単位で丸めて保存します）</p>' +
          '<div class="field mt-8"><label>スタッフ<span class="req">*</span></label><select id="stop-staff">' + selOptions(App.store.staffOptions(), true) + '</select></div>' +
          '<div class="field"><label>記録日</label><input type="date" id="stop-date" value="' + App.fmt.today() + '"/></div>',
        footerButtons: [
          { label: 'キャンセル', class: 'btn-secondary', onClick: function (close) { close(); } },
          { label: '保存', class: 'btn-primary', onClick: function (close, btn) {
            var staffId = document.getElementById('stop-staff').value;
            if (!staffId) { App.toast.error('スタッフを選択してください'); return; }
            var p = {
              staff_id: staffId, work_date: document.getElementById('stop-date').value,
              project_id: s.project_id || elP.value, work_item_id: s.work_item_id || elW.value,
              billing_type: elB.value, description: elD.value, elapsed_seconds: elapsed
            };
            return App.api.post('saveTimerEntry', p).then(function () {
              App.toast.success('工数を保存しました');
              App.timer.clear();
              close();
              updateUI();
            }).catch(function (e) { App.toast.error(e.message); return Promise.reject(e); });
          } }
        ]
      });
    });

    // 計測中ならtick再開
    if (st && st.running) { tickHandle = setInterval(tick, 1000); }
  }

  /* ===== (D) 履歴 ===== */
  function renderHistory(body) {
    body.innerHTML =
      '<div class="filter-bar">' +
        '<div class="field"><label>スタッフ</label><select id="h-staff">' + selOptions(App.store.staffOptions(), false, '全員') + '</select></div>' +
        '<div class="field"><label>案件</label><select id="h-proj">' + selOptions(projOpts(), false, 'すべて') + '</select></div>' +
        '<div class="field"><label>請求区分</label><select id="h-bill">' + selOptions(BILLING, false, 'すべて') + '</select></div>' +
        '<div class="field"><label>開始日</label><input type="date" id="h-from"/></div>' +
        '<div class="field"><label>終了日</label><input type="date" id="h-to"/></div>' +
        '<button class="btn btn-secondary" id="h-search">検索</button>' +
      '</div><div id="h-table"></div>';
    body.querySelector('#h-search').addEventListener('click', function () { loadHistory(body); });
    loadHistory(body);
  }

  function loadHistory(body) {
    var params = {
      staff_id: body.querySelector('#h-staff').value,
      project_id: body.querySelector('#h-proj').value,
      billing_type: body.querySelector('#h-bill').value,
      from: body.querySelector('#h-from').value,
      to: body.querySelector('#h-to').value
    };
    var box = body.querySelector('#h-table');
    box.innerHTML = '<div class="flex" style="justify-content:center;padding:30px"><div class="spinner"></div></div>';
    App.api.get('listTimeEntries', params).then(function (rows) {
      var totH = rows.reduce((s, r) => s + Number(r.hours || 0), 0);
      var totCost = rows.reduce((s, r) => s + Number(r.cost_amount || 0), 0);
      var totBill = rows.reduce((s, r) => s + Number(r.bill_amount || 0), 0);
      App.table.render(box, {
        columns: [
          { key: 'work_date', label: '記録日', render: r => App.fmt.date(r.work_date) },
          { key: 'staff_name', label: 'スタッフ' },
          { key: 'project_name', label: '案件' },
          { key: 'work_item_name', label: '作業項目' },
          { key: 'hours', label: '時間', num: true, render: r => App.fmt.hours(r.hours) },
          { key: 'billing_type', label: '請求区分' },
          { key: 'cost_amount', label: '原価', num: true, render: r => App.fmt.yen(r.cost_amount) },
          { key: 'bill_amount', label: '請求', num: true, render: r => App.fmt.yen(r.bill_amount) },
          { key: 'description', label: '内容', render: r => App.fmt.esc(r.description) }
        ],
        rows: rows, emptyText: '該当する工数がありません。',
        footerHtml: rows.length + ' 件 ／ 合計 ' + App.fmt.hours(totH) + '・原価 ' + App.fmt.yen(totCost) + '・請求 ' + App.fmt.yen(totBill),
        onRowClick: function (r) { openHistoryEdit(r, body); }
      });
    }).catch(function (e) { box.innerHTML = '<div class="card text-danger">読み込み失敗: ' + App.fmt.esc(e.message) + '</div>'; });
  }

  function openHistoryEdit(row, body) {
    var fields = [
      { key: 'work_date', label: '記録日', type: 'date', required: true, value: row.work_date },
      { key: 'staff_id', label: 'スタッフ', type: 'select', required: true, options: App.store.staffOptions(), value: row.staff_id },
      { key: 'project_id', label: '案件', type: 'select', required: true, options: projOpts(), value: row.project_id },
      { key: 'work_item_id', label: '作業項目', type: 'select', required: true, options: App.store.workItemOptions(), value: row.work_item_id },
      { key: 'start_time', label: '開始時刻', type: 'time', value: row.start_time },
      { key: 'end_time', label: '終了時刻', type: 'time', value: row.end_time },
      { key: 'minutes', label: '作業時間（分）', type: 'number', min: 0, step: 5, value: row.minutes },
      { key: 'billing_type', label: '請求区分', type: 'select', required: true, options: BILLING, value: row.billing_type },
      { key: 'description', label: '作業内容', type: 'textarea', value: row.description, full: true }
    ];
    App.crud.editModal({
      title: '工数 編集', fields: fields, isNew: false, wide: true,
      updateAction: 'updateTimeEntry', deleteAction: 'deleteTimeEntry',
      idKey: 'time_entry_id', idValue: row.time_entry_id,
      onDone: function () { loadHistory(body); }
    });
  }

  /* ===== 共通 ===== */
  function bindTimeAutoCalc(form) {
    var st = form.querySelector('[data-key="start_time"]');
    var et = form.querySelector('[data-key="end_time"]');
    var mn = form.querySelector('[data-key="minutes"]');
    function recalc() {
      if (st.value && et.value) {
        var diff = (toMin(et.value) - toMin(st.value));
        if (diff > 0) { mn.value = diff; mn.disabled = true; } else { mn.disabled = false; }
      } else { mn.disabled = false; }
    }
    st.addEventListener('change', recalc); et.addEventListener('change', recalc);
  }
  function bindWorkItemBilling(form) {
    var wi = form.querySelector('[data-key="work_item_id"]');
    var bl = form.querySelector('[data-key="billing_type"]');
    wi.addEventListener('change', function () {
      var w = App.store.get().workItems.filter(x => x.work_item_id === wi.value)[0];
      if (w && w.default_billing_type) bl.value = w.default_billing_type;
    });
  }
  function toMin(hhmm) { var p = hhmm.split(':'); return Number(p[0]) * 60 + Number(p[1]); }
  function selOptions(opts, required, allLabel) {
    var head = required ? '<option value="">選択してください</option>' : '<option value="">' + (allLabel || '（未選択）') + '</option>';
    return head + opts.map(o => '<option value="' + App.fmt.esc(o.value) + '">' + App.fmt.esc(o.label) + '</option>').join('');
  }

  return { render: render };
})();
