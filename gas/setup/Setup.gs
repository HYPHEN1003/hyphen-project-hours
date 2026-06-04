/**
 * Setup.gs － 初回セットアップ（手動実行）
 * ------------------------------------------------------------------
 * GAS エディタから setup() を一度だけ実行する。
 *   1. SPREADSHEET_ID 未設定ならアクティブ/新規スプレッドシートを使用
 *   2. 全16シートを作成し、1行目に日本語ヘッダを出力
 *   3. 日付/時刻列の表示を崩さないよう列書式をプレーンテキスト化
 *   4. 初期データ（マスタ＋サンプルトランザクション＋設定）を投入
 *   5. 採番カウンタ（_sequences）を初期化
 *
 * 既にデータがある場合は重複投入を避けるためスキップする（再実行安全）。
 */

/** メインのセットアップ関数（GASエディタで実行） */
function setup() {
  var ss = resolveSpreadsheet_();
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());

  // 1. シート作成＋ヘッダ
  Object.keys(SCHEMA).forEach(function (table) {
    createSheetWithHeader_(ss, SCHEMA[table]);
  });

  // 2. 既定の Sheet1 を削除（残っていれば）
  var def = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);

  // 3. 初期データ投入
  seedInitialData_();

  Logger.log('セットアップ完了: ' + ss.getUrl());
  return ss.getUrl();
}

/** 対象スプレッドシートを決定（既存ID > アクティブ > 新規作成） */
function resolveSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* 落ちたら下へ */ }
  }
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  return SpreadsheetApp.create('案件別工数管理システム（HYPHEN）データ');
}

/** シートが無ければ作成し、1行目にヘッダ（日本語ラベル）を設定する */
function createSheetWithHeader_(ss, def) {
  var sh = ss.getSheetByName(def.table);
  if (!sh) sh = ss.insertSheet(def.table);
  var labels = def.columns.map(function (c) { return c.label; });
  // ヘッダ行
  sh.getRange(1, 1, 1, labels.length).setValues([labels])
    .setFontWeight('bold').setBackground('#eef2ff');
  sh.setFrozenRows(1);
  // 日付/時刻/datetime/text の列はプレーンテキスト書式（自動変換を防ぐ）
  def.columns.forEach(function (col, i) {
    if (['date', 'time', 'datetime', 'text'].indexOf(col.type) !== -1) {
      sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1).setNumberFormat('@');
    }
  });
  return sh;
}

/** 初期データ投入（冪等: 既にデータがあればスキップ） */
function seedInitialData_() {
  var repo = getRepository();

  // --- システム設定 ---
  if (repo.findAll('system_settings').length === 0) {
    repo.insertMany('system_settings', DEFAULT_SETTINGS);
  }

  // 既にマスタが入っていれば以降スキップ（再実行安全）
  if (repo.findAll('m_customers').length > 0) {
    Logger.log('初期データは投入済みのためスキップしました。');
    return;
  }

  var actor = 'setup';

  // --- 顧客マスタ ---
  repo.insertMany('m_customers', [
    { customer_id: 'CUS-001', name: '株式会社山田製作所', name_kana: 'ヤマダセイサクショ', entity_type: '法人', industry: '製造業', rank: 'A', payment_terms: '翌月末', closing_day: '末日', status: '取引中' },
    { customer_id: 'CUS-002', name: '鈴木商事株式会社', name_kana: 'スズキショウジ', entity_type: '法人', industry: '卸売', rank: 'B', payment_terms: '翌々月末', closing_day: '20日', status: '取引中' },
    { customer_id: 'CUS-003', name: '田中花子', name_kana: 'タナカハナコ', entity_type: '個人', industry: '個人事業', rank: 'C', payment_terms: '翌月末', closing_day: '末日', status: '取引中' },
    { customer_id: 'CUS-004', name: 'NPO法人みらい', name_kana: 'ミライ', entity_type: '法人', industry: '非営利', rank: 'B', payment_terms: '翌月末', closing_day: '15日', status: '休止' }
  ], { actor: actor });

  // --- スタッフマスタ ---
  repo.insertMany('m_staff', [
    { staff_id: 'STF-001', name: '佐藤一郎', role: '代表', job_type: '税理士', cost_rate: 5000, bill_rate: 12000, standard_hours: 160, target_utilization: 0.70, status: '在籍' },
    { staff_id: 'STF-002', name: '高橋次郎', role: 'マネージャー', job_type: '公認会計士', cost_rate: 4000, bill_rate: 10000, standard_hours: 160, target_utilization: 0.80, status: '在籍' },
    { staff_id: 'STF-003', name: '伊藤三郎', role: 'スタッフ', job_type: '税理士', cost_rate: 3000, bill_rate: 8000, standard_hours: 160, target_utilization: 0.80, status: '在籍' },
    { staff_id: 'STF-004', name: '渡辺四郎', role: 'アシスタント', job_type: '', cost_rate: 2000, bill_rate: 5000, standard_hours: 160, target_utilization: 0.85, status: '在籍' }
  ], { actor: actor });

  // --- 案件種別マスタ ---
  repo.insertMany('m_project_types', [
    { type_id: 'KND-001', name: '法人決算申告', category: '税務', standard_hours: 30, standard_price: 300000, difficulty: 3 },
    { type_id: 'KND-002', name: '個人確定申告', category: '税務', standard_hours: 8, standard_price: 80000, difficulty: 2 },
    { type_id: 'KND-003', name: '顧問契約', category: '税務', standard_hours: 4, standard_price: 50000, difficulty: 1 },
    { type_id: 'KND-004', name: '相続税申告', category: '税務', standard_hours: 60, standard_price: 800000, difficulty: 5 }
  ], { actor: actor });

  // --- 作業項目マスタ ---
  repo.insertMany('m_work_items', [
    { work_item_id: 'WRK-001', name: '資料収集・整理', category: '準備', default_billing_type: '請求対象', sort_order: 1 },
    { work_item_id: 'WRK-002', name: '帳簿チェック', category: '作業', default_billing_type: '請求対象', sort_order: 2 },
    { work_item_id: 'WRK-003', name: '申告書作成', category: '作業', default_billing_type: '請求対象', sort_order: 3 },
    { work_item_id: 'WRK-004', name: '顧客打合せ', category: '折衝', default_billing_type: '請求対象', sort_order: 4 },
    { work_item_id: 'WRK-005', name: '社内ミーティング', category: '社内', default_billing_type: '内部', sort_order: 5 }
  ], { actor: actor });

  // --- 案件マスタ ---
  repo.insertMany('projects', [
    { project_id: 'PJT-001', name: '山田製作所 法人決算申告', customer_id: 'CUS-001', type_id: 'KND-001', contract_type: '固定', owner_staff_id: 'STF-002', contract_amount: 350000, estimated_hours: 30, start_date: '2026-04-01', due_date: '2026-05-31', status: '進行中', completed_at: '', note: '' },
    { project_id: 'PJT-002', name: '鈴木商事 顧問契約', customer_id: 'CUS-002', type_id: 'KND-003', contract_type: '顧問', owner_staff_id: 'STF-003', contract_amount: 50000, estimated_hours: 4, start_date: '2026-04-01', due_date: '2026-06-30', status: '進行中', completed_at: '', note: '' },
    { project_id: 'PJT-003', name: '田中花子 確定申告', customer_id: 'CUS-003', type_id: 'KND-002', contract_type: 'スポット', owner_staff_id: 'STF-003', contract_amount: 80000, estimated_hours: 8, start_date: '2026-02-01', due_date: '2026-03-15', status: '完了', completed_at: '2026-03-14', note: '' },
    { project_id: 'PJT-004', name: '山田製作所 相続税申告', customer_id: 'CUS-001', type_id: 'KND-004', contract_type: '固定', owner_staff_id: 'STF-001', contract_amount: 800000, estimated_hours: 60, start_date: '2026-04-15', due_date: '2026-08-31', status: '進行中', completed_at: '', note: '' }
  ], { actor: actor });

  // --- 工数（サンプル。原価/請求金額は単価×時間で事前計算済み） ---
  repo.insertMany('time_entries', [
    teSample_('KOSU-001', '2026-05-07', 'STF-002', 'PJT-001', 'WRK-002', '09:00', '12:00', 180, '請求対象', 4000, 10000, '帳簿チェック'),
    teSample_('KOSU-002', '2026-05-07', 'STF-003', 'PJT-002', 'WRK-004', '13:00', '14:00', 60, '請求対象', 3000, 8000, '月次打合せ'),
    teSample_('KOSU-003', '2026-05-08', 'STF-002', 'PJT-001', 'WRK-003', '09:00', '13:00', 240, '請求対象', 4000, 10000, '申告書ドラフト'),
    teSample_('KOSU-004', '2026-05-08', 'STF-003', 'PJT-001', 'WRK-005', '17:00', '17:30', 30, '内部', 3000, 8000, '進捗共有'),
    teSample_('KOSU-005', '2026-05-09', 'STF-001', 'PJT-004', 'WRK-001', '10:00', '15:00', 300, '請求対象', 5000, 12000, '相続資料収集')
  ], { actor: actor });
  // 採番カウンタを実データに追従（KOSU は5まで使用済み）
  bumpSequence_(repo, 'CUS', 4); bumpSequence_(repo, 'STF', 4);
  bumpSequence_(repo, 'KND', 4); bumpSequence_(repo, 'WRK', 5);
  bumpSequence_(repo, 'PJT', 4); bumpSequence_(repo, 'KOSU', 5);

  // --- 経費（サンプル） ---
  repo.insertMany('expenses', [
    { expense_id: 'KEIHI-001', expense_date: '2026-05-07', staff_id: 'STF-002', project_id: 'PJT-001', expense_type: '交通費', amount: 1200, billing_type: '実費請求', description: '客先訪問', has_receipt: true, approval_status: '承認' },
    { expense_id: 'KEIHI-002', expense_date: '2026-05-10', staff_id: 'STF-001', project_id: 'PJT-004', expense_type: '印紙代', amount: 4000, billing_type: '実費請求', description: '申請書類', has_receipt: true, approval_status: '申請中' },
    { expense_id: 'KEIHI-003', expense_date: '2026-05-12', staff_id: 'STF-003', project_id: 'PJT-002', expense_type: '消耗品費', amount: 800, billing_type: '自社負担', description: '事務用品', has_receipt: false, approval_status: '承認' }
  ], { actor: actor });
  bumpSequence_(repo, 'KEIHI', 3);

  // --- 請求書＋明細（サンプル: 完了案件PJT-003） ---
  repo.insertMany('invoices', [
    { invoice_id: 'INV-202603-001', customer_id: 'CUS-003', project_id: 'PJT-003', invoice_date: '2026-03-20', period_from: '2026-02-01', period_to: '2026-03-15', base_fee: 80000, time_charge: 0, expense_amount: 0, subtotal: 80000, tax_rate: 0.10, tax: 8000, total: 88000, paid_amount: 88000, due_date: '2026-04-30', status: '入金済' }
  ], { actor: actor });
  repo.insertMany('invoice_items', [
    { invoice_item_id: 'INVL-001', invoice_id: 'INV-202603-001', item_type: '基本報酬', description: '個人確定申告（スポット報酬）', quantity: 1, unit_price: 80000, amount: 80000, source_ref: 'PJT-003' }
  ], { actor: actor });
  bumpSequence_(repo, 'INVL', 1);
  // 請求番号カウンタ（202603 月の連番=1）
  repo.nextSequence('INV_202603'); // ->1 に合わせる

  Logger.log('初期データ投入完了。');
}

/** 工数サンプル生成ヘルパ（原価/請求金額を計算して付与） */
function teSample_(id, date, staff, proj, work, st, et, minutes, billing, costRate, billRate, desc) {
  var hours = calcHoursFromMinutes(minutes);
  return {
    time_entry_id: id, work_date: date, staff_id: staff, project_id: proj, work_item_id: work,
    start_time: st, end_time: et, minutes: minutes, hours: hours, billing_type: billing,
    cost_rate_snapshot: costRate, bill_rate_snapshot: billRate,
    cost_amount: calcCostAmount(costRate, hours),
    bill_amount: calcBillAmount(billRate, hours, billing),
    input_method: '個別', description: desc
  };
}

/** 採番カウンタを指定値まで進める（既存値が小さい場合のみ） */
function bumpSequence_(repo, seqName, target) {
  var cur = 0;
  // _sequences を読みつつ目標まで増分
  while (cur < target) { cur = repo.nextSequence(seqName); }
}
