/**
 * TimeEntryService.gs － 工数の CRUD・一括入力・タイマー保存
 * ------------------------------------------------------------------
 * 保存時に CalcUtil で時間換算・丸め・原価/請求金額を計算し、
 * スタッフ単価を「スナップショット」として工数レコードに保存する
 *（後の単価改定で過去金額が変動しないようにする / REQUIREMENTS §4.1）。
 * 保存・更新・削除のたびに、対象案件の集計（agg_projects）を即時更新する。
 */

/** 履歴一覧（staff_id / project_id / 日付範囲 / billing_type でフィルタ） */
function listTimeEntries(params) {
  params = params || {};
  var repo = getRepository();
  var where = {};
  if (params.staff_id) where.staff_id = params.staff_id;
  if (params.project_id) where.project_id = params.project_id;
  if (params.billing_type) where.billing_type = params.billing_type;
  var opts = { orderBy: 'work_date', desc: true };
  if (params.from || params.to) { opts.dateField = 'work_date'; opts.from = params.from; opts.to = params.to; }
  var rows = repo.findWhere('time_entries', Object.keys(where).length ? where : null, opts);
  // 表示名を付与
  return decorateTimeEntries_(repo, rows);
}

/** 工数に スタッフ名・案件名・作業項目名 を付与（表示用） */
function decorateTimeEntries_(repo, rows) {
  var staff = indexById_(repo.findAll('m_staff', { includeDeleted: true }), 'staff_id');
  var projects = indexById_(repo.findAll('projects', { includeDeleted: true }), 'project_id');
  var works = indexById_(repo.findAll('m_work_items', { includeDeleted: true }), 'work_item_id');
  return rows.map(function (r) {
    return Object.assign({}, r, {
      staff_name: staff[r.staff_id] ? staff[r.staff_id].name : '',
      project_name: projects[r.project_id] ? projects[r.project_id].name : '',
      work_item_name: works[r.work_item_id] ? works[r.work_item_id].name : ''
    });
  });
}

/**
 * 工数1件の保存用エンティティを構築（時間換算・丸め・単価スナップ・金額計算）。
 * @returns {Object} 保存可能な time_entries エンティティ（IDは未採番）
 */
function buildTimeEntry_(repo, payload, cfg) {
  // 1. 分を決定（minutes 直接 or 時刻差）
  var minutes;
  if (!isEmpty(payload.minutes) && Number(payload.minutes) > 0) {
    minutes = Number(payload.minutes);
  } else {
    minutes = calcMinutesFromTimes(payload.start_time, payload.end_time);
  }
  // 2. 最小入力単位で丸め
  minutes = roundMinutes(minutes, cfg.minInputMinutes);
  if (minutes <= 0) throw new AppError(ERROR_CODES.VALIDATION_ERROR, '作業時間が0です。入力を確認してください。');
  var hours = calcHoursFromMinutes(minutes);

  // 3. スタッフ単価のスナップショット
  var staff = repo.findById('m_staff', payload.staff_id);
  if (!staff) throw new AppError(ERROR_CODES.FK_VIOLATION, 'スタッフが存在しません');
  var costRate = Number(staff.cost_rate || 0);
  var billRate = Number(staff.bill_rate || 0);

  return {
    work_date: payload.work_date,
    staff_id: payload.staff_id,
    project_id: payload.project_id,
    work_item_id: payload.work_item_id,
    start_time: payload.start_time || '',
    end_time: payload.end_time || '',
    minutes: minutes,
    hours: hours,
    billing_type: payload.billing_type,
    cost_rate_snapshot: costRate,
    bill_rate_snapshot: billRate,
    cost_amount: calcCostAmount(costRate, hours),
    bill_amount: calcBillAmount(billRate, hours, payload.billing_type),
    input_method: payload.input_method || '個別',
    description: payload.description || ''
  };
}

/** 個別入力 */
function createTimeEntry(payload, actor) {
  validateTimeEntry(payload);
  return withLock(function () {
    var repo = getRepository();
    assertFkExists_(repo, 'projects', payload.project_id, '案件');
    assertFkExists_(repo, 'm_work_items', payload.work_item_id, '作業項目');
    var cfg = getCalcConfig();
    var entity = buildTimeEntry_(repo, payload, cfg);
    entity.time_entry_id = generateId(repo, 'KOSU');
    var created = repo.insert('time_entries', entity, { actor: actor });
    recalcProjects_({ projectIds: [entity.project_id] });
    return decorateTimeEntries_(repo, [created])[0];
  });
}

/** 工数更新（金額再計算・案件集計更新） */
function updateTimeEntry(payload, actor) {
  validateTimeEntry(payload);
  return withLock(function () {
    var repo = getRepository();
    var existing = repo.findById('time_entries', payload.time_entry_id);
    if (!existing) throw new AppError(ERROR_CODES.NOT_FOUND, '工数が見つかりません');
    var cfg = getCalcConfig();
    var entity = buildTimeEntry_(repo, payload, cfg);
    var updated = repo.update('time_entries', payload.time_entry_id, entity, { actor: actor });
    // 案件が変わった場合は両方の案件を再集計
    var ids = [entity.project_id];
    if (existing.project_id !== entity.project_id) ids.push(existing.project_id);
    recalcProjects_({ projectIds: ids });
    return decorateTimeEntries_(repo, [updated])[0];
  });
}

/** 工数削除（論理削除・案件集計更新） */
function deleteTimeEntry(id, actor) {
  return withLock(function () {
    var repo = getRepository();
    var existing = repo.findById('time_entries', id);
    if (!existing) throw new AppError(ERROR_CODES.NOT_FOUND, '工数が見つかりません');
    repo.softDelete('time_entries', id, { actor: actor });
    recalcProjects_({ projectIds: [existing.project_id] });
    return { id: id, deleted: true };
  });
}

/**
 * 一括入力（複数行）。全行検証→全成功 or 全失敗（部分成功させない）。
 * payload = { staff_id, work_date, rows:[{project_id, work_item_id, minutes, billing_type, description}] }
 */
function bulkCreateTimeEntries(payload, actor) {
  var rows = payload.rows || [];
  if (!rows.length) throw new AppError(ERROR_CODES.VALIDATION_ERROR, '入力行がありません');
  var details = [];
  var normalized = rows.map(function (r, i) {
    var p = {
      work_date: payload.work_date, staff_id: payload.staff_id,
      project_id: r.project_id, work_item_id: r.work_item_id,
      minutes: r.minutes, billing_type: r.billing_type,
      description: r.description, input_method: '一括'
    };
    try { validateTimeEntry(p); } catch (e) {
      (e.details || [{ message: e.message }]).forEach(function (d) {
        details.push({ field: '行' + (i + 1) + '.' + (d.field || ''), message: '行' + (i + 1) + ': ' + d.message });
      });
    }
    return p;
  });
  assertValid(details);

  return withLock(function () {
    var repo = getRepository();
    var cfg = getCalcConfig();
    var entities = normalized.map(function (p) {
      assertFkExists_(repo, 'projects', p.project_id, '案件');
      assertFkExists_(repo, 'm_work_items', p.work_item_id, '作業項目');
      var e = buildTimeEntry_(repo, p, cfg);
      e.time_entry_id = generateId(repo, 'KOSU');
      return e;
    });
    var created = repo.insertMany('time_entries', entities, { actor: actor });
    // 影響案件をユニーク集計
    var projIds = uniq_(entities.map(function (e) { return e.project_id; }));
    recalcProjects_({ projectIds: projIds });
    return { count: created.length, items: decorateTimeEntries_(repo, created) };
  });
}

/**
 * タイマー保存。elapsed_seconds を分換算→丸め→個別入力と同じ保存。
 * payload = { staff_id, project_id, work_item_id, start_time, end_time, elapsed_seconds, billing_type, description }
 */
function saveTimerEntry(payload, actor) {
  var minutes = Math.round(Number(payload.elapsed_seconds || 0) / 60);
  var p = Object.assign({}, payload, { minutes: minutes, input_method: 'タイマー' });
  validateTimeEntry(p);
  return withLock(function () {
    var repo = getRepository();
    assertFkExists_(repo, 'projects', p.project_id, '案件');
    assertFkExists_(repo, 'm_work_items', p.work_item_id, '作業項目');
    var cfg = getCalcConfig();
    var entity = buildTimeEntry_(repo, p, cfg);
    entity.time_entry_id = generateId(repo, 'KOSU');
    var created = repo.insert('time_entries', entity, { actor: actor });
    recalcProjects_({ projectIds: [entity.project_id] });
    return decorateTimeEntries_(repo, [created])[0];
  });
}

/** 配列のユニーク化 */
function uniq_(arr) {
  var seen = {}, out = [];
  arr.forEach(function (v) { if (!seen[v]) { seen[v] = true; out.push(v); } });
  return out;
}
