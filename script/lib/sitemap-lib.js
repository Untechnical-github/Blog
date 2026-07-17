const fs = require("fs/promises");
const { XMLBuilder } = require("fast-xml-parser");

const BASE_URL = "https://untechnical.info";
const SITEMAP_FILE = "sitemap.xml";

const ROBOTS_NOINDEX_REGEX = /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex[^"']*["']\s*\/?>/i;
const PUBLISHED_TIME_REGEX = /<time[^>]*class="published"[^>]*datetime="([\d-]+)"[^>]*>/;
const MODIFIED_TIME_REGEX = /<time[^>]*class="modified"[^>]*datetime="([\d-]+)"[^>]*>/;
const JSON_LD_MODIFIED_REGEX = /"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})/;

function isNoindex(html) {
  return ROBOTS_NOINDEX_REGEX.test(html);
}

function isDraftDate(dateStr) {
  return !dateStr || /--/.test(dateStr) || dateStr.length < 10;
}

function extractPublishedDate(html) {
  const match = html.match(PUBLISHED_TIME_REGEX);
  return match ? match[1] : null;
}

function extractModifiedDate(html) {
  const timeMatch = html.match(MODIFIED_TIME_REGEX);
  const ldMatch = html.match(JSON_LD_MODIFIED_REGEX);
  return (ldMatch && ldMatch[1]) || (timeMatch && timeMatch[1]) || null;
}

function urlFromFile(relativePath) {
  const relativeUrl = "/" + relativePath.replace(/index\.html$/, "").replace(/\.html$/, "");
  return `${BASE_URL}${relativeUrl}`;
}

async function writeSitemapUrlMap(urlMap) {
  const builder = new XMLBuilder({ ignoreAttributes: false, format: true });
  const xml = builder.build({
    urlset: {
      "@_xmlns": "http://www.sitemaps.org/schemas/sitemap/0.9",
      url: Array.from(urlMap.values())
    }
  });
  await fs.writeFile(SITEMAP_FILE, xml, "utf-8");
}

module.exports = {
  BASE_URL,
  SITEMAP_FILE,
  isNoindex,
  isDraftDate,
  extractPublishedDate,
  extractModifiedDate,
  urlFromFile,
  writeSitemapUrlMap
};
