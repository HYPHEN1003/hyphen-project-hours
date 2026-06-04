/**
 * config.js － アプリ設定（環境ごとに変更する値）
 * ------------------------------------------------------------------
 * API_BASE_URL: GAS ウェブアプリの /exec URL をここに設定する。
 *   デプロイ後の URL に差し替えること。
 * ブランド（社名・表示名）もここで集中管理（HYPHEN 差し替え点）。
 */
window.App = window.App || {};
App.pages = App.pages || {}; // 各ページモジュールの登録先

App.config = {
  // ★ GAS デプロイ後の /exec URL（clasp create-deployment で取得）
  API_BASE_URL: 'https://script.google.com/macros/s/AKfycbyGVD48gUwGhe5BD3q5yGgnV-YEND4AGxOA6z91SLMmUL0vqEoCPROvUNxzGarFBpu4/exec',

  // ブランド（差し替え可）
  APP_NAME: '案件別工数管理システム',
  COMPANY_NAME: 'HYPHEN Inc.',

  // 操作者（認証なしMVPのため自己申告。将来は認証ユーザーに置換）
  ACTOR: 'demo@hyphen-jp.com'
};
