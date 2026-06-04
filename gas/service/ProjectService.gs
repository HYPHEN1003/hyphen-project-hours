/**
 * ProjectService.gs － 案件の CRUD
 * ------------------------------------------------------------------
 * 一覧は集計シート(agg_projects)の値（実績工数・消化率・粗利益・アラート）を
 * マージして返し、表示側で再計算しない。
 * 削除は論理削除。FK（顧客・種別・主担当）は存在チェック。
 */

/** 案件一覧（既定: 進行中）。params.status / customer_id / owner_staff_id でフィルタ。 */
function listProjects(params) {
  params = params || {};
  var repo = getRepository();
  var where = {};
  // status 指定が無ければ既定で進行中。'all' で全件。
  if (params.status && params.status !== 'all') where.status = params.status;
  else if (!params.status) where.status = '進行中';
  if (params.customer_id) where.customer_id = params.customer_id;
  if (params.owner_staff_id) where.owner_staff_id = params.owner_staff_id;

  var rows = repo.findWhere('projects', Object.keys(where).length ? where : null, { orderBy: 'project_id', desc: true });
  return mergeProjectAggregates_(repo, rows);
}

/** 案件1件＋集計値 */
function getProject(id) {
  var repo = getRepository();
  var p = repo.findById('projects', id);
  if (!p) throw new AppError(ERROR_CODES.NOT_FOUND, '案件が見つかりません: ' + id);
  return mergeProjectAggregates_(repo, [p])[0];
}

/** 集計シートの実績値を案件にマージ（無ければ0/未集計） */
function mergeProjectAggregates_(repo, projects) {
  var aggs = repo.findAll('agg_projects');
  var byId = {};
  aggs.forEach(function (a) { byId[a.project_id] = a; });
  var customers = indexById_(repo.findAll('m_customers', { includeDeleted: true }), 'customer_id');
  var types = indexById_(repo.findAll('m_project_types', { includeDeleted: true }), 'type_id');
  var staff = indexById_(repo.findAll('m_staff', { includeDeleted: true }), 'staff_id');

  return projects.map(function (p) {
    var a = byId[p.project_id] || {};
    return Object.assign({}, p, {
      customer_name: customers[p.customer_id] ? customers[p.customer_id].name : '',
      type_name: types[p.type_id] ? types[p.type_id].name : '',
      owner_name: staff[p.owner_staff_id] ? staff[p.owner_staff_id].name : '',
      actual_hours: a.actual_hours != null ? a.actual_hours : 0,
      progress_rate: a.progress_rate != null ? a.progress_rate : null,
      total_cost: a.total_cost != null ? a.total_cost : 0,
      gross_profit: a.gross_profit != null ? a.gross_profit : null,
      gross_margin: a.gross_margin != null ? a.gross_margin : null,
      alert: a.alert || '正常'
    });
  });
}

function createProject(payload, actor) {
  validateProject(payload);
  return withLock(function () {
    var repo = getRepository();
    assertFkExists_(repo, 'm_customers', payload.customer_id, '顧客');
    if (!isEmpty(payload.type_id)) assertFkExists_(repo, 'm_project_types', payload.type_id, '案件種別');
    if (!isEmpty(payload.owner_staff_id)) assertFkExists_(repo, 'm_staff', payload.owner_staff_id, '主担当');
    payload.project_id = generateId(repo, 'PJT');
    if (isEmpty(payload.status)) payload.status = '進行中';
    var created = repo.insert('projects', payload, { actor: actor });
    return mergeProjectAggregates_(repo, [created])[0];
  });
}

function updateProject(payload, actor) {
  validateProject(payload);
  return withLock(function () {
    var repo = getRepository();
    var existing = repo.findById('projects', payload.project_id);
    if (!existing) throw new AppError(ERROR_CODES.NOT_FOUND, '案件が見つかりません');
    assertFkExists_(repo, 'm_customers', payload.customer_id, '顧客');
    if (!isEmpty(payload.type_id)) assertFkExists_(repo, 'm_project_types', payload.type_id, '案件種別');
    if (!isEmpty(payload.owner_staff_id)) assertFkExists_(repo, 'm_staff', payload.owner_staff_id, '主担当');
    // ステータスが「完了」へ変化したら完了日を自動セット（未指定時）
    if (payload.status === '完了' && existing.status !== '完了' && isEmpty(payload.completed_at)) {
      payload.completed_at = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    }
    var updated = repo.update('projects', payload.project_id, payload, { actor: actor });
    // 案件の数値が変わるので当該案件の集計を更新
    recalcProjects_({ projectIds: [payload.project_id] });
    return mergeProjectAggregates_(repo, [updated])[0];
  });
}

function deleteProject(id, actor) {
  return withLock(function () {
    var repo = getRepository();
    if (!repo.findById('projects', id)) throw new AppError(ERROR_CODES.NOT_FOUND, '案件が見つかりません');
    repo.softDelete('projects', id, { actor: actor });
    return { id: id, deleted: true };
  });
}

// ===== ヘルパ =====

/** 配列を id でインデックス化 */
function indexById_(rows, idKey) {
  var m = {};
  rows.forEach(function (r) { m[r[idKey]] = r; });
  return m;
}

/** FK の存在＆未削除を検証 */
function assertFkExists_(repo, table, id, label) {
  if (isEmpty(id)) return;
  var row = repo.findById(table, id);
  if (!row) throw new AppError(ERROR_CODES.FK_VIOLATION, label + 'が存在しません: ' + id);
}
