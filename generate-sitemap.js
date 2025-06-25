const fs = require("fs/promises");
const path = require("path");
const { execSync } = require("child_process");
const glob = require("glob");

const BASE_URL = "https://untechnical.info";
const OUTPUT_FILE = "sitemap.xml";

(async () => {
  const files = glob.sync("**/*.html", { ignore: ["node_modules/**", ".git/**"] });

  const urls = await Promise.all(files.map(async file => {
    const filePath = path.resolve(file);
    let lastmod;

    try {
      const gitDate = execSync(`git log -1 --format="%cI" "${file}"`).toString().trim();
      lastmod = gitDate;
    } catch {
      lastmod = new Date().toISOString(); // fallback
    }

    const relativeUrl = "/" + file.replace(/index\.html$/, "").replace(/\.html$/, "");

    return `
  <url>
    <loc>${BASE_URL}${relativeUrl}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>`;
  }));

  const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  await fs.writeFile(OUTPUT_FILE, sitemapContent, "utf-8");
  console.log(`✅ ${OUTPUT_FILE} generated`);
})();
