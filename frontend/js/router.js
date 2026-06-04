/**
 * router.js － ハッシュルーター＋サイドバーナビ
 * ------------------------------------------------------------------
 * 元アプリのサイドメニュー構成（6グループ）を踏襲。
 * 各ルートは page モジュール（App.pages.*）の render(content, actions) を呼ぶ。
 */
App.router = (function () {
  // ナビ定義（グループ → 項目）
  var NAV = [
    { group: 'メイン', items: [
      { route: 'dashboard', label: 'ダッシュボード', title: 'ダッシュボード', page: 'dashboard' },
      { route: 'time', label: '工数入力', title: '工数入力', page: 'time' },
      { route: 'projects', label: '案件管理', title: '案件管理', page: 'projects' }
    ]},
    { group: 'マスタ', items: [
      { route: 'customers', label: '顧客マスタ', title: '顧客マスタ', page: 'customers' },
      { route: 'staff', label: 'スタッフマスタ', title: 'スタッフマスタ', page: 'staff' },
      { route: 'project-types', label: '案件種別マスタ', title: '案件種別マスタ', page: 'projectTypes' }
    ]},
    { group: '取引', items: [
      { route: 'expenses', label: '経費管理', title: '経費管理', page: 'expenses' },
      { route: 'invoices', label: '請求管理', title: '請求管理', page: 'invoices' }
    ]},
    { group: 'レポート', items: [
      { route: 'report-projects', label: '案件別レポート', title: '案件別レポート', page: 'reportProjects' },
      { route: 'report-staff', label: 'スタッフ別レポート', title: 'スタッフ別レポート', page: 'reportStaff' },
      { route: 'report-monthly', label: '月次レポート', title: '月次レポート', page: 'reportMonthly' },
      { route: 'report-customers', label: '顧客別レポート', title: '顧客別レポート', page: 'reportCustomers' }
    ]},
    { group: '分析', items: [
      { route: 'estimate', label: '見積精度分析', title: '見積精度分析', page: 'estimate' },
      { route: 'forecast', label: '稼働予測', title: '稼働予測', page: 'forecast' }
    ]},
    { group: 'システム', items: [
      { route: 'settings', label: '設定', title: '設定', page: 'settings' }
    ]}
  ];

  var routeMap = {};
  NAV.forEach(function (g) { g.items.forEach(function (it) { routeMap[it.route] = it; }); });

  function renderNav() {
    var html = NAV.map(function (g) {
      var items = g.items.map(function (it) {
        return '<a class="nav-item" data-route="' + it.route + '" href="#/' + it.route + '">' + App.fmt.esc(it.label) + '</a>';
      }).join('');
      return '<div class="nav-group-title">' + App.fmt.esc(g.group) + '</div>' + items;
    }).join('');
    document.getElementById('nav').innerHTML = html;
  }

  function currentRoute() {
    var h = location.hash.replace(/^#\/?/, '');
    return routeMap[h] ? h : 'dashboard';
  }

  function navigate() {
    var route = currentRoute();
    var item = routeMap[route];

    // アクティブ表示
    document.querySelectorAll('.nav-item').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-route') === route);
    });
    document.getElementById('page-title').textContent = item.title;

    var content = document.getElementById('page-content');
    var actions = document.getElementById('page-actions');
    content.innerHTML = '<div class="flex" style="justify-content:center;padding:40px"><div class="spinner"></div></div>';
    actions.innerHTML = '';

    // モバイル: ナビを閉じる
    closeSidebar();

    var page = App.pages[item.page];
    if (!page) { content.innerHTML = '<div class="card">画面が未実装です。</div>'; return; }
    try {
      page.render(content, actions);
    } catch (e) {
      console.error(e);
      content.innerHTML = '<div class="card text-danger">画面の描画でエラーが発生しました。</div>';
    }
  }

  function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
  }
  function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('open');
  }

  function start() {
    renderNav();
    window.addEventListener('hashchange', navigate);
    document.getElementById('menu-toggle').addEventListener('click', toggleSidebar);
    document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);
    if (!location.hash) location.hash = '#/dashboard';
    navigate();
  }

  /** 他ページへプログラム遷移 */
  function go(route) { location.hash = '#/' + route; }

  return { start: start, go: go, navigate: navigate };
})();
