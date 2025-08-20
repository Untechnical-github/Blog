const fs = require("fs/promises");
const { execSync } = require("child_process");
const { JSDOM } = require("jsdom");

const JSON_FILE = "articles.json";

// Git で変更された HTML を取得（index.html, policy.html は除外）
const changedFiles = execSync("git diff --name-only HEAD^ HEAD")
  .toString()
  .split("\n")
  .filter(f => f.endsWith(".html") && f !== "index.html" && f !== "policy.html");

(async () => {
  let articleMap = new Map();

  // 既存 JSON をロード
  try {
    const data = await fs.readFile(JSON_FILE, "utf-8");
    JSON.parse(data).forEach(article => articleMap.set(article.path, article));
  } catch {}

  for (const file of changedFiles) {
    const html = await fs.readFile(file, "utf-8");
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // タイトル
    const title =
      document.querySelector("title")?.textContent?.trim() ||
      document.querySelector("h1")?.textContent?.trim() ||
      "";

    // カテゴリ（metaタグ専用）
    const metaCategory = document.querySelector("meta[name='category']")?.getAttribute("content") || "";
    const categories = metaCategory.split(",").map(c => c.trim()).filter(Boolean);

    // 本文（全文）
    let content =
      document.querySelector("main")?.textContent?.trim() ||
      document.querySelector("article")?.textContent?.trim() ||
      document.body.textContent.trim();

    // 改行・余計な空白を整理（全文保持）
    content = content.replace(/\s+/g, " ").trim();

    // 記事の最初の画像（相対パスのまま保存）
    const image =
      document.querySelector("main img, article img, body img")?.getAttribute("src") || "";

    articleMap.set(file, { title, category: categories, path: file, content, image });
  }

  const articles = Array.from(articleMap.values());
  await fs.writeFile(JSON_FILE, JSON.stringify(articles, null, 2), "utf-8");
  console.log(`✅ articles.json updated (${articles.length} articles)`);
})();
