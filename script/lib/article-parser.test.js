const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const {
  isValidDate,
  getTimeTagDate,
  parseArticle,
  buildRedirectMap,
  toMeta,
  toSearchEntry,
  isSuspiciousArticleCountDrop
} = require('./article-parser');

test('isValidDate accepts YYYY-MM-DD', () => {
  assert.equal(isValidDate('2026-06-05'), true);
});

test('isValidDate rejects missing/malformed/placeholder dates', () => {
  assert.equal(isValidDate(''), false);
  assert.equal(isValidDate('2026-06'), false);
  assert.equal(isValidDate('2026--06-05'), false);
  assert.equal(isValidDate(undefined), false);
});

test('getTimeTagDate reads a valid <time datetime>', () => {
  const dom = new JSDOM('<time datetime="2026-06-05"></time>');
  assert.equal(getTimeTagDate(dom.window.document), '2026-06-05');
});

test('getTimeTagDate rejects a placeholder datetime', () => {
  const dom = new JSDOM('<time datetime="----"></time>');
  assert.equal(getTimeTagDate(dom.window.document), '');
});

test('getTimeTagDate returns empty string when there is no <time> tag', () => {
  const dom = new JSDOM('<p>no time tag</p>');
  assert.equal(getTimeTagDate(dom.window.document), '');
});

function sampleHtml({
  datePublished = '2026-06-05',
  dateModified = '2026-06-05',
  timeDate = '2026-06-05',
  robots = '',
  category = 'Android,Tips',
  description = 'テスト記事の説明文'
} = {}) {
  return `<!DOCTYPE html><html><head>
    <title>テスト記事</title>
    ${robots ? `<meta name="robots" content="${robots}">` : ''}
    <meta name="category" content="${category}">
    ${description ? `<meta name="description" content="${description}">` : ''}
    <script type="application/ld+json">${JSON.stringify({ datePublished, dateModified })}</script>
  </head><body>
    <main>
      <time datetime="${timeDate}"></time>
      <img src="hero.jpg">
      <p>本文テキストです。</p>
    </main>
  </body></html>`;
}

test('parseArticle extracts title/category/image/description/visibility for a well-formed article', () => {
  const article = parseArticle(sampleHtml(), 'articles/foo/foo.html');
  assert.equal(article.valid, true);
  assert.equal(article.title, 'テスト記事');
  assert.deepEqual(article.category, ['Android', 'Tips']);
  assert.equal(article.visibility, 'public');
  assert.equal(article.image, 'https://untechnical.info/articles/foo/hero.jpg');
  assert.equal(article.description, 'テスト記事の説明文');
  assert.match(article.content, /本文テキストです/);
});

test('parseArticle falls back to og:description when meta description is absent', () => {
  const html = sampleHtml({ description: '' }).replace(
    '</head>',
    '<meta property="og:description" content="OG説明文"></head>'
  );
  const article = parseArticle(html, 'articles/foo/foo.html');
  assert.equal(article.description, 'OG説明文');
});

test('toMeta keeps description alongside the other meta fields', () => {
  const meta = toMeta(parseArticle(sampleHtml(), 'articles/foo/foo.html'));
  assert.equal(meta.description, 'テスト記事の説明文');
});

test('parseArticle warns on the build log when description is missing entirely', (t) => {
  const warn = t.mock.method(console, 'warn');
  const article = parseArticle(sampleHtml({ description: '' }), 'articles/foo/foo.html');
  assert.equal(article.description, '');
  assert.equal(warn.mock.calls.some(call => call.arguments[0].includes('meta description が見つかりません')), true);
});

test('parseArticle does not warn when description is present', (t) => {
  const warn = t.mock.method(console, 'warn');
  parseArticle(sampleHtml(), 'articles/foo/foo.html');
  assert.equal(warn.mock.calls.length, 0);
});

test('parseArticle marks noindex articles as private', () => {
  const article = parseArticle(sampleHtml({ robots: 'noindex' }), 'articles/foo/foo.html');
  assert.equal(article.visibility, 'private');
});

test('parseArticle rejects articles with an incomplete published date', () => {
  const article = parseArticle(sampleHtml({ datePublished: '' }), 'articles/foo/foo.html');
  assert.equal(article.valid, false);
});

test('parseArticle rejects articles whose <time> tag is a draft placeholder', () => {
  const article = parseArticle(sampleHtml({ timeDate: '----' }), 'articles/foo/foo.html');
  assert.equal(article.valid, false);
});

test('buildRedirectMap keeps the newest article on a filename collision', () => {
  const articles = [
    { path: 'articles/new/foo.html' },
    { path: 'articles/old/foo.html' }
  ]; // 呼び出し側で日付降順ソート済みという前提
  const map = buildRedirectMap(articles);
  assert.equal(map['foo'], 'articles/new/foo.html');
});

test('isSuspiciousArticleCountDrop skips the check when there is no prior baseline', () => {
  assert.equal(isSuspiciousArticleCountDrop(0, 1, 1), false);
});

test('isSuspiciousArticleCountDrop flags a near-total wipe (e.g. search-index.json failed to load)', () => {
  // 23件あったはずが、変更ファイル1件だけを処理した結果1件になった
  assert.equal(isSuspiciousArticleCountDrop(23, 1, 1), true);
});

test('isSuspiciousArticleCountDrop allows a drop no larger than the number of changed files', () => {
  // 23件中、今回の変更ファイル1件が日付不完全で除外され22件になったのは正当
  assert.equal(isSuspiciousArticleCountDrop(23, 22, 1), false);
});

test('isSuspiciousArticleCountDrop flags a drop larger than the number of changed files', () => {
  assert.equal(isSuspiciousArticleCountDrop(23, 21, 1), true);
});

test('isSuspiciousArticleCountDrop allows an unchanged or growing count', () => {
  assert.equal(isSuspiciousArticleCountDrop(23, 23, 0), false);
  assert.equal(isSuspiciousArticleCountDrop(23, 24, 0), false);
});

test('toMeta strips content (and the internal valid flag) from an article record', () => {
  const meta = toMeta({
    valid: true, title: 't', content: 'long body', path: 'p',
    category: [], image: '', datePublished: '', dateModified: '', visibility: 'public'
  });
  assert.equal('content' in meta, false);
  assert.equal('valid' in meta, false);
  assert.equal(meta.title, 't');
});

test('toSearchEntry keeps content but drops publish/modified dates', () => {
  const entry = toSearchEntry({
    title: 't', category: [], path: 'p', content: 'c', image: '',
    datePublished: '2026-01-01', dateModified: '2026-01-01', visibility: 'public'
  });
  assert.equal(entry.content, 'c');
  assert.equal('datePublished' in entry, false);
});
