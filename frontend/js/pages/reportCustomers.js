/**
 * reportCustomers.js － 顧客別レポート（月別）
 */
App.pages.reportCustomers = (function () {
  var ym = App.fmt.thisMonth();
  function render(content, actions) {
    actions.innerHTML =
      '<input type="month" id="ym" value="' + ym + '" class="btn btn-secondary" style="padding:6px 10px"/>' +
      '<button class="btn btn-secondary" id="reagg">集計</button>';
    actions.querySelector('#ym').addEventListener('change', function (e) { ym = e.target.value; load(content); });
    actions.querySelector('#reagg').addEventListener('click', function () {
      App.api.post('runAggregateMonthly', { yearMonth: ym }).then(function () { App.toast.success('集計しました'); load(content); }).catch(e => App.toast.error(e.message));
    });
    content.innerHTML = '<div id="rc-table"></div><div class="chart-card mt-16"><h3>売上（上位）</h3><div class="chart-box"><canvas id="rc-chart"></canvas></div></div>';
    load(content);
  }

  function load(content) {
    App.api.get('reportCustomers', { yearMonth: ym }).then(function (rows) {
      App.table.render(document.getElementById('rc-table'), {
        columns: [
          { key: 'customer_name', label: '顧客' },
          { key: 'rank', label: 'ランク', render: r => r.rank || '—' },
          { key: 'project_count', label: '案件数', num: true },
          { key: 'revenue', label: '売上', num: true, render: r => App.fmt.yen(r.revenue) },
          { key: 'total_hours', label: '工数', num: true, render: r => App.fmt.hours(r.total_hours) },
          { key: 'gross_profit', label: '粗利益', num: true, render: r => App.fmt.yen(r.gross_profit) },
          { key: 'gross_margin', label: '粗利益率', num: true, render: r => App.fmt.pct(r.gross_margin, 1) },
          { key: 'profitability', label: '収益性', render: r => App.table.profitabilityBadge(r.profitability) }
        ],
        rows: rows, emptyText: '当月の動きがある顧客がいません。「集計」を実行してください。',
        footerHtml: rows.length + ' 件（' + ym + '）'
      });
      var top = rows.slice(0, 10);
      App.chart.horizontalBar('rc-chart', top.map(r => r.customer_name), top.map(r => r.revenue || 0),
        { label: '売上', xTick: v => '¥' + Number(v).toLocaleString(), tooltip: c => '売上: ¥' + Number(c.parsed.x).toLocaleString() });
    }).catch(function (e) { content.innerHTML = '<div class="card text-danger">読み込み失敗: ' + App.fmt.esc(e.message) + '</div>'; });
  }
  return { render: render };
})();
