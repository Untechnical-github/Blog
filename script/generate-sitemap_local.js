const fs = require("fs");
const fsPromises = fs.promises;
const path = require("path");
const glob = require("glob");
const { JSDOM } = require("jsdom");
const { XMLParser, XMLBuilder } = require("fast-xml-parser");
const { execSync } = require("child_process");

const BASE_URL = "https://untechnical.info";
const SITEMAP_FILE = "sitemap.xml";

const getJSTDate = () => {
  const now = new Date();
  const jstOffset = 9 * 60;
  return new Date(now.getTime() + (jstOffset + now.getTimezoneOffset()) * 60000);
};
const formatDateISO = (date) => date.toISOString().split("T")[0];
const formatDateJapanese = (date) =>
  `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;

const normalizePath = (p) =>
  path.normalize(p).replace(/\\/g, "/").replace(/^\.\//, "");

const getCleanUrl = (filePath) => {

  let p = normalizePath(filePath);

  p = p.replace(/^articles\//, '');

  p = p.replace(/\/index\.html$/, '').replace(/\.html$/, '');

  const parts = p.split('/');

  if (parts.length >= 2) {
    const fileName = parts[parts.length - 1];
    const parentDir = parts[parts.length - 2];
    if (fileName === parentDir) {
      parts.pop();
    }
  }

  const joined = parts.join('/');
  return joined ? '/' + joined : '';
};

function getAllHtmlFiles() {
  return glob.sync("**/*.html").map(f => f.replace(/\\/g, "/"));
}

function extractContent(html) {
  if (!html) return "";
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  doc.querySelectorAll('script, style, link, noscript, iframe').forEach(el => el.remove());

  const title = doc.querySelector('title')?.textContent?.trim() || "";
  const category = doc.querySelector("meta[name='category']")?.getAttribute("content") || "";
  const bodyText = doc.body?.textContent?.replace(/\s+/g, " ").trim() || "";

  return JSON.stringify({ title, category, bodyText });
}

function hasMeaningfulChange(file) {
  try {
    const newHtml = fs.readFileSync(file, "utf-8");
    let oldHtml = "";
    try {
      oldHtml = execSync(`git show HEAD~1:${file}`, { stdio: ['pipe','pipe','ignore'] }).toString();
    } catch {
      return true;
    }
    return extractContent(newHtml) !== extractContent(oldHtml);
  } catch {
    return true;
  }
}

async function updateFileDates(file, isoDate, jpDate) {
  let html = await fsPromises.readFile(file, "utf-8");

  html = html.replace(
    /(<time[^>]*class="modified"[^>]*datetime=")([^"]*)("[^>]*>)(最終更新日：)?(.*?)(<\/time>)/s,
    `$1${isoDate}$3最終更新日：${jpDate}$6`
  );

  const jsonLdRegex = /("dateModified"\s*:\s*")(\d{4}-\d{2}-\d{2}|[\d-]*--?)(")/;
  if (jsonLdRegex.test(html)) {
    html = html.replace(jsonLdRegex, `$1${isoDate}$3`);
  }

  await fsPromises.writeFile(file, html, "utf-8");
}

async function updateSitemap(urlMap) {
  const builder = new XMLBuilder({ ignoreAttributes: false, format: true });
  const updatedSitemap = builder.build({
    urlset: {
      "@_xmlns": "http://www.sitemaps.org/schemas/sitemap/0.9",
      url: Array.from(urlMap.values())
    }
  });
  await fsPromises.writeFile(SITEMAP_FILE, updatedSitemap, "utf-8");
}

(async () => {
  const htmlFiles = getAllHtmlFiles();
  console.log(`🔍 発見した HTML 総数: ${htmlFiles.length}`);

  let urlMap = new Map();
  try {
    const xml = await fsPromises.readFile(SITEMAP_FILE, "utf-8");
    const parser = new XMLParser({ ignoreAttributes: false });
    const sitemap = parser.parse(xml);
    const urls = sitemap.urlset && sitemap.urlset.url
      ? (Array.isArray(sitemap.urlset.url) ? sitemap.urlset.url : [sitemap.urlset.url])
      : [];
    urls.forEach(u => urlMap.set(u.loc, u));
    console.log("📄 既存 sitemap.xml をロードしました");
  } catch {
    console.log("⚠️ sitemap.xml が見つかりません。新規作成します");
  }

  const nowJST = getJSTDate();
  const isoDate = formatDateISO(nowJST);
  const jpDate = formatDateJapanese(nowJST);

  const targetFiles = htmlFiles.filter(f => f !== "index.html" && f !== "policy.html");

  for (const file of targetFiles) {

    if (!hasMeaningfulChange(file)) {
      console.log(`⏩ 本文変更なし: ${file}`);
      continue;
    }

    const relativeUrl = getCleanUrl(file);
    const fullUrl = `${BASE_URL}${relativeUrl}`;

    try {
      await updateFileDates(file, isoDate, jpDate);
      console.log(`✏️ 更新完了: ${file} -> URL: ${fullUrl}`);

      urlMap.set(fullUrl, { loc: fullUrl, lastmod: isoDate });
    } catch (err) {
      console.error(`❌ エラー: ${file} 更新失敗`, err);
    }
  }

  await updateSitemap(urlMap);
  console.log("🚀 sitemap.xml 更新完了");
})();