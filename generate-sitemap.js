const fs = require("fs/promises");
const path = require("path");
const { execSync } = require("child_process");
const glob = require("glob");
const { XMLParser, XMLBuilder } = require("fast-xml-parser");

const BASE_URL = "https://untechnical.info";
const SITEMAP_FILE = "sitemap.xml";

const changedFiles = execSync("git diff --name-only HEAD^ HEAD")
  .toString()
  .split("\n")
  .filter(f => f.endsWith(".html") && fs);

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

  try {
    const xml = await fs.readFile(SITEMAP_FILE, "utf-8");
    const parser = new XMLParser({ ignoreAttributes: false });
    sitemap = parser.parse(xml);
  } catch {
  }

  const urlMap = new Map();
  const existingUrls = sitemap.urlset?.url || [];
  const urls = Array.isArray(existingUrls) ? existingUrls : [existingUrls];

  urls.forEach(entry => {
    urlMap.set(entry.loc, entry);
  });

  for (const file of changedFiles) {
    const relativeUrl = "/" + file.replace(/index\.html$/, "").replace(/\.html$/, "");
    const fullUrl = `${BASE_URL}${relativeUrl}`;
    const lastmod = getGitDate(file);

    urlMap.set(fullUrl, {
      loc: fullUrl,
      lastmod
    });
  }

  const builder = new XMLBuilder({ ignoreAttributes: false, format: true });
  const updatedSitemap = builder.build({
    urlset: {
      "@_xmlns": "http://www.sitemaps.org/schemas/sitemap/0.9",
      url: Array.from(urlMap.values())
    }
  });

  await fs.writeFile(SITEMAP_FILE, updatedSitemap, "utf-8");
  console.log("✅ sitemap.xml updated (only modified files)");
})();
