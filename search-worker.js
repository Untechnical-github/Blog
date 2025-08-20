// search-worker.js
let articles = [];

// 記事データを受け取る
self.onmessage = function (e) {
  const { type, payload } = e.data;

  if (type === "load") {
    articles = payload;
  }

  if (type === "search") {
    const keyword = payload.toLowerCase();
    const results = articles.filter(article =>
      article.title.toLowerCase().includes(keyword) ||
      article.content.toLowerCase().includes(keyword) ||
      article.category.some(cat => cat.toLowerCase().includes(keyword))
    );
    self.postMessage(results);
  }
};
