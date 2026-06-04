# 案件別工数管理システム（HYPHEN版サンプル）

士業・コンサル・制作会社など「案件単位で仕事を進める企業」向けの工数・収益管理 Web アプリ。
GAS（Google Apps Script）+ Google スプレッドシート + 静的フロントエンド（Netlify）で構成。
HYPHEN のポートフォリオ／他社紹介用サンプルです。

- 元アプリ参考: https://ankenbetu-kousu.netlify.app/
- 機能仕様の正本: `案件別工数管理.txt`

## 特長

- **全15画面**（ダッシュボード／工数入力／案件／各マスタ／経費／請求／レポート4種／分析2種／設定）
- **タイマー / 一括入力 / 個別入力 / 履歴** の4方式で工数入力
- 原価・請求金額・粗利益・消化率・稼働率・見積精度・稼働予測を**自動計算**
- **Supabase 移行を見据えた設計**: データアクセスを `DataRepository` 層に集約。実装差し替えのみで移行可能
- 日本語UI・レスポンシブ・色の意味統一（🔴警告 / 🟡注意 / 🟢良好）

## ディレクトリ構成

```
.
├─ 案件別工数管理.txt        # 元アプリ公式マニュアル（正本）
├─ REQUIREMENTS.md          # 要件定義書
├─ SHEETS_SCHEMA.md         # スプレッドシート設計書
├─ API_DESIGN.md            # GAS API 設計書
├─ UI_DESIGN.md             # 画面設計書
├─ IMPLEMENTATION_PLAN.md   # 実装計画書
├─ gas/                     # バックエンド（GAS）
│   ├─ Main.gs              # doGet/doPost・ルーター
│   ├─ config/Schema.gs     # シート定義（単一の真実）
│   ├─ repository/          # IRepository / SheetRepository / Factory
│   ├─ service/             # 業務ロジック・CalcUtil・集計
│   ├─ util/                # Lock / 採番 / 検証 / レスポンス / エラー
│   ├─ setup/Setup.gs       # 初回セットアップ（シート作成＋初期データ）
│   └─ tests/Tests.gs       # CalcUtil テスト
├─ frontend/                # フロントエンド（静的SPA）
│   ├─ index.html
│   ├─ css/ js/ assets/
├─ netlify.toml
└─ .clasp.json.sample
```

## セットアップ手順

### 1. バックエンド（GAS）

**A. clasp を使う場合（推奨）**

```bash
npm i -g @google/clasp
clasp login
cp .clasp.json.sample .clasp.json   # scriptId を自分のプロジェクトIDに変更
clasp push                          # gas/ をアップロード
```

**B. 手動の場合**: GAS エディタで `gas/` 内の各 `.gs` を同名で作成して貼り付け。

**初期化（共通）**

1. GAS エディタで **`setup()` を一度だけ実行**（初回は権限承認）。
   → 16シート＋初期データ（顧客・スタッフ・案件・工数等のサンプル）が生成され、
   `SPREADSHEET_ID` が Script Property に保存されます。
2. （任意）`runTests()` を実行して計算ロジックの自己テストを確認。
3. **デプロイ**: 「デプロイ」→「新しいデプロイ」→ 種類=**ウェブアプリ**
   - 実行ユーザー: **自分**
   - アクセス: **全員（匿名を含む）**（認証なしMVPのため）
4. 発行された **`/exec` URL** を控える。

> 再デプロイ時は「デプロイを管理」から既存デプロイの版を更新すると URL が固定されます。

### 2. フロントエンド（Netlify）

1. `frontend/js/config.js` の `API_BASE_URL` に GAS の `/exec` URL を設定。
   （社名・表示名・メインカラーもここ／`css/tokens.css` で変更可）
2. Netlify にリポジトリを接続、または `frontend/` をドラッグ&ドロップでデプロイ。
   （`netlify.toml` で `publish = "frontend"`、ビルド不要）
3. 公開 URL にアクセス。

## 使い方（運用フロー）

1. **マスタ登録**: 顧客 → スタッフ → 案件種別（→必要なら作業項目を設定画面で）
2. **案件登録**: 契約金額・見積工数を入力（消化率・粗利の自動計算に必要）
3. **工数入力**: 個別／一括／タイマーで毎日記録
4. **ダッシュボード/レポート**で進捗・収益性・稼働を確認
5. **経費 → 請求**: 経費登録 → 請求の「自動計算」→ 保存 → 入金登録
6. **月末**: 設定画面で月次・スタッフ別集計を実行 → レポート確認 → 稼働予測

## 設計のポイント（引き継ぎ向け）

- **DataRepository を必ず経由**: `service/` は `getRepository()` 経由でのみデータアクセス。
  `SpreadsheetApp` を直接呼ぶのは `repository/SheetRepository.gs` のみ。
  → Supabase 移行時は `RepositoryFactory` の実装を差し替えるだけ（`REPOSITORY_KIND`）。
- **計算は CalcUtil に集約**（`service/CalcUtil.gs`）。閾値・税率は設定から注入。
- **排他制御**: 書き込み・採番・集計は `withLock`（LockService）で直列化。
- **生データと集計の分離**: 集計値は `agg_*` シートへ別保存。生データは集計で更新しない。
- **ID 規則**: `PJT-/STF-/CUS-/KND-/WRK-/KOSU-/KEIHI-/INVL-`、請求は `INV-YYYYMM-連番`。

## ブランド差し替え（HYPHEN 対応）

1. `frontend/assets/logo.svg` を差し替え
2. `frontend/css/tokens.css` の `--brand-*` を変更
3. `frontend/js/config.js` の `APP_NAME` / `COMPANY_NAME` を変更

セマンティックカラー（赤/黄/緑）は意味固定のため原則変更しません。

## 公開URL・CI/CD

- 本番サイト: https://hyphen-project-hours.netlify.app
- **自動デプロイ**: GitHub `main` への push で Netlify が自動的に再ビルド・公開します
  （Netlify デプロイキー＋GitHub Webhook 連携済み。publish=`frontend`）。

## 動作確認チェックリスト

`IMPLEMENTATION_PLAN.md` の §5 を参照。
