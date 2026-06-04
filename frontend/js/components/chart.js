/**
 * chart.js － Chart.js ラッパ
 * ------------------------------------------------------------------
 * カラートークン(--brand-*, --c-*)を読み取り、日本語ツールチップ・
 * 3桁区切りで描画する。閾値ラインは横線データセットで代替（プラグイン不使用）。
 */
App.chart = (function () {
  var instances = {};

  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  /** 既存インスタンスを破棄（再描画時のリーク防止） */
  function destroy(canvasId) {
    if (instances[canvasId]) { instances[canvasId].destroy(); delete instances[canvasId]; }
  }

  function make(canvasId, config) {
    destroy(canvasId);
    var ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    config.options = Object.assign({
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { font: { family: 'Noto Sans JP' } } } }
    }, config.options || {});
    instances[canvasId] = new Chart(ctx, config);
    return instances[canvasId];
  }

  /** 売上(棒)＋粗利益率(折線) 複合グラフ（ダッシュボード/月次） */
  function revenueMargin(canvasId, labels, revenue, marginPct) {
    return make(canvasId, {
      data: {
        labels: labels,
        datasets: [
          { type: 'bar', label: '売上(¥)', data: revenue, backgroundColor: cssVar('--brand-primary'), yAxisID: 'y', order: 2 },
          { type: 'line', label: '粗利益率(%)', data: marginPct, borderColor: cssVar('--c-success'), backgroundColor: cssVar('--c-success'), yAxisID: 'y1', tension: 0.3, order: 1 }
        ]
      },
      options: {
        scales: {
          y: { position: 'left', ticks: { callback: function (v) { return '¥' + Number(v).toLocaleString(); } } },
          y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: function (v) { return v + '%'; } } }
        },
        plugins: { tooltip: { callbacks: { label: function (c) {
          if (c.dataset.yAxisID === 'y1') return c.dataset.label + ': ' + c.parsed.y + '%';
          return c.dataset.label + ': ¥' + Number(c.parsed.y).toLocaleString();
        } } } }
      }
    });
  }

  /** 横棒グラフ（稼働率・売上上位・乖離率など） */
  function horizontalBar(canvasId, labels, values, opts) {
    opts = opts || {};
    var colors = opts.colors || labels.map(function () { return cssVar('--brand-primary'); });
    return make(canvasId, {
      type: 'bar',
      data: { labels: labels, datasets: [{ label: opts.label || '', data: values, backgroundColor: colors }] },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: opts.tooltip || function (c) { return c.parsed.x; } } } },
        scales: { x: { ticks: { callback: opts.xTick || function (v) { return v; } } } }
      }
    });
  }

  return { make: make, destroy: destroy, revenueMargin: revenueMargin, horizontalBar: horizontalBar, cssVar: cssVar };
})();
