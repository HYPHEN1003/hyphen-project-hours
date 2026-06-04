/**
 * table.js － データテーブル描画＋共通セルパーツ（バッジ/バー）
 * ------------------------------------------------------------------
 * render(container, {columns, rows, onRowClick, emptyText, footerHtml})
 *   columns: [{ key, label, num(右寄せ), render(row)->html, width }]
 */
App.table = (function () {
  function render(container, opts) {
    var cols = opts.columns;
    var rows = opts.rows || [];
    var thead = '<thead><tr>' + cols.map(function (c) {
      return '<th' + (c.num ? ' class="num"' : '') + (c.width ? ' style="width:' + c.width + '"' : '') + '>' + App.fmt.esc(c.label) + '</th>';
    }).join('') + '</tr></thead>';

    var tbody;
    if (!rows.length) {
      tbody = '<tbody><tr><td colspan="' + cols.length + '"><div class="table-empty">' + App.fmt.esc(opts.emptyText || 'データがありません') + '</div></td></tr></tbody>';
    } else {
      tbody = '<tbody>' + rows.map(function (row, i) {
        var cls = (opts.onRowClick ? 'clickable ' : '') + (opts.rowClass ? (opts.rowClass(row) || '') : '');
        var tds = cols.map(function (c) {
          var content = c.render ? c.render(row) : App.fmt.esc(row[c.key]);
          return '<td' + (c.num ? ' class="num"' : '') + '>' + content + '</td>';
        }).join('');
        return '<tr class="' + cls.trim() + '" data-idx="' + i + '">' + tds + '</tr>';
      }).join('') + '</tbody>';
    }

    var footer = opts.footerHtml ? '<div class="table-footer">' + opts.footerHtml + '</div>' : '';
    container.innerHTML = '<div class="table-wrap"><table class="data">' + thead + tbody + '</table>' + footer + '</div>';

    if (opts.onRowClick && rows.length) {
      container.querySelectorAll('tbody tr[data-idx]').forEach(function (tr) {
        tr.addEventListener('click', function () { opts.onRowClick(rows[Number(tr.getAttribute('data-idx'))]); });
      });
    }
  }

  // ---- セルパーツ ----

  /** 進捗バー（消化率）。rate=0.85 → 黄, ≥1 → 赤 */
  function progressBar(rate) {
    if (rate === null || rate === undefined) return '<span class="text-mute">—</span>';
    var pct = Math.min(rate * 100, 100);
    var cls = rate >= 1 ? 'danger' : (rate >= 0.8 ? 'warn' : '');
    return '<div class="bar ' + cls + '"><span style="width:' + pct + '%"></span></div>' +
      '<div class="bar-label">' + (rate * 100).toFixed(0) + '%</div>';
  }

  /** 汎用バー（稼働率など、閾値を渡す） */
  function utilBar(rate, overRate, lowRate) {
    if (rate === null || rate === undefined) return '<span class="text-mute">—</span>';
    var pct = Math.min(rate * 100, 100);
    var cls = rate >= overRate ? 'danger' : (rate < lowRate ? 'warn' : 'success');
    return '<div class="bar ' + cls + '"><span style="width:' + pct + '%"></span></div>' +
      '<div class="bar-label">' + (rate * 100).toFixed(0) + '%</div>';
  }

  /** 汎用バッジ */
  function badge(text, kind) { return '<span class="badge badge-' + kind + '">' + App.fmt.esc(text) + '</span>'; }

  /** 案件アラート → バッジ */
  function alertBadge(alert) {
    if (alert === '超過') return badge('超過', 'danger');
    if (alert === '警告') return badge('警告', 'warn');
    return badge('正常', 'muted');
  }
  /** 案件ステータス → バッジ */
  function projectStatusBadge(s) {
    var map = { '進行中': 'info', '完了': 'success', '中止': 'muted', '見積中': 'warn', '請求済': 'info', '入金済': 'success' };
    return badge(s, map[s] || 'muted');
  }
  /** 請求ステータス → バッジ */
  function invoiceStatusBadge(s) {
    var map = { '下書き': 'muted', '発行済': 'info', '入金済': 'success', '一部入金': 'warn', '遅延': 'danger' };
    return badge(s, map[s] || 'muted');
  }
  /** 承認状態 → バッジ */
  function approvalBadge(s) {
    var map = { '承認': 'success', '申請中': 'warn', '却下': 'danger' };
    return badge(s, map[s] || 'muted');
  }
  /** 収益性評価 → バッジ */
  function profitabilityBadge(s) {
    var map = { '高': 'success', '中': 'muted', '低': 'warn', '赤字': 'danger' };
    return badge(s, map[s] || 'muted');
  }
  /** 予測アラート → バッジ */
  function forecastBadge(s) {
    var map = { '過負荷': 'danger', '適正': 'success', '余裕': 'warn' };
    return badge(s, map[s] || 'muted');
  }
  /** 精度評価 → バッジ */
  function accuracyBadge(s) {
    var map = { '高': 'success', '中': 'muted', '低': 'danger' };
    return badge(s, map[s] || 'muted');
  }
  /** 粗利益率 → 色付きテキスト（≥good 緑, <warn 赤） */
  function marginText(margin, good, warn) {
    if (margin === null || margin === undefined) return '<span class="text-mute">—</span>';
    var cls = margin >= good ? 'text-success' : (margin < warn ? 'text-danger' : '');
    return '<span class="' + cls + '">' + (margin * 100).toFixed(1) + '%</span>';
  }

  return {
    render: render, progressBar: progressBar, utilBar: utilBar, badge: badge,
    alertBadge: alertBadge, projectStatusBadge: projectStatusBadge, invoiceStatusBadge: invoiceStatusBadge,
    approvalBadge: approvalBadge, profitabilityBadge: profitabilityBadge, forecastBadge: forecastBadge,
    accuracyBadge: accuracyBadge, marginText: marginText
  };
})();
