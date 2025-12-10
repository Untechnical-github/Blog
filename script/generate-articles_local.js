const fs = require("fs/promises");
const path = require("path");
const { JSDOM } = require("jsdom");

const JSON_FILE = "articles.json";
const BASE_URL = "https://untechnical.info/";

const BLOG_ROOT = path.resolve(__dirname, "../");
const TARGET_DIR = path.join(BLOG_ROOT, "articles");

const IGNORE_DIRS = ["node_modules", ".git", ".vscode", "script", "public"];

const normalizePath = (p) => {
  const relative = path.relative(BLOG_ROOT, p);
  return relative.replace(/\\/g, "/");
};

function isValidDate(dateStr) {
  if (!dateStr) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  if (dateStr.includes("--")) return false;
  return true;
}

function getTimeTagDate(document) {
  const t = document.querySelector("time[datetime]");
  if (!t) return "";
  const dt = t.getAttribute("datetime");
  if (!dt || dt.includes("--") || !/^\d{4}-\d{2}-\d{2}$/.test(dt)) return "";
  return dt;
}

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

  let articleMap = new Map();

  try {
    const data = await fs.readFile(JSON_FILE, "utf-8");
    JSON.parse(data).forEach(article => {
      const key = normalizePath(article.path || article.url || "");
      articleMap.set(key, { ...article, path: key });
    });
  } catch {
    console.log("⚠️ articles.json を新規作成します");
  }

  console.log("⏳ HTMLファイルを検索中...");
  const htmlFiles = await getAllHtmlFiles(TARGET_DIR);
  console.log(`📄 発見した HTML 数: ${htmlFiles.length}`);

  if (htmlFiles.length === 0) {
    console.log("⚠️ 対象のHTMLが見つかりませんでした。");
    return;
  }

  for (const file of htmlFiles) {
    const normalizedPath = normalizePath(file);
    const html = await fs.readFile(file, "utf-8");
    const dom = new JSDOM(html);
    const document = dom.window.document;

    let datePublished = "";
    let dateModified = "";

    const ldJsonScript = document.querySelector("script[type='application/ld+json']");
    if (ldJsonScript) {
      try {
        const ldData = JSON.parse(ldJsonScript.textContent);
        datePublished = ldData.datePublished || "";
        dateModified = ldData.dateModified || "";
      } catch {}
    }

    const timeDate = getTimeTagDate(document);

    if (
      !isValidDate(datePublished) ||
      !isValidDate(dateModified) ||
      !isValidDate(timeDate)
    ) {
      console.log(`⏩ 除外: ${normalizedPath}（日付不完全）`);
      continue;
    }

    const targetContentElement = 
      document.querySelector("main") || 
      document.querySelector("article") || 
      document.body;

    const clone = targetContentElement.cloneNode(true);

    const junkElements = clone.querySelectorAll("script, style, noscript, iframe");
    junkElements.forEach(el => el.remove());
    let content = clone.textContent || "";
    content = content.replace(/\s+/g, " ").trim();

    const title =
      document.querySelector("title")?.textContent?.trim() ||
      document.querySelector("h1")?.textContent?.trim() ||
      "";

    const metaCategory =
      document.querySelector("meta[name='category']")?.getAttribute("content") || "";
    const categories = metaCategory.split(",").map(c => c.trim()).filter(Boolean);

    const relativeImagePath =
      document.querySelector("main img, article img, body img")?.getAttribute("src") || "";
    let image = "";
    if (relativeImagePath) {
      const fileUrl = new URL(normalizedPath, BASE_URL).href;
      image = new URL(relativeImagePath, fileUrl).href;
    }

    articleMap.set(normalizedPath, {
      title,
      category: categories,
      path: normalizedPath,
      content,
      image,
      datePublished,
      dateModified
    });
    
    process.stdout.write("."); 
  }
  
  console.log("\n✅ 全ファイルの解析完了。JSONを生成します...");

  const articles = Array.from(articleMap.values()).sort((a, b) => {
    const dateA = new Date(a.datePublished || 0);
    const dateB = new Date(b.datePublished || 0);
    return dateB - dateA;
  });

  await fs.writeFile(JSON_FILE, JSON.stringify(articles, null, 2), "utf-8");
  console.log(`🎉 完了！ ${JSON_FILE} を更新 (${articles.length} 件)`);
})();