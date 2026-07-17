import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  unescapeHTML,
  extractMeta,
  resolveUrl,
  detectCharset,
  isAllowedCaller,
  ALLOWED_ORIGIN
} from './index.js';

test('unescapeHTML decodes common HTML entities', () => {
  assert.equal(unescapeHTML('A &amp; B &lt;tag&gt; &quot;q&quot; &#39;a&#39;'), `A & B <tag> "q" 'a'`);
  assert.equal(unescapeHTML(''), '');
  assert.equal(unescapeHTML(null), '');
});

test('extractMeta finds og: tags regardless of attribute order', () => {
  const html = `<meta content="Title Here" property="og:title">`;
  assert.equal(extractMeta(html, ['og:title']), 'Title Here');
});

test('extractMeta falls back through candidate names in order', () => {
  const html = `<meta name="twitter:title" content="Fallback Title">`;
  assert.equal(extractMeta(html, ['og:title', 'twitter:title']), 'Fallback Title');
});

test('extractMeta returns empty string when nothing matches', () => {
  assert.equal(extractMeta('<html></html>', ['og:title']), '');
});

test('resolveUrl resolves relative paths against the base', () => {
  assert.equal(resolveUrl('/img/ogp.png', 'https://example.com/articles/foo.html'), 'https://example.com/img/ogp.png');
});

test('resolveUrl passes through already-absolute URLs', () => {
  assert.equal(resolveUrl('https://cdn.example.com/x.png', 'https://example.com/'), 'https://cdn.example.com/x.png');
});

test('resolveUrl returns null when there is no url', () => {
  assert.equal(resolveUrl('', 'https://example.com/'), null);
});

test('detectCharset reads charset from the Content-Type header', () => {
  const buf = new TextEncoder().encode('<html></html>');
  assert.equal(detectCharset(buf, 'text/html; charset=Shift_JIS'), 'shift-jis');
});

test('detectCharset falls back to <meta charset> when the header is absent', () => {
  const buf = new TextEncoder().encode('<html><head><meta charset="EUC-JP"></head></html>');
  assert.equal(detectCharset(buf, ''), 'euc-jp');
});

test('detectCharset defaults to utf-8 when nothing is found', () => {
  const buf = new TextEncoder().encode('<html></html>');
  assert.equal(detectCharset(buf, ''), 'utf-8');
});

test('isAllowedCaller accepts the site origin via the Origin header', () => {
  const req = new Request('https://worker.example/?url=x', { headers: { Origin: ALLOWED_ORIGIN } });
  assert.equal(isAllowedCaller(req), true);
});

test('isAllowedCaller rejects other origins', () => {
  const req = new Request('https://worker.example/?url=x', { headers: { Origin: 'https://evil.example' } });
  assert.equal(isAllowedCaller(req), false);
});

test('isAllowedCaller falls back to Referer when Origin is absent', () => {
  const req = new Request('https://worker.example/?url=x', { headers: { Referer: ALLOWED_ORIGIN + '/articles/foo.html' } });
  assert.equal(isAllowedCaller(req), true);
});

test('isAllowedCaller rejects requests with neither header', () => {
  const req = new Request('https://worker.example/?url=x');
  assert.equal(isAllowedCaller(req), false);
});
