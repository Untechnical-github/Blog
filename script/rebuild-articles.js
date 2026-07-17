const fs = require("fs/promises");
const path = require("path");
const { normalizePath, parseArticle, writeArticleOutputs } = require("./lib/article-parser");

const BLOG_ROOT = path.resolve(__dirname, "../");
const TARGET_DIR = path.join(BLOG_ROOT, "articles");

const IGNORE_DIRS = ["node_modules", ".git", ".vscode", "script", "public"];

async function getAllHtmlFiles(dir) {
  let results = [];
  try {
    await fs.access(dir);
  } catch {
    console.error(`❌ エラー: ディレクトリが見つかりません -> ${dir}`);
    return [];
  }

  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.includes(entry.name)) continue;
      results = results.concat(await getAllHtmlFiles(fullPath));
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".html") &&
      entry.name !== "index.html" &&
      entry.name !== "policy.html"
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

(async () => {
  console.log("🚀 スクリプトを開始しました...");
  console.log(`📂 探索対象ディレクトリ: ${TARGET_DIR}`);

  const articleMap = new Map();

  console.log("⏳ HTMLファイルを検索中...");
  const htmlFiles = await getAllHtmlFiles(TARGET_DIR);
  console.log(`📄 発見した HTML 数: ${htmlFiles.length}`);

  if (htmlFiles.length === 0) {
    console.log("⚠️ 対象のHTMLが見つかりませんでした。");
    return;
  }

  for (const file of htmlFiles) {
    const normalizedPath = normalizePath(path.relative(BLOG_ROOT, file));
    const html = await fs.readFile(file, "utf-8");
    const article = parseArticle(html, normalizedPath);

    if (!article.valid) {
      console.log(`⏩ 除外: ${normalizedPath}（日付不完全）`);
      continue;
    }

    articleMap.set(normalizedPath, article);
    process.stdout.write(article.visibility === "private" ? "🔒" : ".");
  }

  console.log("\n✅ 全ファイルの解析完了。JSONを生成します...");

  const count = await writeArticleOutputs(articleMap);
  console.log(`🎉 完了！ articles.json / search-index.json / redirect-map.json を更新 (${count} 件)`);
})();
