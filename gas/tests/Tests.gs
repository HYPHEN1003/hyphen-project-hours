/**
 * Tests.gs － CalcUtil の簡易テスト（GASエディタで runTests を実行）
 * ------------------------------------------------------------------
 * 純粋関数なのでスプレッドシート不要。結果は Logger に出力。
 */

function runTests() {
  var failures = [];
  function eq(name, actual, expected) {
    var a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e) failures.push(name + ' : 期待 ' + e + ' / 実際 ' + a);
  }

  // 時間換算・丸め
  eq('hoursFromMinutes(180)', calcHoursFromMinutes(180), 3);
  eq('minutesFromTimes(09:00,12:30)', calcMinutesFromTimes('09:00', '12:30'), 210);
  eq('roundMinutes(37,15)', roundMinutes(37, 15), 30);
  eq('roundMinutes(38,15)', roundMinutes(38, 15), 45);

  // 工数金額
  eq('costAmount(4000,3)', calcCostAmount(4000, 3), 12000);
  eq('billAmount(10000,3,請求対象)', calcBillAmount(10000, 3, '請求対象'), 30000);
  eq('billAmount(10000,3,内部)', calcBillAmount(10000, 3, '内部'), 0);

  // 案件
  eq('progressRate(16,20)', calcProgressRate(16, 20), 0.8);
  eq('progressRate(x,0)=null', calcProgressRate(5, 0), null);
  eq('grossProfit(350000,200000)', calcGrossProfit(350000, 200000), 150000);
  eq('grossMargin(150000,300000)', calcGrossMargin(150000, 300000), 0.5);
  eq('alert(1.05)', judgeProgressAlert(1.05, 0.8, 1.0), '超過');
  eq('alert(0.85)', judgeProgressAlert(0.85, 0.8, 1.0), '警告');
  eq('alert(0.5)', judgeProgressAlert(0.5, 0.8, 1.0), '正常');

  // スタッフ
  eq('utilization(160,160)', calcUtilization(160, 160), 1);
  eq('utilColor(1.2)', judgeUtilizationColor(1.2, 1.0, 0.7), 'over');
  eq('utilColor(0.6)', judgeUtilizationColor(0.6, 1.0, 0.7), 'low');

  // 請求
  eq('tax(80000,0.10)', calcTax(80000, 0.10), 8000);
  eq('baseFee(固定,350000)', calcBaseFee('固定', 350000), 350000);
  eq('baseFee(顧問,50000)', calcBaseFee('顧問', 50000), 0);
  eq('invoiceNumber', buildInvoiceNumber('INV', '202602', 1), 'INV-202602-001');

  // 月次・顧客
  eq('momRatio(120,100)', calcMoMRatio(120, 100), 0.2);
  eq('profitability(0.6)', judgeProfitability(0.6, 0.5, 0.3), '高');
  eq('profitability(-0.1)', judgeProfitability(-0.1, 0.5, 0.3), '赤字');

  // 見積精度
  eq('variance(26,20)', calcVarianceRate(26, 20), 0.3);
  eq('accuracy(0.05)', judgeAccuracy(0.05), '高');
  eq('accuracy(0.3)', judgeAccuracy(0.3), '低');

  // 稼働予測
  eq('forecastUtil(170,160)', calcForecastUtilization(170, 160), 1.063);
  eq('forecastAlert(1.1)', judgeForecastAlert(1.1, 1.0, 0.7), '過負荷');
  eq('forecastAlert(0.5)', judgeForecastAlert(0.5, 1.0, 0.7), '余裕');

  if (failures.length === 0) {
    Logger.log('✅ 全テスト成功');
  } else {
    Logger.log('❌ 失敗 ' + failures.length + '件:\n' + failures.join('\n'));
  }
  return failures;
}
