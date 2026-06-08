# Untechnical Blog (`untechnical.info`)

個人技術ブログ「Untechnical」のソースコードおよびシステムリポジトリ。
Cloudflare Pages / Workers と GitHub Actions を組み合わせ、SEO最適化、運用の自動化（ChatOps）、ユーザー利便性の向上をエッジサーバーおよびCI/CDパイプライン上で実現している。

## 🚀 Architecture

* **Frontend:** Vanilla HTML / CSS / JavaScript (Zero-dependency)
* **Hosting & Routing:** Cloudflare Pages + Pages Functions (`_middleware.js`)
* **Backend & API (Discord Bot):** Cloudflare Workers (`untechnical`)
* **CI/CD & Automation:** GitHub Actions
* **Operations:** Discord (Slash Commands / Interactions)

---

## ✨ Core Features (実装済みの機能一覧)

### 1. エッジサーバーでの動的ルーティングと404フォールバック検索機能
記事のディレクトリ構造を変更した際の手動リダイレクト設定の手間を省き、リンク切れによるユーザー離脱を防ぐ。
* **動的301リダイレクト (`functions/_middleware.js`):**
  Cloudflareのエッジサーバー（Pages Functions）で全アクセスを監視。404エラーが発生したリクエストに対し、`articles.json` を非同期で参照。ファイル名が一致する記事が存在する場合は、SEO評価を引き継ぐ `301 Moved Permanently` を返し、正しいURLへ自動転送を行う。
* **URL解析による検索フォールバック機能 (`index.html` & `404.html`):**
  ファイル名自体が存在しない完全なリンク切れの場合、アクセスされたURLのパスからキーワードを自動抽出。Web Worker (`script/search-worker.js`) を用いて関連記事を非同期検索し、候補一覧を画面上に自動表示する。

### 2. Cloudflare Workers によるマルチ機能APIとDiscord Bot連携
Cloudflare Worker (`script.js`) を活用し、単一のコードベースで「OGPデータ取得API」と「運用自動化Bot」の2つの役割を持たせている。

* **GETリクエスト：高性能なOGPスクレイピングAPI**
  * 任意のURLからタイトル、説明文、アイキャッチ画像を抽出してJSONで返す。
  * **ブラウザ偽装:** 一般的なブラウザのUser-Agentを付与することで、スクレイピング拒否を回避。
  * **文字コード自動判定:** 応答バイナリから文字コード（Shift_JIS、EUC-JP等）を自動検知・デコードし、日本語の文字化けを防ぐ。
  * **データ正規化:** 相対パスで記述された画像URLを絶対URLに自動変換し、HTMLエンティティのデコードを行う。
* **POSTリクエスト：Discord Interaction（Bot）機能**
  * **Ed25519署名検証:** 秘密鍵・公開鍵を用いた暗号学的署名検証を実装し、Discord公式からの正規リクエストのみを許可するセキュリティを担保。
  * **`/proofread` (自動校正):** 指定した複数の記事に対してAI校正をリクエストする（GitHub Actionsと連携）。
  * **`/rebuild` (サイト再構築):** サイト全体（JSONやサイトマップ）の再ビルドおよび再デプロイをDiscord上から実行する。
  * **オートコンプリート機能:** スラッシュコマンド入力時、GitHubのTree APIからリポジトリ内のファイル一覧を非同期で取得し、前方一致で選択肢を最大25件自動追従・補完する。
  * **インタラクティブな承認フロー:** AI校正結果の反映時、Discord上の「承認（マージ）」「破棄」ボタンのインタラクションを受け付け、GitHub API経由でブランチマージや削除を行い、結果をWebhook経由で非同期にDiscordへフィードバックする。

### 3. 自動ビルド・管理パイプライン (GitHub Actions)
`.github/workflows/` 内のYAMLファイルにより、記事の追加・更新、またはDiscordからの要求に応じて各種タスクを自動実行する。
* **サイトデータおよびサイトマップの自動生成 (`generate.yml` / `rebuild-all.yml`):**
  * `script/generate-articles.js`: リポジトリ内の全記事HTMLを解析し、タイトル、パス、画像の絶対URLを抽出して `articles.json` を自動生成する。
  * `script/generate-sitemap.js`: 生成された `articles.json` を元に、検索エンジン向けの `sitemap.xml` をフルビルドする。
* **手動・自動校正ワークフロー (`ai-proofreader.yml` / `ai-proofreader-manual.yml`):**
  * 指定されたファイルに対して静的解析やAIを用いた文章校正を行い、修正案を自動作成する。
* **リンク切れ定期検知 (`link-checker.yml`):**
  * `script/link-checker.mjs`: サイト内の外部リンクや内部リンクを定期的にパトロールし、デッドリンクを自動で検知・記録する。

---

## 📂 Directory Structure

```text
.
├── .github/
│   └── workflows/                # CI/CD自動化設定
│       ├── ai-proofreader-manual.yml # 手動指定でのAI校正ワークフロー
│       ├── ai-proofreader.yml        # 自動AI校正ワークフロー
│       ├── generate.yml              # 通常のビルド・デプロイパイプライン
│       ├── link-checker.yml          # リンク切れの定期チェック
│       └── rebuild-all.yml           # Discord等から実行するフルリビルド
├── articles/                     # 記事データ (HTML/Markdown形式)
├── functions/
│   └── _middleware.js            # エッジで稼働する動的301リダイレクト
├── images/                       # 静的画像アセット
├── node_modules/                 # プロジェクトの依存パッケージ群
├── script/                       # 自動化・フロントエンド用スクリプト群
│   ├── ai-proofreader.mjs        # AIによる記事の自動校正スクリプト
│   ├── generate-articles.js      # articles.json 生成用 (CI環境用)
│   ├── generate-articles_local.js# articles.json 生成用 (ローカル環境用)
│   ├── generate-sitemap.js       # sitemap.xml 生成用 (CI環境用)
│   ├── generate-sitemap_local.js # sitemap.xml 生成用 (ローカル環境用)
│   ├── link-checker.mjs          # リンク切れチェッカー
│   ├── script.js                 # Cloudflare Worker 用（Discord Bot / OGP API）
│   └── search-worker.js          # フロントエンド検索用 Web Worker
├── _redirects                    # Cloudflare Pages 固定リダイレクト設定
├── 404.html                      # 404エラー用フォールバック (index.htmlの複製)
├── ads.txt                       # 広告配信・認証用ファイル
├── articles.json                 # 自動生成される全記事のインデックスデータ
├── index.html                    # トップページ 兼 404アシスト画面
├── package-lock.json             # 依存パッケージの固定バージョン管理
├── package.json                  # Node.js プロジェクト設定・依存関係
├── policy.html                   # プライバシーポリシー
├── sitemap.xml                   # 自動生成されるサイトマップ
└── style.css                     # グローバルスタイルシート