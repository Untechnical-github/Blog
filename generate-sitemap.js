const fs = require("fs/promises");
const path = require("path");
const { execSync } = require("child_process");
const glob = require("glob");
const { XMLParser, XMLBuilder } = require("fast-xml-parser");

const BASE_URL = "https://untechnical.info";
const SITEMAP_FILE = "sitemap.xml";

const changedFiles = execSync("git diff --name-only HEAD^ HEAD")
  .toString()
  .split("\n")
  .filter(f => f.endsWith(".html"));

const getGitDate = (file) => {
  try {
    return execSync(`git log -1 --format="%cI" "${file}"`).toString().trim();
  } catch {
    return new Date().toISOString();
  }
};

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

(async () => {
  let sitemap = { urlset: { url: [] } };

  try {
    const xml = await fs.readFile(SITEMAP_FILE, "utf-8");
    const parser = new XMLParser({ ignoreAttributes: false });
    sitemap = parser.parse(xml);
  } catch {
    console.log("⚠️ 既存 sitemap.xml が見つかりません。新規作成します。");
  }

  const urlMap = new Map();
  const existingUrls = sitemap.urlset?.url || [];
  const urls = Array.isArray(existingUrls) ? existingUrls : [existingUrls];
  urls.forEach(entry => urlMap.set(entry.loc, entry));

  for (const file of changedFiles) {
    const relativeUrl = "/" + file.replace(/index\.html$/, "").replace(/\.html$/, "");
    const fullUrl = `${BASE_URL}${relativeUrl}`;
    const lastmod = getGitDate(file).split("T")[0];

    let oldHtml;
    try {
      oldHtml = execSync(`git show HEAD^:${file}`).toString();
    } catch {
      oldHtml = "";
    }

    const newHtml = await fs.readFile(file, "utf-8");

    if (!hasVisibleChange(oldHtml, newHtml)) {
      console.log(`⏩ ${file} の本文に変更なし → 最終更新日は変更しません`);
      continue;
    }

    const [year, month, day] = lastmod.split("-");
    const japaneseDate = `${year}年${parseInt(month)}月${parseInt(day)}日`;

    urlMap.set(fullUrl, { loc: fullUrl, lastmod });

    let updatedHtml = newHtml;

    updatedHtml = updatedHtml.replace(
      /(<time datetime=")(\d{4}-\d{2}-\d{2})(">最終更新日：)([^<]+)(<\/time>)/,
      `${'$1'}${lastmod}${'$3'}${japaneseDate}${'$5'}`
    );

    updatedHtml = updatedHtml.replace(
      /("dateModified"\s*:\s*")(\d{4}-\d{2}-\d{2})(")/,
      `$1${lastmod}$3`
    );

    await fs.writeFile(file, updatedHtml, "utf-8");
    console.log(`✅ ${file} の最終更新日を ${japaneseDate} に更新（timeタグ & JSON-LD）`);
  }

  const builder = new XMLBuilder({ ignoreAttributes: false, format: true });
  const updatedSitemap = builder.build({
    urlset: {
      "@_xmlns": "http://www.sitemaps.org/schemas/sitemap/0.9",
      url: Array.from(urlMap.values())
    }
  });

  await fs.writeFile(SITEMAP_FILE, updatedSitemap, "utf-8");
  console.log("✅ sitemap.xml を更新しました");
})();