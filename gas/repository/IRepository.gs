/**
 * IRepository.gs － データアクセス層インターフェース（契約）
 * ------------------------------------------------------------------
 * 【最重要】Service / Controller / CalcUtil はこの契約のメソッドのみを使う。
 * シートの行番号・A1記法・SpreadsheetApp を一切知ってはならない。
 *
 * 実装は2系統:
 *   - SheetRepository   : スプレッドシート（MVP）
 *   - SupabaseRepository : 将来（supabase-js / UrlFetchApp）
 * 実装を差し替えれば本体ロジックは無改修で動く（API_DESIGN §4）。
 *
 * エンティティは「物理名キーのプレーンオブジェクト」で受け渡す。
 * シート⇔オブジェクト変換は実装の内部に閉じる。
 *
 * このファイルは契約の文書化（JSDoc）であり、JS としての実体は持たない。
 *
 * @typedef {Object} IRepository
 * @property {function(string, string, Object=):Object|null} findById
 *   主キーで1件取得。論理削除済みは既定で除外。
 * @property {function(string, Object, Object=):Object[]} findWhere
 *   等価条件 where と opts(orderBy/desc/limit/offset/includeDeleted/dateField/from/to) で複数取得。
 * @property {function(string, Object=):Object[]} findAll
 *   全件取得（マスタ等）。
 * @property {function(string, Object, Object=):Object} insert
 *   1件挿入。監査列を自動付与。
 * @property {function(string, Object[], Object=):Object[]} insertMany
 *   複数挿入（一括）。
 * @property {function(string, string, Object, Object=):Object} update
 *   主キーで部分更新。updated_at/updated_by を自動更新。
 * @property {function(string, string, Object=):void} softDelete
 *   論理削除（is_deleted=true）。
 * @property {function(string, Object[]):void} replaceAll
 *   集計シートの洗い替え（全削除→一括挿入）。集計バッチ専用。
 * @property {function(string, string[], Object):void} upsertByKeys
 *   複合キー一致で更新、なければ挿入。集計の部分更新用。
 * @property {function(string):string} getSetting  設定値取得。
 * @property {function(string,string):void} setSetting  設定値更新。
 * @property {function(string):number} nextSequence  採番カウンタを原子的に+1して返す。
 */
