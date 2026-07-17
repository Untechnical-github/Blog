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
  Cloudflareのエッジサーバー（Pages Functions）で全アクセスを監視。404エラーが発生したリクエストに対し、ファイル名→パスの辞書のみを持つ軽量な `redirect-map.json` をハッシュ参照。ファイル名が一致する記事が存在する場合は、SEO評価を引き継ぐ `301 Moved Permanently` を返し、正しいURLへ自動転送を行う。
* **URL解析による検索フォールバック機能 (`index.html` & `404.html`):**
  ファイル名自体が存在しない完全なリンク切れの場合、アクセスされたURLのパスからキーワードを自動抽出。本文つきの `search-index.json` を Web Worker (`script/search-worker.js`) に渡して関連記事を非同期検索し、候補一覧を画面上に自動表示する。

### 2. Cloudflare Workers によるマルチ機能APIとDiscord Bot連携
Cloudflare Worker (`worker/src/index.js`) を活用し、単一のコードベースで「OGPデータ取得API」と「運用自動化Bot」の2つの役割を持たせている。自サイトの記事同士のプレビューは `articles.json` のメタ情報から直接描画するため、このAPIを叩くのは外部リンクのプレビュー時のみ。

* **GETリクエスト：高性能なOGPスクレイピングAPI**
  * 任意のURLからタイトル、説明文、アイキャッチ画像を抽出してJSONで返す。
  * **エッジキャッシュ:** `Cache-Control: public, max-age=86400` を付与しつつ `caches.default` にも保存し、同じ外部URLへの再スクレイピングを1日単位で防ぐ。
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
  * `script/generate-articles.js` (差分) / `script/generate-articles_local.js` (フル): 共通の `script/lib/article-parser.js` で全記事HTMLを解析し、用途別に3ファイルへ分割出力する。
    * `articles.json` … メタ情報のみ（title/path/category/image/日付/visibility）。関連記事表示・内部リンクプレビュー用。
    * `search-index.json` … 本文（content）つき。検索ページでのみ遅延読み込みされる。
    * `redirect-map.json` … ファイル名→パスの辞書のみ。`_middleware.js` の301リダイレクト用。
  * `script/generate-sitemap.js` / `_local.js`: 共通の `script/lib/sitemap-lib.js` を用い、記事HTMLから `sitemap.xml` を生成する。
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
│   ├── lib/
│   │   ├── article-parser.js     # 記事HTML解析 + 3ファイル出力の共通ロジック
│   │   └── sitemap-lib.js        # sitemap.xml 生成の共通ロジック
│   ├── ai-proofreader.mjs        # AIによる記事の自動校正スクリプト
│   ├── filter-meaningful-diff.js # 意味のある差分判定 (CIワークフローから共通利用)
│   ├── generate-articles.js      # articles.json/search-index.json/redirect-map.json 生成 (差分・CI環境用)
│   ├── generate-articles_local.js# 同上 (フルビルド・ローカル環境用)
│   ├── generate-sitemap.js       # sitemap.xml 生成用 (CI環境用)
│   ├── generate-sitemap_local.js # sitemap.xml 生成用 (ローカル環境用)
│   ├── link-checker.mjs          # リンク切れチェッカー (記事単位で並列実行)
│   ├── script.js                 # フロントエンド用（画像ズーム/OGPプレビュー/関連記事）
│   └── search-worker.js          # フロントエンド検索用 Web Worker
├── worker/src/index.js           # Cloudflare Worker（Discord Bot / OGP API、レスポンスをエッジキャッシュ）
├── _redirects                    # Cloudflare Pages 固定リダイレクト設定
├── 404.html                      # 404エラー用フォールバック (ビルド時に index.html から自動コピー)
├── ads.txt                       # 広告配信・認証用ファイル
├── articles.json                 # 自動生成される記事メタ情報 (関連記事・301リダイレクト用)
├── search-index.json             # 自動生成される検索用インデックス (本文つき、検索時のみ読み込み)
├── redirect-map.json             # 自動生成されるファイル名→パスの辞書 (301リダイレクト用)
├── index.html                    # トップページ 兼 404アシスト画面
├── package-lock.json             # 依存パッケージの固定バージョン管理
├── package.json                  # Node.js プロジェクト設定・依存関係
├── policy.html                   # プライバシーポリシー
├── sitemap.xml                   # 自動生成されるサイトマップ
└── style.css                     # グローバルスタイルシート
```

---

## 🔐 Operations Notes

* **`GITHUB_PAT` のスコープ:** Discord Bot（`worker/src/index.js`）が GitHub API 呼び出しに使う PAT は、漏洩時の被害を最小化するため fine-grained PAT を使い、対象リポジトリをこのリポジトリ1つに限定し、権限は `contents: write` と `actions: write` のみに絞ることを推奨する。
* **記事ファイル名の一意性:** `functions/_middleware.js` の301リダイレクトは `redirect-map.json`（ファイル名→パスの辞書）をファイル名の完全一致で引く実装のため、サイト全体で記事のファイル名（拡張子・ディレクトリを除いた部分）が一意であることが前提になっている。衝突した場合は `script/generate-articles.js` / `generate-articles_local.js` 実行時にビルドログへ警告が出力される。
* **反映のラグ:** Cloudflare Pages の自動デプロイは push から反映まで数十秒かかる。Discord の `/rebuild` コマンドの応答にもその旨が案内される。

## 🧪 Tests

`node --test`（`npm test`）で `script/lib/article-parser.js`（メタ抽出・日付バリデーション・redirect-map生成）と `worker/src/index.js`（OGP抽出・文字コード判定・呼び出し元オリジン検証）の単体テストを実行できる。手で確認しづらく、壊れても気づきにくい箇所を優先してカバーしている。