const fs = require("fs/promises");
const path = require("path");
const glob = require("glob");
const { JSDOM } = require("jsdom");
const { XMLParser, XMLBuilder } = require("fast-xml-parser");

const BASE_URL = "https://untechnical.info";
const SITEMAP_FILE = "sitemap.xml";

function isValidDate(dateStr) {
  if (!dateStr) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  if (dateStr.includes("--")) return false;
  return true;
}

function getAllHtmlFiles() {
  return glob.sync("**/*.html").map(f => f.replace(/\\/g, "/"));
}

async function getModifiedDateFromHtml(file) {
  const html = await fs.readFile(file, "utf-8");
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const ld = doc.querySelector('script[type="application/ld+json"]');
  if (ld) {
    try {
      const json = JSON.parse(ld.textContent);
      if (json.dateModified && isValidDate(json.dateModified.split("T")[0])) {
        return json.dateModified.split("T")[0];
      }
    } catch {}
  }

  const modifiedTag = doc.querySelector('time.modified[datetime]');
  if (modifiedTag) {
    const dt = modifiedTag.getAttribute("datetime")?.split("T")[0] ?? "";
    if (isValidDate(dt)) return dt;
  }

  return null;
}

function toUrl(file) {
  return `${BASE_URL}/${file
    .replace(/index\.html$/, "")
    .replace(/\.html$/, "")}`;
}

(async () => {
  let urlMap = new Map();
  try {
    const xml = await fs.readFile(SITEMAP_FILE, "utf-8");
    const parser = new XMLParser({ ignoreAttributes: false });
    const sitemap = parser.parse(xml);

    const urls = sitemap.urlset?.url || [];
    const list = Array.isArray(urls) ? urls : [urls];

    list.forEach(u => urlMap.set(u.loc, u));
    console.log("📄 既存 sitemap.xml をロードしました");
  } catch {
    console.log("⚠️ sitemap.xml が見つかりません。新規作成します");
  }

  const htmlFiles = getAllHtmlFiles();
  console.log(`🔍 発見した HTML 総数: ${htmlFiles.length}`);

  for (const file of htmlFiles) {
    const url = toUrl(file);
    const modifiedDate = await getModifiedDateFromHtml(file);

    if (!modifiedDate) {
      console.log(`⏩ 除外: ${file}（最終更新日不明 or 公開前ドラフト）`);
      continue;
    }

    urlMap.set(url, { loc: url, lastmod: modifiedDate });
    console.log(`✅ ${file} → 最終更新日: ${modifiedDate}`);
  }

  const builder = new XMLBuilder({ ignoreAttributes: false, format: true });
  const output = builder.build({
    urlset: {
      "@_xmlns": "http://www.sitemaps.org/schemas/sitemap/0.9",
      url: Array.from(urlMap.values())
    }
  });

  await fs.writeFile(SITEMAP_FILE, output, "utf-8");
  console.log("🎉 sitemap.xml を更新しました");
})();
