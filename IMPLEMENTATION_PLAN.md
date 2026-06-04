# 実装計画書（HYPHEN版 案件別工数管理システム）

- **ドキュメント種別**: IMPLEMENTATION_PLAN.md（Step 5 / 全5点中の5点目）
- **前提**: REQUIREMENTS.md / SHEETS_SCHEMA.md / API_DESIGN.md / UI_DESIGN.md ／ 正本マニュアル `案件別工数管理.txt`
- **作成日**: 2026-06-04
- **ステータス**: ドラフト（中村レビュー待ち。OK後に実装着手）

---

## 0. 本書の目的
設計書4点（要件・シート・API・UI）を実装に落とすための、ファイル構成・開発順序・デプロイ手順・動作確認チェックリストを定義する。

---

## 1. 全体構成（リポジトリ）

```
hyphen-project-hours/
├─ 案件別工数管理.txt          … 元アプリ公式マニュアル（正本）
├─ REQUIREMENTS.md            … Step1
├─ SHEETS_SCHEMA.md           … Step2
├─ API_DESIGN.md              … Step3
├─ UI_DESIGN.md               … Step4
├─ IMPLEMENTATION_PLAN.md     … Step5（本書）
│
├─ gas/                       … Google Apps Script（clasp 管理）
│   ├─ appsscript.json        … マニフェスト（Webアプリ公開設定・タイムゾーン）
│   ├─ Main.gs                … doGet/doPost・ルーター・CORS・エンベロープ
│   ├─ config/
│   │   └─ Schema.gs          … シート名/ヘッダ/enum/設定キー（単一の真実）
│   ├─ repository/
│   │   ├─ IRepository.gs     … インターフェース契約（JSDoc）
│   │   ├─ SheetRepository.gs … SpreadsheetApp 実装（MVP）
│   │   └─ RepositoryFactory.gs … 実装切替（Sheet/Supabase）
│   ├─ service/
│   │   ├─ CalcUtil.gs        … 自動計算（正本・純粋関数）
│   │   ├─ MasterService.gs   … 顧客/スタッフ/種別/作業項目
│   │   ├─ ProjectService.gs
│   │   ├─ TimeEntryService.gs
│   │   ├─ ExpenseService.gs
│   │   ├─ InvoiceService.gs
│   │   ├─ AggregationService.gs … 集計バッチ
│   │   └─ SettingService.gs
│   ├─ util/
│   │   ├─ IdGenerator.gs     … 採番（ロック下）
│   │   ├─ Lock.gs            … withLock ラッパ
│   │   ├─ Validator.gs       … 入力検証
│   │   ├─ Response.gs        … エンベロープ生成
│   │   └─ AppError.gs        … エラー型・コード
│   ├─ setup/
│   │   └─ Setup.gs           … 初回シート作成＋初期データ投入（手動実行）
│   └─ tests/
│       └─ Tests.gs           … CalcUtil 等の簡易テスト（GASエディタ実行）
│
├─ frontend/                  … 静的SPA（Netlify）
│   ├─ index.html
│   ├─ css/ (tokens/base/components/layout.css)
│   ├─ js/  (config/api/router/store + components/ + pages/ + utils/)
│   └─ assets/ (logo.svg)
│
├─ netlify.toml               … Netlify 設定（publish=frontend）
├─ .clasp.json                … clasp 設定（scriptId）※ gitignore 推奨
├─ .gitignore
└─ README.md                  … セットアップ手順サマリ
```

> gas/ は clasp（CLI）でローカル管理し、`clasp push` で反映。clasp 未使用の場合は GAS エディタへ手動コピー（README に両手順を記載）。

---

## 2. 開発順序（推奨）

中村ご指定の順序「マスタ → 案件 → 工数 → ダッシュボード → 経費・請求 → レポート → 分析」を骨子に、**基盤（足場）を先に作る**フェーズ0を加える。各フェーズは「GAS→疎通→フロント」を縦切りで完成させ、常に動く状態を保つ。

### フェーズ0: 基盤・足場（最優先）
1. **GAS スケルトン**: `Main.gs`（ルーター・エンベロープ・CORS）／`Response.gs`／`AppError.gs`／`Lock.gs`／`Schema.gs`。
2. **Repository**: `IRepository.gs`（契約）＋`SheetRepository.gs`（汎用 CRUD）＋`RepositoryFactory.gs`。
3. **Setup.gs**: 全16シート自動生成＋ヘッダ＋初期データ（SHEETS_SCHEMA §7）投入。`_sequences` 採番初期化。
4. **CalcUtil.gs** ＋ `Tests.gs`（計算式を先にテスト可能に）。
5. **`ping`/`bootstrap`** 実装 → デプロイ → フロント `api.js`/`store.js`/`router.js`/レイアウト（サイドバー・ヘッダ）で疎通確認。
- **完了条件**: 空アプリがデプロイされ、サイドバー表示＋`bootstrap` 取得成功。

### フェーズ1: マスタ（顧客・スタッフ・案件種別・作業項目）
- GAS: `MasterService`（4エンティティの CRUD）。
- フロント: `customers/staff/projectTypes` ページ＋設定内 作業項目 CRUD、共通テーブル/モーダル/フォーム部品を確立（以降流用）。
- **完了条件**: 4マスタの登録・編集・論理削除が UI から可能。

### フェーズ2: 案件管理
- GAS: `ProjectService`（CRUD・ステータスフィルタ・種別から初期値提案）。
- フロント: `projects` ページ＋モーダル。消化率列は暫定（工数未実装のため0）。
- **完了条件**: 案件 CRUD・ステータス絞り込み可能。

### フェーズ3: 工数入力（個別→一括→タイマー→履歴）
- GAS: `TimeEntryService`（`createTimeEntry`/`bulk`/`saveTimer`/`list`/`update`/`delete`）。CalcUtil 連携・単価スナップ・採番・即時案件集計。
- フロント: 4タブ。タイマーの localStorage 状態管理（`utils/timer.js`）。
- **完了条件**: 工数入力→案件の実績工数・消化率が反映。タイマー保存が丸め込み込みで動作。

### フェーズ4: ダッシュボード ＋ 案件別集計
- GAS: `AggregationService.aggregateProjects` ＋ `getDashboard`。
- フロント: KPIカード・アラート一覧・Chart.js 初導入（6ヶ月サマリーは月次集計後に値が入る）。
- **完了条件**: 進行中件数・今月稼働・アラート一覧が表示。

### フェーズ5: 経費・請求
- GAS: `ExpenseService`（CRUD・承認）／`InvoiceService`（`calculateInvoice`/`createInvoice`/採番/`recordPayment`）。
- フロント: `expenses`／`invoices`（自動計算モーダル・入金登録）。
- **完了条件**: 経費登録→請求自動計算（基本報酬＋タイムチャージ＋実費＋消費税）→保存→入金でステータス遷移。

### フェーズ6: レポート（案件別・スタッフ別・月次・顧客別）
- GAS: `aggregateMonthly`/`aggregateStaffMonthly`/顧客集計 ＋ 各 `report*`。
- フロント: 4レポート画面＋グラフ。月選択。
- **完了条件**: 4レポートが集計シート値で表示・色分け・グラフ描画。

### フェーズ7: 分析（見積精度・稼働予測）
- GAS: `analyzeEstimateAccuracy`／`forecastCapacity` ＋ `report`/`analyze` 系。
- フロント: `estimate`／`forecast` 画面＋グラフ。
- **完了条件**: 完了案件の乖離率・種別別傾向、今月/来月の予測稼働が表示。

### フェーズ8: 設定・仕上げ
- GAS: `SettingService`（get/update）＋ `run*` 手動集計ボタンの結線。
- フロント: 設定画面（手動集計・システム設定・作業項目・ブランド設定）。
- 仕上げ: 全画面レスポンシブ確認、空状態/エラー/トースト、HYPHEN ブランド差し替え点の最終確認、コメント整備。
- **完了条件**: 動作確認チェックリスト（§5）を全通過。

> 各フェーズ末に「縦切りで動く」状態を維持。Repository を必ず経由していること、直接 `SpreadsheetApp` 呼び出しが Service/Controller に無いことをフェーズごとにレビュー。

---

## 3. 実装の重要規約（再掲・遵守事項）

1. **直接 `SpreadsheetApp` を呼ぶのは `SheetRepository.gs` のみ**。Service/Controller/Calc は禁止（レビュー必須項目）。
2. **計算は CalcUtil（純粋関数）に集約**。各 Service はそれを呼ぶだけ。閾値・税率は `system_settings` から注入。
3. **採番・書き込みは `withLock` 内**。読み取りはロックなし。
4. **集計シートは洗い替え/upsert のみ**。生データは集計で更新しない。
5. **ID 命名規則厳守**（PJT-/STF-/CUS-/KND-/WRK-/KOSU-/KEIHI-/INV-YYYYMM-）。
6. **コメント多め・日本語**。各関数に JSDoc（引数/戻り値/例外）。
7. **エラーは AppError＋エンベロープ**で返す。日本語メッセージ。
8. **物理名キーで JSON 授受**（Supabase 互換）。

---

## 4. デプロイ手順

### 4.1 事前準備
- Google アカウント、対象の Google スプレッドシート1つを作成（または Setup が新規作成）。
- （任意）Node.js ＋ `npm i -g @google/clasp`、`clasp login`。

### 4.2 GAS（バックエンド）
**A. clasp 利用の場合**
1. `cd gas && clasp create --type webapp --title "案件別工数管理(HYPHEN)"`（または既存 scriptId を `.clasp.json` に設定）。
2. スプレッドシートIDを Script Properties に設定: `SPREADSHEET_ID`（`appsscript.json`/コードで参照）。
3. `clasp push` でアップロード。
4. GAS エディタで `Setup.setup()` を**手動実行**（初回のみ・権限承認）→ 16シート＋初期データ生成。
5. 「デプロイ」→「新しいデプロイ」→種類=ウェブアプリ。
   - 実行ユーザー: **自分**。
   - アクセスできるユーザー: **全員（匿名含む）**（MVP・認証なし）。
6. 発行された `/exec` URL を控える（フロントの `API_BASE_URL`）。

**B. 手動コピーの場合**: GAS エディタに各 `.gs` を作成して貼り付け→4以降同じ。

> 再デプロイ時は「デプロイを管理」→既存デプロイの版を更新（URL を固定維持）。

### 4.3 フロントエンド（Netlify）
1. `frontend/js/config.js` の `API_BASE_URL` に GAS の `/exec` URL を設定。
2. `netlify.toml`:
   ```toml
   [build]
     publish = "frontend"
     command = ""    # ビルド不要（静的）
   ```
3. Netlify にリポジトリを接続（または `frontend/` をドラッグ&ドロップ）→ デプロイ。
4. 公開 URL でアクセス確認。

### 4.4 CORS / 通信
- フロントは `fetch(API_BASE_URL + '?action=...')`、POST は `Content-Type: text/plain` で JSON 文字列送信（プリフライト回避）。
- GAS 側は JSON（`ContentService`）を返す。エラーも 200＋`ok:false`。

### 4.5 設定値
- デプロイ後、設定画面 or `system_settings` シートで 消費税率・最小入力単位・閾値・請求プレフィックス・通知先メールを確認/調整。

---

## 5. 動作確認チェックリスト

### 5.1 基盤
- [ ] `ping` が `ok:true` を返す。
- [ ] `Setup.setup()` で16シート＋初期データが生成される。
- [ ] `bootstrap` でマスタ・設定が取得でき、セレクトに反映。
- [ ] Service/Controller に直接 `SpreadsheetApp` 呼び出しが無い（grep 確認）。

### 5.2 マスタ
- [ ] 顧客/スタッフ/案件種別/作業項目の 登録・編集・論理削除。
- [ ] 必須/形式バリデーション（顧客名・email 等）が日本語エラーで返る。
- [ ] 論理削除済みが一覧から除外される。

### 5.3 案件
- [ ] 案件の CRUD、ステータス絞り込み（既定=進行中）。
- [ ] 種別選択で標準工数/単価が初期提案される。

### 5.4 工数
- [ ] 個別入力で原価/請求金額が単価×時間で自動計算・保存。
- [ ] 時刻入力↔分入力の連動、最小入力単位の丸め。
- [ ] 一括入力でエラー行表示＋全体ロールバック。
- [ ] タイマー: 開始/一時停止/停止保存、リロード後の状態復元。
- [ ] 履歴の絞り込み・編集・削除、合計再計算。
- [ ] 工数保存後に案件の実績工数・消化率が更新（即時集計）。

### 5.5 ダッシュボード
- [ ] 進行中/全案件数・今月稼働・アラート一覧・6ヶ月グラフ表示。
- [ ] 消化率80%🟡/100%🔴 の色分け。

### 5.6 経費・請求
- [ ] 経費 CRUD・承認/却下。
- [ ] 請求「自動計算」: 基本報酬（契約形態別）＋タイムチャージ＋実費＋消費税＋合計。
- [ ] 請求番号 `INV-YYYYMM-連番` が月内連番で採番。
- [ ] 入金登録でステータス（入金済/一部入金/遅延）自動判定。

### 5.7 レポート
- [ ] 案件別: 粗利率色分け（≥50%🟢/<30%🔴）、消化率バー。
- [ ] スタッフ別: 月選択、稼働率色分け（≥100%🔴/<70%🟡）。
- [ ] 月次: 前月比・推移グラフ。
- [ ] 顧客別: 収益性評価（高/中/低/赤字）。

### 5.8 分析
- [ ] 見積精度: 乖離率・精度評価・改善提案・種別別平均。
- [ ] 稼働予測: 今月/来月、予測稼働率・空き時間・アラート。

### 5.9 設定・共通
- [ ] 手動集計5ボタンが実行され更新件数/集計日時が表示。
- [ ] システム設定の変更が計算（税率・閾値・最小単位）に反映。
- [ ] 複数タブ/ユーザー同時書き込みで採番重複なし（LockService）。
- [ ] レスポンシブ（PC/タブレット/スマホ、`≡` 開閉）。
- [ ] 色の意味統一（赤/黄/緑）が全画面で一貫。
- [ ] エラー/空状態/トーストが日本語で表示。

### 5.10 移行容易性（設計検証）
- [ ] `RepositoryFactory` の切替で Service 以上が無改修。
- [ ] 物理名キーの JSON 入出力が Supabase スキーマ（SHEETS_SCHEMA §8）と一致。

---

## 6. リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| 工数 年1万行超でスプシ集計が遅延 | レポート遅延 | 集計シート参照＋即時は対象限定。夜間バッチ。最終的に Supabase 移行（窓口完備済） |
| 同時書き込み競合・採番重複 | データ不整合 | `withLock`＋採番ロック内。楽観ロック口を用意 |
| GAS 実行時間制限（6分） | 大規模集計の失敗 | 集計を月/対象単位に分割。手動/夜間に実行 |
| GAS の CORS/HTTPステータス制約 | フロント連携不具合 | text/plain送信＋200固定＋`ok`判定で統一 |
| `.clasp.json`/scriptId の漏洩 | 不正アクセス | gitignore。公開範囲は必要に応じ見直し |
| ブランド未確定 | 手戻り | CSS変数・config 集中管理で後差し替え |

---

## 7. 完了の定義（Definition of Done）
- 設計書5点と実装が整合し、§5 チェックリスト全通過。
- 元アプリ全15画面の機能を再現（マニュアル準拠）。
- 直接 `SpreadsheetApp` 呼び出しが Repository 以外に無い。
- 日本語UI/エラー、コメント整備済み、README にセットアップ手順。
- HYPHEN ブランド差し替え点が文書化（UI_DESIGN §8）。

---

## 8. 中村レビュー確認事項
| 項目 | 提案 | 要確認 |
|---|---|---|
| clasp 採用 | 推奨（手動コピー手順も併記） | ローカル環境で clasp 使用可否 |
| デプロイ公開範囲 | 全員（匿名）＝認証なしMVP | 社外公開サンプルとしての可否 |
| スプレッドシート | Setup で新規 or 既存指定 | 使用するシートの方針 |
| 開発フェーズ粒度 | フェーズ0〜8（縦切り） | 優先度・省略可否 |
| サンプルデータ量 | 各3〜5行＋デモ用に工数を厚め | デモ見栄えのための増量要否 |

---

（以上 Step 5。これで設計書5点が揃いました。中村のレビュー・フィードバックをお願いします。OK が出れば Step 6 = 実装フェーズ0 から着手します。）
