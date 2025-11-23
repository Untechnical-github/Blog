let articles = [];

self.onmessage = function (e) {
  const { type, payload } = e.data;

  if (type === "load") {
    articles = payload;
    return;
  }

  if (type === "search") {

    const keyword = (payload.keyword || "").toLowerCase();
    const category = payload.category || "";

    const results = articles.filter(article => {

      const titleMatch = article.title.toLowerCase().includes(keyword);
      const contentMatch = article.content.toLowerCase().includes(keyword);

      const categoryMatch = category === "" || article.category.includes(category);

      return (titleMatch || contentMatch) && categoryMatch;
    });

    self.postMessage(results);
  }
};