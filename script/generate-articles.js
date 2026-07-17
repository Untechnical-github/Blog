const fs = require("fs/promises");
const {
  ARTICLES_JSON_FILE,
  SEARCH_INDEX_FILE,
  normalizePath,
  parseArticle,
  writeArticleOutputs
} = require("./lib/article-parser");

// 既存の articles.json（メタ情報）と search-index.json（本文）を突き合わせて
// 変更されていない記事の完全なレコード（本文つき）を復元する。
async function loadExistingArticles() {
  const articleMap = new Map();

  let metaByPath = new Map();
  try {
    const data = await fs.readFile(ARTICLES_JSON_FILE, "utf-8");
    JSON.parse(data).forEach(article => {
      metaByPath.set(normalizePath(article.path), article);
    });
  } catch {}

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
        image: entry.image,
        datePublished: meta.datePublished || "",
        dateModified: meta.dateModified || "",
        visibility: entry.visibility
      });
    });
  } catch {}

  return articleMap;
}

(async () => {
  const articleMap = await loadExistingArticles();

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

  const count = await writeArticleOutputs(articleMap);
  console.log(`✅ articles.json / search-index.json / redirect-map.json updated (${count} articles)`);
})();
