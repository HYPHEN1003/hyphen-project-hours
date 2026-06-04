/**
 * reportMonthly.js － 月次レポート
 */
App.pages.reportMonthly = (function () {
  function render(content, actions) {
    actions.innerHTML = '<button class="btn btn-secondary" id="reagg">今月を集計</button>';
    actions.querySelector('#reagg').addEventListener('click', function () {
      App.api.post('runAggregateMonthly', { yearMonth: App.fmt.thisMonth() }).then(function () { App.toast.success('集計しました'); load(content); }).catch(e => App.toast.error(e.message));
    });
    content.innerHTML =
      '<div id="rm-kpi"></div>' +
      '<div class="chart-card mt-8"><h3>売上・粗利益率の推移</h3><div class="chart-box"><canvas id="rm-chart"></canvas></div></div>' +
      '<div id="rm-table" class="mt-16"></div>';
    load(content);
  }

  function load(content) {
    App.api.get('reportMonthly', {}).then(function (rows) {
      var latest = rows[rows.length - 1] || {};
      document.getElementById('rm-kpi').innerHTML = '<div class="kpi-grid">' +
        kpi('当月売上', App.fmt.yen(latest.revenue)) +
        kpi('前月比', latest.mom_ratio != null ? (latest.mom_ratio >= 0 ? '+' : '') + (latest.mom_ratio * 100).toFixed(1) + '%' : '—') +
        kpi('粗利益率', App.fmt.pct(latest.gross_margin, 1)) +
        kpi('全体稼働率', App.fmt.pct(latest.overall_utilization, 1)) +
        '</div>';

      App.chart.revenueMargin('rm-chart', rows.map(r => r.year_month), rows.map(r => r.revenue || 0),
        rows.map(r => r.gross_margin != null ? Math.round(r.gross_margin * 100) : null));

      App.table.render(document.getElementById('rm-table'), {
        columns: [
          { key: 'year_month', label: '月' },
          { key: 'revenue', label: '売上', num: true, render: r => App.fmt.yen(r.revenue) },
          { key: 'mom_ratio', label: '前月比', num: true, render: r => r.mom_ratio != null ? App.fmt.pct(r.mom_ratio, 1) : '—' },
          { key: 'total_cost', label: '総原価', num: true, render: r => App.fmt.yen(r.total_cost) },
          { key: 'gross_profit', label: '粗利益', num: true, render: r => App.fmt.yen(r.gross_profit) },
          { key: 'gross_margin', label: '粗利益率', num: true, render: r => App.fmt.pct(r.gross_margin, 1) },
          { key: 'completed_count', label: '完了', num: true },
          { key: 'new_count', label: '新規', num: true },
          { key: 'overall_utilization', label: '全体稼働率', num: true, render: r => App.fmt.pct(r.overall_utilization, 1) }
        ],
        rows: rows, emptyText: 'データがありません。「今月を集計」を実行してください。',
        footerHtml: rows.length + ' ヶ月'
      });
    }).catch(function (e) { content.innerHTML = '<div class="card text-danger">読み込み失敗: ' + App.fmt.esc(e.message) + '</div>'; });
  }
  function kpi(l, v) { return '<div class="kpi-card"><div class="kpi-label">' + l + '</div><div class="kpi-value" style="font-size:22px">' + v + '</div></div>'; }
  return { render: render };
})();
