/**
 * node_harness.js － GAS プラットフォームをモックしてバックエンドを通しで検証する。
 * 実行: node gas/tests/node_harness.js
 * （本番では使用しない開発用ツール）
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---- GAS プラットフォーム モック ---- */
function makeSheet(name) {
  return {
    name, data: [], // 2D配列（行0=ヘッダ含む全行）
    getName() { return name; },
    getLastRow() { return this.data.length; },
    getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r.length), 0); },
    getMaxRows() { return Math.max(1000, this.data.length); },
    setFrozenRows() { return this; },
    appendRow(row) { this.data.push(row.slice()); return this; },
    getRange(r, c, nr, nc) {
      const sh = this;
      nr = nr || 1; nc = nc || 1;
      return {
        getValues() {
          const out = [];
          for (let i = 0; i < nr; i++) {
            const row = sh.data[r - 1 + i] || [];
            const line = [];
            for (let j = 0; j < nc; j++) line.push(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]);
            out.push(line);
          }
          return out;
        },
        setValues(vals) {
          for (let i = 0; i < vals.length; i++) {
            const ri = r - 1 + i;
            while (sh.data.length <= ri) sh.data.push([]);
            for (let j = 0; j < vals[i].length; j++) sh.data[ri][c - 1 + j] = vals[i][j];
          }
          return this;
        },
        setValue(v) { const ri = r - 1; while (sh.data.length <= ri) sh.data.push([]); sh.data[ri][c - 1] = v; return this; },
        clearContent() {
          for (let i = 0; i < nr; i++) { const row = sh.data[r - 1 + i]; if (row) for (let j = 0; j < nc; j++) row[c - 1 + j] = ''; }
          return this;
        },
        setFontWeight() { return this; }, setBackground() { return this; }, setNumberFormat() { return this; }
      };
    },
    deleteRow(rowNum) { this.data.splice(rowNum - 1, 1); return this; }
  };
}
function makeSpreadsheet() {
  const sheets = {};
  return {
    _sheets: sheets,
    getId() { return 'MOCK_SS_ID'; }, getUrl() { return 'https://mock/ss'; },
    getSheetByName(n) { return sheets[n] || null; },
    insertSheet(n) { sheets[n] = makeSheet(n); return sheets[n]; },
    getSheets() { return Object.keys(sheets).map(k => sheets[k]); },
    deleteSheet(sh) { delete sheets[sh.name]; }
  };
}
const MOCK_SS = makeSpreadsheet();
const props = {};
const sandbox = {
  console,
  SpreadsheetApp: {
    openById() { return MOCK_SS; }, getActiveSpreadsheet() { return MOCK_SS; }, create() { return MOCK_SS; }
  },
  PropertiesService: {
    getScriptProperties() { return { getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }; }
  },
  LockService: { getScriptLock() { return { tryLock() { return true; }, releaseLock() {} }; } },
  Utilities: {
    formatDate(d, tz, fmt) {
      const p = n => (n < 10 ? '0' + n : '' + n);
      let s = fmt.replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1)).replace('dd', p(d.getDate()));
      s = s.replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes())).replace('ss', p(d.getSeconds()));
      s = s.replace("'T'", 'T').replace('XXX', '+09:00');
      return s;
    }
  },
  Logger: { log: (m) => console.log('[Logger]', m) }
};
vm.createContext(sandbox);

/* ---- GAS ファイルを読み込み（依存順） ---- */
const base = path.join(__dirname, '..');
const files = [
  'util/AppError.gs', 'util/Response.gs', 'util/Lock.gs', 'config/Schema.gs',
  'util/IdGenerator.gs', 'util/Validator.gs',
  'repository/SheetRepository.gs', 'repository/RepositoryFactory.gs',
  'service/CalcUtil.gs', 'service/SettingService.gs', 'service/MasterService.gs',
  'service/ProjectService.gs', 'service/TimeEntryService.gs', 'service/ExpenseService.gs',
  'service/InvoiceService.gs', 'service/AggregationService.gs',
  'setup/Setup.gs', 'Main.gs'
];
files.forEach(f => vm.runInContext(fs.readFileSync(path.join(base, f), 'utf8'), sandbox, { filename: f }));

/* ---- テスト実行 ---- */
let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; } else { fail++; console.log('  ❌ ' + name); } }

vm.runInContext('setup();', sandbox);
const run = (code) => vm.runInContext(code, sandbox);

// 1. bootstrap
const boot = run('bootstrapData()');
check('bootstrap: 顧客4件', boot.customers.length === 4);
check('bootstrap: スタッフ4名', boot.staff.length === 4);
check('bootstrap: 設定 税率0.10', boot.settings.tax_rate === '0.10');

// 2. 顧客作成（採番 CUS-005）
const newCus = run('createCustomer({name:"テスト商事", status:"取引中"}, "test")');
check('顧客採番 CUS-005', newCus.customer_id === 'CUS-005');

// 3. 工数作成 → 案件集計反映
run('createTimeEntry({work_date:"2026-05-15", staff_id:"STF-003", project_id:"PJT-001", work_item_id:"WRK-002", minutes:120, billing_type:"請求対象"}, "test")');
const aggAll = run('aggregateProjects({includeAll:true})');
check('案件集計 実行', aggAll.updatedRows >= 4);
const p1 = run('getProject("PJT-001")');
// PJT-001: 初期 3+4+0.5(内部) +今回2h = 9.5h 実績（内部含む合計）。消化率=9.5/30
check('PJT-001 実績工数=9.5h', Math.abs(p1.actual_hours - 9.5) < 0.001);
check('PJT-001 粗利益が数値', typeof p1.gross_profit === 'number');

// 4. 請求自動計算（PJT-003 完了案件）
const calc = run('calculateInvoice({customer_id:"CUS-003", project_id:"PJT-003", period_from:"2026-02-01", period_to:"2026-03-31", invoice_date:"2026-04-10"})');
check('請求 基本報酬=80000(スポット)', calc.base_fee === 80000);
check('請求 消費税=8000', calc.tax === 8000);
check('請求 合計=88000', calc.total === 88000);

// 5. 請求作成（採番 INV-202604-001）
const inv = run('createInvoice(' + JSON.stringify(Object.assign({}, calc, { due_date: '2026-05-31', status: '発行済' })) + ', "test")');
check('請求採番 INV-202604-001', inv.invoice_id === 'INV-202604-001');

// 6. 入金登録 → 入金済
const paid = run('recordPayment({invoice_id:"' + inv.invoice_id + '", paid_amount:88000}, "test")');
check('入金登録で入金済', paid.status === '入金済');

// 7. 月次集計
run('aggregateMonthly("2026-04")');
const monthly = run('reportMonthly("2026-04","2026-04")');
check('月次 売上=80000(税抜)', monthly[0] && monthly[0].revenue === 80000);

// 8. スタッフ集計
run('aggregateStaffMonthly("2026-05")');
const staffRep = run('reportStaff("2026-05")');
check('スタッフ集計 4名', staffRep.length === 4);

// 9. 見積精度
run('analyzeEstimateAccuracy()');
const est = run('reportEstimateAccuracy()');
check('見積精度 完了案件あり', est.rows.length >= 1);

// 10. 稼働予測
run('forecastCapacity("2026-06")');
const fc = run('reportForecast("2026-06")');
check('稼働予測 在籍スタッフ分', fc.length === 4);

// 11. ダッシュボード
const dash = run('getDashboard()');
check('ダッシュボード 全案件数', dash.totalProjectCount >= 4);

// 12. バリデーション（必須エラー）
let threw = false;
try { run('createCustomer({status:"取引中"}, "t")'); } catch (e) { threw = e.code === 'VALIDATION_ERROR'; }
check('顧客名なしで VALIDATION_ERROR', threw);

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' 統合テスト: ' + pass + ' 成功 / ' + fail + ' 失敗');
process.exit(fail ? 1 : 0);
