/**
 * Main.gs － Web アプリのエントリポイント（Controller / ルーター）
 * ------------------------------------------------------------------
 * doGet/doPost で受けたリクエストを action に応じて Service へ振り分ける。
 * 役割: ルーティング・入出力整形・例外のエンベロープ化（計算/データ処理はしない）。
 *
 * REST スタイル: GET=参照系 / POST=更新系（API_DESIGN §1）。
 * レスポンスは常に HTTP 200、本体の ok/error で結果を表す。
 */

/** GET（参照系） */
function doGet(e) {
  return handleRequest_(e, 'GET');
}

/** POST（更新系） */
function doPost(e) {
  return handleRequest_(e, 'POST');
}

/** 共通リクエスト処理 */
function handleRequest_(e, method) {
  var requestId = '';
  try {
    var ctx = parseRequest_(e);
    requestId = ctx.requestId;
    var handler = ROUTES[ctx.action];
    if (!handler) {
      return fail(ERROR_CODES.NOT_FOUND, '不明なアクションです: ' + ctx.action, null, { requestId: requestId });
    }
    var result = handler(ctx);
    // handler は data（生値）を返す。エンベロープ化はここで行う。
    return ok(result, { requestId: requestId });
  } catch (err) {
    return failFromError(err, { requestId: requestId });
  }
}

/**
 * リクエストを解析して { action, params, payload, actor, requestId } を返す。
 * GET: クエリパラメータ。POST: body(JSON) を優先、無ければクエリ。
 */
function parseRequest_(e) {
  e = e || {};
  var params = (e.parameter) || {};
  var body = {};
  if (e.postData && e.postData.contents) {
    try { body = JSON.parse(e.postData.contents); } catch (ignore) { body = {}; }
  }
  var action = body.action || params.action;
  var meta = body.meta || {};
  return {
    action: action,
    params: params,                    // GET 用のクエリ
    payload: body.payload || {},       // POST 用のデータ
    actor: meta.actor || params.actor || '',
    requestId: meta.requestId || params.requestId || ''
  };
}

/* =================================================================
 *  ルート定義（action -> handler(ctx) -> data）
 *  handler は data（生値）を返すこと。例外は throw（AppError 推奨）。
 * ================================================================= */
var ROUTES = {
  // ---- 共通 ----
  ping: function () { return { pong: true, time: nowIso() }; },
  bootstrap: function () { return bootstrapData(); },

  // ---- 顧客 ----
  listCustomers: function (c) { return listMaster('m_customers', c.params); },
  getCustomer: function (c) { return getMaster('m_customers', c.params.id); },
  createCustomer: function (c) { return createCustomer(c.payload, c.actor); },
  updateCustomer: function (c) { return updateCustomer(c.payload, c.actor); },
  deleteCustomer: function (c) { return deleteMaster('m_customers', c.payload.id, c.actor); },

  // ---- スタッフ ----
  listStaff: function (c) { return listMaster('m_staff', c.params); },
  getStaff: function (c) { return getMaster('m_staff', c.params.id); },
  createStaff: function (c) { return createStaff(c.payload, c.actor); },
  updateStaff: function (c) { return updateStaff(c.payload, c.actor); },
  deleteStaff: function (c) { return deleteMaster('m_staff', c.payload.id, c.actor); },

  // ---- 案件種別 ----
  listProjectTypes: function (c) { return listMaster('m_project_types', c.params); },
  getProjectType: function (c) { return getMaster('m_project_types', c.params.id); },
  createProjectType: function (c) { return createProjectType(c.payload, c.actor); },
  updateProjectType: function (c) { return updateProjectType(c.payload, c.actor); },
  deleteProjectType: function (c) { return deleteMaster('m_project_types', c.payload.id, c.actor); },

  // ---- 作業項目 ----
  listWorkItems: function (c) { return listMaster('m_work_items', c.params); },
  createWorkItem: function (c) { return createWorkItem(c.payload, c.actor); },
  updateWorkItem: function (c) { return updateWorkItem(c.payload, c.actor); },
  deleteWorkItem: function (c) { return deleteMaster('m_work_items', c.payload.id, c.actor); },

  // ---- 案件 ----
  listProjects: function (c) { return listProjects(c.params); },
  getProject: function (c) { return getProject(c.params.id); },
  createProject: function (c) { return createProject(c.payload, c.actor); },
  updateProject: function (c) { return updateProject(c.payload, c.actor); },
  deleteProject: function (c) { return deleteProject(c.payload.id, c.actor); },

  // ---- 工数 ----
  listTimeEntries: function (c) { return listTimeEntries(mergeParams_(c)); },
  createTimeEntry: function (c) { return createTimeEntry(c.payload, c.actor); },
  updateTimeEntry: function (c) { return updateTimeEntry(c.payload, c.actor); },
  deleteTimeEntry: function (c) { return deleteTimeEntry(c.payload.id, c.actor); },
  bulkCreateTimeEntries: function (c) { return bulkCreateTimeEntries(c.payload, c.actor); },
  saveTimerEntry: function (c) { return saveTimerEntry(c.payload, c.actor); },

  // ---- 経費 ----
  listExpenses: function (c) { return listExpenses(mergeParams_(c)); },
  createExpense: function (c) { return createExpense(c.payload, c.actor); },
  updateExpense: function (c) { return updateExpense(c.payload, c.actor); },
  deleteExpense: function (c) { return deleteExpense(c.payload.id, c.actor); },
  approveExpense: function (c) { return approveExpense(c.payload, c.actor); },

  // ---- 請求 ----
  listInvoices: function (c) { return listInvoices(mergeParams_(c)); },
  getInvoice: function (c) { return getInvoice(c.params.id); },
  calculateInvoice: function (c) { return calculateInvoice(c.payload); },
  createInvoice: function (c) { return createInvoice(c.payload, c.actor); },
  updateInvoice: function (c) { return updateInvoice(c.payload, c.actor); },
  deleteInvoice: function (c) { return deleteInvoice(c.payload.id, c.actor); },
  recordPayment: function (c) { return recordPayment(c.payload, c.actor); },

  // ---- レポート ----
  getDashboard: function () { return getDashboard(); },
  reportProjects: function (c) { return reportProjects(c.params); },
  reportStaff: function (c) { return reportStaff(c.params.yearMonth); },
  reportMonthly: function (c) { return reportMonthly(c.params.from, c.params.to); },
  reportCustomers: function (c) { return reportCustomers(c.params.yearMonth); },

  // ---- 分析 ----
  analyzeEstimateAccuracy: function () { return reportEstimateAccuracy(); },
  forecastCapacity: function (c) { return reportForecast(c.params.yearMonth); },

  // ---- 設定・集計実行 ----
  getSettings: function () { return getSettingsMap(); },
  updateSettings: function (c) { return updateSettings(c.payload, c.actor); },
  runAggregateProjects: function () { return aggregateProjects({ includeAll: true }); },
  runAggregateMonthly: function (c) { return aggregateMonthly(c.payload.yearMonth || lastMonthStr_()); },
  runAggregateStaff: function (c) { return aggregateStaffMonthly(c.payload.yearMonth || lastMonthStr_()); },
  runAnalyzeEstimate: function () { return analyzeEstimateAccuracy(); },
  runForecastCapacity: function (c) { return forecastCapacity(c.payload.yearMonth || currentMonthStr_()); }
};

/** GET/POST どちらでも検索条件を拾えるよう params と payload をマージ */
function mergeParams_(c) {
  var merged = {};
  Object.keys(c.params || {}).forEach(function (k) { merged[k] = c.params[k]; });
  Object.keys(c.payload || {}).forEach(function (k) { merged[k] = c.payload[k]; });
  return merged;
}

/**
 * bootstrap: 画面初期化に必要なマスタ・設定をまとめて返す（往復削減）。
 */
function bootstrapData() {
  var repo = getRepository();
  return {
    customers: repo.findAll('m_customers', { orderBy: 'name_kana' }),
    staff: repo.findAll('m_staff', { orderBy: 'staff_id' }),
    projectTypes: repo.findAll('m_project_types', { orderBy: 'type_id' }),
    workItems: repo.findAll('m_work_items', { orderBy: 'sort_order' }),
    settings: getSettingsMap()
  };
}

/** 'YYYY-MM'（今月） */
function currentMonthStr_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM');
}
/** 'YYYY-MM'（先月） */
function lastMonthStr_() {
  var d = new Date();
  d.setMonth(d.getMonth() - 1);
  return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM');
}
