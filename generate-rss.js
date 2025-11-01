const fs = require("fs/promises");
const { execSync } = require("child_process");
const { JSDOM } = require("jsdom");
const { XMLBuilder } = require("fast-xml-parser");

const RSS_FILE = "rss.xml";
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

const getGitDate = (file) => {
  try {
    return execSync(`git log -1 --format="%cI" "${file}"`).toString().trim();
  } catch {
    return new Date().toISOString();
  }
};

(async () => {
  let articles = [];

  try {
    const data = await fs.readFile("articles.json", "utf-8");
    articles = JSON.parse(data);
  } catch {
    console.warn("⚠️ articles.json が見つかりません。新規作成します。");
  }

  for (const file of changedFiles) {
    let oldHtml;
    try {
      oldHtml = execSync(`git show HEAD^:${file}`).toString();
    } catch {
      oldHtml = "";
    }

    const newHtml = await fs.readFile(file, "utf-8");
    if (!hasVisibleChange(oldHtml, newHtml)) {
      console.log(`⏩ ${file} の本文に変更なし → RSSは更新しません`);
      continue;
    }

    const dom = new JSDOM(newHtml);
    const document = dom.window.document;

    const title =
      document.querySelector("title")?.textContent?.trim() ||
      document.querySelector("h1")?.textContent?.trim() ||
      "";

    const description =
      document.querySelector("meta[name='description']")?.getAttribute("content")?.trim() ||
      document.querySelector("article")?.textContent?.trim().slice(0, 160) ||
      document.querySelector("main")?.textContent?.trim().slice(0, 160) ||
      "";

    const datePublished =
      document.querySelector("time[datetime]")?.getAttribute("datetime") ||
      getGitDate(file).split("T")[0];

    const fullUrl = new URL(file, BASE_URL).href;

    const existingIndex = articles.findIndex(a => a.path === file);
    const newData = { title, description, url: fullUrl, datePublished, path: file };

    if (existingIndex >= 0) {
      articles[existingIndex] = { ...articles[existingIndex], ...newData };
    } else {
      articles.push(newData);
    }

    console.log(`✅ ${file} の本文変更を検出 → RSS用データ更新`);
  }

  articles.sort((a, b) => new Date(b.datePublished) - new Date(a.datePublished));

  const rss = {
    rss: {
      "@_version": "2.0",
      channel: {
        title: "Untechnical",
        link: BASE_URL,
        description: "高度情報社会の最先端を駆け抜ける",
        language: "ja",
        lastBuildDate: new Date(articles[0]?.datePublished || Date.now()).toUTCString(),
        item: articles.slice(0, 50).map(article => ({
          title: article.title,
          link: article.url,
          guid: article.url,
          pubDate: new Date(article.datePublished).toUTCString(),
          description: article.description,
        })),
      },
    },
  };

  const builder = new XMLBuilder({ ignoreAttributes: false, format: true });
  const xmlContent = builder.build(rss);
  const xmlWithHeader = `<?xml version="1.0" encoding="UTF-8"?>\n${xmlContent}`;

  await fs.writeFile(RSS_FILE, xmlWithHeader, "utf-8");
  console.log("✅ rss.xml を更新しました");
})();
