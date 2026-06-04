/**
 * forecast.js － 稼働予測（今月 / 来月）
 */
App.pages.forecast = (function () {
  var ym = App.fmt.thisMonth();

  function render(content, actions) {
    actions.innerHTML =
      '<button class="btn btn-secondary" id="t-cur">今月</button>' +
      '<button class="btn btn-ghost" id="t-next">来月</button>' +
      '<button class="btn btn-secondary" id="reagg">予測実行</button>';
    actions.querySelector('#t-cur').addEventListener('click', function () { ym = App.fmt.thisMonth(); setActive(actions, 't-cur'); load(content); });
    actions.querySelector('#t-next').addEventListener('click', function () { ym = App.fmt.nextMonth(); setActive(actions, 't-next'); load(content); });
    actions.querySelector('#reagg').addEventListener('click', function () {
      App.api.post('runForecastCapacity', { yearMonth: ym }).then(function () { App.toast.success('予測を更新しました'); load(content); }).catch(e => App.toast.error(e.message));
    });
    content.innerHTML = '<div id="fc-table"></div><div class="chart-card mt-16"><h3>予測稼働率</h3><div class="chart-box"><canvas id="fc-chart"></canvas></div></div>';
    load(content);
  }

  function setActive(actions, id) {
    actions.querySelector('#t-cur').className = 'btn ' + (id === 't-cur' ? 'btn-secondary' : 'btn-ghost');
    actions.querySelector('#t-next').className = 'btn ' + (id === 't-next' ? 'btn-secondary' : 'btn-ghost');
  }

  function load(content) {
    var s = App.store.get().settings;
    var over = Number(s.util_over_rate || 1), low = Number(s.util_low_rate || 0.7);
    App.api.get('forecastCapacity', { yearMonth: ym }).then(function (rows) {
      App.table.render(document.getElementById('fc-table'), {
        columns: [
          { key: 'staff_name', label: 'スタッフ' },
          { key: 'available_hours', label: '稼働可能', num: true, render: r => App.fmt.hours(r.available_hours) },
          { key: 'committed_hours', label: '確定案件工数', num: true, render: r => App.fmt.hours(r.committed_hours) },
          { key: 'forecast_hours', label: '予測稼働', num: true, render: r => App.fmt.hours(r.forecast_hours) },
          { key: 'forecast_utilization', label: '予測稼働率', render: r => App.table.utilBar(r.forecast_utilization, over, low) },
          { key: 'free_hours', label: '空き時間', num: true, render: r => App.fmt.hours(r.free_hours) },
          { key: 'alert', label: 'アラート', render: r => App.table.forecastBadge(r.alert) }
        ],
        rows: rows, emptyText: 'データがありません。「予測実行」を押してください。',
        footerHtml: rows.length + ' 名（' + ym + '）'
      });
      var colors = rows.map(function (r) {
        var u = r.forecast_utilization || 0;
        return u >= over ? App.chart.cssVar('--c-danger') : (u < low ? App.chart.cssVar('--c-warn') : App.chart.cssVar('--c-success'));
      });
      App.chart.horizontalBar('fc-chart', rows.map(r => r.staff_name), rows.map(r => Math.round((r.forecast_utilization || 0) * 100)),
        { label: '予測稼働率', colors: colors, xTick: v => v + '%', tooltip: c => '予測稼働率: ' + c.parsed.x + '%' });
    }).catch(function (e) { content.innerHTML = '<div class="card text-danger">読み込み失敗: ' + App.fmt.esc(e.message) + '</div>'; });
  }
  return { render: render };
})();
