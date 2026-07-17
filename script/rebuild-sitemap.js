const fs = require("fs/promises");
const path = require("path");
const {
  isNoindex,
  isDraftDate,
  extractPublishedDate,
  extractModifiedDate,
  urlFromFile,
  writeSitemapUrlMap
} = require("./lib/sitemap-lib");

const BLOG_ROOT = path.resolve(__dirname, "../");
const TARGET_DIR = path.join(BLOG_ROOT, "articles");
const IGNORE_DIRS = ["node_modules", ".git", ".vscode", "script", "public"];

async function getAllHtmlFiles(dir) {
  let results = [];
  try {
    await fs.access(dir);
  } catch { return []; }

  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.includes(entry.name)) results = results.concat(await getAllHtmlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".html") && !["index.html", "policy.html"].includes(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

(async () => {
  console.log("🚀 sitemap.xml のフルビルドを開始します...");
  const htmlFiles = await getAllHtmlFiles(TARGET_DIR);
  const urlMap = new Map();

  for (const file of htmlFiles) {
    const relativePath = path.relative(BLOG_ROOT, file).replace(/\\/g, "/");
    const fullUrl = urlFromFile(relativePath);

    try {
      const html = await fs.readFile(file, "utf-8");

      if (isNoindex(html)) continue;

      const publishedISO = extractPublishedDate(html);
      if (isDraftDate(publishedISO)) continue;

      const lastmod = extractModifiedDate(html) || publishedISO;

      urlMap.set(fullUrl, { loc: fullUrl, lastmod });
    } catch (err) {
      console.error(`❌ エラー: ${file} 処理失敗`, err);
    }
  }

  await writeSitemapUrlMap(urlMap);
  console.log(`🎉 sitemap.xml を完全に再構築しました（計 ${urlMap.size} 件）`);
})();
