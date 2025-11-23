const fs = require("fs/promises");
const { XMLParser, XMLBuilder } = require("fast-xml-parser");
const path = require("path");

const BASE_URL = "https://untechnical.info";
const SITEMAP_FILE = "sitemap.xml";

const getJSTDate = () => {
  const now = new Date();
  const jstOffset = 9 * 60;
  const jstDate = new Date(now.getTime() + (jstOffset + now.getTimezoneOffset()) * 60000);
  return jstDate;
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

(async () => {
  const changedFiles = process.argv
    .slice(2)
    .filter(f => f.endsWith(".html") && f !== "index.html" && f !== "policy.html");

  if (changedFiles.length === 0) {
    console.log("⏩ 変更されたHTMLファイルはありません。");
  } else {
    console.log(`🔍 変更ファイル: ${changedFiles.join(", ")}`);
  }

  let sitemap = { urlset: { url: [] } };
  try {
    const xml = await fs.readFile(SITEMAP_FILE, "utf-8");
    const parser = new XMLParser({ ignoreAttributes: false });
    sitemap = parser.parse(xml);
  } catch {
    console.log("⚠️ 既存 sitemap.xml が見つかりません。新規作成します。");
  }

  const urlMap = new Map();

  const urls = sitemap.urlset && sitemap.urlset.url 
    ? (Array.isArray(sitemap.urlset.url) ? sitemap.urlset.url : [sitemap.urlset.url])
    : [];
  
  urls.forEach(entry => urlMap.set(entry.loc, entry));

  const nowJST = getJSTDate();
  const isoDate = formatDateISO(nowJST);
  const jpDate = formatDateJapanese(nowJST);

  for (const file of changedFiles) {

    const relativeUrl = getCleanUrl(file);
    const fullUrl = `${BASE_URL}${relativeUrl}`;

    try {
      let html = await fs.readFile(file, "utf-8");

      const pubMatch = html.match(/<time[^>]*class="published"[^>]*datetime="([\d-]+)"[^>]*>/);
      const publishedISO = pubMatch ? pubMatch[1] : null;

      const isDraft =
        !publishedISO ||
        /--/.test(publishedISO) ||
        publishedISO.length < 10;

      if (isDraft) {
        console.log(`⛔ Skipping ${file}: 公開日未確定のため sitemap 登録なし`);
        if (urlMap.has(fullUrl)) {
          urlMap.delete(fullUrl);
          console.log(`🗑️ ${file} を sitemap から削除しました。`);
        }
        continue;
      }

      html = html.replace(
        /(<time[^>]*class="modified"[^>]*datetime=")([^"]*)("[^>]*>)(最終更新日：)?(.*?)(<\/time>)/s,
        `$1${isoDate}$3最終更新日：${jpDate}$6`
      );

      const jsonLdRegex = /("dateModified"\s*:\s*")(\d{4}-\d{2}-\d{2}|[\d-]*--?)(")/;
      if (jsonLdRegex.test(html)) {
        html = html.replace(jsonLdRegex, `$1${isoDate}$3`);
      }

      await fs.writeFile(file, html, "utf-8");
      console.log(`✏️ 更新完了: ${file}`);

      urlMap.set(fullUrl, { loc: fullUrl, lastmod: isoDate });
      console.log(`🗺️ Sitemap URL: ${fullUrl}`);

    } catch (err) {
      console.error(`❌ エラー: ${file} 処理失敗`, err);
    }
  }

  const builder = new XMLBuilder({ ignoreAttributes: false, format: true });
  const updatedSitemap = builder.build({
    urlset: {
      "@_xmlns": "http://www.sitemaps.org/schemas/sitemap/0.9",
      url: Array.from(urlMap.values())
    }
  });

  await fs.writeFile(SITEMAP_FILE, updatedSitemap, "utf-8");
  console.log("🚀 sitemap.xml 更新完了");
})();