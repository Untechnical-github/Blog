let articles = [];

// JSON をロード
async function loadArticles() {
  const res = await fetch("articles.json");
  articles = await res.json();
}

loadArticles();

// メッセージを受け取ったら検索処理
self.onmessage = (e) => {
  const { query, category } = e.data;
  const q = query.toLowerCase();

  let results = articles.filter(article => {
    const inCategory = category ? article.category.includes(category) : true;
    const inText = article.title.toLowerCase().includes(q) || article.content.toLowerCase().includes(q);
    return inCategory && inText;
  });

  self.postMessage(results);
};
