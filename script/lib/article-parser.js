const fs = require("fs/promises");
const path = require("path");
const { JSDOM } = require("jsdom");

const ARTICLES_JSON_FILE = "articles.json";
const SEARCH_INDEX_FILE = "search-index.json";
const REDIRECT_MAP_FILE = "redirect-map.json";

const BASE_URL = "https://untechnical.info/";

function normalizePath(p) {
  return path.normalize(p).replace(/\\/g, "/").replace(/^\.\//, "");
}

function isValidDate(dateStr) {
  if (!dateStr) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  if (dateStr.includes("--")) return false;
  return true;
}

function getTimeTagDate(document) {
  const t = document.querySelector("time[datetime]");
  if (!t) return "";
  const dt = t.getAttribute("datetime");
  if (!dt || dt.includes("--") || !/^\d{4}-\d{2}-\d{2}$/.test(dt)) return "";
  return dt;
}

// html を解析し、記事メタ + 本文テキストを抽出する。
// 日付が不完全な記事（下書き）は valid: false を返す。
function parseArticle(html, normalizedPath) {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const robotsMeta = document.querySelector("meta[name='robots']");
  const robotsContent = robotsMeta?.getAttribute("content")?.toLowerCase() || "";
  const visibility = robotsContent.includes("noindex") ? "private" : "public";

  let datePublished = "";
  let dateModified = "";
  const ldJsonScript = document.querySelector("script[type='application/ld+json']");
  if (ldJsonScript) {
    try {
      const ldData = JSON.parse(ldJsonScript.textContent);
      datePublished = ldData.datePublished || "";
      dateModified = ldData.dateModified || "";
    } catch {
      console.warn(`⚠️ JSON-LD parse error in ${normalizedPath}`);
    }
  }

  const timeDate = getTimeTagDate(document);

  if (!isValidDate(datePublished) || !isValidDate(dateModified) || !isValidDate(timeDate)) {
    return { valid: false, path: normalizedPath };
  }

  const targetElement =
    document.querySelector("main") ||
    document.querySelector("article") ||
    document.body;

  const clone = targetElement.cloneNode(true);
  clone.querySelectorAll("script, style, noscript, iframe").forEach(el => el.remove());

  let content = clone.textContent?.trim() || "";
  content = content.replace(/\s+/g, " ").trim();

  const title =
    document.querySelector("title")?.textContent?.trim() ||
    document.querySelector("h1")?.textContent?.trim() ||
    "";

  const metaCategory = document.querySelector("meta[name='category']")?.getAttribute("content") || "";
  const category = metaCategory.split(",").map(c => c.trim()).filter(Boolean);

  const description =
    document.querySelector("meta[name='description']")?.getAttribute("content")?.trim() ||
    document.querySelector("meta[property='og:description']")?.getAttribute("content")?.trim() ||
    "";

  const relativeImagePath =
    document.querySelector("main img, article img, body img")?.getAttribute("src") || "";
  let image = "";
  if (relativeImagePath) {
    const fileUrl = new URL(normalizedPath, BASE_URL).href;
    image = new URL(relativeImagePath, fileUrl).href;
  }

  return {
    valid: true,
    title,
    category,
    path: normalizedPath,
    content,
    description,
    image,
    datePublished,
    dateModified,
    visibility
  };
}

function sortByDateDesc(articles) {
  return [...articles].sort((a, b) => {
    const dateA = new Date(a.datePublished || 0);
    const dateB = new Date(b.datePublished || 0);
    return dateB - dateA;
  });
}

// articles.json 用: 検索用の本文（content）を除いたメタ情報のみ
function toMeta(article) {
  const { valid, content, ...meta } = article;
  return meta;
}

// search-index.json 用: 表示・検索に必要なフィールドのみ（datePublished/dateModified は不要）
function toSearchEntry(article) {
  const { title, category, path: p, content, image, visibility } = article;
  return { title, category, path: p, content, image, visibility };
}

// redirect-map.json 用: ファイル名（拡張子なし・小文字）→ path の辞書
// 同名ファイルが複数ある場合は、日付降順で先に現れたもの（＝新しい記事）を優先する
function buildRedirectMap(articlesSortedByDateDesc) {
  const map = {};
  for (const article of articlesSortedByDateDesc) {
    const fileName = article.path.split("/").pop().replace(/\.html$/, "").toLowerCase();
    if (!(fileName in map)) {
      map[fileName] = article.path;
    } else {
      // ファイル名がサイト全体で一意であることが _middleware.js の301リダイレクトの前提になっている。
      // 衝突した場合は日付が新しい方を優先し、ビルドログで検知できるようにする。
      console.warn(`⚠️ redirect-map.json: ファイル名 "${fileName}" が複数の記事と衝突しています（"${map[fileName]}" を優先し、"${article.path}" は無視されます）`);
    }
  }
  return map;
}

// articleMap (Map<path, article-with-content>) から articles.json / search-index.json /
// redirect-map.json の3ファイルを生成して書き出す。
async function writeArticleOutputs(articleMap) {
  const articles = sortByDateDesc(Array.from(articleMap.values()));

  const meta = articles.map(toMeta);
  const searchEntries = articles.map(toSearchEntry);
  const redirectMap = buildRedirectMap(articles);

  await fs.writeFile(ARTICLES_JSON_FILE, JSON.stringify(meta, null, 2), "utf-8");
  await fs.writeFile(SEARCH_INDEX_FILE, JSON.stringify(searchEntries, null, 2), "utf-8");
  await fs.writeFile(REDIRECT_MAP_FILE, JSON.stringify(redirectMap, null, 2), "utf-8");

  return articles.length;
}

module.exports = {
  BASE_URL,
  ARTICLES_JSON_FILE,
  SEARCH_INDEX_FILE,
  REDIRECT_MAP_FILE,
  normalizePath,
  isValidDate,
  getTimeTagDate,
  parseArticle,
  sortByDateDesc,
  toMeta,
  toSearchEntry,
  buildRedirectMap,
  writeArticleOutputs
};
