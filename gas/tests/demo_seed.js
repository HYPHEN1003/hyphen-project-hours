/**
 * demo_seed.js － 当月デモデータを本番APIへ投入する開発用スクリプト（Node実行）
 * 実行: node gas/tests/demo_seed.js
 * ※ 本番スプレッドシートに書き込みます。デモ見栄え用。
 */
const BASE = 'https://script.google.com/macros/s/AKfycbyGVD48gUwGhe5BD3q5yGgnV-YEND4AGxOA6z91SLMmUL0vqEoCPROvUNxzGarFBpu4/exec';

async function post(action, payload) {
  const res = await fetch(BASE + '?action=' + encodeURIComponent(action), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, payload, meta: { actor: 'demo-seed' } })
  });
  const env = await res.json();
  if (!env.ok) throw new Error(action + ': ' + (env.error && env.error.message));
  return env.data;
}

// 当月（今日基準）の日付を作る
const now = new Date();
const ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
const d = (day) => ym + '-' + String(day).padStart(2, '0');

const entries = [
  { staff_id: 'STF-002', project_id: 'PJT-001', work_item_id: 'WRK-003', work_date: d(2), minutes: 300, billing_type: '請求対象', description: '申告書作成' },
  { staff_id: 'STF-002', project_id: 'PJT-001', work_item_id: 'WRK-002', work_date: d(3), minutes: 240, billing_type: '請求対象', description: '帳簿精査' },
  { staff_id: 'STF-004', project_id: 'PJT-001', work_item_id: 'WRK-001', work_date: d(4), minutes: 180, billing_type: '請求対象', description: '資料整理' },
  { staff_id: 'STF-003', project_id: 'PJT-001', work_item_id: 'WRK-005', work_date: d(4), minutes: 60, billing_type: '内部', description: '社内ミーティング' },
  { staff_id: 'STF-001', project_id: 'PJT-004', work_item_id: 'WRK-001', work_date: d(2), minutes: 360, billing_type: '請求対象', description: '相続資料収集' },
  { staff_id: 'STF-001', project_id: 'PJT-004', work_item_id: 'WRK-004', work_date: d(3), minutes: 120, billing_type: '請求対象', description: '相続人面談' },
  { staff_id: 'STF-002', project_id: 'PJT-004', work_item_id: 'WRK-003', work_date: d(4), minutes: 180, billing_type: '請求対象', description: '財産評価明細' },
  { staff_id: 'STF-004', project_id: 'PJT-004', work_item_id: 'WRK-001', work_date: d(4), minutes: 240, billing_type: 'サービス', description: '補助作業' },
  // PJT-002 顧問(見積4h) を超過させてアラートを出す
  { staff_id: 'STF-003', project_id: 'PJT-002', work_item_id: 'WRK-004', work_date: d(2), minutes: 120, billing_type: '請求対象', description: '月次訪問' },
  { staff_id: 'STF-003', project_id: 'PJT-002', work_item_id: 'WRK-002', work_date: d(3), minutes: 150, billing_type: '請求対象', description: '記帳代行' }
];

const expenses = [
  { staff_id: 'STF-001', project_id: 'PJT-004', expense_date: d(3), expense_type: '交通費', amount: 2200, billing_type: '実費請求', has_receipt: true, approval_status: '承認', description: '法務局往復' },
  { staff_id: 'STF-002', project_id: 'PJT-001', expense_date: d(2), expense_type: '外注費', amount: 30000, billing_type: '自社負担', has_receipt: true, approval_status: '承認', description: 'データ入力外注' }
];

(async () => {
  console.log('対象月:', ym);
  for (const e of entries) { await post('createTimeEntry', { ...e, input_method: '個別' }); }
  console.log('工数', entries.length, '件 投入');
  for (const x of expenses) { await post('createExpense', x); }
  console.log('経費', expenses.length, '件 投入');

  // 当月の請求書（PJT-001 固定報酬）を自動計算→作成
  const calc = await post('calculateInvoice', { customer_id: 'CUS-001', project_id: 'PJT-001', period_from: d(1), period_to: d(28), invoice_date: d(4) });
  await post('createInvoice', { ...calc, due_date: ym + '-28', status: '発行済' });
  console.log('請求書 作成: 合計 ¥' + calc.total.toLocaleString());

  // 集計を最新化
  await post('runAggregateProjects', {});
  await post('runAggregateMonthly', { yearMonth: ym });
  await post('runAggregateStaff', { yearMonth: ym });
  await post('runForecastCapacity', { yearMonth: ym });
  await post('runAnalyzeEstimate', {});
  console.log('集計 完了');

  const dash = await post('getDashboard', {});
  console.log('ダッシュボード → 進行中', dash.activeProjectCount + '/' + dash.totalProjectCount,
    '| 今月稼働', dash.currentMonthHours + 'h', '| 今月売上 ¥' + (dash.currentMonthRevenue || 0).toLocaleString(),
    '| アラート', dash.alertCount + '件');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
