/**
 * MasterService.gs － マスタ（顧客 / スタッフ / 案件種別 / 作業項目）の CRUD
 * ------------------------------------------------------------------
 * すべて Repository 経由。書き込みは withLock 下で採番→保存。
 * 削除は論理削除（softDelete）。
 */

// ===== 汎用（一覧・取得・削除） =====

/** マスタ一覧（論理削除除外）。params.status 等で簡易フィルタ可。 */
function listMaster(table, params) {
  var repo = getRepository();
  var where = {};
  if (params && params.status) where.status = params.status;
  var opts = { orderBy: getTableDef(table).pk };
  // 並び順の調整
  if (table === 'm_customers') opts.orderBy = 'name_kana';
  if (table === 'm_work_items') opts.orderBy = 'sort_order';
  return repo.findWhere(table, Object.keys(where).length ? where : null, opts);
}

/** マスタ1件取得 */
function getMaster(table, id) {
  var repo = getRepository();
  var row = repo.findById(table, id);
  if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, '対象が見つかりません: ' + id);
  return row;
}

/** マスタ論理削除 */
function deleteMaster(table, id, actor) {
  return withLock(function () {
    var repo = getRepository();
    if (!repo.findById(table, id)) throw new AppError(ERROR_CODES.NOT_FOUND, '対象が見つかりません: ' + id);
    repo.softDelete(table, id, { actor: actor });
    return { id: id, deleted: true };
  });
}

// ===== 顧客 =====

function createCustomer(payload, actor) {
  validateCustomer(payload);
  return withLock(function () {
    var repo = getRepository();
    payload.customer_id = generateId(repo, 'CUS');
    if (isEmpty(payload.status)) payload.status = '取引中';
    return repo.insert('m_customers', payload, { actor: actor });
  });
}

function updateCustomer(payload, actor) {
  validateCustomer(payload);
  return withLock(function () {
    var repo = getRepository();
    return repo.update('m_customers', payload.customer_id, payload, { actor: actor });
  });
}

// ===== スタッフ =====

function createStaff(payload, actor) {
  validateStaff(payload);
  return withLock(function () {
    var repo = getRepository();
    payload.staff_id = generateId(repo, 'STF');
    if (isEmpty(payload.status)) payload.status = '在籍';
    if (isEmpty(payload.standard_hours)) payload.standard_hours = 160;
    if (isEmpty(payload.target_utilization)) payload.target_utilization = 0.80;
    return repo.insert('m_staff', payload, { actor: actor });
  });
}

function updateStaff(payload, actor) {
  validateStaff(payload);
  return withLock(function () {
    var repo = getRepository();
    return repo.update('m_staff', payload.staff_id, payload, { actor: actor });
  });
}

// ===== 案件種別 =====

function createProjectType(payload, actor) {
  validateProjectType(payload);
  return withLock(function () {
    var repo = getRepository();
    payload.type_id = generateId(repo, 'KND');
    return repo.insert('m_project_types', payload, { actor: actor });
  });
}

function updateProjectType(payload, actor) {
  validateProjectType(payload);
  return withLock(function () {
    var repo = getRepository();
    return repo.update('m_project_types', payload.type_id, payload, { actor: actor });
  });
}

// ===== 作業項目 =====

function createWorkItem(payload, actor) {
  validateWorkItem(payload);
  return withLock(function () {
    var repo = getRepository();
    payload.work_item_id = generateId(repo, 'WRK');
    return repo.insert('m_work_items', payload, { actor: actor });
  });
}

function updateWorkItem(payload, actor) {
  validateWorkItem(payload);
  return withLock(function () {
    var repo = getRepository();
    return repo.update('m_work_items', payload.work_item_id, payload, { actor: actor });
  });
}
