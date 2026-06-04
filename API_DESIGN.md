# GAS API 設計書（HYPHEN版 案件別工数管理システム）

- **ドキュメント種別**: API_DESIGN.md（Step 3 / 全5点中の3点目）
- **前提**: REQUIREMENTS.md（Step 1）／ SHEETS_SCHEMA.md（Step 2）／ 正本マニュアル `案件別工数管理.txt`
- **作成日**: 2026-06-04
- **ステータス**: ドラフト（中村レビュー待ち）

---

## 0. 設計方針

1. **REST スタイル**: `GET /exec?action=listProjects`、`POST /exec?action=createProject` の形式。`action` でルーティングする。
2. **Supabase Edge Function 互換の JSON**: リクエスト/レスポンスの形を将来 Edge Function でそのまま再現できる構造にする（§2 の共通エンベロープ）。
3. **DataRepository 層を必ず経由**: 業務ロジック（Service 層）は `SpreadsheetApp` を直接呼ばない。シート操作は Repository 実装の内部に閉じ込め、将来 Supabase 版へ差し替え可能にする（§4）。
4. **3層アーキテクチャ**:
   - **Controller**（doGet/doPost）= ルーティング・認可・入出力整形
   - **Service**（業務ロジック・自動計算・集計）= 計算式の正本
   - **Repository**（データアクセス）= シート/将来DBへの CRUD
5. **排他制御**: 書き込み・採番は `LockService` で直列化する（§6）。
6. **計算はサーバ側**: 原価/請求/粗利/消化率/稼働率などはすべて Service 層で計算（フロントは表示のみ）。

### 0.1 レイヤ依存方向
```
Controller (doGet/doPost, router)
      │  呼ぶ
      v
Service (ProjectService, TimeEntryService, InvoiceService, AggregationService, CalcUtil ...)
      │  呼ぶ（インターフェース経由）
      v
Repository (IRepository) ── 実装A: SheetRepository(SpreadsheetApp)
                          └ 実装B: SupabaseRepository(将来 / UrlFetchApp or supabase-js)
```
Service は `IRepository` 抽象にのみ依存し、具象実装を知らない（依存性注入）。

### 0.2 ファイル構成（GAS 側 / IMPLEMENTATION_PLAN.md で確定）
```
gas/
  Main.gs               … doGet/doPost、ルーター、CORS、エンベロープ
  config/Schema.gs      … シート名・ヘッダ定義・enum・設定キー
  repository/IRepository.gs        … インターフェース（JSDoc 契約）
  repository/SheetRepository.gs    … SpreadsheetApp 実装
  repository/RepositoryFactory.gs  … 実装の切替（Sheet/Supabase）
  service/CalcUtil.gs              … 自動計算関数群（正本）
  service/MasterService.gs         … 顧客/スタッフ/種別/作業項目 CRUD
  service/ProjectService.gs        … 案件 CRUD
  service/TimeEntryService.gs      … 工数 CRUD・一括・タイマー保存
  service/ExpenseService.gs        … 経費 CRUD
  service/InvoiceService.gs        … 請求・自動計算・採番
  service/AggregationService.gs    … 集計バッチ（案件/月次/スタッフ/見積精度/稼働予測）
  service/SettingService.gs        … システム設定 read/write
  util/IdGenerator.gs             … ID採番（排他下）
  util/Lock.gs                    … LockService ラッパ
  util/Validator.gs               … バリデーション
  util/Response.gs                … 成功/エラーエンベロープ生成
```

---

## 1. エンドポイント設計（ルーティング）

### 1.1 HTTP メソッドの割当
- **GET**: 参照系（list / get / レポート取得）。副作用なし。
- **POST**: 更新系（create / update / delete / 自動計算 / 集計実行）。

> 注: GAS Web アプリの `doGet`/`doPost` はパスを持たないため、`action` クエリ（POST は body の `action` も可）でディスパッチする。GET は URL 長制限があるため複雑な検索条件も POST 可とする（`action=...Search`）。

### 1.2 アクション一覧

#### マスタ（顧客 / スタッフ / 案件種別 / 作業項目）
| action | method | 説明 |
|---|---|---|
| `listCustomers` / `getCustomer` / `createCustomer` / `updateCustomer` / `deleteCustomer` | GET/GET/POST/POST/POST | 顧客 CRUD |
| `listStaff` / `getStaff` / `createStaff` / `updateStaff` / `deleteStaff` | 〃 | スタッフ CRUD |
| `listProjectTypes` / `getProjectType` / `createProjectType` / `updateProjectType` / `deleteProjectType` | 〃 | 案件種別 CRUD |
| `listWorkItems` / `createWorkItem` / `updateWorkItem` / `deleteWorkItem` | 〃 | 作業項目 CRUD |

#### 案件
| action | method | 説明 |
|---|---|---|
| `listProjects` | GET | 案件一覧（status フィルタ可。既定=進行中） |
| `getProject` | GET | 案件1件＋集計値 |
| `createProject` / `updateProject` / `deleteProject` | POST | 案件 CRUD |

#### 工数
| action | method | 説明 |
|---|---|---|
| `listTimeEntries` | GET/POST | 履歴（staff/project/日付範囲フィルタ） |
| `createTimeEntry` / `updateTimeEntry` / `deleteTimeEntry` | POST | 個別 CRUD |
| `bulkCreateTimeEntries` | POST | 一括入力（複数行） |
| `saveTimerEntry` | POST | タイマー停止時の保存（経過分→丸め→工数化） |

#### 経費
| action | method | 説明 |
|---|---|---|
| `listExpenses` / `createExpense` / `updateExpense` / `deleteExpense` | GET/POST/POST/POST | 経費 CRUD |
| `approveExpense` | POST | 承認状態変更（申請中→承認/却下） |

#### 請求
| action | method | 説明 |
|---|---|---|
| `listInvoices` / `getInvoice` | GET | 請求一覧/明細 |
| `calculateInvoice` | POST | 自動計算（保存せず計算結果を返す） |
| `createInvoice` / `updateInvoice` / `deleteInvoice` | POST | 請求 CRUD（明細含む） |
| `recordPayment` | POST | 入金登録（paid_amount 更新・ステータス再判定） |

#### レポート（集計シート参照）
| action | method | 説明 |
|---|---|---|
| `getDashboard` | GET | ダッシュボード（進行中件数/今月稼働/アラート/直近6ヶ月） |
| `reportProjects` | GET | 案件別レポート |
| `reportStaff` | GET | スタッフ別レポート（`yearMonth` 指定） |
| `reportMonthly` | GET | 月次レポート（期間指定） |
| `reportCustomers` | GET | 顧客別レポート（`yearMonth` 指定） |

#### 分析
| action | method | 説明 |
|---|---|---|
| `analyzeEstimateAccuracy` | GET | 見積精度分析（完了案件） |
| `forecastCapacity` | GET | 稼働予測（`yearMonth`=今月/来月） |

#### 設定・集計実行
| action | method | 説明 |
|---|---|---|
| `getSettings` / `updateSettings` | GET/POST | システム設定 |
| `runAggregateProjects` | POST | 案件別集計を実行 |
| `runAggregateMonthly` | POST | 月次集計を実行（先月） |
| `runAggregateStaff` | POST | スタッフ別集計を実行（先月） |
| `runAnalyzeEstimate` | POST | 見積精度分析を実行 |
| `runForecastCapacity` | POST | 稼働予測を実行（今月/来月） |

#### 共通
| action | method | 説明 |
|---|---|---|
| `bootstrap` | GET | 初期表示用の一括取得（マスタ各種＋設定）。フロント起動時の往復削減 |
| `ping` | GET | 疎通確認 |

---

## 2. リクエスト / レスポンス共通仕様

### 2.1 リクエスト（POST）
`Content-Type: text/plain`（GAS の CORS 制約回避のため。body は JSON 文字列）。
```json
{
  "action": "createProject",
  "payload": { "name": "山田製作所 法人決算申告", "customer_id": "CUS-001", "...": "..." },
  "meta": { "actor": "n-nakamura@hyphen-jp.com", "requestId": "uuid-xxxx" }
}
```
- `action`: 実行アクション（クエリと body どちらでも可。body 優先）。
- `payload`: アクション固有のデータ（物理名キーで送る）。
- `meta.actor`: 操作者（監査列 created_by/updated_by に使用。認証なしMVPのため自己申告）。
- `meta.requestId`: 冪等性・ログ追跡用（任意）。

GET の場合はクエリパラメータ（`?action=listProjects&status=進行中`）。

### 2.2 レスポンス（成功）— Supabase Edge Function 互換エンベロープ
```json
{
  "ok": true,
  "data": { "...": "..." },
  "error": null,
  "meta": { "count": 12, "requestId": "uuid-xxxx", "serverTime": "2026-06-04T09:00:00+09:00" }
}
```
- 一覧系は `data` が配列、`meta.count` に件数。

### 2.3 レスポンス（エラー）
```json
{
  "ok": false,
  "data": null,
  "error": { "code": "VALIDATION_ERROR", "message": "案件名は必須です", "details": [{ "field": "name", "message": "必須です" }] },
  "meta": { "requestId": "uuid-xxxx", "serverTime": "..." }
}
```

### 2.4 エラーコード一覧
| code | 意味 | HTTP相当 |
|---|---|---|
| `VALIDATION_ERROR` | 入力検証エラー | 400 |
| `NOT_FOUND` | 対象なし | 404 |
| `CONFLICT` | 排他/重複（採番衝突・楽観ロック失敗） | 409 |
| `LOCK_TIMEOUT` | LockService 取得失敗 | 423 |
| `FK_VIOLATION` | 参照先が存在しない/論理削除済 | 422 |
| `INTERNAL_ERROR` | 想定外エラー | 500 |

> GAS の `ContentService` は HTTP ステータスを自由に返せないため、ステータスは常に 200 とし、`ok`/`error.code` で判定する（Supabase 移行時は本来の HTTP ステータスへマッピング）。

### 2.5 CORS
- Netlify フロントからのアクセスを許可。`doGet`/`doPost` は `ContentService.createTextOutput(JSON).setMimeType(JSON)` を返す。
- プリフライト回避のため `Content-Type: text/plain` で送信し、サーバで JSON.parse する。

### 2.6 楽観的ロック（任意）
- 更新系は payload に `updated_at`（取得時の値）を含め、サーバ側現在値と不一致なら `CONFLICT` を返す（多人数同時編集の上書き事故防止）。MVP では任意・将来有効化。

---

## 3. 主要エンドポイント詳細

> 全レスポンスは §2.2 のエンベロープでラップされる。以下は `data` の中身を示す。

### 3.1 `bootstrap`（GET）
画面初期化に必要なマスタと設定をまとめて返す。
- **req**: なし
- **data**:
```json
{
  "customers": [ ... ], "staff": [ ... ], "projectTypes": [ ... ],
  "workItems": [ ... ], "settings": { "tax_rate": 0.10, "min_input_minutes": 15, ... }
}
```

### 3.2 `createTimeEntry`（POST）
- **payload**:
```json
{
  "work_date": "2026-05-07", "staff_id": "STF-002", "project_id": "PJT-001",
  "work_item_id": "WRK-002", "start_time": "09:00", "end_time": "12:00",
  "minutes": null, "billing_type": "請求対象", "description": "帳簿チェック", "input_method": "個別"
}
```
- **サーバ処理**:
  1. バリデーション（§5）。`start/end` か `minutes` のどちらか必須。
  2. `minutes` 未指定なら `end-start` を分換算。最小入力単位で丸め。
  3. `hours = minutes/60`。
  4. スタッフ単価を取得し `cost_rate_snapshot/bill_rate_snapshot` に保存。
  5. `cost_amount = round(cost_rate × hours)`、`bill_amount = round(bill_rate × hours)`。
  6. `KOSU-` ID 採番（ロック下）。
  7. 保存。設定により対象案件の `agg_projects` を即時再集計（§7.5 ハイブリッド方針）。
- **data**: 作成された工数レコード（採番ID・計算済み金額を含む）。

### 3.3 `bulkCreateTimeEntries`（POST）
- **payload**: `{ "staff_id":"STF-003", "work_date":"2026-05-08", "rows":[ {project_id, work_item_id, minutes, billing_type, description}, ... ] }`
- **処理**: 行ごとに検証 → 一括ロック取得 → 連番採番 → 一括保存。エラー行は `error.details[]` に index 付きで返し、全体ロールバック（部分成功させない）。
- **data**: 作成件数と作成レコード配列。

### 3.4 `saveTimerEntry`（POST）
- **payload**: `{ staff_id, project_id, work_item_id, start_time, end_time, elapsed_seconds, billing_type, description }`
- **処理**: `elapsed_seconds` を分換算→最小入力単位で丸め→`createTimeEntry` と同じ保存フロー。`input_method="タイマー"`。
- **data**: 作成された工数レコード。

### 3.5 `calculateInvoice`（POST）— 保存しない計算プレビュー
- **payload**: `{ customer_id, project_id, period_from, period_to, invoice_date }`
- **処理**（CalcUtil 経由）:
  1. 案件取得 → 契約形態に応じ `base_fee`（固定/スポット=契約金額、顧問/タイムチャージ=0 を既定。§9 論点7）。
  2. 期間内・請求対象工数の `Σ bill_amount` = `time_charge`。
  3. 期間内・承認済み・実費請求経費の `Σ amount` = `expense_amount`。
  4. `subtotal = base_fee + time_charge + expense_amount`。
  5. `tax = round(subtotal × tax_rate)`、`total = subtotal + tax`。
  6. 明細候補（`invoice_items` 相当）も生成して返す。
- **data**: `{ base_fee, time_charge, expense_amount, subtotal, tax_rate, tax, total, items:[...] }`（未保存）。

### 3.6 `createInvoice`（POST）
- **payload**: `calculateInvoice` の結果（ユーザー調整後）＋ `due_date, status`。
- **処理**: `INV-YYYYMM-連番` 採番（`invoice_date` の年月、月内連番、ロック下）。ヘッダ＋明細を保存。
- **data**: 作成請求（請求番号付き）。

### 3.7 `recordPayment`（POST）
- **payload**: `{ invoice_id, paid_amount }`
- **処理**: 入金累計を更新。`paid_amount >= total` →「入金済」、`0 < paid_amount < total` →「一部入金」。`due_date` 超過かつ未入金は「遅延」。
- **data**: 更新後請求。

### 3.8 `getDashboard`（GET）
- **data**:
```json
{
  "activeProjectCount": 8, "totalProjectCount": 25,
  "currentMonthHours": 320.5,
  "alerts": [ { "project_id":"PJT-004", "name":"...", "progress_rate":1.05, "alert":"超過" } ],
  "recentMonthly": [ { "year_month":"2026-01", "revenue":..., "gross_profit":... }, ... 6件 ]
}
```
- 集計シート（`agg_projects` / `agg_monthly`）参照。重い再計算はしない。

### 3.9 レポート系（GET）
- `reportProjects`: `agg_projects` 全件（フィルタ/ソート可）。色判定用フィールド（alert, margin 区分）を含む。
- `reportStaff?yearMonth=2026-05`: `agg_staff_monthly` の該当月。
- `reportMonthly?from=2026-01&to=2026-06`: `agg_monthly` 範囲。
- `reportCustomers?yearMonth=2026-05`: `agg_customer_monthly`。
- `analyzeEstimateAccuracy`: `agg_estimate_accuracy` ＋ 種別別平均乖離率サマリー。
- `forecastCapacity?yearMonth=2026-06`: `agg_capacity_forecast`。

### 3.10 集計実行（POST）
`runAggregate*` / `runAnalyzeEstimate` / `runForecastCapacity` は対応する AggregationService 関数を呼び、集計シートを洗い替え。`data` に `{ updatedRows, aggregated_at }` を返す。長時間化に備え対象を絞る引数（`yearMonth` 等）を受ける。

---

## 4. DataRepository 層インターフェース（Supabase 化の窓口）

### 4.1 設計原則
- Service は **`IRepository` のメソッドのみ**を使う。シート行番号・A1記法・`SpreadsheetApp` を一切知らない。
- エンティティは「物理名キーのプレーンオブジェクト」で受け渡し（シート↔オブジェクト変換は Repository 内）。
- クエリは単純な条件オブジェクトで表現（複雑な集計は Service 側でメモリ処理、または専用メソッド）。

### 4.2 インターフェース定義（JSDoc 契約 / 擬似コード）
```js
/**
 * @interface IRepository
 * すべてのデータアクセスはこの契約を通す。実装を差し替えれば本体ロジックは不変。
 */
const IRepository = {
  /** 主キーで1件取得（論理削除済みは既定で除外） @returns {Object|null} */
  findById(table, id, opts) {},

  /**
   * 条件一致で複数取得。
   * @param {string} table 物理テーブル名（'projects' 等）
   * @param {Object} where 等価条件 { status:'進行中', customer_id:'CUS-001' }
   * @param {Object} [opts] { orderBy:'created_at', desc:false, limit, offset, includeDeleted:false,
   *                          dateField:'work_date', from:'2026-05-01', to:'2026-05-31' }
   * @returns {Object[]}
   */
  findWhere(table, where, opts) {},

  /** 全件取得（マスタ等） @returns {Object[]} */
  findAll(table, opts) {},

  /** 1件挿入（idは呼び出し側で採番済 or autoId:true で内部採番）。監査列を自動付与 @returns {Object} */
  insert(table, entity, opts) {},

  /** 複数挿入（一括）。トランザクション的に全成功/全失敗 @returns {Object[]} */
  insertMany(table, entities, opts) {},

  /** 主キーで部分更新。updated_at/updated_by を自動更新 @returns {Object} */
  update(table, id, patch, opts) {},

  /** 論理削除（is_deleted=true）。物理削除は別メソッド hardDelete（原則未使用） */
  softDelete(table, id, opts) {},

  /** 集計シートの洗い替え（全削除→一括挿入）。集計バッチ専用 */
  replaceAll(table, entities, opts) {},

  /** キー単位 upsert（集計の部分更新用） */
  upsertByKeys(table, keys, entity, opts) {},

  /** 設定 key-value */
  getSetting(key) {}, setSetting(key, value) {},

  /** 採番カウンタの原子的インクリメント（ロック下で呼ばれる） @returns {number} */
  nextSequence(seqName) {}
};
```

### 4.3 SheetRepository（MVP 実装）の責務
- ヘッダ行（1行目・日本語）↔ 物理名のマッピング（`Schema.gs` 由来）を保持。
- 行 ⇄ オブジェクト変換、`is_deleted` フィルタ、`orderBy/limit` のメモリ処理。
- `getRange().getValues()` をまとめて読み、N+1 を避ける（性能）。
- 監査列の自動付与（created/updated）。
- `nextSequence` は `system_settings`（or 専用 `_sequences` シート）で連番管理。

### 4.4 SupabaseRepository（将来実装）の対応
| IRepository | Supabase（postgrest / supabase-js） |
|---|---|
| `findById` | `select().eq('id',id).is('is_deleted',false).single()` |
| `findWhere` | `select().match(where).range()` |
| `insert/insertMany` | `insert([...])` |
| `update` | `update(patch).eq('id',id)` |
| `softDelete` | `update({is_deleted:true})` |
| `replaceAll` | `delete()` + `insert()`（または materialized view refresh） |
| `nextSequence` | DB シーケンス / `rpc('next_seq')` |

→ Service・Controller・CalcUtil・AggregationService は**一切変更不要**。

---

## 5. バリデーション仕様（Validator）

- Controller で payload を Validator に通し、不備は `VALIDATION_ERROR` で即返す。
- FK は Repository 参照で存在＆未削除を確認、なければ `FK_VIOLATION`。

| エンティティ | 主な検証（REQUIREMENTS.md §5 由来） |
|---|---|
| 工数 | 記録日/スタッフ/案件/作業項目/請求区分 必須。(start&end) または minutes のいずれか必須。end>start。minutes は正・最小単位の倍数・上限1440。 |
| 案件 | 案件名/顧客 必須。契約金額・見積工数 ≥0。納期=日付。status は enum。 |
| 顧客 | 顧客名 必須。email 形式。status enum。 |
| スタッフ | 氏名 必須。単価 ≥0（請求<原価は警告）。0<目標稼働率≤1。 |
| 案件種別 | 種別名 必須。標準工数/単価 ≥0。難易度 1〜5。 |
| 経費 | 発生日/スタッフ/案件/種別/金額/請求区分 必須。金額>0。 |
| 請求 | 顧客/案件/請求日/期間/status 必須。period_from ≤ period_to。金額 ≥0。 |

共通: enum 値は `Schema.gs` の許可リストと照合。日付/時刻の形式チェック。

---

## 6. 排他制御（LockService）

### 6.1 方針
- **全書き込み系アクション**（create/update/delete/bulk/calculate保存/採番/集計実行）は `LockService.getScriptLock()` を取得してから実行。
- 取得タイムアウト（既定 10 秒）超過は `LOCK_TIMEOUT` を返す（フロントはリトライ案内）。
- 採番（`nextSequence`）はロック内で実行し、連番重複を構造的に防ぐ。
- 集計バッチも同じスクリプトロックで直列化し、集計中の不整合読み取りを避ける（読み取り系はロック不要＝高速）。

### 6.2 ラッパ（util/Lock.gs）
```js
/** ロックを取得して fn を実行。確実に解放する。 */
function withLock(fn, timeoutMs) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(timeoutMs || 10000)) {
    throw new AppError('LOCK_TIMEOUT', '処理が混み合っています。少し待って再実行してください。');
  }
  try { return fn(); } finally { lock.releaseLock(); }
}
```

### 6.3 粒度の注意
- スクリプトロックは全体直列化のため、一括入力・集計など長処理は短く保つ（読み込みを事前に済ませ、ロック区間は書き込みのみ）。
- 将来 Supabase 移行時はDBトランザクション/行ロックに置換（`withLock` の中身のみ差し替え）。

---

## 7. 自動計算関数シグネチャ（CalcUtil = 計算の正本）

REQUIREMENTS.md §4 の式を関数化。すべて純粋関数（副作用なし・テスト容易）。

```js
// 工数単位
function calcHoursFromMinutes(minutes) {}                 // minutes/60
function calcMinutesFromTimes(start, end) {}              // 'HH:mm' 差を分で
function roundMinutes(minutes, unit) {}                   // 最小入力単位で丸め
function calcCostAmount(costRate, hours) {}               // 原価金額
function calcBillAmount(billRate, hours, billingType) {}  // 請求金額(請求対象のみ)

// 案件単位
function calcProgressRate(actualHours, estimatedHours) {}            // 消化率(0除算→null)
function calcTotalCost(laborCost, expenseCost) {}
function calcGrossProfit(contractAmount, totalCost) {}
function calcGrossMargin(grossProfit, contractAmount) {}             // 0除算→null
function judgeProgressAlert(progressRate, warnRate, overRate) {}     // 正常/警告/超過
function judgeMargin(grossMargin, goodRate, warnRate) {}             // 良好/通常/要注意(色)

// スタッフ単位
function calcUtilization(totalHours, standardHours) {}
function calcTargetAchievement(utilization, targetUtilization) {}
function judgeUtilizationColor(utilization, overRate, lowRate) {}    // 赤/無色/黄

// 請求
function calcInvoice(project, timeEntries, expenses, taxRate, contractRule) {} // §3.5の合算
function calcTax(subtotal, taxRate) {}
function buildInvoiceNumber(prefix, yyyymm, seq) {}                  // INV-YYYYMM-001

// 月次・顧客
function calcMoMRatio(current, previous) {}                          // 前月比
function judgeProfitability(grossMargin) {}                          // 高/中/低/赤字

// 見積精度
function calcVarianceRate(actualHours, estimatedHours) {}            // 乖離率
function judgeAccuracy(varianceRate) {}                              // 高/中/低
function buildEstimateSuggestion(varianceRate) {}                    // 改善提案文

// 稼働予測
function calcForecastUtilization(forecastHours, availableHours) {}
function judgeForecastAlert(forecastUtilization, overRate, lowRate) {} // 過負荷/適正/余裕
```

- 閾値（warnRate 等）は `system_settings` から注入し、ハードコードしない。
- 端数処理は `Math.round`（円・分は整数）で統一。率は小数のまま保持し表示側で % 整形。

---

## 8. バッチ集計関数仕様（AggregationService）

集計は**生データシートを読み取り→計算→集計シートを洗い替え/upsert**する。生データは変更しない。

### 8.1 案件別集計 `aggregateProjects(opts)`
- 対象: 既定=進行中案件（`opts.includeAll` で全件）。
- 処理: 案件ごとに工数（実績工数・人件費）＋経費（原価算入分）を合算 → 消化率・粗利益・アラート判定 → `agg_projects` へ書き込み。
- 出力: `agg_projects` 洗い替え（対象案件分は upsert）。

### 8.2 月次集計 `aggregateMonthly(yearMonth)`
- 対象: 指定月（設定画面の「月次集計」は既定で先月）。
- 処理: 当月の請求（売上）・工数原価・経費原価を集計 → 粗利・前月比・完了/新規件数・全体稼働率 → `agg_monthly` upsert（key=year_month）。

### 8.3 スタッフ別集計 `aggregateStaffMonthly(yearMonth)`
- 対象: 指定月（既定=先月）。全スタッフ。
- 処理: スタッフ×月で総稼働/請求対象時間/稼働率/達成度/担当案件数(主担当)/売上貢献 → `agg_staff_monthly` upsert（key=year_month+staff_id）。

### 8.4 見積精度分析 `analyzeEstimateAccuracy(opts)`
- 対象: 完了案件。
- 処理: 案件ごとに見積vs実績→乖離率・精度評価・改善提案。種別別平均乖離率も算出。→ `agg_estimate_accuracy` 洗い替え。

### 8.5 稼働予測 `forecastCapacity(yearMonth)`
- 対象: 今月/来月、全スタッフ。
- 処理: 月間稼働可能時間、確定案件の残見積（主担当へ計上＝単純モデル）、実績+残予測→予測稼働率→アラート。→ `agg_capacity_forecast` upsert（key=year_month+staff_id）。

### 8.6 集計タイミング（ハイブリッド方針 / 論点13）
| 契機 | 範囲 | 関数 |
|---|---|---|
| 工数/経費の保存・更新・削除時（即時） | 当該案件のみ | `aggregateProjects({projectIds:[id]})` |
| 請求保存/入金時（即時） | 当該月・当該顧客 | 月次/顧客集計の該当キーを upsert |
| 設定画面の手動ボタン | 全体/先月 | 各 `run*` |
| 定期トリガー（任意・将来） | 全体 | 夜間に全集計を洗い替え |

- 即時集計は対象を1案件/1キーに限定し短時間で完了させる（ロック区間を短く）。
- 全体集計は手動/夜間に回し、性能（年1万行超）を担保。

---

## 9. 中村レビュー確認事項（本書での確定/要確認）

| # | 論点 | 本書の方針 |
|---|---|---|
| 7 | 契約形態と基本報酬 | 固定/スポット=契約金額を基本報酬に、顧問/タイムチャージ=基本報酬0で工数のみ請求（`contractRule` で切替可・要承認） |
| 12 | アラートメール通知 | API に通知フックの口（`alert_email`設定）だけ用意。送信実装はMVP範囲外（将来 `MailApp`） |
| 13 | 集計タイミング | 即時（対象限定）＋手動/夜間バッチのハイブリッド（§8.6） |
| — | 楽観ロック | `updated_at` 照合の口を用意。MVPは任意（§2.6） |
| — | 認証 | MVPなし。`meta.actor` 自己申告。将来 Supabase Auth/トークンで Controller に認可層を追加 |

---

（以上 Step 3。中村のフィードバック確認後、Step 4: UI_DESIGN.md に進む。）
