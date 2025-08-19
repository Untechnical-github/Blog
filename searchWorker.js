self.onmessage = function(e) {
  const { articles, query, category } = e.data;

  const filtered = articles.filter(article => {
    const matchCategory = !category || article.category.map(c => c.toLowerCase()).includes(category.toLowerCase());
    const matchQuery = !query || article.title.toLowerCase().includes(query.toLowerCase()) || article.content.toLowerCase().includes(query.toLowerCase());
    return matchCategory && matchQuery;
  });

  const highlighted = filtered.map(article => {
    if (!query) return article;
    const idx = article.content.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return article;
    const snippet = article.content.substring(Math.max(0, idx - 50), idx + query.length + 50);
    const highlightedSnippet = snippet.replace(new RegExp(query, "gi"), match => `<strong>${match}</strong>`);
    return { ...article, snippet: `...${highlightedSnippet}...` };
  });

  postMessage(highlighted);
};
