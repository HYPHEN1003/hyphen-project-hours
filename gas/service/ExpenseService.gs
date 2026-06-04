/**
 * ExpenseService.gs － 経費の CRUD・承認
 * ------------------------------------------------------------------
 * 「実費請求」かつ「承認」の経費 → 請求書の実費金額に算入（InvoiceService）。
 * 「含む」「自社負担」 → 案件原価に算入（AggregationService）。
 * 変更時は対象案件の集計を即時更新（原価が変わるため）。
 */

/** 経費一覧（project_id / staff_id / approval_status / billing_type / 日付範囲） */
function listExpenses(params) {
  params = params || {};
  var repo = getRepository();
  var where = {};
  if (params.project_id) where.project_id = params.project_id;
  if (params.staff_id) where.staff_id = params.staff_id;
  if (params.approval_status) where.approval_status = params.approval_status;
  if (params.billing_type) where.billing_type = params.billing_type;
  if (params.expense_type) where.expense_type = params.expense_type;
  var opts = { orderBy: 'expense_date', desc: true };
  if (params.from || params.to) { opts.dateField = 'expense_date'; opts.from = params.from; opts.to = params.to; }
  var rows = repo.findWhere('expenses', Object.keys(where).length ? where : null, opts);
  return decorateExpenses_(repo, rows);
}

function decorateExpenses_(repo, rows) {
  var staff = indexById_(repo.findAll('m_staff', { includeDeleted: true }), 'staff_id');
  var projects = indexById_(repo.findAll('projects', { includeDeleted: true }), 'project_id');
  return rows.map(function (r) {
    return Object.assign({}, r, {
      staff_name: staff[r.staff_id] ? staff[r.staff_id].name : '',
      project_name: projects[r.project_id] ? projects[r.project_id].name : ''
    });
  });
}

function createExpense(payload, actor) {
  validateExpense(payload);
  return withLock(function () {
    var repo = getRepository();
    assertFkExists_(repo, 'projects', payload.project_id, '案件');
    assertFkExists_(repo, 'm_staff', payload.staff_id, 'スタッフ');
    payload.expense_id = generateId(repo, 'KEIHI');
    if (isEmpty(payload.approval_status)) payload.approval_status = '申請中';
    var created = repo.insert('expenses', payload, { actor: actor });
    recalcProjects_({ projectIds: [payload.project_id] });
    return decorateExpenses_(repo, [created])[0];
  });
}

function updateExpense(payload, actor) {
  validateExpense(payload);
  return withLock(function () {
    var repo = getRepository();
    var existing = repo.findById('expenses', payload.expense_id);
    if (!existing) throw new AppError(ERROR_CODES.NOT_FOUND, '経費が見つかりません');
    var updated = repo.update('expenses', payload.expense_id, payload, { actor: actor });
    var ids = [payload.project_id];
    if (existing.project_id !== payload.project_id) ids.push(existing.project_id);
    recalcProjects_({ projectIds: ids });
    return decorateExpenses_(repo, [updated])[0];
  });
}

function deleteExpense(id, actor) {
  return withLock(function () {
    var repo = getRepository();
    var existing = repo.findById('expenses', id);
    if (!existing) throw new AppError(ERROR_CODES.NOT_FOUND, '経費が見つかりません');
    repo.softDelete('expenses', id, { actor: actor });
    recalcProjects_({ projectIds: [existing.project_id] });
    return { id: id, deleted: true };
  });
}

/** 承認状態の変更（申請中→承認/却下）。payload={expense_id, approval_status} */
function approveExpense(payload, actor) {
  if (!isInEnum('expense_approval', payload.approval_status)) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, '承認状態の値が不正です');
  }
  return withLock(function () {
    var repo = getRepository();
    var existing = repo.findById('expenses', payload.expense_id);
    if (!existing) throw new AppError(ERROR_CODES.NOT_FOUND, '経費が見つかりません');
    var updated = repo.update('expenses', payload.expense_id, { approval_status: payload.approval_status }, { actor: actor });
    return decorateExpenses_(repo, [updated])[0];
  });
}
