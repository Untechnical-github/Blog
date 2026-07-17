const fs = require("fs/promises");
const {
  ARTICLES_JSON_FILE,
  SEARCH_INDEX_FILE,
  normalizePath,
  parseArticle,
  isSuspiciousArticleCountDrop,
  isMissingArticlesJsonBaseline,
  writeArticleOutputs
} = require("./lib/article-parser");

// 既存の articles.json（メタ情報）と search-index.json（本文）を突き合わせて
// 変更されていない記事の完全なレコード（本文つき）を復元する。
// どちらかの読み込みに失敗した場合は articleMap が空（または不完全）のまま返ることがあるため、
// 呼び出し側で previousCount（= articles.json から読めた件数）を使って安全性を検証すること。
async function loadExistingArticles() {
  const articleMap = new Map();

  let metaByPath = new Map();
  try {
    const data = await fs.readFile(ARTICLES_JSON_FILE, "utf-8");
    JSON.parse(data).forEach(article => {
      metaByPath.set(normalizePath(article.path), article);
    });
  } catch (err) {
    console.warn(`⚠️ ${ARTICLES_JSON_FILE} を読めませんでした（既存メタ情報の復元をスキップします）: ${err.message}`);
  }

  try {
    const data = await fs.readFile(SEARCH_INDEX_FILE, "utf-8");
    JSON.parse(data).forEach(entry => {
      const key = normalizePath(entry.path);
      const meta = metaByPath.get(key) || {};
      articleMap.set(key, {
        title: entry.title,
        category: entry.category,
        path: key,
        content: entry.content,
        description: meta.description || "",
        image: entry.image,
        datePublished: meta.datePublished || "",
        dateModified: meta.dateModified || "",
        visibility: entry.visibility
      });
    });
  } catch (err) {
    console.warn(`⚠️ ${SEARCH_INDEX_FILE} を読めませんでした（既存記事の復元をスキップします）: ${err.message}`);
  }

  return { articleMap, previousCount: metaByPath.size };
}

(async () => {
  const { articleMap, previousCount } = await loadExistingArticles();

  const changedFiles = process.argv
    .slice(2)
    .filter(f => f.endsWith(".html") && f !== "index.html" && f !== "policy.html");

  for (const file of changedFiles) {
    const normalizedPath = normalizePath(file);
    const html = await fs.readFile(file, "utf-8");
    const article = parseArticle(html, normalizedPath);

    if (!article.valid) {
      console.log(`⛔ ${normalizedPath} は日付が不完全なため articles.json から除外します`);
      articleMap.delete(normalizedPath);
      continue;
    }

    articleMap.set(normalizedPath, article);
    console.log(`✅ ${normalizedPath} を articles.json に登録 (${article.visibility})`);
  }

  // 差分ビルドで正当に減るのは、今回変更されたファイルが日付不完全で除外された場合のみ。
  // それ以上の減少は既存インデックスの読み込み失敗が疑われるため、サイト全体のインデックスを
  // 静かに1〜数件へ上書きしてコミットしてしまう前にビルドを止める。
  if (isSuspiciousArticleCountDrop(previousCount, articleMap.size, changedFiles.length)) {
    console.error(
      `❌ 記事数が ${previousCount} → ${articleMap.size} に減少しました（今回の変更ファイル数: ${changedFiles.length}）。` +
      `既存インデックス（${ARTICLES_JSON_FILE} / ${SEARCH_INDEX_FILE}）の読み込みに失敗した可能性があります。書き込みを中止します。`
    );
    process.exit(1);
  }

  // 件数チェックは articles.json（previousCount）基準なので、articles.json 自体が読めなかった
  // 場合（previousCount === 0）は上のチェックを素通りしてしまう。search-index.json だけから
  // articleMap を復元できてしまっている状態は、それ自体が異常（日付・descriptionが全記事分
  // 失われたまま articles.json が上書きされる）なので別途検知する。
  if (isMissingArticlesJsonBaseline(previousCount, articleMap.size)) {
    console.error(
      `❌ ${ARTICLES_JSON_FILE} が読めないまま ${articleMap.size} 件を復元しようとしています` +
      `（日付・descriptionが全て失われます）。書き込みを中止します。`
    );
    process.exit(1);
  }

  const count = await writeArticleOutputs(articleMap);
  console.log(`✅ articles.json / search-index.json / redirect-map.json updated (${count} articles)`);
})();
