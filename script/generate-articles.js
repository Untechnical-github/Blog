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

  const changedFiles = process.argv
    .slice(2)
    .filter(f => f.endsWith(".html") && f !== "index.html" && f !== "policy.html");

  for (const file of changedFiles) {
    const normalizedPath = normalizePath(file);

    const newHtml = await fs.readFile(file, "utf-8");
    const dom = new JSDOM(newHtml);
    const document = dom.window.document;

    const robotsMeta = document.querySelector("meta[name='robots']");
    const robotsContent = robotsMeta?.getAttribute("content")?.toLowerCase() || "";
    const visibility = robotsContent.includes("noindex")
      ? "private"
      : "public";

    const targetElement =
      document.querySelector("main") ||
      document.querySelector("article") ||
      document.body;

    const clone = targetElement.cloneNode(true);
    clone.querySelectorAll("script, style, noscript, iframe")
      .forEach(el => el.remove());

    let content = clone.textContent?.trim() || "";
    content = content.replace(/\s+/g, " ").trim();

    const title =
      document.querySelector("title")?.textContent?.trim() ||
      document.querySelector("h1")?.textContent?.trim() || "";

    const metaCategory =
      document.querySelector("meta[name='category']")
        ?.getAttribute("content") || "";
    const categories = metaCategory
      .split(",")
      .map(c => c.trim())
      .filter(Boolean);

    const relativeImagePath =
      document.querySelector("main img, article img, body img")
        ?.getAttribute("src") || "";
    let image = "";
    if (relativeImagePath) {
      const fileUrl = new URL(normalizedPath, BASE_URL).href;
      image = new URL(relativeImagePath, fileUrl).href;
    }

    let datePublished = "";
    let dateModified = "";
    const ldJsonScript =
      document.querySelector("script[type='application/ld+json']");
    if (ldJsonScript) {
      try {
        const ldData = JSON.parse(ldJsonScript.textContent);
        datePublished = ldData.datePublished || "";
        dateModified = ldData.dateModified || "";
      } catch {
        console.warn(`⚠️ JSON-LD parse error in ${normalizedPath}`);
      }
    }

    const isInvalidDate = (dateStr) =>
      !dateStr || dateStr.includes("--") || dateStr.includes("年月日");

    if (isInvalidDate(datePublished) || isInvalidDate(dateModified)) {
      console.log(
        `⛔ ${normalizedPath} は日付が不完全なため articles.json から除外します`
      );
      articleMap.delete(normalizedPath);
      continue;
    }

    articleMap.set(normalizedPath, {
      title,
      category: categories,
      path: normalizedPath,
      content,
      image,
      datePublished,
      dateModified,
      visibility
    });

    console.log(
      `✅ ${normalizedPath} を articles.json に登録 (${visibility})`
    );
  }

  const articles = Array.from(articleMap.values()).sort((a, b) => {
    const dateA = new Date(a.datePublished || 0);
    const dateB = new Date(b.datePublished || 0);
    return dateB - dateA;
  });

  await fs.writeFile(
    JSON_FILE,
    JSON.stringify(articles, null, 2),
    "utf-8"
  );

  console.log(`✅ articles.json updated (${articles.length} articles)`);
})();
