// 404が連続で発生した場合（クローラーの巡回など）に、毎回 ASSETS.fetch + JSON parse が
// 走らないよう、redirect-map.json はエッジキャッシュに載せて数分間使い回す。
async function loadRedirectMap(env, origin, waitUntil) {
  const redirectMapUrl = new URL('/redirect-map.json', origin).href;
  const cache = caches.default;
  const cacheKey = new Request(redirectMapUrl);

  const cached = await cache.match(cacheKey);
  if (cached) return cached.json();

  const redirectMapRes = await env.ASSETS.fetch(redirectMapUrl);
  if (!redirectMapRes.ok) return null;

  const cacheableResponse = new Response(redirectMapRes.clone().body, redirectMapRes);
  cacheableResponse.headers.set('Cache-Control', 'max-age=300');
  waitUntil(cache.put(cacheKey, cacheableResponse));

  return redirectMapRes.json();
}

export async function onRequest(context) {
  const { request, env, next, waitUntil } = context;
  const url = new URL(request.url);

  const response = await next();

  if (response.status === 404 && url.pathname.includes('/articles/')) {
    try {
      const redirectMap = await loadRedirectMap(env, url.origin, waitUntil);

      if (redirectMap) {
        const cleanPath = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
        const requestedFileName = cleanPath.split('/').pop().replace('.html', '').toLowerCase();

        const matchedPath = redirectMap[requestedFileName];

        if (matchedPath) {
          const newPath = matchedPath.startsWith('/') ? matchedPath : '/' + matchedPath;

          const newPathNoExt = newPath.replace('.html', '');

          if (cleanPath !== newPath && cleanPath !== newPathNoExt) {
            return new Response(null, {
              status: 301,
              headers: {
                'Location': newPathNoExt,
                'Cache-Control': 'max-age=3600'
              }
            });
          }
        }
      }
    } catch (err) {
    }
  }

  return response;
}