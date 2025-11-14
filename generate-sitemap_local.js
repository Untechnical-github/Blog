const fs = require("fs/promises");
const path = require("path");
const glob = require("glob");
const { JSDOM } = require("jsdom");
const { XMLParser, XMLBuilder } = require("fast-xml-parser");

const BASE_URL = "https://untechnical.info";
const SITEMAP_FILE = "sitemap.xml";

// HTMLファイル一覧取得（index.html / policy.html も含む）
function getAllHtmlFiles() {
  return glob.sync("**/*.html").map(f => f.replace(/\\/g, "/"));
}

// HTMLの最終更新日を取得（JSON-LD > time datetime > mtime）
async function getLastModifiedFromHtml(file) {
  const html = await fs.readFile(file, "utf-8");
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  // JSON-LD (dateModified)
  const ld = doc.querySelector('script[type="application/ld+json"]');
  if (ld) {
    try {
      const json = JSON.parse(ld.textContent);
      if (json.dateModified) return json.dateModified.split("T")[0];
    } catch {}
  }

  // <time datetime="yyyy-mm-dd">
  const timeTag = doc.querySelector("time[datetime]");
  if (timeTag) {
    const dt = timeTag.getAttribute("datetime");
    if (dt) return dt.split("T")[0];
  }

  // HTMLメタが無い場合 → ファイルの最終更新日時 (mtime)
  const stat = await fs.stat(file);
  return new Date(stat.mtime).toISOString().split("T")[0];
}

// HTMLから URL を生成（/dir/file → /dir/file）
function toUrl(file) {
  return `${BASE_URL}/${file.replace(/index\.html$/, "").replace(/\.html$/, "")}`;
}

(async () => {
  // 既存 sitemap.xml を読み込み
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
    console.log("⚠️ 既存 sitemap.xml が見つかりません。新規作成します");
  }

  // 全 HTML を対象
  const htmlFiles = getAllHtmlFiles();
  console.log(`🔍 発見した HTML の総数: ${htmlFiles.length}`);

  for (const file of htmlFiles) {
    const url = toUrl(file);
    const lastmod = await getLastModifiedFromHtml(file);

    urlMap.set(url, { loc: url, lastmod });
    console.log(`✅ ${file} → ${lastmod}`);
  }

  // XML に変換して書き出し
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
