export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  const response = await next();

  if (response.status === 404 && url.pathname.includes('/articles/')) {
    try {
      const articlesRes = await env.ASSETS.fetch(new URL('/articles.json', url.origin));
      
      if (articlesRes.ok) {
        const articles = await articlesRes.json();
        
        const cleanPath = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
        const requestedFileName = cleanPath.split('/').pop().replace('.html', '').toLowerCase();

        const exactMatch = articles.find(article => {
          const articleFileName = article.path.split('/').pop().replace('.html', '').toLowerCase();
          return articleFileName === requestedFileName;
        });

        if (exactMatch) {
          const newPath = exactMatch.path.startsWith('/') ? exactMatch.path : '/' + exactMatch.path;
          
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