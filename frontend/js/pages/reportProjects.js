/**
 * reportProjects.js － 案件別レポート
 */
App.pages.reportProjects = (function () {
  function render(content, actions) {
    actions.innerHTML = '<button class="btn btn-secondary" id="reagg">再集計</button>';
    actions.querySelector('#reagg').addEventListener('click', function () {
      App.api.post('runAggregateProjects', {}).then(function () { App.toast.success('再集計しました'); load(content); }).catch(e => App.toast.error(e.message));
    });
    content.innerHTML = '<div id="rp-summary"></div><div id="rp-table" class="mt-16"></div>';
    load(content);
  }

  function load(content) {
    var s = App.store.get().settings;
    var good = Number(s.margin_good_rate || 0.5), warn = Number(s.margin_warn_rate || 0.3);
    App.api.get('reportProjects').then(function (rows) {
      var totContract = rows.reduce((a, r) => a + Number(r.contract_amount || 0), 0);
      var totProfit = rows.reduce((a, r) => a + Number(r.gross_profit || 0), 0);
      var avgMargin = totContract ? totProfit / totContract : null;
      document.getElementById('rp-summary').innerHTML = '<div class="kpi-grid">' +
        kpi('合計契約額', App.fmt.yen(totContract)) +
        kpi('合計粗利益', App.fmt.yen(totProfit)) +
        kpi('平均粗利益率', App.fmt.pct(avgMargin, 1)) +
        '</div>';
      App.table.render(document.getElementById('rp-table'), {
        columns: [
          { key: 'project_name', label: '案件' },
          { key: 'customer_name', label: '顧客' },
          { key: 'contract_amount', label: '契約金額', num: true, render: r => App.fmt.yen(r.contract_amount) },
          { key: 'actual_hours', label: '実績工数', num: true, render: r => App.fmt.hours(r.actual_hours) },
          { key: 'progress', label: '消化率', render: r => App.table.progressBar(r.progress_rate) },
          { key: 'total_cost', label: '総原価', num: true, render: r => App.fmt.yen(r.total_cost) },
          { key: 'gross_profit', label: '粗利益', num: true, render: r => App.fmt.yen(r.gross_profit) },
          { key: 'gross_margin', label: '粗利益率', num: true, render: r => App.table.marginText(r.gross_margin, good, warn) },
          { key: 'alert', label: 'アラート', render: r => App.table.alertBadge(r.alert) }
        ],
        rows: rows, emptyText: 'データがありません。「再集計」を実行してください。',
        footerHtml: rows.length + ' 件'
      });
    }).catch(function (e) { content.innerHTML = '<div class="card text-danger">読み込み失敗: ' + App.fmt.esc(e.message) + '</div>'; });
  }
  function kpi(l, v) { return '<div class="kpi-card"><div class="kpi-label">' + l + '</div><div class="kpi-value" style="font-size:20px">' + v + '</div></div>'; }
  return { render: render };
})();
