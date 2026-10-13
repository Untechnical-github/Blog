// アクセス数の集計API（D1）。
//   POST /views/hit      記事ページ・トップページから送られるビーコン（1表示 = 1カウント）
//   GET  /views/ranking  期間別の人気順（パスの並びだけ。数値は公開しない）
//   GET  /views/stats    日別×ページ別のデータ（解析ページ専用、STATS_TOKEN が必要）
// ranking と stats が参照するのは前日までのデータ。当日分は記録するだけで、翌日から反映される。

const SITE_ORIGIN = 'https://untechnical.info';

// 「合計」の起点。これより前の日付のデータは合計に含めない。
const COUNT_START_DAY = '2026-10-14';

// トップページを表すキー（記事は articles.json と同じ "articles/.../x.html" 形式で保存する）
const TOP_PAGE = 'index';

const PERIOD_DAYS = { week: 7, month: 30, year: 365 };

const DAY_MS = 24 * 60 * 60 * 1000;

// 解析ページが期間を指定しなかったときに返す日数（直近1年 + その前の1年との比較に足りる長さ）
const STATS_DEFAULT_DAYS = 800;

const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|curl|wget|python|scrapy|monitor/i;

// 集計の日付は日本時間で区切る
function jstDay(ms = Date.now()) {
  return new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ms の日を含む直近 days 日間の初日
function periodStart(days, ms = Date.now()) {
  return jstDay(ms - (days - 1) * DAY_MS);
}

// 並び替えと解析ページが参照する最後の日（= 前日）。当日はまだ数えている途中なので見せない。
function latestDay(ms = Date.now()) {
  return jstDay(ms - DAY_MS);
}

// ブラウザの location.pathname（"/articles/a/b" や "/"）を保存用のキーに揃える。
// 記事でもトップでもないパスは null を返して集計対象から外す。
function normalizeViewPath(raw) {
  if (typeof raw !== 'string' || raw.length > 200) return null;

  let path = raw.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  if (path === '' || path === 'index' || path === 'index.html') return TOP_PAGE;

  if (!path.endsWith('.html')) path += '.html';
  return /^articles\/[A-Za-z0-9_\-\/]+\.html$/.test(path) ? path : null;
}

function isBot(userAgent) {
  return !userAgent || BOT_UA.test(userAgent);
}

// 直近1年の集計行（week / month / year）と累計の行（total）を、パスごとの1行にまとめる
function mergeCounts(recentRows, totalRows) {
  const byPath = new Map();
  const rowFor = path => {
    if (!byPath.has(path)) byPath.set(path, { path, week: 0, month: 0, year: 0, total: 0 });
    return byPath.get(path);
  };

  for (const row of recentRows) Object.assign(rowFor(row.path), { week: row.week, month: row.month, year: row.year });
  for (const row of totalRows) rowFor(row.path).total = row.total;

  return [...byPath.values()];
}

// ranking 用: { path, week, month, year, total } の行から、期間ごとに多い順のパス配列を作る
function buildRanking(rows) {
  const ranking = {};
  for (const period of ['week', 'month', 'year', 'total']) {
    ranking[period] = rows
      .filter(row => row[period] > 0)
      .sort((a, b) => b[period] - a[period])
      .map(row => row.path);
  }
  return ranking;
}

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

// 文字列を直接比較すると一致した桁数が応答時間に漏れるため、ハッシュ同士を比較する
async function isAuthorized(request, env) {
  if (!env.STATS_TOKEN) return false;
  const match = (request.headers.get('Authorization') || '').match(/^Bearer (.+)$/);
  if (!match) return false;

  const [given, expected] = await Promise.all([sha256(match[1]), sha256(env.STATS_TOKEN)]);
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given[i] ^ expected[i];
  return diff === 0;
}

// 存在しないパスを大量に送りつけてテーブルを汚されないよう、実在する記事だけを数える。
// articles.json が取れないときは形式チェック（normalizeViewPath）だけで通す。
async function loadArticlePaths(ctx) {
  const url = `${SITE_ORIGIN}/articles.json`;
  const cache = caches.default;

  let res = await cache.match(url);
  if (!res) {
    res = await fetch(url);
    if (!res.ok) return null;
    const cacheable = new Response(res.clone().body, res);
    cacheable.headers.set('Cache-Control', 'max-age=300');
    ctx.waitUntil(cache.put(url, cacheable));
  }

  const articles = await res.json();
  return new Set(articles.map(article => article.path));
}

function json(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store', ...extraHeaders }
  });
}

async function handleHit(request, env, ctx) {
  const headers = { 'Access-Control-Allow-Origin': SITE_ORIGIN };
  const ignored = new Response(null, { status: 204, headers });

  // ローカルで開いたページ（localhost / file://）や他サイトからの送信は数えない
  if (request.headers.get('Origin') !== SITE_ORIGIN) return new Response(null, { status: 403, headers });
  if (isBot(request.headers.get('User-Agent'))) return ignored;

  const path = normalizeViewPath(await request.text());
  if (!path) return ignored;

  if (path !== TOP_PAGE) {
    try {
      const known = await loadArticlePaths(ctx);
      if (known && !known.has(path)) return ignored;
    } catch (e) {
    }
  }

  // 記録時に書くのはこの1行だけ。累計（totals）は1日1回の締め処理でまとめて加算する。
  await env.DB
    .prepare('INSERT INTO views (day, path, count) VALUES (?1, ?2, 1) ON CONFLICT (day, path) DO UPDATE SET count = count + 1')
    .bind(jstDay(), path)
    .run();

  return ignored;
}

// 1日1回の締め処理。前日までの分を累計に足し込み、前日までの順位を計算する。
//   - 累計への加算は、ページごとに「何日まで足したか」（through_day）より後の日だけを対象にするので、
//     同時に2回走っても、失敗してやり直しても、二重に足されることはない。
//   - 読む行数は「ページ数 × 365日」程度で頭打ちになり、運用年数が延びても増えない
//     （主キーが day 始まりなので、day の範囲指定はインデックスで絞り込まれる）。
async function closeDay(env, through, previousThrough, now) {
  const endMs = now - DAY_MS;

  const [, recent, totals] = await env.DB.batch([
    env.DB
      .prepare(`
        INSERT INTO totals (path, count, through_day)
        SELECT v.path, SUM(v.count), ?1
        FROM views v LEFT JOIN totals t ON t.path = v.path
        WHERE v.day > ?2 AND v.day >= ?3 AND v.day <= ?1 AND v.day > COALESCE(t.through_day, '')
        GROUP BY v.path
        ON CONFLICT (path) DO UPDATE SET count = count + excluded.count, through_day = excluded.through_day
      `)
      .bind(through, previousThrough, COUNT_START_DAY),
    env.DB
      .prepare(`
        SELECT path,
          SUM(CASE WHEN day >= ?1 THEN count ELSE 0 END) AS week,
          SUM(CASE WHEN day >= ?2 THEN count ELSE 0 END) AS month,
          SUM(count) AS year
        FROM views
        WHERE day >= ?3 AND day <= ?4 AND path != ?5
        GROUP BY path
      `)
      .bind(periodStart(PERIOD_DAYS.week, endMs), periodStart(PERIOD_DAYS.month, endMs), periodStart(PERIOD_DAYS.year, endMs), through, TOP_PAGE),
    env.DB.prepare('SELECT path, count AS total FROM totals WHERE path != ?1').bind(TOP_PAGE)
  ]);

  return buildRanking(mergeCounts(recent.results, totals.results));
}

// 順位は前日までのデータで決まるので、日付が変わるまで保存済みのものを返し続ける。
// 締め処理に失敗したとき（D1の1日の上限に達した場合など）は、古い順位のまま返して並び替えを止めない。
async function loadRanking(env, ctx, now = Date.now()) {
  const through = latestDay(now);
  const snapshot = await env.DB.prepare('SELECT through_day, ranking FROM ranking_snapshot WHERE id = 1').first();
  if (snapshot && snapshot.through_day === through) return JSON.parse(snapshot.ranking);

  try {
    const ranking = await closeDay(env, through, snapshot ? snapshot.through_day : '', now);
    ctx.waitUntil(
      env.DB
        .prepare('INSERT INTO ranking_snapshot (id, computed_at, through_day, ranking) VALUES (1, ?1, ?2, ?3) ON CONFLICT (id) DO UPDATE SET computed_at = ?1, through_day = ?2, ranking = ?3')
        .bind(now, through, JSON.stringify(ranking))
        .run()
        .catch(() => {})
    );
    return ranking;
  } catch (err) {
    if (snapshot) return JSON.parse(snapshot.ranking);
    throw err;
  }
}

async function handleRanking(request, env, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(new URL('/views/ranking', request.url).href);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // 保存済みの順位を読むだけでもD1に問い合わせるので、10分間エッジにキャッシュする
  const response = json(await loadRanking(env, ctx), 200, { 'Cache-Control': 'public, max-age=600' });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

async function handleStats(request, env) {
  if (!env.STATS_TOKEN) return json({ status: 'error', message: 'STATS_TOKEN is not set' }, 503);
  if (!(await isAuthorized(request, env))) return json({ status: 'error', message: 'Unauthorized' }, 401);

  // 全期間を毎回返すと年数に比例して重くなるため、解析ページが必要とする日付以降だけを返す
  const requestedFrom = new URL(request.url).searchParams.get('from');
  const from = /^\d{4}-\d{2}-\d{2}$/.test(requestedFrom || '') ? requestedFrom : periodStart(STATS_DEFAULT_DAYS);

  // 並び替えと同じく、数え終わっていない当日分は見せない
  const latest = latestDay();

  const [rowsResult, firstResult] = await env.DB.batch([
    env.DB.prepare('SELECT day, path, count FROM views WHERE day >= ?1 AND day <= ?2 ORDER BY day').bind(from, latest),
    env.DB.prepare('SELECT MIN(day) AS firstDay FROM views WHERE day <= ?1').bind(latest)
  ]);
  const results = rowsResult.results;
  const firstDay = firstResult.results[0].firstDay;

  // 同じパスが日数ぶん繰り返されるので、パスは番号に置き換えて転送量を抑える
  const paths = [];
  const indexOf = new Map();
  const rows = results.map(row => {
    if (!indexOf.has(row.path)) {
      indexOf.set(row.path, paths.length);
      paths.push(row.path);
    }
    return [row.day, indexOf.get(row.path), row.count];
  });

  return json({ start: COUNT_START_DAY, latest, topPage: TOP_PAGE, firstDay, from, paths, rows }, 200);
}

async function handleViews(request, env, ctx, url) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  if (!env.DB) return json({ status: 'error', message: 'D1 binding (DB) is not configured' }, 503);

  try {
    if (url.pathname === '/views/hit' && request.method === 'POST') return await handleHit(request, env, ctx);
    if (url.pathname === '/views/ranking' && request.method === 'GET') return await handleRanking(request, env, ctx);
    if (url.pathname === '/views/stats' && request.method === 'GET') return await handleStats(request, env);
  } catch (err) {
    return json({ status: 'error', message: err.message }, 500);
  }

  return json({ status: 'error', message: 'Not found' }, 404);
}

export { handleViews, jstDay, periodStart, latestDay, normalizeViewPath, isBot, mergeCounts, buildRanking, loadRanking, isAuthorized, COUNT_START_DAY, TOP_PAGE };
