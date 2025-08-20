let articles = [];

self.onmessage = function (e) {
  const { type, payload } = e.data;

  // 最初に記事データを読み込む
  if (type === "load") {
    articles = payload;
    return;
  }

  // 検索処理
  if (type === "search") {
    // ★★★ ここが修正点 ★★★
    // payloadオブジェクトからkeywordとcategoryを正しく取り出す
    const keyword = (payload.keyword || "").toLowerCase();
    const category = payload.category || "";

    const results = articles.filter(article => {
      // キーワードがタイトルか内容に含まれるかチェック
      const titleMatch = article.title.toLowerCase().includes(keyword);
      const contentMatch = article.content.toLowerCase().includes(keyword);
      
      // カテゴリが一致するかチェック（「全て」の場合は常にtrue）
      const categoryMatch = category === "" || article.category.includes(category);
      
      // 両方の条件を満たすものを結果とする
      return (titleMatch || contentMatch) && categoryMatch;
    });

    // 結果をメインスレッドに返す
    self.postMessage(results);
  }
};