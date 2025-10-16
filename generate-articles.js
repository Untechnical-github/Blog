const fs = require("fs/promises");
const { execSync } = require("child_process");
const { JSDOM } = require("jsdom");

const JSON_FILE = "articles.json";
const BASE_URL = "https://untechnical.info/";

const changedFiles = execSync("git diff --name-only HEAD^ HEAD")
  .toString()
  .split("\n")
  .filter(f => f.endsWith(".html") && f !== "index.html" && f !== "policy.html");

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

(async () => {
  let articleMap = new Map();

  try {
    const data = await fs.readFile(JSON_FILE, "utf-8");
    JSON.parse(data).forEach(article => articleMap.set(article.path, article));
  } catch {}

  for (const file of changedFiles) {
    let oldHtml;
    try {
      oldHtml = execSync(`git show HEAD^:${file}`).toString();
    } catch {
      oldHtml = "";
    }

    const newHtml = await fs.readFile(file, "utf-8");
    if (!hasVisibleChange(oldHtml, newHtml)) {
      console.log(`⏩ ${file} の本文に変更なし → articles.jsonは更新しません`);
      continue;
    }

    const dom = new JSDOM(newHtml);
    const document = dom.window.document;

    const title =
      document.querySelector("title")?.textContent?.trim() ||
      document.querySelector("h1")?.textContent?.trim() ||
      "";

    const metaCategory =
      document.querySelector("meta[name='category']")?.getAttribute("content") || "";
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

    articleMap.set(file, {
      title,
      category: categories,
      path: file,
      content,
      image,
      datePublished,
      dateModified
    });

    console.log(`✅ ${file} の本文変更を検出 → articles.jsonに反映`);
  }

  const articles = Array.from(articleMap.values()).sort((a, b) => {
    const dateA = new Date(a.datePublished || 0);
    const dateB = new Date(b.datePublished || 0);
    return dateB - dateA;
  });

  await fs.writeFile(JSON_FILE, JSON.stringify(articles, null, 2), "utf-8");
  console.log(`✅ articles.json updated (${articles.length} articles, newest first)`);
})();