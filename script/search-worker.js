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
        // 部分一致(includes)だと、別の記事のパスが偶然部分文字列として一致してしまい
        // 未訪問の非公開記事が表示される事故につながるため、完全一致のみを許可する。
        const isViewed = viewedPrivate.some(vp => vp === article.path);

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
