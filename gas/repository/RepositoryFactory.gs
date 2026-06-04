/**
 * RepositoryFactory.gs － Repository 実装の切替点
 * ------------------------------------------------------------------
 * Service はここから Repository を受け取る。実装の選択はこの1ファイルに集約。
 * 将来 Supabase へ移行する際は REPOSITORY_KIND を 'supabase' に変え、
 * createSupabaseRepository() を実装するだけでよい（Service は無改修）。
 */

var REPOSITORY_KIND = 'sheet'; // 'sheet' | 'supabase'

var _repoSingleton = null;

/** アプリ全体で共有する Repository を返す（実行ごとに1つ） */
function getRepository() {
  if (_repoSingleton) return _repoSingleton;
  if (REPOSITORY_KIND === 'supabase') {
    _repoSingleton = createSupabaseRepository(); // 将来実装
  } else {
    _repoSingleton = createSheetRepository();
  }
  return _repoSingleton;
}

/**
 * 将来の Supabase 実装プレースホルダ。
 * IRepository と同じメソッド群を supabase-js / UrlFetchApp で実装する。
 * （API_DESIGN §4.4 の対応表を参照）
 */
function createSupabaseRepository() {
  throw new AppError('INTERNAL_ERROR', 'SupabaseRepository は未実装です。');
}
