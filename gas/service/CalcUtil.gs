/**
 * CalcUtil.gs － 自動計算（計算ロジックの正本・純粋関数）
 * ------------------------------------------------------------------
 * REQUIREMENTS §4 の全計算式をここに集約する。副作用なし＝テスト容易。
 * 閾値・税率はハードコードせず、呼び出し側が設定値を渡す。
 */

// ===== 時刻・時間 =====

/** 'HH:mm' を分に変換 */
function timeToMinutes(hhmm) {
  var p = String(hhmm).split(':');
  return Number(p[0]) * 60 + Number(p[1]);
}

/** 開始/終了 'HH:mm' の差を分で返す（終了>開始前提） */
function calcMinutesFromTimes(start, end) {
  return timeToMinutes(end) - timeToMinutes(start);
}

/** 分 → 時間（小数） */
function calcHoursFromMinutes(minutes) {
  return Math.round((Number(minutes) / 60) * 100) / 100;
}

/** 分を最小入力単位で丸め（四捨五入。最小単位の倍数に揃える） */
function roundMinutes(minutes, unit) {
  unit = Number(unit) || 1;
  return Math.round(Number(minutes) / unit) * unit;
}

// ===== 工数単位 =====

/** 原価金額 = 原価単価 × 時間（円・四捨五入） */
function calcCostAmount(costRate, hours) {
  return Math.round(Number(costRate || 0) * Number(hours || 0));
}

/**
 * 請求金額 = 請求単価 × 時間。請求対象以外は集計上0扱いだが、
 * レコードには「請求対象だった場合の金額」を保持する設計のため、
 * billingType を渡した場合のみ0制御する（集計用ヘルパは別途参照）。
 */
function calcBillAmount(billRate, hours, billingType) {
  var amount = Math.round(Number(billRate || 0) * Number(hours || 0));
  if (billingType && billingType !== '請求対象') return 0;
  return amount;
}

// ===== 案件単位 =====

/** 消化率 = 実績 ÷ 見積（見積0/未設定は null） */
function calcProgressRate(actualHours, estimatedHours) {
  var est = Number(estimatedHours);
  if (!est || est <= 0) return null;
  return Math.round((Number(actualHours) / est) * 1000) / 1000;
}

/** 総原価 = 人件費 + 経費原価 */
function calcTotalCost(laborCost, expenseCost) {
  return Math.round(Number(laborCost || 0) + Number(expenseCost || 0));
}

/** 粗利益 = 契約金額 − 総原価 */
function calcGrossProfit(contractAmount, totalCost) {
  return Math.round(Number(contractAmount || 0) - Number(totalCost || 0));
}

/** 粗利益率 = 粗利益 ÷ 契約金額（契約0は null） */
function calcGrossMargin(grossProfit, contractAmount) {
  var c = Number(contractAmount);
  if (!c || c <= 0) return null;
  return Math.round((Number(grossProfit) / c) * 1000) / 1000;
}

/** 消化率アラート判定 → '正常'|'警告'|'超過' */
function judgeProgressAlert(progressRate, warnRate, overRate) {
  if (progressRate === null || progressRate === undefined) return '正常';
  if (progressRate >= overRate) return '超過';
  if (progressRate >= warnRate) return '警告';
  return '正常';
}

/** 粗利益率の色区分 → 'good'|'normal'|'bad'（UIの色付けに使用） */
function judgeMargin(grossMargin, goodRate, warnRate) {
  if (grossMargin === null || grossMargin === undefined) return 'normal';
  if (grossMargin >= goodRate) return 'good';
  if (grossMargin < warnRate) return 'bad';
  return 'normal';
}

// ===== スタッフ単位 =====

/** 稼働率 = 稼働時間 ÷ 標準稼働時間（標準0は null） */
function calcUtilization(totalHours, standardHours) {
  var s = Number(standardHours);
  if (!s || s <= 0) return null;
  return Math.round((Number(totalHours) / s) * 1000) / 1000;
}

/** 稼働率達成度 = 稼働率 ÷ 目標稼働率（目標0は null） */
function calcTargetAchievement(utilization, targetUtilization) {
  var t = Number(targetUtilization);
  if (!t || t <= 0 || utilization === null) return null;
  return Math.round((Number(utilization) / t) * 1000) / 1000;
}

/** 稼働率の色区分 → 'over'(赤)|'low'(黄)|'ok'（過負荷/余裕/適正） */
function judgeUtilizationColor(utilization, overRate, lowRate) {
  if (utilization === null || utilization === undefined) return 'ok';
  if (utilization >= overRate) return 'over';
  if (utilization < lowRate) return 'low';
  return 'ok';
}

// ===== 請求 =====

/** 消費税 = 小計 × 税率（四捨五入） */
function calcTax(subtotal, taxRate) {
  return Math.round(Number(subtotal || 0) * Number(taxRate || 0));
}

/** 請求番号文字列を組み立て（INV-YYYYMM-001） */
function buildInvoiceNumber(prefix, yyyymm, seq) {
  return prefix + '-' + yyyymm + '-' + zeroPad(seq, 3);
}

/**
 * 契約形態に応じた基本報酬を返す（API_DESIGN §9 / 承認済み方針）。
 * 固定・スポット → 契約金額、顧問・タイムチャージ → 0
 */
function calcBaseFee(contractType, contractAmount) {
  if (contractType === '固定' || contractType === 'スポット') {
    return Math.round(Number(contractAmount || 0));
  }
  return 0;
}

// ===== 月次・顧客 =====

/** 前月比 = 当月 ÷ 前月 − 1（前月0/null は null） */
function calcMoMRatio(current, previous) {
  var p = Number(previous);
  if (!p || p <= 0) return null;
  return Math.round((Number(current) / p - 1) * 1000) / 1000;
}

/** 収益性評価 → '高'|'中'|'低'|'赤字'（REQUIREMENTS §4.9） */
function judgeProfitability(grossMargin, goodRate, warnRate) {
  if (grossMargin === null || grossMargin === undefined) return '中';
  if (grossMargin < 0) return '赤字';
  if (grossMargin >= goodRate) return '高';
  if (grossMargin >= warnRate) return '中';
  return '低';
}

// ===== 見積精度 =====

/** 乖離率 = (実績 − 見積) ÷ 見積（見積0は null） */
function calcVarianceRate(actualHours, estimatedHours) {
  var est = Number(estimatedHours);
  if (!est || est <= 0) return null;
  return Math.round(((Number(actualHours) - est) / est) * 1000) / 1000;
}

/** 精度評価 → '高'|'中'|'低'（|乖離率| ≤10%→高, ≤20%→中, それ超→低） */
function judgeAccuracy(varianceRate) {
  if (varianceRate === null || varianceRate === undefined) return '中';
  var abs = Math.abs(varianceRate);
  if (abs <= 0.10) return '高';
  if (abs <= 0.20) return '中';
  return '低';
}

/** 改善提案文を生成（REQUIREMENTS §4.10） */
function buildEstimateSuggestion(varianceRate) {
  if (varianceRate === null || varianceRate === undefined) return '見積工数が未設定です。';
  if (varianceRate > 0.20) return '見積が甘い傾向。次回は工数を増やして見積もりましょう。';
  if (varianceRate < -0.20) return '見積が過大な傾向。次回は工数を減らして見積もりましょう。';
  if (Math.abs(varianceRate) <= 0.10) return '見積精度は良好です。';
  return '概ね妥当ですが、微調整を検討してください。';
}

// ===== 稼働予測 =====

/** 予測稼働率 = 予測稼働時間 ÷ 稼働可能時間（可能0は null） */
function calcForecastUtilization(forecastHours, availableHours) {
  var a = Number(availableHours);
  if (!a || a <= 0) return null;
  return Math.round((Number(forecastHours) / a) * 1000) / 1000;
}

/** 予測アラート → '過負荷'|'適正'|'余裕' */
function judgeForecastAlert(forecastUtilization, overRate, lowRate) {
  if (forecastUtilization === null || forecastUtilization === undefined) return '適正';
  if (forecastUtilization >= overRate) return '過負荷';
  if (forecastUtilization < lowRate) return '余裕';
  return '適正';
}
