const fs = require("fs/promises");
const path = require("path");
const { XMLBuilder } = require("fast-xml-parser");

const BASE_URL = "https://untechnical.info";
const BLOG_ROOT = path.resolve(__dirname, "../");
const TARGET_DIR = path.join(BLOG_ROOT, "articles");
const SITEMAP_FILE = path.join(BLOG_ROOT, "sitemap.xml");
const IGNORE_DIRS = ["node_modules", ".git", ".vscode", "script", "public"];

async function getAllHtmlFiles(dir) {
  let results = [];
  try {
    await fs.access(dir);
  } catch { return []; }

  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.includes(entry.name)) results = results.concat(await getAllHtmlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".html") && !["index.html", "policy.html"].includes(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

(async () => {
  console.log("🚀 sitemap.xml のフルビルドを開始します...");
  const htmlFiles = await getAllHtmlFiles(TARGET_DIR);
  const urlMap = new Map();

  for (const file of htmlFiles) {

    const relativeUrl = "/" + path.relative(BLOG_ROOT, file).replace(/\\/g, "/").replace(/index\.html$/, "").replace(/\.html$/, "");
    const fullUrl = `${BASE_URL}${relativeUrl}`;

    try {
      const html = await fs.readFile(file, "utf-8");

      if (/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex[^"']*["']\s*\/?>/i.test(html)) continue;

      const pubMatch = html.match(/<time[^>]*class="published"[^>]*datetime="([\d-]+)"[^>]*>/);
      const publishedISO = pubMatch ? pubMatch[1] : null;
      if (!publishedISO || /--/.test(publishedISO) || publishedISO.length < 10) continue;

      const modMatch = html.match(/<time[^>]*class="modified"[^>]*datetime="([\d-]+)"[^>]*>/);
      let lastmod = modMatch ? modMatch[1] : publishedISO;
      
      const jsonLdMatch = html.match(/"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})/);
      if (jsonLdMatch) lastmod = jsonLdMatch[1];

      urlMap.set(fullUrl, { loc: fullUrl, lastmod: lastmod });
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
  console.log(`🎉 sitemap.xml を完全に再構築しました（計 ${urlMap.size} 件）`);
})();