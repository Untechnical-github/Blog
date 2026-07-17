// git diff で変更検出されたファイルのうち、見た目上のテキスト/構造が実際に変わったものだけを
// 抽出する。改行やスペース、属性順の揺れだけの差分（意味のない差分）は除外する。
// generate.yml / ai-proofread.yml の両方から共通で呼び出す:
//   node script/filter-meaningful-diff.js file1 file2 ...
// 標準出力に、意味のある変更があったファイルのパスをスペース区切りで出力する。
const fs = require('fs');
const { execSync } = require('child_process');
const { JSDOM } = require('jsdom');
const path = require('path');

const files = process.argv.slice(2);
const meaningfulFiles = [];

const extractContent = (content, ext) => {
  if (!content) return "";

  if (ext === '.md') return content.trim();

  const dom = new JSDOM(content);
  const doc = dom.window.document;

  doc.querySelectorAll('script, style, link, noscript, iframe, ins, svg').forEach(el => el.remove());

  const title = doc.querySelector('title')?.textContent?.trim() || "";
  const category = doc.querySelector('meta[name="category"]')?.getAttribute("content") || "";
  const bodyText = doc.body?.textContent?.replace(/\s+/g, " ").trim() || "";

  const images = Array.from(doc.querySelectorAll('img'))
    .map(img => `${img.getAttribute('src')}|${img.getAttribute('alt') || ''}`)
    .join(',');

  const links = Array.from(doc.querySelectorAll('a')).map(a => a.getAttribute('href')).join(',');

  return JSON.stringify({ title, category, bodyText, images, links });
};

files.forEach(file => {
  try {
    if (!fs.existsSync(file)) return;
    const ext = path.extname(file).toLowerCase();
    const newContent = fs.readFileSync(file, 'utf-8');

    let oldContent = "";
    try {
      oldContent = execSync(`git show HEAD~1:${file}`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
    } catch (e) {
      meaningfulFiles.push(file);
      return;
    }

    if (extractContent(newContent, ext) !== extractContent(oldContent, ext)) {
      meaningfulFiles.push(file);
    }
  } catch (err) {
    console.error(`Error processing ${file}:`, err);
    meaningfulFiles.push(file);
  }
});

console.log(meaningfulFiles.join(' '));
