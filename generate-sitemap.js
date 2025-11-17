const fs = require("fs/promises");
const { execSync } = require("child_process");
const { XMLParser, XMLBuilder } = require("fast-xml-parser");

// -------- 基本設定 --------
const BASE_URL = "https://untechnical.info";
const SITEMAP_FILE = "sitemap.xml";

// =====================================================
// 1. CLI から差分 HTML を受け取る（GitHub Actions 経由）
// =====================================================
const cliChangedFiles = process.argv.slice(2).filter(f => f.endsWith(".html"));

// CLI 差分がある場合はそれを使う
let changedFiles = [...cliChangedFiles];

// CLI からの差分が空なら fallback → HEAD^ と比較
if (changedFiles.length === 0) {
  const diffResult = execSync(`git diff --name-only HEAD^ HEAD -- '*.html'`)
    .toString()
    .trim()
    .split("\n")
    .filter(f => f.endsWith(".html"));

  changedFiles = diffResult;
}

console.log("🔍 対象 HTML:", changedFiles);

if (changedFiles.length === 0) {
  console.log("⏩ HTML の変更がないため sitemap 更新なし");
  process.exit(0);
}

// =====================================================
// 2. HTML の本文抽出 & 本文比較
// =====================================================
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

// =====================================================
// 3. sitemap.xml 読み込み → Map 化
// =====================================================
let sitemap = { urlset: { url: [] } };

try {
  const xml = await fs.readFile(SITEMAP_FILE, "utf-8");
  const parser = new XMLParser({ ignoreAttributes: false });
  sitemap = parser.parse(xml);
} catch {
  console.log("⚠️ sitemap.xml が存在しないため新規作成します。");
}

const urlMap = new Map();
const existingUrls = sitemap.urlset?.url || [];
const urls = Array.isArray(existingUrls) ? existingUrls : [existingUrls];

urls.forEach(entry => urlMap.set(entry.loc, entry));

// =====================================================
// 4. 各 HTML ファイルを処理
// =====================================================
for (const file of changedFiles) {
  console.log(`\n📄 処理中: ${file}`);

  // URL化
  const relativeUrl = "/" + file.replace(/index\.html$/, "").replace(/\.html$/, "");
  const fullUrl = `${BASE_URL}${relativeUrl}`;

  // Git 日付
  const lastmodIso = execSync(`git log -1 --format="%cI" "${file}"`)
    .toString()
    .trim();
  const lastmod = lastmodIso.split("T")[0];

  // 旧HTML（HEAD^ なら確実に存在）
  let oldHtml = "";
  try {
    oldHtml = execSync(`git show HEAD^:${file}`).toString();
  } catch {
    oldHtml = "";
  }

  // 新HTML
  const newHtml = await fs.readFile(file, "utf-8");

  // 本文比較
  if (!hasVisibleChange(oldHtml, newHtml)) {
    console.log(`⏩ 本文に変更なし → 最終更新日を変更しません`);
    continue;
  }

  // -------- HTML 内部の日付更新 --------
  const [year, month, day] = lastmod.split("-");
  const japaneseDate = `${year}年${parseInt(month)}月${parseInt(day)}日`;

  let updatedHtml = newHtml;

  // timeタグ更新
  updatedHtml = updatedHtml.replace(
    /(<time datetime=")(\d{4}-\d{2}-\d{2})(">最終更新日：)([^<]+)(<\/time>)/,
    `${'$1'}${lastmod}${'$3'}${japaneseDate}${'$5'}`
  );

  // JSON-LD 更新
  updatedHtml = updatedHtml.replace(
    /("dateModified"\s*:\s*")(\d{4}-\d{2}-\d{2})(")/,
    `$1${lastmod}$3`
  );

  await fs.writeFile(file, updatedHtml, "utf-8");

  console.log(`✅ ${file} → 最終更新日を ${japaneseDate} に更新`);

  // sitemap へ登録
  urlMap.set(fullUrl, { loc: fullUrl, lastmod });
}

// =====================================================
// 5. sitemap.xml を書き出し
// =====================================================
const builder = new XMLBuilder({ ignoreAttributes: false, format: true });
const outputXml = builder.build({
  urlset: {
    "@_xmlns": "http://www.sitemaps.org/schemas/sitemap/0.9",
    url: Array.from(urlMap.values())
  }
});

await fs.writeFile(SITEMAP_FILE, outputXml, "utf-8");
console.log("✅ sitemap.xml 更新完了");
