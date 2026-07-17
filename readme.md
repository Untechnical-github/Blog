# Untechnical Blog (`untechnical.info`)

個人技術ブログ「Untechnical」のソースコードおよびシステムリポジトリ。
Cloudflare Pages / Workers と GitHub Actions を組み合わせ、SEO最適化、運用の自動化（ChatOps）、ユーザー利便性の向上をエッジサーバーおよびCI/CDパイプライン上で実現している。

データベースを持たず、**記事のHTMLファイルだけを情報源**として、検索用データやサイトマップをすべて自動生成するのが特徴。記事を書いてpushすれば、あとは公開まで自動で進む。

```
記事を書く → GitHubへpush
                ├─→ 記事一覧・検索データ・サイトマップを自動生成 → Cloudflare Pages が公開
                └─→ AIが誤字を校正して修正案を作成 → Discordで承認 → 反映
```

---

## 🚀 技術構成

| 役割 | 使用技術 |
|---|---|
| **フロントエンド** | ライブラリを一切使わない素の HTML / CSS / JavaScript |
| **ホスティング・ルーティング** | Cloudflare Pages + Pages Functions（`functions/_middleware.js`） |
| **バックエンド・API・Discord Bot** | Cloudflare Workers（`untechnical`）— wrangler で `worker/` 配下をローカル管理 |
| **AI校正** | Google Gemini API |
| **CI/CD・自動化** | GitHub Actions |
| **運用インターフェース** | Discord（スラッシュコマンド / ボタン操作） |

---

## ✨ 主な機能

### 1. リンク切れを自動で救済する仕組み

記事のフォルダ構成を変えるたびに転送設定を手書きするのは大変で、忘れるとリンク切れになる。それを2段構えで自動化している。

* **記事が移動していた場合 — 自動301リダイレクト（`functions/_middleware.js`）**
  Cloudflareのエッジサーバーで全アクセスを監視し、404が出たときだけ `redirect-map.json`（ファイル名→パスの辞書）を参照する。同じファイル名の記事が見つかれば、SEO評価を引き継ぐ `301 Moved Permanently` で正しいURLへ自動転送する。辞書はエッジに60秒キャッシュされるので、404が連続しても毎回読み直さない。

* **記事そのものが存在しない場合 — 検索フォールバック（`index.html` / `404.html`）**
  アクセスされたURLからキーワードを抜き出し、`search-index.json` を Web Worker（`script/search-worker.js`）で検索して、関連しそうな記事の候補を画面に表示する。行き止まりにせず、近い記事へ案内する。

### 2. Cloudflare Workers（OGP取得API + Discord Bot）

1つのWorker（`worker/src/index.js`）が、リクエストの種類に応じて2つの役割をこなす。

**GETリクエスト：OGP取得API**

記事内に貼った外部リンクを、タイトル・説明文・画像つきのカードとして表示するためのAPI。

* 指定されたURLからタイトル・説明文・アイキャッチ画像を抽出してJSONで返す。
* **呼び出し元の制限:** 自サイトからの呼び出し以外は拒否する。誰でも任意のURLを取得できる状態だと、第三者に無料のスクレイピング代行として悪用されてしまうため。
* **キャッシュ:** 一度取得した外部URLの結果は1日間キャッシュし、同じサイトへ何度もアクセスしない。失敗した場合はキャッシュせず、次回すぐ再取得できるようにしている。
* **ブラウザのふりをする:** 一般的なブラウザと同じUser-Agentを付けて、アクセス拒否を回避する。
* **文字化け対策:** 応答から文字コード（Shift_JIS、EUC-JP など）を自動判別してデコードする。古い日本語サイトでも文字化けしない。
* **URLの正規化:** 相対パスの画像URLを絶対URLに直し、HTMLの特殊文字（`&amp;` など）を元に戻す。

なお、**自サイトの記事同士のリンクはこのAPIを使わない**。`articles.json` に必要な情報が既にあるので、そこから直接描画している。

**POSTリクエスト：Discord Bot**

Discordから運用操作を行うための窓口。

* **なりすまし防止:** Ed25519という暗号方式で署名を検証し、Discord公式からの正規のリクエストだけを受け付ける。
* **`/proofread`（AI校正）:** 指定した記事のAI校正を依頼する。
* **`/rebuild`（サイト再構築）:** 記事一覧・検索データ・サイトマップを全記事ぶん作り直す。
* **入力補完:** コマンド入力中にGitHubからファイル一覧を取得し、記事名の候補を最大25件表示する（結果は60秒キャッシュ）。
* **承認ボタン:** AI校正の結果に「反映する」「破棄する」ボタンが付き、押すとGitHub側でマージ／削除が実行され、結果がDiscordに返ってくる。

### 3. 自動ビルド・管理パイプライン（GitHub Actions）

`.github/workflows/` 内の設定により、記事の追加・更新やDiscordからの指示に応じて各種処理が自動で走る。

どのワークフローも `script/filter-meaningful-diff.js` を通し、**本文・タイトル・画像・リンクが実際に変わったファイルだけ**を処理対象にする。広告タグやスクリプトの細かい変更だけで無駄に処理が走らないようにするため。

**記事一覧・サイトマップの自動生成（`generate.yml` / `rebuild-all.yml`）**

記事HTMLを解析し、用途ごとに3つのファイルへ分けて出力する。全部を1つのファイルにまとめると、少しの情報しか要らない場面でも全記事の本文をダウンロードすることになり、記事が増えるほど重くなるため。

| ファイル | 中身 | 使う場面 |
|---|---|---|
| `articles.json` | メタ情報のみ（タイトル / パス / カテゴリ / 画像 / 説明文 / 日付 / 公開状態） | 全記事ページ（関連記事・内部リンクのプレビュー） |
| `search-index.json` | 本文つき | 検索するときだけ |
| `redirect-map.json` | ファイル名→パスの辞書だけ | 404が出たときだけ（エッジ） |

* 生成は `script/generate-articles.js`（差分）/ `script/generate-articles_local.js`（全記事）が担当し、解析ロジックは `script/lib/article-parser.js` に集約している。
* **安全装置:** 差分ビルドは「変更していない記事は既存のJSONから復元し、変更した記事だけ作り直す」方式のため、その復元に失敗すると記事一覧が数件まで削られたまま公開されてしまう。書き込み前に記事数が不自然に減っていないか検証し、異常があればコミットせずにビルドを止める。復旧はDiscordの `/rebuild`（全記事ビルド）で行う。
* `script/generate-sitemap.js` / `_local.js` が `sitemap.xml` を生成する（共通ロジックは `script/lib/sitemap-lib.js`）。差分ビルド時は記事HTML内の最終更新日も同時に更新する。
* `404.html` は `index.html` からビルド時に自動コピーされる（手動で2つ管理しなくてよい）。

**AI校正（`ai-proofread.yml` / `ai-proofread-manual.yml`）**

* `ai-proofread.yml` は記事のpush時に自動実行、`ai-proofread-manual.yml` はDiscordの `/proofread` から実行する。
* `script/ai-proofreader.mjs` が Gemini API に「明らかな誤字脱字・変換ミス・タグの構文エラー」だけの検出を依頼し、修正前後のペアを受け取る。文章のリライトや言い回しの変更は禁止している。
* **AIは記事を直接書き換えない。** 修正案は一時ブランチに置かれ、Discordの「反映する」ボタンを押して初めて本番に反映される。
* AIの回答もそのまま信用せず、「修正対象が本当にファイル内にあるか」「短いフレーズが意図せず何箇所にもマッチしていないか」を確認してから適用する。
* 承認時のコミットには `[skip-proofread]` が付き、その反映がまたAI校正を呼び出す無限ループを防いでいる。

**リンク切れの定期チェック（`link-checker.yml`）**

* `script/link-checker.mjs` が毎日サイト内外のリンクと画像を巡回し、切れているものをDiscordに通知する。
* 記事ごとに並列で処理しつつ、外部サイトへは同じドメインごとに約500ms間隔でアクセスする（相手に負荷をかけないため）。
* Bot対策ページや外部サイトのタイムアウトは、誤検知として通知対象から除外する。

### 4. フロントエンド（`script/script.js`）

ライブラリなしで、記事ページに以下の機能を提供する。

* **リンクプレビュー:** 内部リンクは `articles.json` からすぐ描画。外部リンクだけWorkerのOGP APIを使い、画面に入ってから取得する（5秒でタイムアウト）。
* **関連記事の自動表示:** カテゴリが一致する記事を最大10件、自動で追加する（非公開記事や既に貼ってあるリンクは除く）。
* **画像のズーム・移動:** マウスホイール、ドラッグ、タッチ操作に対応。
* **コードブロックのコピーボタン。**

---

## 📂 ディレクトリ構成

```text
.
├── .github/
│   └── workflows/                # CI/CD自動化設定
│       ├── ai-proofread-manual.yml # 手動指定でのAI校正ワークフロー
│       ├── ai-proofread.yml        # 自動AI校正ワークフロー
│       ├── generate.yml            # 通常のビルド・デプロイパイプライン
│       ├── link-checker.yml        # リンク切れの定期チェック
│       └── rebuild-all.yml         # Discord等から実行するフルリビルド
├── articles/                     # 記事データ (HTML)
├── functions/
│   └── _middleware.js            # エッジで稼働する動的301リダイレクト
├── images/                       # 静的画像アセット
├── node_modules/                 # プロジェクトの依存パッケージ群
├── script/                       # 自動化・フロントエンド用スクリプト群
│   ├── lib/
│   │   ├── article-parser.js     # 記事HTML解析 + 3ファイル出力の共通ロジック
│   │   ├── article-parser.test.js# 上記の単体テスト
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
├── worker/                       # wrangler管理下のWorkerソース
│   ├── .wrangler/                # wrangler の作業用ディレクトリ (自動生成)
│   ├── src/
│   │   ├── index.js              # Worker本体（OGP API + Discord Bot）
│   │   └── index.test.mjs        # 上記の単体テスト
│   ├── .dev.vars.example         # ローカル開発用の環境変数テンプレート
│   ├── package.json              # Worker用のプロジェクト設定
│   └── wrangler.toml             # Worker設定
├── _redirects                    # Cloudflare Pages 固定リダイレクト設定
├── .gitignore
├── 404.html                      # 404エラー用フォールバック (ビルド時に index.html から自動コピー)
├── ads.txt                       # 広告配信・認証用ファイル
├── articles.json                 # 自動生成される記事メタ情報 (関連記事・内部リンクプレビュー用)
├── search-index.json             # 自動生成される検索用インデックス (本文つき、検索時のみ読み込み)
├── redirect-map.json             # 自動生成されるファイル名→パスの辞書 (301リダイレクト用)
├── index.html                    # トップページ 兼 404アシスト画面
├── package-lock.json             # 依存パッケージの固定バージョン管理
├── package.json                  # Node.js プロジェクト設定・依存関係
├── policy.html                   # プライバシーポリシー
├── readme.md
├── sitemap.xml                   # 自動生成されるサイトマップ
└── style.css                     # グローバルスタイルシート
```

`articles.json` / `search-index.json` / `redirect-map.json` / `sitemap.xml` は**すべて自動生成**されるので、手で編集しない。
`articles/` 配下の `.md` は記事として扱われない（記事一覧・サイトマップの生成対象は `.html` のみ）。

---

## 🔐 運用上の注意

* **シークレットの管理**
  Worker のシークレット（`DISCORD_PUBLIC_KEY` / `GITHUB_PAT`）は `wrangler secret put` で設定し、コードには一切書かない。ローカル開発では `worker/.dev.vars`（gitignore対象）を使い、テンプレートだけを `.dev.vars.example` としてコミットする。GitHub Actions 側は `GEMINI_API_KEY` / `DISCORD_BOT_TOKEN` / `DISCORD_CHANNEL_ID` / `DISCORD_WEBHOOK_URL` を Secrets に登録する。

* **`GITHUB_PAT` の権限範囲**
  Discord Bot（`worker/src/index.js`）がGitHub APIに使うトークンは、万一漏れたときの被害を抑えるため fine-grained PAT を使い、対象をこのリポジトリ1つに限定し、権限は `contents: write` と `actions: write` だけに絞ることを推奨する。

* **記事ファイル名は全体で重複させない**
  `functions/_middleware.js` の301リダイレクトは、ファイル名（拡張子とフォルダを除いた部分）で `redirect-map.json` を引く仕組みのため、サイト全体で重複しないことが前提になっている。重複した場合は日付の新しい記事が優先され、ビルドログに警告が出る。

* **記事には `meta description` を書く**
  内部リンクのプレビューは `articles.json` の `description` を使うため、`meta description`（または `og:description`）が無いと説明文が空のカードになる。書き忘れた場合はビルドログに警告が出る。

* **非公開記事について**
  `meta robots` に `noindex` を指定した記事は非公開扱いとなり、サイトマップと関連記事から除外される。ただし `search-index.json` には含まれる（一度閲覧した記事だけ検索結果に出す仕様のため）ので、本文を隠す手段はURLの秘匿のみである点に注意。

* **公開までのタイムラグ**
  Cloudflare Pages の自動デプロイは、pushから反映まで数十秒かかる。Discord の `/rebuild` の応答にもその旨が表示される。

---

## 🧪 テスト

`node --test`（`npm test`）で単体テストを実行できる。手で確認しづらく、壊れても気づきにくい箇所を優先してカバーしている。

* **`script/lib/article-parser.js`**
  メタ情報の抽出、日付のチェック（下書きの除外）、`description` 欠落時の警告、ファイル名が重複したときの優先順位、差分ビルドの安全装置。
* **`worker/src/index.js`**
  OGPのメタタグ抽出、文字コードの判定、呼び出し元の検証。
