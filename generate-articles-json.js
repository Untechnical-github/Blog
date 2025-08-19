const fs = require("fs/promises");
const { execSync } = require("child_process");
const { JSDOM } = require("jsdom");

const JSON_FILE = "articles.json";

// Git で変更された HTML を取得（index.html は除外）
const changedFiles = execSync("git diff --name-only HEAD^ HEAD")
  .toString()
  .split("\n")
  .filter(f => f.endsWith(".html") && f !== "index.html");

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

    const title = document.querySelector("title")?.textContent?.trim() || document.querySelector("h1")?.textContent?.trim() || "";
    const dataCategory = document.querySelector(".post")?.getAttribute("data-category") || "";
    const categories = dataCategory.split(",").map(c => c.trim()).filter(Boolean);
    const content = document.querySelector("main")?.textContent?.trim() || "";

    articleMap.set(file, { title, category: categories, path: file, content });
  }

  const articles = Array.from(articleMap.values());
  await fs.writeFile(JSON_FILE, JSON.stringify(articles, null, 2), "utf-8");
  console.log(`✅ articles.json updated (${articles.length} articles)`);
})();
