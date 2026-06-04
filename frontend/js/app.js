/**
 * app.js － 起動処理（最後に読み込む）
 * ------------------------------------------------------------------
 * 1. ブランド名を反映
 * 2. ヘッダ日付を表示
 * 3. bootstrap を取得（マスタ・設定キャッシュ）
 * 4. ルーター開始
 */
(function () {
  function init() {
    document.getElementById('app-name').textContent = App.config.APP_NAME;
    document.getElementById('company-name').textContent = App.config.COMPANY_NAME;

    var d = new Date();
    document.getElementById('header-date').textContent =
      d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate());

    App.store.load()
      .then(function () {
        document.getElementById('splash').classList.add('hidden');
        App.router.start();
      })
      .catch(function (err) {
        var splash = document.getElementById('splash');
        splash.innerHTML = '<div class="card" style="max-width:480px;text-align:center">' +
          '<h2>接続できませんでした</h2>' +
          '<p class="text-mute">' + App.fmt.esc((err && err.message) || 'API に接続できません') + '</p>' +
          '<p class="text-mute" style="font-size:12px;margin-top:8px">js/config.js の API_BASE_URL（GASの/exec URL）を確認してください。</p>' +
          '<button class="btn btn-primary mt-16" onclick="location.reload()">再読み込み</button></div>';
      });
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
