const fs = require("fs/promises");
const { execSync } = require("child_process");
const { XMLParser, XMLBuilder } = require("fast-xml-parser");

const BASE_URL = "https://untechnical.info";
const SITEMAP_FILE = "sitemap.xml";

const getChangedHtmlFiles = () => {
  return execSync("git diff --name-only HEAD^ HEAD")
    .toString()
    .split("\n")
    .filter(f => f.endsWith(".html"));
};

const getGitLastModifiedDate = (file) => {
  try {
    return execSync(`git log -1 --format="%cI" "${file}"`).toString().trim();
  } catch {
    return new Date().toISOString();
  }
};

const formatJapaneseDate = (isoString) => {
  const d = new Date(isoString);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
};

const updateHtmlLastmod = async (filePath, lastmodISO) => {
  try {
    let content = await fs.readFile(filePath, "utf-8");

    content = content.replace(
      /<time datetime="(\d{4}-\d{2}-\d{2})">最終更新日：[^<]+<\/time>/,
      `<time datetime="${lastmodISO.slice(0, 10)}">最終更新日：${formatJapaneseDate(lastmodISO)}</time>`
    );

    await fs.writeFile(filePath, content, "utf-8");
    console.log(`✅ 最終更新日を更新: ${filePath}`);
  } catch (err) {
    console.warn(`⚠️ HTML更新失敗: ${filePath} - ${err.message}`);
  }
};

const updateSitemap = async (changedFiles) => {
  let sitemap = { urlset: { url: [] } };

  try {
    const xml = await fs.readFile(SITEMAP_FILE, "utf-8");
    const parser = new XMLParser({ ignoreAttributes: false });
    sitemap = parser.parse(xml);
  } catch {
    console.log("ℹ️ sitemap.xml が見つかりません。新規作成します。");
  }

  const urlMap = new Map();
  const existingUrls = sitemap.urlset?.url || [];
  const urls = Array.isArray(existingUrls) ? existingUrls : [existingUrls];

  urls.forEach(entry => {
    urlMap.set(entry.loc, entry);
  });

  for (const file of changedFiles) {
    const relativeUrl = "/" + file.replace(/index\.html$/, "").replace(/\.html$/, "");
    const fullUrl = `${BASE_URL}${relativeUrl}`;
    const lastmod = getGitLastModifiedDate(file);

    urlMap.set(fullUrl, { loc: fullUrl, lastmod });

    await updateHtmlLastmod(file, lastmod);
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
};

(async () => {
  const changedFiles = getChangedHtmlFiles();
  if (changedFiles.length === 0) {
    console.log("📁 HTMLの変更はありません。");
    return;
  }

  await updateSitemap(changedFiles);
})();
