const fs = require("fs/promises");
const path = require("path");
const { JSDOM } = require("jsdom");

const JSON_FILE = "articles.json";
const BASE_URL = "https://untechnical.info/";

(async () => {
  let articleMap = new Map();

  // 既存 articles.json を読み込む
  try {
    const data = await fs.readFile(JSON_FILE, "utf-8");
    JSON.parse(data).forEach(article => {
      articleMap.set(article.path, article);
    });
  } catch {}

  // 対象の HTML ファイル
  const changedFiles = process.argv
    .slice(2)
    .filter(f => f.endsWith(".html") && f !== "index.html" && f !== "policy.html");

  for (const file of changedFiles) {
    // パスを正規化 → 同じ記事は常に同じキーになる
    const normalizedPath = path.normalize(file).replace(/\\/g, "/");

    const newHtml = await fs.readFile(file, "utf-8");

    const dom = new JSDOM(newHtml);
    const document = dom.window.document;

    // 本文
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

    // 画像
    const relativeImagePath =
      document.querySelector("main img, article img, body img")?.getAttribute("src") || "";
    let image = "";
    if (relativeImagePath) {
      const fileUrl = new URL(normalizedPath, BASE_URL).href;
      image = new URL(relativeImagePath, fileUrl).href;
    }

    // JSON-LD
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

    // 旧記事と比較（キーは normalizedPath）
    const oldArticle = articleMap.get(normalizedPath);

    const isChanged =
      !oldArticle ||
      oldArticle.content !== content ||
      oldArticle.dateModified !== dateModified;

    if (!isChanged) {
      console.log(`⏩ ${normalizedPath} に本文・更新日変更なし → articles.json は更新しません`);
      continue;
    }

    // 上書き (重複せず確実に 1 件だけ)
    articleMap.set(normalizedPath, {
      title,
      category: categories,
      path: normalizedPath,
      content,
      image,
      datePublished,
      dateModified
    });

    console.log(`✅ ${normalizedPath} → 更新を検知し articles.json に反映`);
  }

  const articles = Array.from(articleMap.values()).sort((a, b) => {
    const dateA = new Date(a.datePublished || 0);
    const dateB = new Date(b.datePublished || 0);
    return dateB - dateA;
  });

  await fs.writeFile(JSON_FILE, JSON.stringify(articles, null, 2), "utf-8");
  console.log(`✅ articles.json updated (${articles.length} articles)`);
})();
