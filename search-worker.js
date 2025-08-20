let articles = [];

self.onmessage = function (e) {
  const { type, payload } = e.data;

  if (type === "load") {
    articles = payload;
  }

  if (type === "search") {
    const keyword = payload.toLowerCase();
    const results = articles.filter(article => {
      const titleMatch = article.title?.toLowerCase().includes(keyword);
      const contentMatch = article.content?.toLowerCase().includes(keyword);
      const categoryMatch = Array.isArray(article.category)
        ? article.category.some(cat => cat.toLowerCase().includes(keyword))
        : false;
      return titleMatch || contentMatch || categoryMatch;
    });
    self.postMessage(results);
  }
};
