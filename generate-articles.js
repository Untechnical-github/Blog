const fs = require("fs/promises");
const { JSDOM } = require("jsdom");

const JSON_FILE = "articles.json";
const BASE_URL = "https://untechnical.info/";

(async () => {
  let articleMap = new Map();

  // 既存 articles.json を読み込む
  try {
    const data = await fs.readFile(JSON_FILE, "utf-8");
    JSON.parse(data).forEach(article => articleMap.set(article.path, article));
  } catch {}

  // 対象の HTML ファイル
  const changedFiles = process.argv.slice(2).filter(f => f.endsWith(".html") && f !== "index.html" && f !== "policy.html");

  const extractBodyContent = (html) => {
    const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return match ? match[1].trim() : "";
  };

  const hasVisibleChange = (oldHtml, newHtml) => {
    const normalize = (text) =>
      extractBodyContent(text)
        .replace(/\s+/g, " ")
        .replace(/<!--.*?-->/g, "");
    return normalize(oldHtml) !== normalize(newHtml);
  };

  for (const file of changedFiles) {
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
      const fileUrl = new URL(file, BASE_URL).href;
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
        dateModified = ldData.dateModified || "";
      } catch (e) {
        console.warn(`⚠️ JSON-LD parse error in ${file}`);
      }
    }

    // 本文が変わっていなくても、dateModified が変わっていれば更新する
    const oldArticle = articleMap.get(file);
    const isChanged = !oldArticle || oldArticle.content !== content || oldArticle.dateModified !== dateModified;

    if (!isChanged) {
      console.log(`⏩ ${file} に本文・更新日変更なし → articles.json は更新しません`);
      continue;
    }

    articleMap.set(file, {
      title,
      category: categories,
      path: file,
      content,
      image,
      datePublished,
      dateModified
    });

    console.log(`✅ ${file} の変更を検出 → articles.json に反映 (本文または更新日)`);
  }

  const articles = Array.from(articleMap.values()).sort((a, b) => {
    const dateA = new Date(a.datePublished || 0);
    const dateB = new Date(b.datePublished || 0);
    return dateB - dateA;
  });

  await fs.writeFile(JSON_FILE, JSON.stringify(articles, null, 2), "utf-8");
  console.log(`✅ articles.json updated (${articles.length} articles, newest first)`);
})();
