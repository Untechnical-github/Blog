const fs = require("fs/promises");
const { isNoindex, isDraftDate, extractPublishedDate } = require("./lib/sitemap-lib");

// 変更されたHTML内の最終更新日（<time class="modified"> と JSON-LD の dateModified）を
// 今日の日付に書き換える。記事のほか、記事一覧やサイトマップには載せない index.html / policy.html も対象。この副作用は「今回変更されたファイルだけ」に対して行う必要があるため
// 差分のまま残している。sitemap.xml 自体はここでは触らない（rebuild-sitemap.js が担当）。
const getJSTDate = () => {
  const now = new Date();
  const jstOffset = 9 * 60;
  return new Date(now.getTime() + (jstOffset + now.getTimezoneOffset()) * 60000);
};

const formatDateISO = (date) => date.toISOString().split("T")[0];
const formatDateJapanese = (date) =>
  `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;

(async () => {
  const changedFiles = process.argv
    .slice(2)
    // 404.html は後のステップで index.html から丸ごとコピーされるので、ここでは触らない。
    // stats.html は日付の欄を持たない。
    .filter(f => f.endsWith(".html") && f !== "404.html" && f !== "stats.html");

  if (changedFiles.length === 0) {
    console.log("⏩ 変更されたHTMLファイルはありません。");
    return;
  }
  console.log(`🔍 変更ファイル: ${changedFiles.join(", ")}`);

  const nowJST = getJSTDate();
  const isoDate = formatDateISO(nowJST);
  const jpDate = formatDateJapanese(nowJST);

  for (const file of changedFiles) {
    try {
      let html = await fs.readFile(file, "utf-8");

      if (isNoindex(html)) {
        console.log(`🚫 Skipping ${file}: noindex 指定あり`);
        continue;
      }

      // index.html のように <time class="published"> を持たないページは、JSON-LD の公開日で判定する
      const ldPublished = html.match(/"datePublished"\s*:\s*"([^"]*)"/);
      const publishedISO = extractPublishedDate(html) || (ldPublished && ldPublished[1]);

      if (isDraftDate(publishedISO)) {
        console.log(`⛔ Skipping ${file}: 公開日未確定`);
        continue;
      }

      html = html.replace(
        /(<time[^>]*class="modified"[^>]*datetime=")([^"]*)("[^>]*>)(最終更新日：)?(.*?)(<\/time>)/s,
        `$1${isoDate}$3最終更新日：${jpDate}$6`
      );

      const jsonLdRegex =
        /("dateModified"\s*:\s*")(\d{4}-\d{2}-\d{2}|[\d-]*--?)(")/;

      if (jsonLdRegex.test(html)) {
        html = html.replace(jsonLdRegex, `$1${isoDate}$3`);
      }

      await fs.writeFile(file, html, "utf-8");
      console.log(`✏️ 更新完了: ${file}`);

    } catch (err) {
      console.error(`❌ エラー: ${file} 処理失敗`, err);
    }
  }

  console.log("🚀 記事の最終更新日を更新しました");
})();
