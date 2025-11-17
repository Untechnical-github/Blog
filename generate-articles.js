const fs = require("fs/promises");
const path = require("path");
const { JSDOM } = require("jsdom");

const JSON_FILE = "articles.json";
const BASE_URL = "https://untechnical.info/";

const normalizePath = (p) =>
  path.normalize(p).replace(/\\/g, "/").replace(/^\.\//, "");

(async () => {
  let articleMap = new Map();

  try {
    const data = await fs.readFile(JSON_FILE, "utf-8");
    JSON.parse(data).forEach(article => {
      const key = normalizePath(article.path);
      articleMap.set(key, { ...article, path: key });
    });
  } catch {}

  // 引数からファイルリストを取得
  const changedFiles = process.argv
    .slice(2)
    .filter(f => f.endsWith(".html") && f !== "index.html" && f !== "policy.html");

  for (const file of changedFiles) {
    const normalizedPath = normalizePath(file);
    
    // HTML読み込み (generate-sitemap.js で日付更新済みのものを読む)
    const newHtml = await fs.readFile(file, "utf-8");
    const dom = new JSDOM(newHtml);
    const document = dom.window.document;

    // 本文取得
    let content =
      document.querySelector("main")?.textContent?.trim() ||
      document.querySelector("article")?.textContent?.trim() ||
      document.body.textContent.trim();
    content = content.replace(/\s+/g, " ").trim();

    // タイトル
    const title =
      document.querySelector("title")?.textContent?.trim() ||
      document.querySelector("h1")?.textContent?.trim() || "";

    // カテゴリ
    const metaCategory =
      document.querySelector("meta[name='category']")?.getAttribute("content") || "";
    const categories = metaCategory.split(",").map(c => c.trim()).filter(Boolean);

    // 画像
    const relativeImagePath =
      document.querySelector("main img, article img, body img")?.getAttribute("src") || "";
    let image = "";
    if (relativeImagePath) {
      const fileUrl = new URL(normalizedPath, BASE_URL).href;
      image = new URL(relativeImagePath, fileUrl).href;
    }

    // JSON-LD から日付取得
    let datePublished = "";
    let dateModified = "";
    const ldJsonScript = document.querySelector("script[type='application/ld+json']");
    if (ldJsonScript) {
      try {
        const ldData = JSON.parse(ldJsonScript.textContent);
        datePublished = ldData.datePublished || "";
        dateModified = ldData.dateModified || ""; // ここは更新後の日付になっているはず
      } catch {
        console.warn(`⚠️ JSON-LD parse error in ${normalizedPath}`);
      }
    }

    // 日付が取得できない場合はスキップせず、今日の日付を入れるなどのフォールバックも検討可能
    // ここでは articles.json を更新
    articleMap.set(normalizedPath, {
      title,
      category: categories,
      path: normalizedPath,
      content,
      image,
      datePublished,
      dateModified
    });

    console.log(`✅ ${normalizedPath} を articles.json に更新登録 (Modified: ${dateModified})`);
  }

  // 日付順にソート
  const articles = Array.from(articleMap.values()).sort((a, b) => {
    const dateA = new Date(a.datePublished || 0);
    const dateB = new Date(b.datePublished || 0);
    return dateB - dateA;
  });

  await fs.writeFile(JSON_FILE, JSON.stringify(articles, null, 2), "utf-8");
  console.log(`✅ articles.json updated (${articles.length} articles)`);
})();