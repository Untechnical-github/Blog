const fs = require("fs/promises");
const path = require("path");
const { execSync } = require("child_process");
const glob = require("glob");
const { XMLParser, XMLBuilder } = require("fast-xml-parser");

const BASE_URL = "https://untechnical.info";
const SITEMAP_FILE = "sitemap.xml";

// Gitで変更されたHTMLファイルを取得
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

(async () => {
  let sitemap = {
    urlset: {
      url: []
    }
  };

  // 既存の sitemap.xml を読み込み
  try {
    const xml = await fs.readFile(SITEMAP_FILE, "utf-8");
    const parser = new XMLParser({ ignoreAttributes: false });
    sitemap = parser.parse(xml);
  } catch {
    console.log("⚠️ 既存 sitemap.xml が見つかりません。新規作成します。");
  }

  // 既存の URL を Map に入れる
  const urlMap = new Map();
  const existingUrls = sitemap.urlset?.url || [];
  const urls = Array.isArray(existingUrls) ? existingUrls : [existingUrls];
  urls.forEach(entry => {
    urlMap.set(entry.loc, entry);
  });

  for (const file of changedFiles) {
    const relativeUrl = "/" + file.replace(/index\.html$/, "").replace(/\.html$/, "");
    const fullUrl = `${BASE_URL}${relativeUrl}`;
    const lastmod = getGitDate(file).split("T")[0]; // ISO 日付だけ

    // sitemap.xml を更新
    urlMap.set(fullUrl, {
      loc: fullUrl,
      lastmod
    });

    // HTMLの <time> 最終更新日 を更新
    let html = await fs.readFile(file, "utf-8");

    // 公開日・最終更新日が両方入っている想定
    html = html.replace(
  /(<time datetime=")(\d{4}-\d{2}-\d{2})(">最終更新日：)([^<]+)(<\/time>)/,
  (match, p1, p2, p3, p4, p5) => {
    return `${p1}${lastmod}${p3}${lastmod}${p5}`;
  }
);

    await fs.writeFile(file, html, "utf-8");
    console.log(`✅ ${file} の最終更新日を ${lastmod} に更新`);
  }

  // sitemap.xml を書き出し
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
