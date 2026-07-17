const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const {
  isValidDate,
  getTimeTagDate,
  parseArticle,
  buildRedirectMap,
  toMeta,
  toSearchEntry
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
  category = 'Android,Tips'
} = {}) {
  return `<!DOCTYPE html><html><head>
    <title>テスト記事</title>
    ${robots ? `<meta name="robots" content="${robots}">` : ''}
    <meta name="category" content="${category}">
    <script type="application/ld+json">${JSON.stringify({ datePublished, dateModified })}</script>
  </head><body>
    <main>
      <time datetime="${timeDate}"></time>
      <img src="hero.jpg">
      <p>本文テキストです。</p>
    </main>
  </body></html>`;
}

test('parseArticle extracts title/category/image/visibility for a well-formed article', () => {
  const article = parseArticle(sampleHtml(), 'articles/foo/foo.html');
  assert.equal(article.valid, true);
  assert.equal(article.title, 'テスト記事');
  assert.deepEqual(article.category, ['Android', 'Tips']);
  assert.equal(article.visibility, 'public');
  assert.equal(article.image, 'https://untechnical.info/articles/foo/hero.jpg');
  assert.match(article.content, /本文テキストです/);
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
