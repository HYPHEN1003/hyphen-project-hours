/**
 * Validator.gs － 入力検証
 * ------------------------------------------------------------------
 * Schema の列定義（required/type/enum）に基づく汎用検証 +
 * エンティティ固有のビジネスルール（REQUIREMENTS §5 / API_DESIGN §5）。
 * 不備があれば AppError(VALIDATION_ERROR) を throw する。
 */

/** 値が空（null/undefined/空文字）か */
function isEmpty(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

/** メール形式の簡易チェック */
function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v));
}

/** 'YYYY-MM-DD' 形式か */
function isDateStr(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v));
}

/** 'HH:mm' 形式か */
function isTimeStr(v) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v));
}

/** enum 値が許可リストに含まれるか */
function isInEnum(enumKey, v) {
  var list = ENUMS[enumKey];
  return list && list.indexOf(v) !== -1;
}

/**
 * Schema 定義ベースの汎用検証（required と enum と数値/日付型）。
 * @param {string} table
 * @param {Object} entity
 * @param {Object} [enumMap] 列key -> ENUMSキー の対応（固有指定が必要な場合）
 * @returns {Array} details（空なら問題なし）
 */
function validateBySchema(table, entity, enumMap) {
  enumMap = enumMap || {};
  var def = getTableDef(table);
  var details = [];
  def.columns.forEach(function (col) {
    if (AUDIT_COLUMNS.some(function (a) { return a.key === col.key; })) return;
    var v = entity[col.key];
    if (col.required && isEmpty(v)) {
      details.push({ field: col.key, message: col.label + 'は必須です' });
      return;
    }
    if (isEmpty(v)) return; // 任意かつ空はスキップ
    if (col.type === 'int' || col.type === 'num') {
      if (isNaN(Number(v))) details.push({ field: col.key, message: col.label + 'は数値で入力してください' });
    } else if (col.type === 'date') {
      if (!isDateStr(v)) details.push({ field: col.key, message: col.label + 'の日付形式が不正です（YYYY-MM-DD）' });
    } else if (col.type === 'time') {
      if (!isTimeStr(v)) details.push({ field: col.key, message: col.label + 'の時刻形式が不正です（HH:mm）' });
    } else if (col.type === 'enum' && enumMap[col.key]) {
      if (!isInEnum(enumMap[col.key], v)) details.push({ field: col.key, message: col.label + 'の値が不正です' });
    }
  });
  return details;
}

/** details が空でなければ VALIDATION_ERROR を throw */
function assertValid(details) {
  if (details && details.length > 0) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, details[0].message, details);
  }
}

// ===== エンティティ別の enum マッピング =====
var ENUM_MAP = {
  m_customers: { entity_type: 'customer_entity_type', rank: 'customer_rank', payment_terms: 'customer_payment_terms', closing_day: 'customer_closing_day', status: 'customer_status' },
  m_staff: { role: 'staff_role', status: 'staff_status' },
  m_work_items: { default_billing_type: 'time_billing_type' },
  projects: { contract_type: 'project_contract_type', status: 'project_status' },
  time_entries: { billing_type: 'time_billing_type', input_method: 'time_input_method' },
  expenses: { expense_type: 'expense_type', billing_type: 'expense_billing_type', approval_status: 'expense_approval' },
  invoices: { status: 'invoice_status' },
  invoice_items: { item_type: 'invoice_item_type' }
};

// ===== エンティティ別ビジネスルール =====

function validateCustomer(e) {
  var d = validateBySchema('m_customers', e, ENUM_MAP.m_customers);
  if (!isEmpty(e.email) && !isEmail(e.email)) d.push({ field: 'email', message: 'メールアドレスの形式が不正です' });
  assertValid(d);
}

function validateStaff(e) {
  var d = validateBySchema('m_staff', e, ENUM_MAP.m_staff);
  ['cost_rate', 'bill_rate', 'standard_hours'].forEach(function (k) {
    if (!isEmpty(e[k]) && Number(e[k]) < 0) d.push({ field: k, message: '0以上で入力してください' });
  });
  if (!isEmpty(e.target_utilization)) {
    var t = Number(e.target_utilization);
    if (t <= 0 || t > 1) d.push({ field: 'target_utilization', message: '稼働率目標は0より大きく1以下で入力してください' });
  }
  assertValid(d);
}

function validateProjectType(e) {
  var d = validateBySchema('m_project_types', e, {});
  if (!isEmpty(e.difficulty)) {
    var n = Number(e.difficulty);
    if (n < 1 || n > 5 || n % 1 !== 0) d.push({ field: 'difficulty', message: '難易度は1〜5の整数で入力してください' });
  }
  ['standard_hours', 'standard_price'].forEach(function (k) {
    if (!isEmpty(e[k]) && Number(e[k]) < 0) d.push({ field: k, message: '0以上で入力してください' });
  });
  assertValid(d);
}

function validateWorkItem(e) {
  var d = validateBySchema('m_work_items', e, ENUM_MAP.m_work_items);
  assertValid(d);
}

function validateProject(e) {
  var d = validateBySchema('projects', e, ENUM_MAP.projects);
  ['contract_amount', 'estimated_hours'].forEach(function (k) {
    if (!isEmpty(e[k]) && Number(e[k]) < 0) d.push({ field: k, message: '0以上で入力してください' });
  });
  assertValid(d);
}

function validateTimeEntry(e, minUnit) {
  // minutes / hours はサーバ側で算出するため Schema 必須チェックから除外し、
  // 下の「時刻ペア or 分」ルールで個別に検証する。
  var d = validateBySchema('time_entries', e, ENUM_MAP.time_entries).filter(function (x) {
    return x.field !== 'minutes' && x.field !== 'hours';
  });
  // start/end ペア か minutes のいずれか必須（Schema では minutes required だが Service で補完するため二重チェック）
  var hasTimes = !isEmpty(e.start_time) && !isEmpty(e.end_time);
  var hasMinutes = !isEmpty(e.minutes) && Number(e.minutes) > 0;
  if (!hasTimes && !hasMinutes) {
    d.push({ field: 'minutes', message: '開始/終了時刻、または作業時間（分）のいずれかを入力してください' });
  }
  if (hasTimes && isTimeStr(e.start_time) && isTimeStr(e.end_time)) {
    if (timeToMinutes(e.end_time) <= timeToMinutes(e.start_time)) {
      d.push({ field: 'end_time', message: '終了時刻は開始時刻より後にしてください' });
    }
  }
  if (hasMinutes) {
    var m = Number(e.minutes);
    if (m <= 0 || m > 1440) d.push({ field: 'minutes', message: '作業時間（分）は1〜1440で入力してください' });
  }
  assertValid(d);
}

function validateExpense(e) {
  var d = validateBySchema('expenses', e, ENUM_MAP.expenses);
  if (!isEmpty(e.amount) && Number(e.amount) <= 0) d.push({ field: 'amount', message: '金額は正の数で入力してください' });
  assertValid(d);
}

function validateInvoice(e) {
  var d = validateBySchema('invoices', e, ENUM_MAP.invoices);
  if (isDateStr(e.period_from) && isDateStr(e.period_to) && e.period_from > e.period_to) {
    d.push({ field: 'period_to', message: '請求期間の終了日は開始日以降にしてください' });
  }
  assertValid(d);
}
