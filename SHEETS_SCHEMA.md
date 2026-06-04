# スプレッドシート設計書（HYPHEN版 案件別工数管理システム）

- **ドキュメント種別**: SHEETS_SCHEMA.md（Step 2 / 全5点中の2点目）
- **前提**: REQUIREMENTS.md（Step 1）／ 正本マニュアル `案件別工数管理.txt`
- **作成日**: 2026-06-04
- **ステータス**: ドラフト（中村レビュー待ち）

---

## 0. 設計方針

1. **正規化**: 後で PostgreSQL の正規化テーブルへそのままマッピングできる構造とする。マスタとトランザクションを分離し、外部キー（FK）で関係を表現する。
2. **生データと集計の分離**: 生データシート（マスタ・トランザクション）は集計処理で**絶対に更新しない**。粗利益・消化率・稼働率などの派生値は「集計シート（agg_）」へビュー的に別保存する。
3. **ID は文字列主キー**: REQUIREMENTS.md §3.1 の命名規則（PJT- / STF- / CUS- / KND- / KOSU- / KEIHI- / WRK- / INV-）を主キーとして使用。Supabase でも `text` 主キーとしてそのまま使える。
4. **論理削除**: 全シートに `削除フラグ(is_deleted)` を持たせ、物理削除は行わない（集計整合のため）。
5. **監査列**: 全シートに `作成日時 / 作成者 / 更新日時 / 更新者` を持たせる（Supabase の `created_at / updated_at` に対応）。
6. **単価スナップショット**: 工数レコードに登録時点のスタッフ単価を保存し、後の単価改定で過去金額が変動しないようにする（REQUIREMENTS.md §4.1）。
7. **DataRepository 経由**: シートの列順・ヘッダ名に依存しないよう、Repository 層は1行目のヘッダ名で列を解決する（列追加に強い構造）。

### 0.1 列の物理名（Supabase カラム名）規約
- snake_case・英小文字。
- 各シートの1行目に**日本語ヘッダ**、2行目以降がデータ。物理名は本設計書の対応表で管理し、Repository 層が日本語ヘッダ→物理名のマッピングを保持する。
  - （別案: 1行目=物理名、2行目=日本語ラベル の2行ヘッダも可。MVP は「日本語ヘッダ1行 + 本書の対応表」で運用。）

### 0.2 型表記
`text` / `int`（整数円・分・件数）/ `num`（小数: 率・時間）/ `date`（YYYY-MM-DD）/ `time`（HH:mm）/ `datetime`（ISO8601）/ `bool` / `enum`（選択肢）。

---

## 1. シート一覧（全16シート）

| # | 分類 | シート名（日本語） | 物理テーブル名 | ID接頭辞 | 役割 |
|---|---|---|---|---|---|
| 1 | マスタ | 顧客マスタ | `m_customers` | CUS- | 取引先 |
| 2 | マスタ | スタッフマスタ | `m_staff` | STF- | 自社メンバー・単価 |
| 3 | マスタ | 案件種別マスタ | `m_project_types` | KND- | 案件テンプレート |
| 4 | マスタ | 作業項目マスタ | `m_work_items` | WRK- | 工数の作業種類 |
| 5 | マスタ | 案件マスタ | `projects` | PJT- | 案件（仕事） |
| 6 | トランザクション | 工数 | `time_entries` | KOSU- | 作業時間記録 |
| 7 | トランザクション | 経費 | `expenses` | KEIHI- | 案件関連経費 |
| 8 | トランザクション | 請求書 | `invoices` | INV- | 請求ヘッダ |
| 9 | トランザクション | 請求明細 | `invoice_items` | INVL- | 請求内訳行 |
| 10 | 集計 | 案件集計 | `agg_projects` | （PJT参照） | 案件別収益・消化率 |
| 11 | 集計 | スタッフ集計（月別） | `agg_staff_monthly` | （STF参照） | 月別稼働 |
| 12 | 集計 | 月次サマリー | `agg_monthly` | （YYYYMM） | 経営数値推移 |
| 13 | 集計 | 顧客集計（月別） | `agg_customer_monthly` | （CUS参照） | 顧客別収益 |
| 14 | 集計 | 見積精度 | `agg_estimate_accuracy` | （PJT参照） | 見積vs実績 |
| 15 | 集計 | 稼働予測 | `agg_capacity_forecast` | （STF参照） | 月別予測稼働 |
| 16 | 設定 | システム設定 | `system_settings` | （key） | システム設定値 |

> マニュアルの推定（10〜15シート）に対し、正規化（作業項目マスタ・請求明細の分離）と集計分離により16シート構成とした。集計6シートは派生データであり、SQL ではマテリアライズドビュー or 集計テーブルに対応する。

### 1.1 全シート共通の監査列（末尾に付与）
| 日本語ヘッダ | 物理名 | 型 | 説明 |
|---|---|---|---|
| 削除フラグ | `is_deleted` | bool | 論理削除（既定 FALSE） |
| 作成日時 | `created_at` | datetime | レコード作成時刻 |
| 作成者 | `created_by` | text | 作成スタッフID/メール |
| 更新日時 | `updated_at` | datetime | 最終更新時刻 |
| 更新者 | `updated_by` | text | 最終更新スタッフID/メール |

（以降の各シートの列定義では監査列を省略。全シートに上記5列が末尾に付くものとする。）

---

## 2. マスタシート定義

### 2-1. 顧客マスタ `m_customers`
| 日本語ヘッダ | 物理名 | 型 | 必須 | 説明 / 選択肢 |
|---|---|---|---|---|
| 顧客ID | `customer_id` | text(PK) | ○ | CUS-001 形式 |
| 顧客名 | `name` | text | ○ | |
| カナ | `name_kana` | text | | 並べ替え用 |
| 区分 | `entity_type` | enum | | 法人 / 個人 |
| 業種 | `industry` | text | | |
| 代表者名 | `representative` | text | | |
| 担当者名 | `contact_person` | text | | |
| 電話番号 | `phone` | text | | |
| メールアドレス | `email` | text | | 形式チェック |
| 住所 | `address` | text | | |
| 顧客ランク | `rank` | enum | | A / B / C |
| 支払条件 | `payment_terms` | enum | | 翌月末 / 翌々月末 など |
| 請求締日 | `closing_day` | enum | | 末日 / 15 / 20 / 25 |
| ステータス | `status` | enum | ○ | 取引中 / 休止 / 解約 |

### 2-2. スタッフマスタ `m_staff`
| 日本語ヘッダ | 物理名 | 型 | 必須 | 説明 / 選択肢 |
|---|---|---|---|---|
| スタッフID | `staff_id` | text(PK) | ○ | STF-001 |
| 氏名 | `name` | text | ○ | |
| 役職 | `role` | enum | | 代表 / パートナー / マネージャー / スタッフ / アシスタント |
| 職種 | `job_type` | text | | 税理士 / 公認会計士 / エンジニア など |
| 原価単価 | `cost_rate` | int | | 標準時給単価（円/時） |
| 請求単価 | `bill_rate` | int | | 標準請求単価（円/時） |
| 月間標準稼働時間 | `standard_hours` | num | | 既定 160 |
| 稼働率目標 | `target_utilization` | num | | 既定 0.80 |
| メールアドレス | `email` | text | | 通知・作成者識別用 |
| ステータス | `status` | enum | ○ | 在籍 / 休職 / 退職（既定 在籍） |

### 2-3. 案件種別マスタ `m_project_types`
| 日本語ヘッダ | 物理名 | 型 | 必須 | 説明 |
|---|---|---|---|---|
| 種別ID | `type_id` | text(PK) | ○ | KND-001 |
| 種別名 | `name` | text | ○ | 法人決算申告 など |
| カテゴリ大 | `category` | text | | 税務 / 法務 / コンサル |
| 標準工数 | `standard_hours` | num | | 時間 |
| 標準単価 | `standard_price` | int | | 標準請求額（円） |
| 難易度 | `difficulty` | int | | 1〜5 |

### 2-4. 作業項目マスタ `m_work_items`
> マニュアル「作業項目」の選択肢を正規化（論点1: マスタ化を採用）。
| 日本語ヘッダ | 物理名 | 型 | 必須 | 説明 |
|---|---|---|---|---|
| 作業項目ID | `work_item_id` | text(PK) | ○ | WRK-001 |
| 作業項目名 | `name` | text | ○ | 資料作成 / 打合せ / 申告書作成 など |
| カテゴリ | `category` | text | | 任意の分類 |
| 既定請求区分 | `default_billing_type` | enum | | 請求対象 / 内部 / サービス（入力初期値の提案用） |
| 表示順 | `sort_order` | int | | |

### 2-5. 案件マスタ `projects`
| 日本語ヘッダ | 物理名 | 型 | 必須 | 説明 / 選択肢 |
|---|---|---|---|---|
| 案件ID | `project_id` | text(PK) | ○ | PJT-001 |
| 案件名 | `name` | text | ○ | |
| 顧客ID | `customer_id` | text(FK) | ○ | → m_customers |
| 種別ID | `type_id` | text(FK) | | → m_project_types |
| 契約形態 | `contract_type` | enum | | スポット / 顧問 / タイムチャージ / 固定 |
| 主担当ID | `owner_staff_id` | text(FK) | | → m_staff |
| 契約金額 | `contract_amount` | int | | 円 |
| 見積工数 | `estimated_hours` | num | | 時間 |
| 開始日 | `start_date` | date | | 【推定】受注日/着手日 |
| 納期 | `due_date` | date | | 完了予定日 |
| ステータス | `status` | enum | ○ | 見積中 / 進行中 / 完了 / 請求済 / 入金済 / 中止 |
| 完了日 | `completed_at` | date | | ステータス=完了 になった日（月次集計用） |
| 備考 | `note` | text | | |

---

## 3. トランザクションシート定義

### 3-1. 工数 `time_entries`
> 単価スナップショット（論点2採用）。原価金額・請求金額は登録時に計算保存し、集計を高速化する。
| 日本語ヘッダ | 物理名 | 型 | 必須 | 説明 |
|---|---|---|---|---|
| 工数ID | `time_entry_id` | text(PK) | ○ | KOSU-001 |
| 記録日 | `work_date` | date | ○ | |
| スタッフID | `staff_id` | text(FK) | ○ | → m_staff |
| 案件ID | `project_id` | text(FK) | ○ | → projects |
| 作業項目ID | `work_item_id` | text(FK) | ○ | → m_work_items |
| 開始時刻 | `start_time` | time | | 時刻入力時 |
| 終了時刻 | `end_time` | time | | 時刻入力時 |
| 作業時間（分） | `minutes` | int | ○ | 生データの基準値 |
| 作業時間（時間） | `hours` | num | ○ | minutes ÷ 60（保存） |
| 請求区分 | `billing_type` | enum | ○ | 請求対象 / 内部 / サービス |
| 原価単価（スナップ） | `cost_rate_snapshot` | int | ○ | 登録時の staff.cost_rate |
| 請求単価（スナップ） | `bill_rate_snapshot` | int | ○ | 登録時の staff.bill_rate |
| 原価金額 | `cost_amount` | int | ○ | cost_rate_snapshot × hours |
| 請求金額 | `bill_amount` | int | ○ | bill_rate_snapshot × hours（請求対象のみ集計算入） |
| 入力方法 | `input_method` | enum | | 個別 / 一括 / タイマー |
| 作業内容 | `description` | text | | メモ |

### 3-2. 経費 `expenses`
| 日本語ヘッダ | 物理名 | 型 | 必須 | 説明 |
|---|---|---|---|---|
| 経費ID | `expense_id` | text(PK) | ○ | KEIHI-001 |
| 発生日 | `expense_date` | date | ○ | |
| スタッフID | `staff_id` | text(FK) | ○ | → m_staff |
| 案件ID | `project_id` | text(FK) | ○ | → projects |
| 経費種別 | `expense_type` | enum | ○ | 交通費 / 宿泊費 / 印紙代 / 登録免許税 / 外注費 / 通信費 / 消耗品費 / その他 |
| 金額 | `amount` | int | ○ | 円 |
| 請求区分 | `billing_type` | enum | ○ | 実費請求 / 含む / 自社負担 |
| 内容 | `description` | text | | |
| 領収書 | `has_receipt` | bool | | 有 / 無 |
| 承認状態 | `approval_status` | enum | ○ | 申請中 / 承認 / 却下（既定 申請中） |

> 原価算入（論点3採用）: `含む`・`自社負担` を案件原価へ算入。請求書算入は `実費請求` かつ `承認`。

### 3-3. 請求書 `invoices`（ヘッダ）
| 日本語ヘッダ | 物理名 | 型 | 必須 | 説明 |
|---|---|---|---|---|
| 請求ID | `invoice_id` | text(PK) | ○ | INV-202602-001 |
| 顧客ID | `customer_id` | text(FK) | ○ | → m_customers |
| 案件ID | `project_id` | text(FK) | ○ | → projects（論点6: 1請求=1案件） |
| 請求日 | `invoice_date` | date | ○ | 請求番号 YYYYMM の基準 |
| 請求期間FROM | `period_from` | date | ○ | 自動計算範囲 |
| 請求期間TO | `period_to` | date | ○ | |
| 基本報酬 | `base_fee` | int | | 4.7 |
| タイムチャージ金額 | `time_charge` | int | | 請求対象工数の合計 |
| 実費金額 | `expense_amount` | int | | 承認済み実費請求の合計 |
| 小計 | `subtotal` | int | | base_fee + time_charge + expense_amount |
| 消費税率 | `tax_rate` | num | | 計算時の設定値（スナップ） |
| 消費税 | `tax` | int | | subtotal × tax_rate |
| 合計請求額 | `total` | int | | subtotal + tax |
| 入金額 | `paid_amount` | int | | 一部入金対応 |
| 支払期限 | `due_date` | date | | 顧客支払条件から提案 |
| ステータス | `status` | enum | ○ | 下書き / 発行済 / 入金済 / 一部入金 / 遅延 |

### 3-4. 請求明細 `invoice_items`（内訳行）
> 将来の複数案件まとめ請求・内訳保存に備え分離（論点6）。MVP では自動計算結果を行展開して保存。
| 日本語ヘッダ | 物理名 | 型 | 必須 | 説明 |
|---|---|---|---|---|
| 明細ID | `invoice_item_id` | text(PK) | ○ | INVL-001 |
| 請求ID | `invoice_id` | text(FK) | ○ | → invoices |
| 明細種別 | `item_type` | enum | ○ | 基本報酬 / タイムチャージ / 実費 |
| 内容 | `description` | text | | |
| 数量 | `quantity` | num | | 時間数・件数 |
| 単価 | `unit_price` | int | | |
| 金額 | `amount` | int | ○ | |
| 参照工数ID/経費ID | `source_ref` | text | | 集計元のトレース用（任意） |

---

## 4. 集計シート定義（派生データ・生データは更新しない）

集計シートは各バッチ集計関数が再生成する（全行洗い替え or キー単位 upsert）。`集計日時` を持ち最終更新を明示する。

### 4-1. 案件集計 `agg_projects`（→ 案件別レポート / ダッシュボード / 見積精度）
| 日本語ヘッダ | 物理名 | 型 | 説明 |
|---|---|---|---|
| 案件ID | `project_id` | text | → projects |
| 案件名 | `project_name` | text | スナップ |
| 顧客名 | `customer_name` | text | スナップ |
| 契約金額 | `contract_amount` | int | |
| 見積工数 | `estimated_hours` | num | |
| 実績工数 | `actual_hours` | num | Σ time_entries.hours |
| 工数消化率 | `progress_rate` | num | actual ÷ estimated |
| 総人件費 | `labor_cost` | int | Σ cost_amount |
| 経費原価 | `expense_cost` | int | 含む+自社負担 の合計 |
| 総原価 | `total_cost` | int | labor_cost + expense_cost |
| 粗利益 | `gross_profit` | int | contract_amount − total_cost |
| 粗利益率 | `gross_margin` | num | gross_profit ÷ contract_amount |
| アラート | `alert` | enum | 正常 / 警告 / 超過 |
| 集計日時 | `aggregated_at` | datetime | |

### 4-2. スタッフ集計（月別）`agg_staff_monthly`（→ スタッフ別レポート）
| 日本語ヘッダ | 物理名 | 型 | 説明 |
|---|---|---|---|
| 対象月 | `year_month` | text | YYYY-MM |
| スタッフID | `staff_id` | text | |
| 氏名 | `staff_name` | text | スナップ |
| 役職 | `role` | text | スナップ |
| 総稼働時間 | `total_hours` | num | |
| 請求対象時間 | `billable_hours` | num | |
| 稼働率 | `utilization` | num | total ÷ standard_hours |
| 稼働率達成度 | `target_achievement` | num | utilization ÷ target |
| 担当案件数 | `project_count` | int | 主担当基準（論点8） |
| 売上貢献額 | `revenue_contribution` | int | Σ bill_amount |
| 集計日時 | `aggregated_at` | datetime | |

### 4-3. 月次サマリー `agg_monthly`（→ 月次レポート / ダッシュボード）
| 日本語ヘッダ | 物理名 | 型 | 説明 |
|---|---|---|---|
| 対象月 | `year_month` | text | YYYY-MM |
| 売上合計 | `revenue` | int | 請求ベース（論点5） |
| 前月比 | `mom_ratio` | num | 当月 ÷ 前月 − 1 |
| 総原価 | `total_cost` | int | 人件費 + 経費原価 |
| 粗利益 | `gross_profit` | int | |
| 粗利益率 | `gross_margin` | num | |
| 完了案件数 | `completed_count` | int | 当月 completed_at |
| 新規受注数 | `new_count` | int | 当月 start_date/作成 |
| 全体稼働率 | `overall_utilization` | num | Σ稼働 ÷ Σ標準 |
| 集計日時 | `aggregated_at` | datetime | |

### 4-4. 顧客集計（月別）`agg_customer_monthly`（→ 顧客別レポート）
| 日本語ヘッダ | 物理名 | 型 | 説明 |
|---|---|---|---|
| 対象月 | `year_month` | text | YYYY-MM |
| 顧客ID | `customer_id` | text | |
| 顧客名 | `customer_name` | text | スナップ |
| 顧客ランク | `rank` | text | スナップ |
| 案件数 | `project_count` | int | |
| 売上合計 | `revenue` | int | |
| 工数合計 | `total_hours` | num | |
| 粗利益 | `gross_profit` | int | |
| 粗利益率 | `gross_margin` | num | |
| 収益性評価 | `profitability` | enum | 高 / 中 / 低 / 赤字 |
| 集計日時 | `aggregated_at` | datetime | |

### 4-5. 見積精度 `agg_estimate_accuracy`（→ 見積精度分析）
| 日本語ヘッダ | 物理名 | 型 | 説明 |
|---|---|---|---|
| 案件ID | `project_id` | text | 完了案件のみ |
| 案件名 | `project_name` | text | スナップ |
| 種別ID | `type_id` | text | |
| 種別名 | `type_name` | text | スナップ |
| 見積工数 | `estimated_hours` | num | |
| 実績工数 | `actual_hours` | num | |
| 乖離率 | `variance_rate` | num | (実績−見積)÷見積 |
| 精度評価 | `accuracy` | enum | 高 / 中 / 低 |
| 改善提案 | `suggestion` | text | 自動生成文 |
| 集計日時 | `aggregated_at` | datetime | |

### 4-6. 稼働予測 `agg_capacity_forecast`（→ 稼働予測）
| 日本語ヘッダ | 物理名 | 型 | 説明 |
|---|---|---|---|
| 対象月 | `year_month` | text | 今月 / 来月 |
| スタッフID | `staff_id` | text | |
| 氏名 | `staff_name` | text | スナップ |
| 月間稼働可能時間 | `available_hours` | num | standard_hours |
| 確定案件工数 | `committed_hours` | num | 確定案件の残見積（論点9: 単純モデル） |
| 予測稼働時間 | `forecast_hours` | num | 実績 + 残予測 |
| 予測稼働率 | `forecast_utilization` | num | forecast ÷ available |
| 空き時間 | `free_hours` | num | available − forecast |
| アラート | `alert` | enum | 過負荷 / 適正 / 余裕 |
| 集計日時 | `aggregated_at` | datetime | |

---

## 5. 設定シート定義

### 5-1. システム設定 `system_settings`（key-value 形式）
| 日本語ヘッダ | 物理名 | 型 | 説明 |
|---|---|---|---|
| 設定キー | `key` | text(PK) | |
| 設定値 | `value` | text | |
| 説明 | `description` | text | |

初期キー:
| key | value | description |
|---|---|---|
| `tax_rate` | 0.10 | 消費税率 |
| `min_input_minutes` | 15 | 工数最小入力単位（分） |
| `alert_warn_rate` | 0.80 | 消化率 警告閾値 |
| `alert_over_rate` | 1.00 | 消化率 超過閾値 |
| `util_over_rate` | 1.00 | 稼働率 過負荷閾値 |
| `util_low_rate` | 0.70 | 稼働率 余裕閾値 |
| `margin_good_rate` | 0.50 | 粗利益率 良好閾値（緑） |
| `margin_warn_rate` | 0.30 | 粗利益率 要注意閾値（赤） |
| `invoice_prefix` | INV | 請求番号プレフィックス |
| `alert_email` | （空） | 予算超過通知先メール |

---

## 6. リレーション図（ER 概念）

```
m_customers (CUS) 1 ──< projects (PJT) >── 1 m_project_types (KND)
                                  │  ^
                                  │  └─ owner_staff_id ─ m_staff (STF)
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                          │
        v                         v                          v
 time_entries (KOSU)        expenses (KEIHI)           invoices (INV) 1 ──< invoice_items (INVL)
   │        │                   │                          │
   └ staff  └ work_item (WRK)   └ staff                    └ customer

多対多（実績ベース）: projects N ──< time_entries >── N m_staff
```

主なカーディナリティ:
- 顧客 1 — N 案件
- 案件種別 1 — N 案件
- スタッフ 1 — N 工数 / N 経費 / N 案件（主担当）
- 案件 1 — N 工数 / N 経費 / N 請求書
- 請求書 1 — N 請求明細
- 案件 N — N スタッフ（time_entries が中間テーブル）

集計シートはいずれも生データシートから導出される（FK は参照のみ・更新なし）。

---

## 7. 初期データ例（サンプル投入用）

> サンプル/デモ用。実際の値は実装時に整える。日付は 2026 年想定。

### 7-1. 顧客マスタ
| 顧客ID | 顧客名 | カナ | 区分 | 業種 | 顧客ランク | 支払条件 | 請求締日 | ステータス |
|---|---|---|---|---|---|---|---|---|
| CUS-001 | 株式会社山田製作所 | ヤマダセイサクショ | 法人 | 製造業 | A | 翌月末 | 末日 | 取引中 |
| CUS-002 | 鈴木商事株式会社 | スズキショウジ | 法人 | 卸売 | B | 翌々月末 | 20日 | 取引中 |
| CUS-003 | 田中花子 | タナカハナコ | 個人 | 個人事業 | C | 翌月末 | 末日 | 取引中 |
| CUS-004 | NPO法人みらい | ミライ | 法人 | 非営利 | B | 翌月末 | 15日 | 休止 |

### 7-2. スタッフマスタ
| スタッフID | 氏名 | 役職 | 職種 | 原価単価 | 請求単価 | 月間標準稼働時間 | 稼働率目標 | ステータス |
|---|---|---|---|---|---|---|---|---|
| STF-001 | 佐藤一郎 | 代表 | 税理士 | 5000 | 12000 | 160 | 0.70 | 在籍 |
| STF-002 | 高橋次郎 | マネージャー | 公認会計士 | 4000 | 10000 | 160 | 0.80 | 在籍 |
| STF-003 | 伊藤三郎 | スタッフ | 税理士 | 3000 | 8000 | 160 | 0.80 | 在籍 |
| STF-004 | 渡辺四郎 | アシスタント | — | 2000 | 5000 | 160 | 0.85 | 在籍 |

### 7-3. 案件種別マスタ
| 種別ID | 種別名 | カテゴリ大 | 標準工数 | 標準単価 | 難易度 |
|---|---|---|---|---|---|
| KND-001 | 法人決算申告 | 税務 | 30 | 300000 | 3 |
| KND-002 | 個人確定申告 | 税務 | 8 | 80000 | 2 |
| KND-003 | 顧問契約 | 税務 | 4 | 50000 | 1 |
| KND-004 | 相続税申告 | 税務 | 60 | 800000 | 5 |

### 7-4. 作業項目マスタ
| 作業項目ID | 作業項目名 | カテゴリ | 既定請求区分 | 表示順 |
|---|---|---|---|---|
| WRK-001 | 資料収集・整理 | 準備 | 請求対象 | 1 |
| WRK-002 | 帳簿チェック | 作業 | 請求対象 | 2 |
| WRK-003 | 申告書作成 | 作業 | 請求対象 | 3 |
| WRK-004 | 顧客打合せ | 折衝 | 請求対象 | 4 |
| WRK-005 | 社内ミーティング | 社内 | 内部 | 5 |

### 7-5. 案件マスタ
| 案件ID | 案件名 | 顧客ID | 種別ID | 契約形態 | 主担当ID | 契約金額 | 見積工数 | 納期 | ステータス |
|---|---|---|---|---|---|---|---|---|---|
| PJT-001 | 山田製作所 法人決算申告 | CUS-001 | KND-001 | 固定 | STF-002 | 350000 | 30 | 2026-05-31 | 進行中 |
| PJT-002 | 鈴木商事 顧問契約 | CUS-002 | KND-003 | 顧問 | STF-003 | 50000 | 4 | 2026-06-30 | 進行中 |
| PJT-003 | 田中花子 確定申告 | CUS-003 | KND-002 | スポット | STF-003 | 80000 | 8 | 2026-03-15 | 完了 |
| PJT-004 | 山田製作所 相続税申告 | CUS-001 | KND-004 | 固定 | STF-001 | 800000 | 60 | 2026-08-31 | 進行中 |

### 7-6. 工数
| 工数ID | 記録日 | スタッフID | 案件ID | 作業項目ID | 作業時間（分） | 作業時間（時間） | 請求区分 | 原価単価 | 請求単価 | 原価金額 | 請求金額 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| KOSU-001 | 2026-05-07 | STF-002 | PJT-001 | WRK-002 | 180 | 3.0 | 請求対象 | 4000 | 10000 | 12000 | 30000 |
| KOSU-002 | 2026-05-07 | STF-003 | PJT-002 | WRK-004 | 60 | 1.0 | 請求対象 | 3000 | 8000 | 3000 | 8000 |
| KOSU-003 | 2026-05-08 | STF-002 | PJT-001 | WRK-003 | 240 | 4.0 | 請求対象 | 4000 | 10000 | 16000 | 40000 |
| KOSU-004 | 2026-05-08 | STF-003 | PJT-001 | WRK-005 | 30 | 0.5 | 内部 | 3000 | 8000 | 1500 | 4000 |

### 7-7. 経費
| 経費ID | 発生日 | スタッフID | 案件ID | 経費種別 | 金額 | 請求区分 | 領収書 | 承認状態 |
|---|---|---|---|---|---|---|---|---|
| KEIHI-001 | 2026-05-07 | STF-002 | PJT-001 | 交通費 | 1200 | 実費請求 | 有 | 承認 |
| KEIHI-002 | 2026-05-10 | STF-001 | PJT-004 | 印紙代 | 4000 | 実費請求 | 有 | 申請中 |
| KEIHI-003 | 2026-05-12 | STF-003 | PJT-002 | 消耗品費 | 800 | 自社負担 | 無 | 承認 |

### 7-8. 請求書
| 請求ID | 顧客ID | 案件ID | 請求日 | 期間FROM | 期間TO | 基本報酬 | タイムチャージ | 実費金額 | 小計 | 消費税率 | 消費税 | 合計 | ステータス |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| INV-202603-001 | CUS-003 | PJT-003 | 2026-03-20 | 2026-02-01 | 2026-03-15 | 80000 | 0 | 0 | 80000 | 0.10 | 8000 | 88000 | 発行済 |
| INV-202605-001 | CUS-001 | PJT-001 | 2026-05-31 | 2026-05-01 | 2026-05-31 | 350000 | 0 | 1200 | 351200 | 0.10 | 35120 | 386320 | 下書き |

### 7-9. 請求明細（INV-202605-001 の例）
| 明細ID | 請求ID | 明細種別 | 内容 | 数量 | 単価 | 金額 |
|---|---|---|---|---|---|---|
| INVL-001 | INV-202605-001 | 基本報酬 | 法人決算申告（固定報酬） | 1 | 350000 | 350000 |
| INVL-002 | INV-202605-001 | 実費 | 交通費（5/7） | 1 | 1200 | 1200 |

---

## 8. Supabase 移行対応表

### 8-1. シート → テーブル
| シート（日本語） | Supabase テーブル | 種別 |
|---|---|---|
| 顧客マスタ | `m_customers` | table |
| スタッフマスタ | `m_staff` | table |
| 案件種別マスタ | `m_project_types` | table |
| 作業項目マスタ | `m_work_items` | table |
| 案件マスタ | `projects` | table |
| 工数 | `time_entries` | table |
| 経費 | `expenses` | table |
| 請求書 | `invoices` | table |
| 請求明細 | `invoice_items` | table |
| 案件集計 | `agg_projects` | materialized view / 集計table |
| スタッフ集計（月別） | `agg_staff_monthly` | materialized view |
| 月次サマリー | `agg_monthly` | materialized view |
| 顧客集計（月別） | `agg_customer_monthly` | materialized view |
| 見積精度 | `agg_estimate_accuracy` | materialized view |
| 稼働予測 | `agg_capacity_forecast` | view / table |
| システム設定 | `system_settings` | table（key-value） |

### 8-2. 型マッピング（本書の型 → PostgreSQL）
| 本書の型 | PostgreSQL |
|---|---|
| text(PK) | `text primary key` |
| text(FK) | `text references <親>(id)` |
| text | `text` |
| int | `integer` |
| num | `numeric` |
| date | `date` |
| time | `time` |
| datetime | `timestamptz` |
| bool | `boolean` |
| enum | `text` + `check (... in (...))` または PostgreSQL `enum` 型 |

### 8-3. 移行時の留意
- 主キーが文字列 IDのため、シートの行をそのまま `INSERT` 可能（採番ロジックは Supabase 側のシーケンス/関数へ移行）。
- 集計シートは生データから再計算可能なため、移行時に再生成すればよい（移行対象は生データ＋設定のみで十分）。
- 監査列 `created_at/updated_at` はそのまま `timestamptz`。`is_deleted` で論理削除を継続、または RLS/部分インデックスで運用。
- enum 選択肢は本書の値を `check` 制約 or enum 型に転記する。
- DataRepository インターフェース（API_DESIGN.md で定義）の実装を SpreadsheetApp 版 → supabase-js 版へ差し替えるのみで本体ロジックは不変。

---

## 9. 中村レビュー確認事項（本書での確定事項・要確認）

REQUIREMENTS.md §8 の13論点について、本書で採用した方針（要承認）:

| # | 論点 | 本書の採用方針 |
|---|---|---|
| 1 | 作業項目 | マスタ化（`m_work_items`） |
| 2 | 単価スナップショット | 工数レコードに単価・金額を保存 |
| 3 | 経費の原価算入 | 「含む」「自社負担」を案件原価に算入 |
| 4 | 削除方針 | 全シート論理削除（`is_deleted`） |
| 5 | 売上認識基準 | 請求ベース（invoices） |
| 6 | 請求と案件 | 1請求=1案件。ただし `invoice_items` で内訳保存・将来拡張可 |
| 8 | 担当案件数 | 主担当（owner_staff_id）基準 |
| 9 | 稼働予測 | 確定案件の残見積を主担当へ計上する単純モデル |

未確定（API_DESIGN.md / 実装で詰める）: #7 契約形態と基本報酬, #10/#11 評価閾値（設定シートに集約済み・値は調整可）, #12 アラートメール, #13 集計タイミング（即時+手動/バッチのハイブリッド予定）。

---

（以上 Step 2。中村のフィードバック確認後、Step 3: API_DESIGN.md に進む。）
