import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  jstDay,
  periodStart,
  latestDay,
  normalizeViewPath,
  isBot,
  mergeCounts,
  buildRanking,
  loadRanking,
  isAuthorized,
  TOP_PAGE
} from './views.js';

test('jstDay switches date at midnight JST, not UTC', () => {
  assert.equal(jstDay(Date.UTC(2026, 9, 13, 14, 59)), '2026-10-13');
  assert.equal(jstDay(Date.UTC(2026, 9, 13, 15, 0)), '2026-10-14');
});

test('periodStart counts today as the first of the N days', () => {
  const now = Date.UTC(2026, 9, 20, 3, 0);
  assert.equal(periodStart(1, now), '2026-10-20');
  assert.equal(periodStart(7, now), '2026-10-14');
});

test('normalizeViewPath maps extensionless article URLs to the articles.json form', () => {
  assert.equal(normalizeViewPath('/articles/camera_sound/oppo/oppo'), 'articles/camera_sound/oppo/oppo.html');
  assert.equal(normalizeViewPath('/articles/a/b.html'), 'articles/a/b.html');
  assert.equal(normalizeViewPath('/articles/a/b/'), 'articles/a/b.html');
});

test('normalizeViewPath maps the top page to its own key', () => {
  assert.equal(normalizeViewPath('/'), TOP_PAGE);
  assert.equal(normalizeViewPath('/index.html'), TOP_PAGE);
});

test('normalizeViewPath rejects anything that is not an article or the top page', () => {
  assert.equal(normalizeViewPath('/policy'), null);
  assert.equal(normalizeViewPath('/articles/../secret'), null);
  assert.equal(normalizeViewPath('/articles/a b'), null);
  assert.equal(normalizeViewPath('/articles/' + 'a'.repeat(300)), null);
  assert.equal(normalizeViewPath(undefined), null);
});

test('isBot flags crawlers and missing user agents', () => {
  assert.equal(isBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), true);
  assert.equal(isBot(''), true);
  assert.equal(isBot(null), true);
  assert.equal(isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'), false);
});

test('buildRanking orders each period independently and drops zero-view articles', () => {
  const ranking = buildRanking([
    { path: 'a', week: 1, month: 9, year: 9, total: 9 },
    { path: 'b', week: 5, month: 5, year: 5, total: 5 },
    { path: 'c', week: 0, month: 0, year: 7, total: 0 }
  ]);
  assert.deepEqual(ranking.week, ['b', 'a']);
  assert.deepEqual(ranking.month, ['a', 'b']);
  assert.deepEqual(ranking.year, ['a', 'c', 'b']);
  assert.deepEqual(ranking.total, ['a', 'b']);
});

test('isAuthorized accepts only the exact bearer token', async () => {
  const env = { STATS_TOKEN: 'correct-token' };
  const withAuth = value => new Request('https://worker.example/views/stats', { headers: value ? { Authorization: value } : {} });

  assert.equal(await isAuthorized(withAuth('Bearer correct-token'), env), true);
  assert.equal(await isAuthorized(withAuth('Bearer wrong-token'), env), false);
  assert.equal(await isAuthorized(withAuth('correct-token'), env), false);
  assert.equal(await isAuthorized(withAuth(null), env), false);
});

test('isAuthorized rejects everything when STATS_TOKEN is not configured', async () => {
  const request = new Request('https://worker.example/views/stats', { headers: { Authorization: 'Bearer ' } });
  assert.equal(await isAuthorized(request, {}), false);
});

test('mergeCounts joins recent and total rows, keeping articles that appear in only one', () => {
  const merged = mergeCounts(
    [{ path: 'a', week: 1, month: 2, year: 3 }],
    [{ path: 'a', total: 10 }, { path: 'old', total: 4 }]
  );
  assert.deepEqual(merged, [
    { path: 'a', week: 1, month: 2, year: 3, total: 10 },
    { path: 'old', week: 0, month: 0, year: 0, total: 4 }
  ]);
});

// loadRanking が触る範囲だけを真似た D1 の代役
function fakeDb({ snapshot, failClose = false }) {
  const calls = { closed: 0 };
  const statement = { bind: () => statement, first: async () => snapshot, run: async () => ({}) };
  return {
    calls,
    prepare: () => statement,
    batch: async () => {
      calls.closed++;
      if (failClose) throw new Error('daily limit exceeded');
      return [{}, { results: [{ path: 'fresh', week: 1, month: 1, year: 1 }] }, { results: [] }];
    }
  };
}

const ctx = { waitUntil: () => {} };
const NOON_OCT_20 = Date.UTC(2026, 9, 20, 3, 0); // 日本時間 2026-10-20 12:00
const rankingJson = JSON.stringify({ week: ['saved'], month: [], year: [], total: [] });

test('latestDay is the day before today in JST', () => {
  assert.equal(latestDay(NOON_OCT_20), '2026-10-19');
  assert.equal(latestDay(Date.UTC(2026, 9, 19, 15, 0)), '2026-10-19');
  assert.equal(latestDay(Date.UTC(2026, 9, 19, 14, 59)), '2026-10-18');
});

test('loadRanking reuses the saved ranking for the rest of the day', async () => {
  const DB = fakeDb({ snapshot: { through_day: '2026-10-19', ranking: rankingJson } });
  const ranking = await loadRanking({ DB }, ctx, NOON_OCT_20);
  assert.deepEqual(ranking.week, ['saved']);
  assert.equal(DB.calls.closed, 0);
});

test('loadRanking closes the previous day once the date has changed', async () => {
  const DB = fakeDb({ snapshot: { through_day: '2026-10-18', ranking: rankingJson } });
  const ranking = await loadRanking({ DB }, ctx, NOON_OCT_20);
  assert.deepEqual(ranking.week, ['fresh']);
  assert.equal(DB.calls.closed, 1);
});

test('loadRanking falls back to the saved ranking when closing the day fails', async () => {
  const DB = fakeDb({ snapshot: { through_day: '2026-10-18', ranking: rankingJson }, failClose: true });
  const ranking = await loadRanking({ DB }, ctx, NOON_OCT_20);
  assert.deepEqual(ranking.week, ['saved']);
});

test('loadRanking surfaces the error when there is no saved ranking to fall back to', async () => {
  const DB = fakeDb({ snapshot: null, failClose: true });
  await assert.rejects(loadRanking({ DB }, ctx, NOON_OCT_20), /daily limit/);
});
