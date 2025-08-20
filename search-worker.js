let articles = [];

self.onmessage = function (e) {
  const { type, payload } = e.data;

  if (type === "load") {
    articles = payload;
  }

  if (type === "search") {
    const { keyword, category } = payload;
    const lowerKeyword = keyword.toLowerCase();

    const results = articles.filter(article => {
      const titleMatch = article.title.toLowerCase().includes(lowerKeyword);
      const contentMatch = article.content.toLowerCase().includes(lowerKeyword);
      const categoryMatch = category === "" || article.category.includes(category);
      return (titleMatch || contentMatch) && categoryMatch;
    });

    self.postMessage(results);
  }
};
