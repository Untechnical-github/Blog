const fs = require("fs/promises");
const { XMLParser, XMLBuilder } = require("fast-xml-parser");
const path = require("path");

const BASE_URL = "https://untechnical.info";
const SITEMAP_FILE = "sitemap.xml";

// JSTの日時を取得するヘルパー
const getJSTDate = () => {
  const now = new Date();
  // UTC時間をJST(UTC+9)に変換
  const jstOffset = 9 * 60;
  const jstDate = new Date(now.getTime() + (jstOffset + now.getTimezoneOffset()) * 60000);
  return jstDate;
};

const formatDateISO = (date) => {
  return date.toISOString().split("T")[0]; // YYYY-MM-DD
};

const formatDateJapanese = (date) => {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
};

(async () => {
  // ✅ 引数から変更されたファイルリストを取得 (GitHub Actionsから渡される)
  const changedFiles = process.argv
    .slice(2)
    .filter(f => f.endsWith(".html") && f !== "index.html" && f !== "policy.html");

  if (changedFiles.length === 0) {
    console.log("⏩ 変更されたHTMLファイルはありません。");
  } else {
    console.log(`🔍 変更ファイル: ${changedFiles.join(", ")}`);
  }

  // 既存の sitemap.xml を読み込み
  let sitemap = { urlset: { url: [] } };
  try {
    const xml = await fs.readFile(SITEMAP_FILE, "utf-8");
    const parser = new XMLParser({ ignoreAttributes: false });
    sitemap = parser.parse(xml);
  } catch {
    console.log("⚠️ 既存 sitemap.xml が見つかりません。新規作成します。");
  }

  const urlMap = new Map();
  const existingUrls = sitemap.urlset?.url || [];
  const urls = Array.isArray(existingUrls) ? existingUrls : [existingUrls];
  urls.forEach(entry => urlMap.set(entry.loc, entry));

  // 現在時刻 (更新日とする)
  const nowJST = getJSTDate();
  const isoDate = formatDateISO(nowJST);
  const jpDate = formatDateJapanese(nowJST);

  // ✅ 変更されたファイルをループ処理して HTML を書き換え
  for (const file of changedFiles) {
    const relativeUrl = "/" + file.replace(/index\.html$/, "").replace(/\.html$/, "");
    const fullUrl = `${BASE_URL}${relativeUrl}`;

    try {
      let html = await fs.readFile(file, "utf-8");

      // ---------------------------------------------------------
      // 1. HTML内の <time> タグを更新
      // ---------------------------------------------------------
      // パターン: <time datetime="2023-01-01">最終更新日：YYYY年M月D日</time>
      // 多少のスペースや改行に対応できる正規表現
      const timeRegex = /(<time[^>]*datetime=")(\d{4}-\d{2}-\d{2})("[^>]*>)(.*?)(<\/time>)/s;
      
      if (timeRegex.test(html)) {
        html = html.replace(timeRegex, `$1${isoDate}$3最終更新日：${jpDate}$5`);
        console.log(`✅ HTML更新: ${file} (Timeタグ)`);
      } else {
        console.warn(`⚠️ ${file} に <time> タグが見つかりません。`);
      }

      // ---------------------------------------------------------
      // 2. JSON-LD ("dateModified": "YYYY-MM-DD") を更新
      // ---------------------------------------------------------
      const jsonLdRegex = /("dateModified"\s*:\s*")(\d{4}-\d{2}-\d{2})(")/;
      if (jsonLdRegex.test(html)) {
        html = html.replace(jsonLdRegex, `$1${isoDate}$3`);
        console.log(`✅ HTML更新: ${file} (JSON-LD)`);
      }

      // ファイルに書き込み (これで日付が更新された状態になる)
      await fs.writeFile(file, html, "utf-8");

      // ---------------------------------------------------------
      // 3. Sitemap データを更新
      // ---------------------------------------------------------
      urlMap.set(fullUrl, { loc: fullUrl, lastmod: isoDate });
      
    } catch (err) {
      console.error(`❌ エラー: ${file} の処理中に問題が発生しました`, err);
    }
  }

  // Sitemap を書き出し
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