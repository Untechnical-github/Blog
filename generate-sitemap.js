import fs from "fs/promises";
import path from "path";
import { execSync } from "child_process";
import glob from "glob";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import { fileURLToPath } from "url";

// __dirname を再現（ESMでは直接使えない）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = "https://untechnical.info";
const SITEMAP_FILE = "sitemap.xml";

// 🔧 変更されたHTML一覧（origin/main...HEAD の差分）
const changedFiles = execSync("git diff --name-only origin/main...HEAD")
  .toString()
  .split("\n")
  .filter((f) => f.endsWith(".html") && f.trim().length > 0);

const getGitDate = (file) => {
  try {
    return execSync(`git log -1 --format="%cI" "${file}"`).toString().trim();
  } catch {
    return new Date().toISOString();
  }
};

// BODYだけ取り出す
const extractBodyContent = (html) => {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1].trim() : "";
};

// 可視部分の本文が変化したか判定
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

  // 既存 sitemap.xml 読み込み
  try {
    const xml = await fs.readFile(SITEMAP_FILE, "utf-8");
    const parser = new XMLParser({ ignoreAttributes: false });
    sitemap = parser.parse(xml);
  } catch {
    console.log("⚠️ 既存 sitemap.xml が見つかりません。新規作成します。");
  }

  // Map に登録
  const urlMap = new Map();
  const existingUrls = sitemap.urlset?.url || [];
  const urls = Array.isArray(existingUrls) ? existingUrls : [existingUrls];

  urls.forEach((entry) => urlMap.set(entry.loc, entry));

  for (const file of changedFiles) {
    const relativeUrl = "/" + file.replace(/index\.html$/, "").replace(/\.html$/, "");
    const fullUrl = `${BASE_URL}${relativeUrl}`;
    const lastmod = getGitDate(file).split("T")[0];

    let oldHtml = "";
    try {
      oldHtml = execSync(`git show origin/main:${file}`).toString();
    } catch {
      oldHtml = "";
    }

    const newHtml = await fs.readFile(file, "utf-8");

    // 本文が変化していなければ timeタグは更新しない
    if (!hasVisibleChange(oldHtml, newHtml)) {
      console.log(`⏩ ${file} の本文に変更なし → 最終更新日は変更しません`);
      continue;
    }

    // 日本語表記へ変換
    const [year, month, day] = lastmod.split("-");
    const japaneseDate = `${year}年${parseInt(month)}月${parseInt(day)}日`;

    // sitemap の更新
    urlMap.set(fullUrl, { loc: fullUrl, lastmod });

    // HTML を書き換える
    let updatedHtml = newHtml;

    // <time datetime="xxxx-xx-xx"> の更新
    updatedHtml = updatedHtml.replace(
      /(<time datetime=")(\d{4}-\d{2}-\d{2})(">最終更新日：)([^<]+)(<\/time>)/,
      `${"$1"}${lastmod}${"$3"}${japaneseDate}${"$5"}`
    );

    // JSON-LD の dateModified
    updatedHtml = updatedHtml.replace(
      /("dateModified"\s*:\s*")(\d{4}-\d{2}-\d{2})(")/,
      `$1${lastmod}$3`
    );

    await fs.writeFile(file, updatedHtml, "utf-8");

    console.log(`✅ ${file} の最終更新日を ${japaneseDate} に更新`);
  }

  // sitemap.xml を再生成
  const builder = new XMLBuilder({ ignoreAttributes: false, format: true });
  const updatedSitemap = builder.build({
    urlset: {
      "@_xmlns": "http://www.sitemaps.org/schemas/sitemap/0.9",
      url: Array.from(urlMap.values()),
    },
  });

  await fs.writeFile(SITEMAP_FILE, updatedSitemap, "utf-8");
  console.log("✅ sitemap.xml を更新しました");
})();
