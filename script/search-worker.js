let articles = [];
let viewedPrivate = [];

self.onmessage = function (e) {
  const { type, payload } = e.data;

  if (type === "load") {
    articles = payload.articles;
    viewedPrivate = payload.viewedPrivate || [];
    return;
  }

  if (type === "search") {
    const keyword = (payload.keyword || "").toLowerCase();
    const category = payload.category || "";

    const results = articles.filter(article => {

      if (article.visibility === "private") {
        const isViewed = viewedPrivate.some(vp => {
            return article.path.includes(vp) || vp.includes(article.path);
        });

        if (!isViewed) {
          return false;
        }
      }

      const titleMatch = article.title.toLowerCase().includes(keyword);
      const contentMatch = article.content.toLowerCase().includes(keyword);
      const categoryMatch = category === "" || article.category.includes(category);

      return (titleMatch || contentMatch) && categoryMatch;
    });

    self.postMessage(results);
  }
};
