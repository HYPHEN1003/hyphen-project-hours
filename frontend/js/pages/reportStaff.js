/**
 * reportStaff.js － スタッフ別レポート（月別）
 */
App.pages.reportStaff = (function () {
  var ym = App.fmt.thisMonth();

  function render(content, actions) {
    actions.innerHTML =
      '<input type="month" id="ym" value="' + ym + '" class="btn btn-secondary" style="padding:6px 10px"/>' +
      '<button class="btn btn-secondary" id="reagg">集計</button>';
    actions.querySelector('#ym').addEventListener('change', function (e) { ym = e.target.value; load(content); });
    actions.querySelector('#reagg').addEventListener('click', function () {
      App.api.post('runAggregateStaff', { yearMonth: ym }).then(function () { App.toast.success('集計しました'); load(content); }).catch(e => App.toast.error(e.message));
    });
    content.innerHTML = '<div id="rs-table"></div><div class="chart-card mt-16"><h3>稼働率</h3><div class="chart-box"><canvas id="rs-chart"></canvas></div></div>';
    load(content);
  }

  function load(content) {
    var s = App.store.get().settings;
    var over = Number(s.util_over_rate || 1), low = Number(s.util_low_rate || 0.7);
    App.api.get('reportStaff', { yearMonth: ym }).then(function (rows) {
      App.table.render(document.getElementById('rs-table'), {
        columns: [
          { key: 'staff_name', label: '氏名' },
          { key: 'role', label: '役職', render: r => r.role || '—' },
          { key: 'total_hours', label: '総稼働', num: true, render: r => App.fmt.hours(r.total_hours) },
          { key: 'billable_hours', label: '請求対象', num: true, render: r => App.fmt.hours(r.billable_hours) },
          { key: 'utilization', label: '稼働率', render: r => App.table.utilBar(r.utilization, over, low) },
          { key: 'target_achievement', label: '達成度', num: true, render: r => App.fmt.pct(r.target_achievement) },
          { key: 'project_count', label: '担当案件数', num: true },
          { key: 'revenue_contribution', label: '売上貢献', num: true, render: r => App.fmt.yen(r.revenue_contribution) }
        ],
        rows: rows, emptyText: 'データがありません。「集計」を実行してください。',
        footerHtml: rows.length + ' 名（' + ym + '）'
      });
      // グラフ
      var colors = rows.map(function (r) {
        var u = r.utilization || 0;
        return u >= over ? App.chart.cssVar('--c-danger') : (u < low ? App.chart.cssVar('--c-warn') : App.chart.cssVar('--c-success'));
      });
      App.chart.horizontalBar('rs-chart', rows.map(r => r.staff_name), rows.map(r => Math.round((r.utilization || 0) * 100)),
        { label: '稼働率', colors: colors, xTick: v => v + '%', tooltip: c => '稼働率: ' + c.parsed.x + '%' });
    }).catch(function (e) { content.innerHTML = '<div class="card text-danger">読み込み失敗: ' + App.fmt.esc(e.message) + '</div>'; });
  }
  return { render: render };
})();
