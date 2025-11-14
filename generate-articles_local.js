const fs = require("fs/promises");
const path = require("path");
const { JSDOM } = require("jsdom");

const JSON_FILE = "articles.json";
const BASE_URL = "https://untechnical.info/";

// ----------------------------
// パスを完全統一する関数
// ----------------------------
const normalizePath = (p) =>
  path.normalize(p)
    .replace(/\\/g, "/")
    .replace(/^\.\//, "");

// ----------------------------
// yyyy-mm-dd 形式の妥当性チェック
// ----------------------------
function isValidDate(dateStr) {
  if (!dateStr) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  if (dateStr.includes("--")) return false;
  return true;
}

// ----------------------------
// time datetime の妥当性チェック
// ----------------------------
function getTimeTagDate(document) {
  const t = document.querySelector("time[datetime]");
  if (!t) return "";
  const dt = t.getAttribute("datetime");
  if (!dt || dt.includes("--") || !/^\d{4}-\d{2}-\d{2}$/.test(dt)) return "";
  return dt;
}

// ----------------------------
// 指定ディレクトリ配下の HTML をすべて取得
// ----------------------------
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

// ----------------------------
// メイン処理
// ----------------------------
(async () => {
  let articleMap = new Map();

  // 既存 articles.json 読み込み
  try {
    const data = await fs.readFile(JSON_FILE, "utf-8");
    JSON.parse(data).forEach(article => {
      const key = normalizePath(article.path);
      articleMap.set(key, { ...article, path: key });
    });
  } catch {
    console.log("⚠️ articles.json が存在しないため、新規作成します");
  }

  // ------------------------------------------------
  // 1. 全 HTML を探索（index.html と policy.html は除外）
  // ------------------------------------------------
  const htmlFiles = await getAllHtmlFiles(".");
  console.log(`📄 発見した HTML 数: ${htmlFiles.length}`);

  for (const file of htmlFiles) {
    const normalizedPath = normalizePath(file);
    const html = await fs.readFile(file, "utf-8");

    const dom = new JSDOM(html);
    const document = dom.window.document;

    // ----------------------------
    // JSON-LD 日付取得
    // ----------------------------
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

    // ----------------------------
    // time datetime 日付チェック
    // ----------------------------
    const timeDate = getTimeTagDate(document);

    // ----------------------------
    // ❌ 日付が不完全なら除外
    // ----------------------------
    if (
      !isValidDate(datePublished) ||
      !isValidDate(dateModified) ||
      !isValidDate(timeDate)
    ) {
      console.log(`⏩ 除外: ${normalizedPath}（日付が不完全）`);
      continue;
    }

    // ----------------------------
    // 本文
    // ----------------------------
    let content =
      document.querySelector("main")?.textContent?.trim() ||
      document.querySelector("article")?.textContent?.trim() ||
      document.body.textContent.trim();
    content = content.replace(/\s+/g, " ").trim();

    // タイトル
    const title =
      document.querySelector("title")?.textContent?.trim() ||
      document.querySelector("h1")?.textContent?.trim() ||
      "";

    // カテゴリ
    const metaCategory =
      document.querySelector("meta[name='category']")?.getAttribute("content") || "";
    const categories = metaCategory.split(",").map(c => c.trim()).filter(Boolean);

    // 画像URL
    const relativeImagePath =
      document.querySelector("main img, article img, body img")?.getAttribute("src") || "";
    let image = "";
    if (relativeImagePath) {
      const fileUrl = new URL(normalizedPath, BASE_URL).href;
      image = new URL(relativeImagePath, fileUrl).href;
    }

    // ----------------------------
    // 記事登録
    // ----------------------------
    articleMap.set(normalizedPath, {
      title,
      category: categories,
      path: normalizedPath,
      content,
      image,
      datePublished,
      dateModified
    });

    console.log(`✅ 記事データ更新: ${normalizedPath}`);
  }

  // ------------------------------------------------
  // 2. 日付順にソートして保存
  // ------------------------------------------------
  const articles = Array.from(articleMap.values()).sort((a, b) => {
    const dateA = new Date(a.datePublished || 0);
    const dateB = new Date(b.datePublished || 0);
    return dateB - dateA;
  });

  await fs.writeFile(JSON_FILE, JSON.stringify(articles, null, 2), "utf-8");
  console.log(`🎉 完了！articles.json を更新 (${articles.length} 件)`);
})();
