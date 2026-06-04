/**
 * estimate.js － 見積精度分析（完了案件）
 */
App.pages.estimate = (function () {
  function render(content, actions) {
    actions.innerHTML = '<button class="btn btn-secondary" id="reagg">再分析</button>';
    actions.querySelector('#reagg').addEventListener('click', function () {
      App.api.post('runAnalyzeEstimate', {}).then(function () { App.toast.success('再分析しました'); load(content); }).catch(e => App.toast.error(e.message));
    });
    content.innerHTML =
      '<div class="chart-card"><h3>案件種別ごとの平均乖離率</h3><div class="chart-box"><canvas id="es-chart"></canvas></div></div>' +
      '<div id="es-table" class="mt-16"></div>';
    load(content);
  }

  function load(content) {
    App.api.get('analyzeEstimateAccuracy').then(function (res) {
      var rows = res.rows || [], summary = res.typeSummary || [];
      // グラフ（0中心の乖離率。プラスは赤、マイナスは青）
      var colors = summary.map(s => s.avg_variance >= 0 ? App.chart.cssVar('--c-danger') : App.chart.cssVar('--brand-primary'));
      App.chart.horizontalBar('es-chart', summary.map(s => s.type_name || '（種別なし）'),
        summary.map(s => Math.round(s.avg_variance * 100)),
        { label: '平均乖離率', colors: colors, xTick: v => v + '%', tooltip: c => '平均乖離率: ' + (c.parsed.x >= 0 ? '+' : '') + c.parsed.x + '%' });

      App.table.render(document.getElementById('es-table'), {
        columns: [
          { key: 'project_name', label: '案件' },
          { key: 'type_name', label: '種別', render: r => r.type_name || '—' },
          { key: 'estimated_hours', label: '見積', num: true, render: r => App.fmt.hours(r.estimated_hours) },
          { key: 'actual_hours', label: '実績', num: true, render: r => App.fmt.hours(r.actual_hours) },
          { key: 'variance_rate', label: '乖離率', num: true, render: r => varianceText(r.variance_rate) },
          { key: 'accuracy', label: '精度', render: r => App.table.accuracyBadge(r.accuracy) },
          { key: 'suggestion', label: '改善提案', render: r => App.fmt.esc(r.suggestion) }
        ],
        rows: rows, emptyText: '完了案件がありません。「再分析」を実行してください。',
        footerHtml: rows.length + ' 件'
      });
    }).catch(function (e) { content.innerHTML = '<div class="card text-danger">読み込み失敗: ' + App.fmt.esc(e.message) + '</div>'; });
  }

  function varianceText(v) {
    if (v === null || v === undefined) return '—';
    var cls = Math.abs(v) > 0.2 ? 'text-danger' : '';
    return '<span class="' + cls + '">' + (v >= 0 ? '+' : '') + (v * 100).toFixed(0) + '%</span>';
  }
  return { render: render };
})();
