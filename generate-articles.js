const fs = require("fs/promises");
const { execSync } = require("child_process");
const { JSDOM } = require("jsdom");

const ARTICLES_FILE = "articles.json";
const BASE_URL = "https://untechnical.info";

const changedFiles = execSync("git diff --name-only origin/main...HEAD")
  .toString()
  .split("\n")
  .filter(f => f.endsWith(".html") && f.trim().length > 0);

const extractBodyContent = (html) => {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1].trim() : "";
};

const hasVisibleChange = (oldHtml, newHtml) => {
  const oldBody = extractBodyContent(oldHtml)
    .replace(/\s+/g, " ")
    .replace(/<!--.*?-->/g, "");
  const newBody = extractBodyContent(newHtml)
    .replace(/\s+/g, " ")
    .replace(/<!--.*?-->/g, "");
  return oldBody !== newBody;
};

const getGitDate = (file) => {
  try {
    return execSync(`git log -1 --format="%cI" "${file}"`).toString().trim();
  } catch {
    return new Date().toISOString();
  }
};

// ✅ HTML から記事情報を抽出
const extractArticleData = (html, filePath) => {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const title = doc.querySelector("title")?.textContent.trim() || "無題の記事";

  // ✅ 複数metaタグまたはカンマ区切りカテゴリ対応
  const categories = Array.from(doc.querySelectorAll('meta[name="category"]'))
    .flatMap(meta => meta.getAttribute("content").split(","))
    .map(c => c.trim())
    .filter(Boolean);

  const contentText = doc.body.textContent
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);

  const image =
    doc.querySelector('meta[property="og:image"]')?.getAttribute("content") ||
    `${BASE_URL}/${filePath.replace(/\.html$/, ".jpg")}`;

  const times = doc.querySelectorAll("time[datetime]");
  const datePublished = times[0]?.getAttribute("datetime") || getGitDate(filePath).split("T")[0];
  const dateModified = times[1]?.getAttribute("datetime") || datePublished;

  return {
    title,
    category: [...new Set(categories)], // ✅ 重複削除
    path: filePath,
    content: contentText,
    image,
    datePublished,
    dateModified
  };
};

(async () => {
  let articles = [];
  try {
    const json = await fs.readFile(ARTICLES_FILE, "utf-8");
    articles = JSON.parse(json);
  } catch {
    console.log("⚠️ 既存 articles.json が見つかりません。新規作成します。");
  }

  const articleMap = new Map(articles.map(a => [a.path, a]));

  for (const file of changedFiles) {
    let oldHtml;
    try {
      oldHtml = execSync(`git show origin/main:${file}`).toString();
    } catch {
      oldHtml = "";
    }

    const newHtml = await fs.readFile(file, "utf-8");

    if (!hasVisibleChange(oldHtml, newHtml)) {
      console.log(`⏩ ${file} の本文に変更なし → articles.json は変更しません`);
      continue;
    }

    const data = extractArticleData(newHtml, file);
    articleMap.set(file, data);
    console.log(`✅ ${file} の記事情報を更新しました`);
  }

  // ✅ 公開日（新しい順）で並べ替え
  const updatedArticles = Array.from(articleMap.values()).sort(
    (a, b) => new Date(b.datePublished) - new Date(a.datePublished)
  );

  await fs.writeFile(ARTICLES_FILE, JSON.stringify(updatedArticles, null, 2), "utf-8");
  console.log("✅ articles.json を更新しました");
})();
