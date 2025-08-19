const fs = require("fs/promises");
const glob = require("glob");
const { JSDOM } = require("jsdom");

const JSON_FILE = "articles.json";

// 全 HTML を取得（index.html は除外）
const htmlFiles = glob.sync("**/*.html", { ignore: "index.html" });

(async () => {
  let articleMap = new Map();

  // 既存 JSON をロード（上書きではなく更新用）
  try {
    const data = await fs.readFile(JSON_FILE, "utf-8");
    JSON.parse(data).forEach(article => articleMap.set(article.path, article));
  } catch {}

  for (const file of htmlFiles) {
    const html = await fs.readFile(file, "utf-8");
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // タイトル
    const title = document.querySelector("title")?.textContent?.trim() || document.querySelector("h1")?.textContent?.trim() || "";

    // カテゴリ：<meta name="category" content="Android, iOS"> などでもOK
    let dataCategory = document.querySelector(".post")?.getAttribute("data-category") || "";
    const categories = dataCategory.split(",").map(c => c.trim()).filter(Boolean);

    // 本文全文
    const mainContent = document.querySelector("main")?.textContent?.trim() || "";

    articleMap.set(file, { title, category: categories, path: file, content: mainContent });
  }

  const articles = Array.from(articleMap.values());
  await fs.writeFile(JSON_FILE, JSON.stringify(articles, null, 2), "utf-8");
  console.log(`✅ articles.json updated (${articles.length} articles)`);
})();
