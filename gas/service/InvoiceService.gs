/**
 * InvoiceService.gs － 請求書の自動計算・採番・CRUD・入金
 * ------------------------------------------------------------------
 * 自動計算（calculateInvoice）: 案件の契約形態に応じた基本報酬 +
 *   請求期間内の請求対象工数（タイムチャージ）+ 承認済み実費請求経費 +
 *   消費税（設定税率）。保存はしない（プレビュー）。
 * 採番: INV-YYYYMM-連番（請求日の年月・月内リセット・ロック下）。
 */

/** 請求一覧（customer_id / status / 日付範囲） */
function listInvoices(params) {
  params = params || {};
  var repo = getRepository();
  var where = {};
  if (params.customer_id) where.customer_id = params.customer_id;
  if (params.status) where.status = params.status;
  var opts = { orderBy: 'invoice_date', desc: true };
  if (params.from || params.to) { opts.dateField = 'invoice_date'; opts.from = params.from; opts.to = params.to; }
  var rows = repo.findWhere('invoices', Object.keys(where).length ? where : null, opts);
  // 支払期限超過かつ未入金は表示上「遅延」に補正
  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  rows = rows.map(function (r) { return applyOverdue_(r, today); });
  return decorateInvoices_(repo, rows);
}

/** 請求1件＋明細 */
function getInvoice(id) {
  var repo = getRepository();
  var inv = repo.findById('invoices', id);
  if (!inv) throw new AppError(ERROR_CODES.NOT_FOUND, '請求が見つかりません: ' + id);
  var items = repo.findWhere('invoice_items', { invoice_id: id }, { orderBy: 'invoice_item_id' });
  var decorated = decorateInvoices_(repo, [inv])[0];
  decorated.items = items;
  return decorated;
}

function decorateInvoices_(repo, rows) {
  var customers = indexById_(repo.findAll('m_customers', { includeDeleted: true }), 'customer_id');
  var projects = indexById_(repo.findAll('projects', { includeDeleted: true }), 'project_id');
  return rows.map(function (r) {
    return Object.assign({}, r, {
      customer_name: customers[r.customer_id] ? customers[r.customer_id].name : '',
      project_name: projects[r.project_id] ? projects[r.project_id].name : ''
    });
  });
}

/** 支払期限超過かつ未入金（下書き以外）なら status を遅延に補正 */
function applyOverdue_(inv, today) {
  if (inv.due_date && inv.due_date < today &&
      inv.status !== '入金済' && inv.status !== '下書き' &&
      Number(inv.paid_amount || 0) < Number(inv.total || 0)) {
    return Object.assign({}, inv, { status: '遅延' });
  }
  return inv;
}

/**
 * 自動計算（保存しないプレビュー）。
 * payload = { customer_id, project_id, period_from, period_to, invoice_date }
 */
function calculateInvoice(payload) {
  var repo = getRepository();
  var cfg = getCalcConfig();
  var project = repo.findById('projects', payload.project_id);
  if (!project) throw new AppError(ERROR_CODES.FK_VIOLATION, '案件が存在しません');

  // 1. 基本報酬（契約形態別）
  var baseFee = calcBaseFee(project.contract_type, project.contract_amount);

  // 2. タイムチャージ（期間内・請求対象工数の請求金額合計）
  var entries = repo.findWhere('time_entries', { project_id: payload.project_id, billing_type: '請求対象' },
    { dateField: 'work_date', from: payload.period_from, to: payload.period_to });
  var timeCharge = 0;
  var timeItems = [];
  entries.forEach(function (e) {
    timeCharge += Number(e.bill_amount || 0);
  });
  if (timeCharge > 0) {
    timeItems.push({ item_type: 'タイムチャージ', description: '請求対象工数（' + payload.period_from + '〜' + payload.period_to + '）', quantity: sumHours_(entries), unit_price: 0, amount: Math.round(timeCharge), source_ref: '' });
  }

  // 3. 実費（期間内・承認済み・実費請求の経費合計）
  var expenses = repo.findWhere('expenses', { project_id: payload.project_id, billing_type: '実費請求', approval_status: '承認' },
    { dateField: 'expense_date', from: payload.period_from, to: payload.period_to });
  var expenseAmount = 0;
  var expenseItems = [];
  expenses.forEach(function (x) {
    expenseAmount += Number(x.amount || 0);
    expenseItems.push({ item_type: '実費', description: x.expense_type + (x.description ? '（' + x.description + '）' : ''), quantity: 1, unit_price: Number(x.amount), amount: Number(x.amount), source_ref: x.expense_id });
  });

  // 4. 小計・税・合計
  var subtotal = Math.round(baseFee + timeCharge + expenseAmount);
  var tax = calcTax(subtotal, cfg.taxRate);
  var total = subtotal + tax;

  // 明細候補
  var items = [];
  if (baseFee > 0) items.push({ item_type: '基本報酬', description: project.name + '（' + (project.contract_type || '') + '）', quantity: 1, unit_price: baseFee, amount: baseFee, source_ref: project.project_id });
  items = items.concat(timeItems).concat(expenseItems);

  return {
    customer_id: payload.customer_id, project_id: payload.project_id,
    invoice_date: payload.invoice_date, period_from: payload.period_from, period_to: payload.period_to,
    base_fee: baseFee, time_charge: Math.round(timeCharge), expense_amount: Math.round(expenseAmount),
    subtotal: subtotal, tax_rate: cfg.taxRate, tax: tax, total: total,
    items: items
  };
}

function sumHours_(entries) {
  var h = 0;
  entries.forEach(function (e) { h += Number(e.hours || 0); });
  return Math.round(h * 100) / 100;
}

/** 請求作成（採番→ヘッダ＋明細保存）。payload は calculateInvoice 結果＋due_date,status,items */
function createInvoice(payload, actor) {
  validateInvoice(payload);
  return withLock(function () {
    var repo = getRepository();
    var cfg = getCalcConfig();
    var yyyymm = String(payload.invoice_date).substring(0, 7).replace('-', ''); // YYYYMM
    var invoiceId = generateInvoiceId(repo, cfg.invoicePrefix, yyyymm);

    var header = {
      invoice_id: invoiceId,
      customer_id: payload.customer_id, project_id: payload.project_id,
      invoice_date: payload.invoice_date, period_from: payload.period_from, period_to: payload.period_to,
      base_fee: num_(payload.base_fee), time_charge: num_(payload.time_charge), expense_amount: num_(payload.expense_amount),
      subtotal: num_(payload.subtotal), tax_rate: Number(payload.tax_rate || cfg.taxRate), tax: num_(payload.tax), total: num_(payload.total),
      paid_amount: num_(payload.paid_amount), due_date: payload.due_date || '', status: payload.status || '下書き'
    };
    var created = repo.insert('invoices', header, { actor: actor });

    // 明細保存
    var items = payload.items || [];
    var itemEntities = items.map(function (it) {
      return {
        invoice_item_id: generateId(repo, 'INVL'),
        invoice_id: invoiceId, item_type: it.item_type, description: it.description || '',
        quantity: num_(it.quantity), unit_price: num_(it.unit_price), amount: num_(it.amount), source_ref: it.source_ref || ''
      };
    });
    if (itemEntities.length) repo.insertMany('invoice_items', itemEntities, { actor: actor });

    var result = decorateInvoices_(repo, [created])[0];
    result.items = itemEntities;
    return result;
  });
}

/** 請求更新（金額・ステータス・支払期限など） */
function updateInvoice(payload, actor) {
  validateInvoice(payload);
  return withLock(function () {
    var repo = getRepository();
    if (!repo.findById('invoices', payload.invoice_id)) throw new AppError(ERROR_CODES.NOT_FOUND, '請求が見つかりません');
    var patch = {
      base_fee: num_(payload.base_fee), time_charge: num_(payload.time_charge), expense_amount: num_(payload.expense_amount),
      subtotal: num_(payload.subtotal), tax_rate: Number(payload.tax_rate), tax: num_(payload.tax), total: num_(payload.total),
      due_date: payload.due_date || '', status: payload.status,
      period_from: payload.period_from, period_to: payload.period_to, invoice_date: payload.invoice_date
    };
    var updated = repo.update('invoices', payload.invoice_id, patch, { actor: actor });
    return decorateInvoices_(repo, [updated])[0];
  });
}

function deleteInvoice(id, actor) {
  return withLock(function () {
    var repo = getRepository();
    if (!repo.findById('invoices', id)) throw new AppError(ERROR_CODES.NOT_FOUND, '請求が見つかりません');
    repo.softDelete('invoices', id, { actor: actor });
    // 明細も論理削除
    var items = repo.findWhere('invoice_items', { invoice_id: id });
    items.forEach(function (it) { repo.softDelete('invoice_items', it.invoice_item_id, { actor: actor }); });
    return { id: id, deleted: true };
  });
}

/** 入金登録。payload={invoice_id, paid_amount}。ステータスを自動判定。 */
function recordPayment(payload, actor) {
  return withLock(function () {
    var repo = getRepository();
    var inv = repo.findById('invoices', payload.invoice_id);
    if (!inv) throw new AppError(ERROR_CODES.NOT_FOUND, '請求が見つかりません');
    var paid = num_(payload.paid_amount);
    var total = Number(inv.total || 0);
    var status;
    if (paid >= total && total > 0) status = '入金済';
    else if (paid > 0) status = '一部入金';
    else status = inv.status;
    var updated = repo.update('invoices', payload.invoice_id, { paid_amount: paid, status: status }, { actor: actor });
    return decorateInvoices_(repo, [updated])[0];
  });
}

/** 数値化（空→0） */
function num_(v) { return isEmpty(v) ? 0 : Math.round(Number(v)); }
