const fs = require("fs/promises");
const { execSync } = require("child_process");
const { JSDOM } = require("jsdom");

const JSON_FILE = "articles.json";

const BASE_URL = "https://untechnical.info/";

const changedFiles = execSync("git diff --name-only HEAD^ HEAD")
  .toString()
  .split("\n")
  .filter(f => f.endsWith(".html") && f !== "index.html" && f !== "policy.html");

(async () => {
  let articleMap = new Map();

  try {
    const data = await fs.readFile(JSON_FILE, "utf-8");
    JSON.parse(data).forEach(article => articleMap.set(article.path, article));
  } catch {}

  for (const file of changedFiles) {
    const html = await fs.readFile(file, "utf-8");
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const title =
      document.querySelector("title")?.textContent?.trim() ||
      document.querySelector("h1")?.textContent?.trim() ||
      "";

    const metaCategory = document.querySelector("meta[name='category']")?.getAttribute("content") || "";
    const categories = metaCategory.split(",").map(c => c.trim()).filter(Boolean);

    let content =
      document.querySelector("main")?.textContent?.trim() ||
      document.querySelector("article")?.textContent?.trim() ||
      document.body.textContent.trim();

    content = content.replace(/\s+/g, " ").trim();

    const relativeImagePath =
      document.querySelector("main img, article img, body img")?.getAttribute("src") || "";
    
    let image = "";
    if (relativeImagePath) {

      const fileUrl = new URL(file, BASE_URL).href;
      image = new URL(relativeImagePath, fileUrl).href;
    }

    articleMap.set(file, { title, category: categories, path: file, content, image });
  }

  const articles = Array.from(articleMap.values()).reverse();
  await fs.writeFile(JSON_FILE, JSON.stringify(articles, null, 2), "utf-8");
  console.log(`✅ articles.json updated (${articles.length} articles, newest first)`);
})();