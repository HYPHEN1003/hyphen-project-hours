/**
 * dashboard.js － ダッシュボード（全体概況・アラート・月次サマリー）
 */
App.pages.dashboard = (function () {
  function render(content, actions) {
    actions.innerHTML = '';
    content.innerHTML = '<div class="flex" style="justify-content:center;padding:40px"><div class="spinner"></div></div>';
    App.api.get('getDashboard').then(function (d) {
      content.innerHTML =
        kpis(d) +
        '<div class="section"><div class="section-title">予算アラート</div><div id="dash-alerts"></div></div>' +
        '<div class="section"><div class="section-title">直近6ヶ月の推移</div>' +
          '<div class="chart-card"><div class="chart-box"><canvas id="dash-chart"></canvas></div></div></div>';

      // アラート一覧
      App.table.render(document.getElementById('dash-alerts'), {
        columns: [
          { key: 'project_name', label: '案件' },
          { key: 'customer_name', label: '顧客' },
          { key: 'progress', label: '消化率', render: r => App.table.progressBar(r.progress_rate) },
          { key: 'gross_margin', label: '粗利益率', num: true, render: r => App.fmt.pct(r.gross_margin, 1) },
          { key: 'alert', label: '状態', render: r => App.table.alertBadge(r.alert) }
        ],
        rows: d.alerts || [],
        emptyText: '警告・超過の案件はありません。良好です。',
        onRowClick: function () { App.router.go('report-projects'); }
      });

      // 月次グラフ
      var m = d.recentMonthly || [];
      App.chart.revenueMargin('dash-chart',
        m.map(x => x.year_month),
        m.map(x => x.revenue || 0),
        m.map(x => x.gross_margin != null ? Math.round(x.gross_margin * 100) : null));
    }).catch(function (e) {
      content.innerHTML = '<div class="card text-danger">読み込みに失敗しました: ' + App.fmt.esc(e.message) + '</div>';
    });
  }

  function kpis(d) {
    return '<div class="kpi-grid">' +
      kpi('進行中の案件', d.activeProjectCount + ' <span class="unit">/ ' + d.totalProjectCount + ' 件</span>') +
      kpi('今月の総稼働時間', App.fmt.num(d.currentMonthHours) + ' <span class="unit">h</span>') +
      kpi('今月の売上', App.fmt.yen(d.currentMonthRevenue)) +
      kpi('要対応アラート', '<span class="' + (d.alertCount ? 'text-danger' : '') + '">' + d.alertCount + '</span> <span class="unit">件</span>') +
      '</div>';
  }
  function kpi(label, value) {
    return '<div class="kpi-card"><div class="kpi-label">' + label + '</div><div class="kpi-value">' + value + '</div></div>';
  }

  return { render: render };
})();
