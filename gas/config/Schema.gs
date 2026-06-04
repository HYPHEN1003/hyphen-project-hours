/**
 * Schema.gs － シート定義の「単一の真実 (Single Source of Truth)」
 * ------------------------------------------------------------------
 * 全シートの物理名・列定義・enum・設定キーをここに集約する。
 * Repository / Service / Setup はすべてこの定義を参照し、
 * シート名や列名を直書きしない（変更時の影響範囲を一点に閉じ込める）。
 *
 * 列定義の各要素:
 *   key   : 物理名（JSON のキー。Supabase のカラム名と一致させる）
 *   label : スプレッドシート1行目に出力する日本語ヘッダ
 *   type  : 'text'|'int'|'num'|'date'|'time'|'datetime'|'bool'|'enum'
 *   pk    : 主キーなら true
 *   fk    : 参照先テーブル名（任意。バリデーションで使用）
 *
 * 監査列 (is_deleted / created_at / created_by / updated_at / updated_by) は
 * audited=true のテーブルに自動付与する（buildTable 内）。
 */

/** 監査列（生データ系テーブルの末尾に自動付与） */
var AUDIT_COLUMNS = [
  { key: 'is_deleted', label: '削除フラグ', type: 'bool' },
  { key: 'created_at', label: '作成日時', type: 'datetime' },
  { key: 'created_by', label: '作成者', type: 'text' },
  { key: 'updated_at', label: '更新日時', type: 'datetime' },
  { key: 'updated_by', label: '更新者', type: 'text' }
];

/**
 * テーブル定義ヘルパ。audited=true なら監査列を末尾に付与する。
 * @param {string} table 物理テーブル名（= シート名）
 * @param {string} prefix ID接頭辞（採番用。無いものは null）
 * @param {Array} columns 列定義
 * @param {Object} [opts] { audited:boolean }
 */
function buildTable(table, prefix, columns, opts) {
  opts = opts || {};
  var audited = opts.audited !== false; // 既定は監査あり
  var cols = audited ? columns.concat(AUDIT_COLUMNS) : columns.slice();
  var pkCol = columns.filter(function (c) { return c.pk; })[0];
  return {
    table: table,
    prefix: prefix,
    audited: audited,
    pk: pkCol ? pkCol.key : columns[0].key,
    columns: cols
  };
}

/** enum 許可値（バリデーションで参照） */
var ENUMS = {
  customer_entity_type: ['法人', '個人'],
  customer_rank: ['A', 'B', 'C'],
  customer_payment_terms: ['翌月末', '翌々月末', '当月末'],
  customer_closing_day: ['末日', '15日', '20日', '25日'],
  customer_status: ['取引中', '休止', '解約'],
  staff_role: ['代表', 'パートナー', 'マネージャー', 'スタッフ', 'アシスタント'],
  staff_status: ['在籍', '休職', '退職'],
  project_contract_type: ['スポット', '顧問', 'タイムチャージ', '固定'],
  project_status: ['見積中', '進行中', '完了', '請求済', '入金済', '中止'],
  time_billing_type: ['請求対象', '内部', 'サービス'],
  time_input_method: ['個別', '一括', 'タイマー'],
  expense_type: ['交通費', '宿泊費', '印紙代', '登録免許税', '外注費', '通信費', '消耗品費', 'その他'],
  expense_billing_type: ['実費請求', '含む', '自社負担'],
  expense_approval: ['申請中', '承認', '却下'],
  invoice_status: ['下書き', '発行済', '入金済', '一部入金', '遅延'],
  invoice_item_type: ['基本報酬', 'タイムチャージ', '実費'],
  project_alert: ['正常', '警告', '超過'],
  profitability: ['高', '中', '低', '赤字'],
  forecast_alert: ['過負荷', '適正', '余裕'],
  accuracy: ['高', '中', '低']
};

/** 設定キーと初期値（system_settings シートの初期投入に使用） */
var DEFAULT_SETTINGS = [
  { key: 'tax_rate', value: '0.10', description: '消費税率' },
  { key: 'min_input_minutes', value: '15', description: '工数最小入力単位（分）' },
  { key: 'alert_warn_rate', value: '0.80', description: '消化率 警告閾値' },
  { key: 'alert_over_rate', value: '1.00', description: '消化率 超過閾値' },
  { key: 'util_over_rate', value: '1.00', description: '稼働率 過負荷閾値' },
  { key: 'util_low_rate', value: '0.70', description: '稼働率 余裕閾値' },
  { key: 'margin_good_rate', value: '0.50', description: '粗利益率 良好閾値（緑）' },
  { key: 'margin_warn_rate', value: '0.30', description: '粗利益率 要注意閾値（赤）' },
  { key: 'invoice_prefix', value: 'INV', description: '請求番号プレフィックス' },
  { key: 'alert_email', value: '', description: '予算超過通知先メール' }
];

/**
 * 全テーブル定義。SHEETS_SCHEMA.md と1対1で対応する。
 */
var SCHEMA = {
  // ===== マスタ =====
  m_customers: buildTable('m_customers', 'CUS', [
    { key: 'customer_id', label: '顧客ID', type: 'text', pk: true },
    { key: 'name', label: '顧客名', type: 'text', required: true },
    { key: 'name_kana', label: 'カナ', type: 'text' },
    { key: 'entity_type', label: '区分', type: 'enum' },
    { key: 'industry', label: '業種', type: 'text' },
    { key: 'representative', label: '代表者名', type: 'text' },
    { key: 'contact_person', label: '担当者名', type: 'text' },
    { key: 'phone', label: '電話番号', type: 'text' },
    { key: 'email', label: 'メールアドレス', type: 'text' },
    { key: 'address', label: '住所', type: 'text' },
    { key: 'rank', label: '顧客ランク', type: 'enum' },
    { key: 'payment_terms', label: '支払条件', type: 'enum' },
    { key: 'closing_day', label: '請求締日', type: 'enum' },
    { key: 'status', label: 'ステータス', type: 'enum', required: true }
  ]),

  m_staff: buildTable('m_staff', 'STF', [
    { key: 'staff_id', label: 'スタッフID', type: 'text', pk: true },
    { key: 'name', label: '氏名', type: 'text', required: true },
    { key: 'role', label: '役職', type: 'enum' },
    { key: 'job_type', label: '職種', type: 'text' },
    { key: 'cost_rate', label: '原価単価', type: 'int' },
    { key: 'bill_rate', label: '請求単価', type: 'int' },
    { key: 'standard_hours', label: '月間標準稼働時間', type: 'num' },
    { key: 'target_utilization', label: '稼働率目標', type: 'num' },
    { key: 'email', label: 'メールアドレス', type: 'text' },
    { key: 'status', label: 'ステータス', type: 'enum', required: true }
  ]),

  m_project_types: buildTable('m_project_types', 'KND', [
    { key: 'type_id', label: '種別ID', type: 'text', pk: true },
    { key: 'name', label: '種別名', type: 'text', required: true },
    { key: 'category', label: 'カテゴリ大', type: 'text' },
    { key: 'standard_hours', label: '標準工数', type: 'num' },
    { key: 'standard_price', label: '標準単価', type: 'int' },
    { key: 'difficulty', label: '難易度', type: 'int' }
  ]),

  m_work_items: buildTable('m_work_items', 'WRK', [
    { key: 'work_item_id', label: '作業項目ID', type: 'text', pk: true },
    { key: 'name', label: '作業項目名', type: 'text', required: true },
    { key: 'category', label: 'カテゴリ', type: 'text' },
    { key: 'default_billing_type', label: '既定請求区分', type: 'enum' },
    { key: 'sort_order', label: '表示順', type: 'int' }
  ]),

  projects: buildTable('projects', 'PJT', [
    { key: 'project_id', label: '案件ID', type: 'text', pk: true },
    { key: 'name', label: '案件名', type: 'text', required: true },
    { key: 'customer_id', label: '顧客ID', type: 'text', fk: 'm_customers', required: true },
    { key: 'type_id', label: '種別ID', type: 'text', fk: 'm_project_types' },
    { key: 'contract_type', label: '契約形態', type: 'enum' },
    { key: 'owner_staff_id', label: '主担当ID', type: 'text', fk: 'm_staff' },
    { key: 'contract_amount', label: '契約金額', type: 'int' },
    { key: 'estimated_hours', label: '見積工数', type: 'num' },
    { key: 'start_date', label: '開始日', type: 'date' },
    { key: 'due_date', label: '納期', type: 'date' },
    { key: 'status', label: 'ステータス', type: 'enum', required: true },
    { key: 'completed_at', label: '完了日', type: 'date' },
    { key: 'note', label: '備考', type: 'text' }
  ]),

  // ===== トランザクション =====
  time_entries: buildTable('time_entries', 'KOSU', [
    { key: 'time_entry_id', label: '工数ID', type: 'text', pk: true },
    { key: 'work_date', label: '記録日', type: 'date', required: true },
    { key: 'staff_id', label: 'スタッフID', type: 'text', fk: 'm_staff', required: true },
    { key: 'project_id', label: '案件ID', type: 'text', fk: 'projects', required: true },
    { key: 'work_item_id', label: '作業項目ID', type: 'text', fk: 'm_work_items', required: true },
    { key: 'start_time', label: '開始時刻', type: 'time' },
    { key: 'end_time', label: '終了時刻', type: 'time' },
    { key: 'minutes', label: '作業時間（分）', type: 'int', required: true },
    { key: 'hours', label: '作業時間（時間）', type: 'num', required: true },
    { key: 'billing_type', label: '請求区分', type: 'enum', required: true },
    { key: 'cost_rate_snapshot', label: '原価単価（スナップ）', type: 'int' },
    { key: 'bill_rate_snapshot', label: '請求単価（スナップ）', type: 'int' },
    { key: 'cost_amount', label: '原価金額', type: 'int' },
    { key: 'bill_amount', label: '請求金額', type: 'int' },
    { key: 'input_method', label: '入力方法', type: 'enum' },
    { key: 'description', label: '作業内容', type: 'text' }
  ]),

  expenses: buildTable('expenses', 'KEIHI', [
    { key: 'expense_id', label: '経費ID', type: 'text', pk: true },
    { key: 'expense_date', label: '発生日', type: 'date', required: true },
    { key: 'staff_id', label: 'スタッフID', type: 'text', fk: 'm_staff', required: true },
    { key: 'project_id', label: '案件ID', type: 'text', fk: 'projects', required: true },
    { key: 'expense_type', label: '経費種別', type: 'enum', required: true },
    { key: 'amount', label: '金額', type: 'int', required: true },
    { key: 'billing_type', label: '請求区分', type: 'enum', required: true },
    { key: 'description', label: '内容', type: 'text' },
    { key: 'has_receipt', label: '領収書', type: 'bool' },
    { key: 'approval_status', label: '承認状態', type: 'enum', required: true }
  ]),

  invoices: buildTable('invoices', null, [
    { key: 'invoice_id', label: '請求ID', type: 'text', pk: true },
    { key: 'customer_id', label: '顧客ID', type: 'text', fk: 'm_customers', required: true },
    { key: 'project_id', label: '案件ID', type: 'text', fk: 'projects', required: true },
    { key: 'invoice_date', label: '請求日', type: 'date', required: true },
    { key: 'period_from', label: '請求期間FROM', type: 'date', required: true },
    { key: 'period_to', label: '請求期間TO', type: 'date', required: true },
    { key: 'base_fee', label: '基本報酬', type: 'int' },
    { key: 'time_charge', label: 'タイムチャージ金額', type: 'int' },
    { key: 'expense_amount', label: '実費金額', type: 'int' },
    { key: 'subtotal', label: '小計', type: 'int' },
    { key: 'tax_rate', label: '消費税率', type: 'num' },
    { key: 'tax', label: '消費税', type: 'int' },
    { key: 'total', label: '合計請求額', type: 'int' },
    { key: 'paid_amount', label: '入金額', type: 'int' },
    { key: 'due_date', label: '支払期限', type: 'date' },
    { key: 'status', label: 'ステータス', type: 'enum', required: true }
  ]),

  invoice_items: buildTable('invoice_items', 'INVL', [
    { key: 'invoice_item_id', label: '明細ID', type: 'text', pk: true },
    { key: 'invoice_id', label: '請求ID', type: 'text', fk: 'invoices', required: true },
    { key: 'item_type', label: '明細種別', type: 'enum', required: true },
    { key: 'description', label: '内容', type: 'text' },
    { key: 'quantity', label: '数量', type: 'num' },
    { key: 'unit_price', label: '単価', type: 'int' },
    { key: 'amount', label: '金額', type: 'int', required: true },
    { key: 'source_ref', label: '参照工数ID/経費ID', type: 'text' }
  ]),

  // ===== 集計（派生データ・監査列なし・洗い替え/upsert） =====
  agg_projects: buildTable('agg_projects', null, [
    { key: 'project_id', label: '案件ID', type: 'text', pk: true },
    { key: 'project_name', label: '案件名', type: 'text' },
    { key: 'customer_name', label: '顧客名', type: 'text' },
    { key: 'contract_amount', label: '契約金額', type: 'int' },
    { key: 'estimated_hours', label: '見積工数', type: 'num' },
    { key: 'actual_hours', label: '実績工数', type: 'num' },
    { key: 'progress_rate', label: '工数消化率', type: 'num' },
    { key: 'labor_cost', label: '総人件費', type: 'int' },
    { key: 'expense_cost', label: '経費原価', type: 'int' },
    { key: 'total_cost', label: '総原価', type: 'int' },
    { key: 'gross_profit', label: '粗利益', type: 'int' },
    { key: 'gross_margin', label: '粗利益率', type: 'num' },
    { key: 'alert', label: 'アラート', type: 'enum' },
    { key: 'aggregated_at', label: '集計日時', type: 'datetime' }
  ], { audited: false }),

  agg_staff_monthly: buildTable('agg_staff_monthly', null, [
    { key: 'year_month', label: '対象月', type: 'text' },
    { key: 'staff_id', label: 'スタッフID', type: 'text' },
    { key: 'staff_name', label: '氏名', type: 'text' },
    { key: 'role', label: '役職', type: 'text' },
    { key: 'total_hours', label: '総稼働時間', type: 'num' },
    { key: 'billable_hours', label: '請求対象時間', type: 'num' },
    { key: 'utilization', label: '稼働率', type: 'num' },
    { key: 'target_achievement', label: '稼働率達成度', type: 'num' },
    { key: 'project_count', label: '担当案件数', type: 'int' },
    { key: 'revenue_contribution', label: '売上貢献額', type: 'int' },
    { key: 'aggregated_at', label: '集計日時', type: 'datetime' }
  ], { audited: false }),

  agg_monthly: buildTable('agg_monthly', null, [
    { key: 'year_month', label: '対象月', type: 'text', pk: true },
    { key: 'revenue', label: '売上合計', type: 'int' },
    { key: 'mom_ratio', label: '前月比', type: 'num' },
    { key: 'total_cost', label: '総原価', type: 'int' },
    { key: 'gross_profit', label: '粗利益', type: 'int' },
    { key: 'gross_margin', label: '粗利益率', type: 'num' },
    { key: 'completed_count', label: '完了案件数', type: 'int' },
    { key: 'new_count', label: '新規受注数', type: 'int' },
    { key: 'overall_utilization', label: '全体稼働率', type: 'num' },
    { key: 'aggregated_at', label: '集計日時', type: 'datetime' }
  ], { audited: false }),

  agg_customer_monthly: buildTable('agg_customer_monthly', null, [
    { key: 'year_month', label: '対象月', type: 'text' },
    { key: 'customer_id', label: '顧客ID', type: 'text' },
    { key: 'customer_name', label: '顧客名', type: 'text' },
    { key: 'rank', label: '顧客ランク', type: 'text' },
    { key: 'project_count', label: '案件数', type: 'int' },
    { key: 'revenue', label: '売上合計', type: 'int' },
    { key: 'total_hours', label: '工数合計', type: 'num' },
    { key: 'gross_profit', label: '粗利益', type: 'int' },
    { key: 'gross_margin', label: '粗利益率', type: 'num' },
    { key: 'profitability', label: '収益性評価', type: 'enum' },
    { key: 'aggregated_at', label: '集計日時', type: 'datetime' }
  ], { audited: false }),

  agg_estimate_accuracy: buildTable('agg_estimate_accuracy', null, [
    { key: 'project_id', label: '案件ID', type: 'text', pk: true },
    { key: 'project_name', label: '案件名', type: 'text' },
    { key: 'type_id', label: '種別ID', type: 'text' },
    { key: 'type_name', label: '種別名', type: 'text' },
    { key: 'estimated_hours', label: '見積工数', type: 'num' },
    { key: 'actual_hours', label: '実績工数', type: 'num' },
    { key: 'variance_rate', label: '乖離率', type: 'num' },
    { key: 'accuracy', label: '精度評価', type: 'enum' },
    { key: 'suggestion', label: '改善提案', type: 'text' },
    { key: 'aggregated_at', label: '集計日時', type: 'datetime' }
  ], { audited: false }),

  agg_capacity_forecast: buildTable('agg_capacity_forecast', null, [
    { key: 'year_month', label: '対象月', type: 'text' },
    { key: 'staff_id', label: 'スタッフID', type: 'text' },
    { key: 'staff_name', label: '氏名', type: 'text' },
    { key: 'available_hours', label: '月間稼働可能時間', type: 'num' },
    { key: 'committed_hours', label: '確定案件工数', type: 'num' },
    { key: 'forecast_hours', label: '予測稼働時間', type: 'num' },
    { key: 'forecast_utilization', label: '予測稼働率', type: 'num' },
    { key: 'free_hours', label: '空き時間', type: 'num' },
    { key: 'alert', label: 'アラート', type: 'enum' },
    { key: 'aggregated_at', label: '集計日時', type: 'datetime' }
  ], { audited: false }),

  // ===== 設定 =====
  system_settings: buildTable('system_settings', null, [
    { key: 'key', label: '設定キー', type: 'text', pk: true },
    { key: 'value', label: '設定値', type: 'text' },
    { key: 'description', label: '説明', type: 'text' }
  ], { audited: false }),

  // ===== 採番カウンタ（内部管理用） =====
  _sequences: buildTable('_sequences', null, [
    { key: 'seq_name', label: '採番キー', type: 'text', pk: true },
    { key: 'current', label: '現在値', type: 'int' }
  ], { audited: false })
};

/** 集計シート名の一覧（集計バッチが洗い替えする対象） */
var AGG_TABLES = [
  'agg_projects', 'agg_staff_monthly', 'agg_monthly',
  'agg_customer_monthly', 'agg_estimate_accuracy', 'agg_capacity_forecast'
];

/** テーブル定義を取得（未定義はエラー） */
function getTableDef(table) {
  var def = SCHEMA[table];
  if (!def) throw new AppError('INTERNAL_ERROR', 'シート定義が見つかりません: ' + table);
  return def;
}
