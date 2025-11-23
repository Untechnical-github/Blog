const fs = require("fs/promises");
const path = require("path");
const { JSDOM } = require("jsdom");

const JSON_FILE = "articles.json";
const BASE_URL = "https://untechnical.info/";

const normalizePath = (p) =>
  path.normalize(p)
    .replace(/\\/g, "/")
    .replace(/^\.\//, "");

const getCleanUrl = (filePath) => {

  let p = normalizePath(filePath);

  p = p.replace(/^articles\//, '');

  p = p.replace(/\.html$/, '');

  const parts = p.split('/');

  if (parts.length >= 2) {
    const fileName = parts[parts.length - 1];
    const parentDir = parts[parts.length - 2];
    if (fileName === parentDir) {
      parts.pop();
    }
  }

  return '/' + parts.join('/');
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
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results = results.concat(await getAllHtmlFiles(fullPath));
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".html") &&
      entry.name !== "index.html" &&
      entry.name !== "policy.html"
    ) {
      results.push(normalizePath(fullPath));
    }
  }
  return results;
}

(async () => {
  let articleMap = new Map();

  try {
    const data = await fs.readFile(JSON_FILE, "utf-8");
    JSON.parse(data).forEach(article => {

      const key = article.filePath || article.path;
      articleMap.set(key, article);
    });
  } catch {
    console.log("⚠️ articles.json が存在しないため、新規作成します");
  }

  const htmlFiles = await getAllHtmlFiles(".");
  console.log(`📄 発見した HTML 数: ${htmlFiles.length}`);

  for (const file of htmlFiles) {
    const normalizedPath = normalizePath(file);
    const cleanUrl = getCleanUrl(normalizedPath);

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
      } catch {
        console.warn(`⚠️ JSON-LD parse error in ${normalizedPath}`);
      }
    }

    const timeDate = getTimeTagDate(document);

    if (
      !isValidDate(datePublished) ||
      !isValidDate(dateModified) ||
      !isValidDate(timeDate)
    ) {
      console.log(`⏩ 除外: ${normalizedPath}（日付が不完全）`);

      articleMap.delete(normalizedPath);
      continue;
    }

    let content =
      document.querySelector("main")?.textContent?.trim() ||
      document.querySelector("article")?.textContent?.trim() ||
      document.body.textContent.trim();
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
      path: cleanUrl,
      filePath: normalizedPath,
      content,
      image,
      datePublished,
      dateModified
    });

    console.log(`✅ 記事データ更新: ${normalizedPath} -> URL: ${cleanUrl}`);
  }
  
  const articles = Array.from(articleMap.values()).sort((a, b) => {
    const dateA = new Date(a.datePublished || 0);
    const dateB = new Date(b.datePublished || 0);
    return dateB - dateA;
  });

  await fs.writeFile(JSON_FILE, JSON.stringify(articles, null, 2), "utf-8");
  console.log(`🎉 完了！articles.json を更新 (${articles.length} 件)`);
})();