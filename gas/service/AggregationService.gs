/**
 * AggregationService.gs － バッチ集計＋レポート読み出し
 * ------------------------------------------------------------------
 * 生データ（工数・経費・請求・案件・スタッフ）を読み取り計算し、
 * 集計シート(agg_*)へ書き込む。【生データは絶対に更新しない】
 *
 * 集計タイミング（API_DESIGN §8.6 ハイブリッド）:
 *   - 即時: 工数/経費/案件 変更時に当該案件のみ aggregateProjects({projectIds})
 *   - 手動/夜間: 設定画面のボタンから全体集計（run*）
 *
 * report* / getDashboard は集計シートを読むだけ（重い再計算をしない）。
 */

/* =========================================================
 *  集計バッチ（書き込み）
 * ========================================================= */

/**
 * 案件別集計（公開・ロックあり）。設定画面の run* やトップレベルから呼ぶ。
 * opts.projectIds 指定でその案件のみ upsert、opts.includeAll で全件洗い替え。
 */
function aggregateProjects(opts) {
  return withLock(function () { return recalcProjects_(opts || {}); });
}

/**
 * 案件別集計の本体（ロックなし）。
 * 各 Service（工数/経費/案件 更新）は既に withLock 内なので、
 * 二重ロックを避けるためこの core を直接呼ぶ。
 */
function recalcProjects_(opts) {
  opts = opts || {};
  {
    var repo = getRepository();
    var cfg = getCalcConfig();
    var customers = indexById_(repo.findAll('m_customers', { includeDeleted: true }), 'customer_id');

    var targets;
    if (opts.includeAll) {
      targets = repo.findAll('projects');
    } else if (opts.projectIds && opts.projectIds.length) {
      targets = opts.projectIds.map(function (id) { return repo.findById('projects', id); }).filter(Boolean);
    } else {
      targets = repo.findWhere('projects', { status: '進行中' });
    }

    // 工数・経費を一括読みしてメモリ集計（N+1 回避）
    var allEntries = repo.findAll('time_entries');
    var allExpenses = repo.findAll('expenses');
    var laborByProj = sumByKey_(allEntries, 'project_id', 'cost_amount');
    var hoursByProj = sumByKey_(allEntries, 'project_id', 'hours');
    var expenseCostByProj = {};
    allExpenses.forEach(function (x) {
      if (x.billing_type === '含む' || x.billing_type === '自社負担') {
        expenseCostByProj[x.project_id] = (expenseCostByProj[x.project_id] || 0) + Number(x.amount || 0);
      }
    });

    var now = nowIso();
    var rows = targets.map(function (p) {
      var actualHours = round2_(hoursByProj[p.project_id] || 0);
      var laborCost = Math.round(laborByProj[p.project_id] || 0);
      var expenseCost = Math.round(expenseCostByProj[p.project_id] || 0);
      var totalCost = calcTotalCost(laborCost, expenseCost);
      var progress = calcProgressRate(actualHours, p.estimated_hours);
      var grossProfit = calcGrossProfit(p.contract_amount, totalCost);
      var grossMargin = calcGrossMargin(grossProfit, p.contract_amount);
      return {
        project_id: p.project_id,
        project_name: p.name,
        customer_name: customers[p.customer_id] ? customers[p.customer_id].name : '',
        contract_amount: Number(p.contract_amount || 0),
        estimated_hours: Number(p.estimated_hours || 0),
        actual_hours: actualHours,
        progress_rate: progress,
        labor_cost: laborCost,
        expense_cost: expenseCost,
        total_cost: totalCost,
        gross_profit: grossProfit,
        gross_margin: grossMargin,
        alert: judgeProgressAlert(progress, cfg.alertWarnRate, cfg.alertOverRate),
        aggregated_at: now
      };
    });

    if (opts.includeAll) {
      repo.replaceAll('agg_projects', rows);
    } else {
      rows.forEach(function (r) { repo.upsertByKeys('agg_projects', ['project_id'], r); });
    }
    return { updatedRows: rows.length, aggregated_at: now };
  }
}

/** 月次集計（指定月） */
function aggregateMonthly(yearMonth) {
  return withLock(function () {
    var repo = getRepository();
    var cfg = getCalcConfig();
    var now = nowIso();

    var revenue = sumInvoiceSubtotalForMonth_(repo, yearMonth);
    var prevRevenue = sumInvoiceSubtotalForMonth_(repo, prevMonth_(yearMonth));
    var laborCost = sumMonthField_(repo.findAll('time_entries'), 'work_date', yearMonth, 'cost_amount');
    var expenseCost = sumMonthExpenseCost_(repo.findAll('expenses'), yearMonth);
    var totalCost = calcTotalCost(laborCost, expenseCost);
    var grossProfit = calcGrossProfit(revenue, totalCost);

    var projects = repo.findAll('projects');
    var completedCount = projects.filter(function (p) { return ymOf_(p.completed_at) === yearMonth; }).length;
    var newCount = projects.filter(function (p) { return ymOf_(p.start_date) === yearMonth; }).length;

    var overallUtil = calcOverallUtilization_(repo, yearMonth);

    var row = {
      year_month: yearMonth,
      revenue: Math.round(revenue),
      mom_ratio: calcMoMRatio(revenue, prevRevenue),
      total_cost: totalCost,
      gross_profit: grossProfit,
      gross_margin: calcGrossMargin(grossProfit, revenue),
      completed_count: completedCount,
      new_count: newCount,
      overall_utilization: overallUtil,
      aggregated_at: now
    };
    repo.upsertByKeys('agg_monthly', ['year_month'], row);
    // 顧客別集計も同月で更新
    aggregateCustomerMonthly(yearMonth);
    return { updatedRows: 1, yearMonth: yearMonth, aggregated_at: now };
  });
}

/** スタッフ別集計（指定月） */
function aggregateStaffMonthly(yearMonth) {
  return withLock(function () {
    var repo = getRepository();
    var now = nowIso();
    var staffList = repo.findAll('m_staff');
    var entries = repo.findAll('time_entries').filter(function (e) { return ymOf_(e.work_date) === yearMonth; });
    var projects = repo.findAll('projects');

    var rows = staffList.map(function (s) {
      var mine = entries.filter(function (e) { return e.staff_id === s.staff_id; });
      var totalHours = round2_(sumField_(mine, 'hours'));
      var billableHours = round2_(sumField_(mine.filter(function (e) { return e.billing_type === '請求対象'; }), 'hours'));
      var util = calcUtilization(totalHours, s.standard_hours);
      var ownedActive = projects.filter(function (p) { return p.owner_staff_id === s.staff_id && p.status === '進行中'; }).length;
      var revenue = Math.round(sumField_(mine.filter(function (e) { return e.billing_type === '請求対象'; }), 'bill_amount'));
      return {
        year_month: yearMonth,
        staff_id: s.staff_id, staff_name: s.name, role: s.role || '',
        total_hours: totalHours, billable_hours: billableHours,
        utilization: util, target_achievement: calcTargetAchievement(util, s.target_utilization),
        project_count: ownedActive, revenue_contribution: revenue,
        aggregated_at: now
      };
    });
    rows.forEach(function (r) { repo.upsertByKeys('agg_staff_monthly', ['year_month', 'staff_id'], r); });
    return { updatedRows: rows.length, yearMonth: yearMonth, aggregated_at: now };
  });
}

/** 顧客別集計（指定月） */
function aggregateCustomerMonthly(yearMonth) {
  var repo = getRepository();
  var cfg = getCalcConfig();
  var now = nowIso();
  var customers = repo.findAll('m_customers');
  var projects = repo.findAll('projects');
  var projById = indexById_(projects, 'project_id');
  var entries = repo.findAll('time_entries').filter(function (e) { return ymOf_(e.work_date) === yearMonth; });
  var invoices = repo.findAll('invoices').filter(function (i) { return ymOf_(i.invoice_date) === yearMonth; });
  var expenses = repo.findAll('expenses').filter(function (x) { return ymOf_(x.expense_date) === yearMonth; });

  var rows = customers.map(function (c) {
    var custProjIds = projects.filter(function (p) { return p.customer_id === c.customer_id; }).map(function (p) { return p.project_id; });
    var idset = {}; custProjIds.forEach(function (id) { idset[id] = true; });
    var custEntries = entries.filter(function (e) { return idset[e.project_id]; });
    var custInvoices = invoices.filter(function (i) { return i.customer_id === c.customer_id; });
    var revenue = Math.round(sumField_(custInvoices, 'subtotal'));
    var totalHours = round2_(sumField_(custEntries, 'hours'));
    var laborCost = Math.round(sumField_(custEntries, 'cost_amount'));
    var expCost = 0;
    expenses.forEach(function (x) {
      if (idset[x.project_id] && (x.billing_type === '含む' || x.billing_type === '自社負担')) expCost += Number(x.amount || 0);
    });
    var grossProfit = calcGrossProfit(revenue, calcTotalCost(laborCost, expCost));
    var grossMargin = calcGrossMargin(grossProfit, revenue);
    var activeProjCount = custInvoices.length ? uniq_(custInvoices.map(function (i) { return i.project_id; })).length
      : uniq_(custEntries.map(function (e) { return e.project_id; })).length;
    return {
      year_month: yearMonth,
      customer_id: c.customer_id, customer_name: c.name, rank: c.rank || '',
      project_count: activeProjCount, revenue: revenue, total_hours: totalHours,
      gross_profit: grossProfit, gross_margin: grossMargin,
      profitability: judgeProfitability(grossMargin, cfg.marginGoodRate, cfg.marginWarnRate),
      aggregated_at: now
    };
  }).filter(function (r) { return r.revenue !== 0 || r.total_hours !== 0; }); // 動きのある顧客のみ

  rows.forEach(function (r) { repo.upsertByKeys('agg_customer_monthly', ['year_month', 'customer_id'], r); });
  return { updatedRows: rows.length };
}

/** 見積精度分析（完了案件） */
function analyzeEstimateAccuracy() {
  return withLock(function () {
    var repo = getRepository();
    var now = nowIso();
    var projects = repo.findAll('projects').filter(function (p) { return p.status === '完了' || p.status === '請求済' || p.status === '入金済'; });
    var types = indexById_(repo.findAll('m_project_types', { includeDeleted: true }), 'type_id');
    var hoursByProj = sumByKey_(repo.findAll('time_entries'), 'project_id', 'hours');

    var rows = projects.map(function (p) {
      var actual = round2_(hoursByProj[p.project_id] || 0);
      var variance = calcVarianceRate(actual, p.estimated_hours);
      return {
        project_id: p.project_id, project_name: p.name,
        type_id: p.type_id || '', type_name: types[p.type_id] ? types[p.type_id].name : '',
        estimated_hours: Number(p.estimated_hours || 0), actual_hours: actual,
        variance_rate: variance, accuracy: judgeAccuracy(variance),
        suggestion: buildEstimateSuggestion(variance), aggregated_at: now
      };
    });
    repo.replaceAll('agg_estimate_accuracy', rows);
    return { updatedRows: rows.length, aggregated_at: now };
  });
}

/** 稼働予測（指定月）。単純モデル: 確定(進行中)案件の残見積を主担当に計上。 */
function forecastCapacity(yearMonth) {
  return withLock(function () {
    var repo = getRepository();
    var cfg = getCalcConfig();
    var now = nowIso();
    var staffList = repo.findAll('m_staff');
    var projects = repo.findAll('projects').filter(function (p) { return p.status === '進行中'; });
    var hoursByProj = sumByKey_(repo.findAll('time_entries'), 'project_id', 'hours');
    var entriesThisMonth = repo.findAll('time_entries').filter(function (e) { return ymOf_(e.work_date) === yearMonth; });

    var rows = staffList.filter(function (s) { return s.status === '在籍'; }).map(function (s) {
      var available = Number(s.standard_hours || 0);
      // 確定案件の残見積（主担当ぶん）
      var committed = 0;
      projects.filter(function (p) { return p.owner_staff_id === s.staff_id; }).forEach(function (p) {
        var remain = Number(p.estimated_hours || 0) - (hoursByProj[p.project_id] || 0);
        if (remain > 0) committed += remain;
      });
      committed = round2_(committed);
      var actualThisMonth = round2_(sumField_(entriesThisMonth.filter(function (e) { return e.staff_id === s.staff_id; }), 'hours'));
      var forecast = round2_(actualThisMonth + committed);
      var util = calcForecastUtilization(forecast, available);
      return {
        year_month: yearMonth,
        staff_id: s.staff_id, staff_name: s.name,
        available_hours: available, committed_hours: committed, forecast_hours: forecast,
        forecast_utilization: util, free_hours: round2_(available - forecast),
        alert: judgeForecastAlert(util, cfg.utilOverRate, cfg.utilLowRate),
        aggregated_at: now
      };
    });
    rows.forEach(function (r) { repo.upsertByKeys('agg_capacity_forecast', ['year_month', 'staff_id'], r); });
    return { updatedRows: rows.length, yearMonth: yearMonth, aggregated_at: now };
  });
}

/**
 * 全集計シートを作り直す（メンテ用）。
 * 壊れた集計や月跨ぎのデータを一括で正しく再生成する。
 * データのある月を自動抽出し、月次/スタッフ/顧客/案件/見積/稼働予測を全更新。
 */
function rebuildAggregates() {
  var repo = getRepository();
  // 1. 集計シートを全クリア（ロック下）
  withLock(function () {
    AGG_TABLES.forEach(function (t) { repo.replaceAll(t, []); });
  });
  // 2. データのある月を抽出
  var months = distinctDataMonths_(repo);
  // 3. 再集計（各関数が個別に withLock）
  aggregateProjects({ includeAll: true });
  analyzeEstimateAccuracy();
  months.forEach(function (m) { aggregateMonthly(m); aggregateStaffMonthly(m); });
  forecastCapacity(currentMonthStr_());
  forecastCapacity(nextMonthStr_());
  return { months: months, count: months.length };
}

/** time_entries / invoices / projects からデータのある 'YYYY-MM' を抽出 */
function distinctDataMonths_(repo) {
  var set = {};
  repo.findAll('time_entries').forEach(function (e) { var m = ymOf_(e.work_date); if (m) set[m] = true; });
  repo.findAll('invoices').forEach(function (i) { var m = ymOf_(i.invoice_date); if (m) set[m] = true; });
  repo.findAll('expenses').forEach(function (x) { var m = ymOf_(x.expense_date); if (m) set[m] = true; });
  // 当月は必ず含める
  set[currentMonthStr_()] = true;
  return Object.keys(set).sort();
}

/** 'YYYY-MM' の翌月 */
function nextMonthStr_() {
  var d = new Date(); d.setMonth(d.getMonth() + 1);
  return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM');
}

/* =========================================================
 *  レポート読み出し（集計シート参照のみ）
 * ========================================================= */

function reportProjects(params) {
  var repo = getRepository();
  var rows = repo.findAll('agg_projects', { orderBy: 'project_id' });
  if (params && params.customer_name) rows = rows.filter(function (r) { return r.customer_name === params.customer_name; });
  return rows;
}

function reportStaff(yearMonth) {
  yearMonth = yearMonth || currentMonthStr_();
  var repo = getRepository();
  return repo.findWhere('agg_staff_monthly', { year_month: yearMonth }, { orderBy: 'staff_id' });
}

function reportMonthly(from, to) {
  var repo = getRepository();
  var rows = repo.findAll('agg_monthly', { orderBy: 'year_month' });
  if (from) rows = rows.filter(function (r) { return r.year_month >= from; });
  if (to) rows = rows.filter(function (r) { return r.year_month <= to; });
  return rows;
}

function reportCustomers(yearMonth) {
  yearMonth = yearMonth || currentMonthStr_();
  var repo = getRepository();
  return repo.findWhere('agg_customer_monthly', { year_month: yearMonth }, { orderBy: 'revenue', desc: true });
}

function reportEstimateAccuracy() {
  var repo = getRepository();
  var rows = repo.findAll('agg_estimate_accuracy', { orderBy: 'project_id' });
  // 種別別の平均乖離率サマリーを併せて返す
  var byType = {};
  rows.forEach(function (r) {
    if (r.variance_rate === null || r.variance_rate === undefined) return;
    if (!byType[r.type_id]) byType[r.type_id] = { type_id: r.type_id, type_name: r.type_name, sum: 0, count: 0 };
    byType[r.type_id].sum += r.variance_rate; byType[r.type_id].count++;
  });
  var typeSummary = Object.keys(byType).map(function (k) {
    var t = byType[k];
    return { type_id: t.type_id, type_name: t.type_name, avg_variance: round3_(t.sum / t.count), count: t.count };
  });
  return { rows: rows, typeSummary: typeSummary };
}

function reportForecast(yearMonth) {
  yearMonth = yearMonth || currentMonthStr_();
  var repo = getRepository();
  return repo.findWhere('agg_capacity_forecast', { year_month: yearMonth }, { orderBy: 'staff_id' });
}

/** ダッシュボード（集計シート参照） */
function getDashboard() {
  var repo = getRepository();
  var projects = repo.findAll('projects');
  var activeCount = projects.filter(function (p) { return p.status === '進行中'; }).length;
  var totalCount = projects.length;

  var ym = currentMonthStr_();
  var monthHours = round2_(sumField_(
    repo.findAll('time_entries').filter(function (e) { return ymOf_(e.work_date) === ym; }), 'hours'));

  var aggP = repo.findAll('agg_projects');
  var alerts = aggP.filter(function (a) { return a.alert === '警告' || a.alert === '超過'; })
    .sort(function (a, b) { return (b.progress_rate || 0) - (a.progress_rate || 0); });

  var monthly = repo.findAll('agg_monthly', { orderBy: 'year_month' });
  var recent = monthly.slice(-6);
  var currentRevenue = 0;
  var cur = monthly.filter(function (m) { return m.year_month === ym; })[0];
  if (cur) currentRevenue = cur.revenue;

  return {
    activeProjectCount: activeCount,
    totalProjectCount: totalCount,
    currentMonthHours: monthHours,
    currentMonthRevenue: currentRevenue,
    alertCount: alerts.length,
    alerts: alerts,
    recentMonthly: recent
  };
}

/* =========================================================
 *  集計用ヘルパ
 * ========================================================= */

function sumField_(rows, field) {
  var s = 0; rows.forEach(function (r) { s += Number(r[field] || 0); }); return s;
}
function sumByKey_(rows, keyField, valField) {
  var m = {};
  rows.forEach(function (r) { m[r[keyField]] = (m[r[keyField]] || 0) + Number(r[valField] || 0); });
  return m;
}
function sumMonthField_(rows, dateField, ym, valField) {
  var s = 0;
  rows.forEach(function (r) { if (ymOf_(r[dateField]) === ym) s += Number(r[valField] || 0); });
  return s;
}
function sumMonthExpenseCost_(expenses, ym) {
  var s = 0;
  expenses.forEach(function (x) {
    if (ymOf_(x.expense_date) === ym && (x.billing_type === '含む' || x.billing_type === '自社負担')) s += Number(x.amount || 0);
  });
  return s;
}
function sumInvoiceSubtotalForMonth_(repo, ym) {
  var invoices = repo.findAll('invoices').filter(function (i) { return ymOf_(i.invoice_date) === ym; });
  return sumField_(invoices, 'subtotal');
}
function calcOverallUtilization_(repo, ym) {
  var staffList = repo.findAll('m_staff').filter(function (s) { return s.status === '在籍'; });
  var entries = repo.findAll('time_entries').filter(function (e) { return ymOf_(e.work_date) === ym; });
  var totalHours = sumField_(entries, 'hours');
  var totalStandard = sumField_(staffList, 'standard_hours');
  return calcUtilization(totalHours, totalStandard);
}

/** 'YYYY-MM-DD' → 'YYYY-MM'（空は ''） */
function ymOf_(dateStr) {
  if (!dateStr) return '';
  return String(dateStr).substring(0, 7);
}
/** 'YYYY-MM' の前月 */
function prevMonth_(ym) {
  var y = Number(ym.substring(0, 4)), m = Number(ym.substring(5, 7));
  m--; if (m < 1) { m = 12; y--; }
  return y + '-' + (m < 10 ? '0' + m : '' + m);
}
function round2_(n) { return Math.round(Number(n) * 100) / 100; }
function round3_(n) { return Math.round(Number(n) * 1000) / 1000; }
