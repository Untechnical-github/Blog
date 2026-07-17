const OGP_WORKER_URL = "https://untechnical.eusng90912.workers.dev";

document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById("imgModal");
  const modalImg = document.getElementById("modalImage");

  modalImg.style.transformOrigin = "0 0";

  let cleanupZoomPan = null;

  const setupZoomPan = () => {
    if (cleanupZoomPan) { cleanupZoomPan(); cleanupZoomPan = null; }

    const container = modal;
    const img = modalImg;

    const cW = container.clientWidth;
    const cH = container.clientHeight;
    const imgW = img.offsetWidth;
    const imgH = img.offsetHeight;

    let scale = 1;
    let x = (cW - imgW) / 2;
    let y = (cH - imgH) / 2;

    // x,y,scale をそのまま適用 — ジェスチャー中は一切クランプしない（基準点のずれを防ぐ）
    const setTransform = (transition = 'none') => {
      img.style.transition = transition;
      img.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    };

    // 位置の補正 — ジェスチャーが終わった後にのみ呼ぶ
    const snap = (transition = 'transform 0.2s ease-out') => {
      const vW = imgW * scale;
      const vH = imgH * scale;
      if (scale <= 1) {
        scale = 1; x = (cW - imgW) / 2; y = (cH - imgH) / 2;
      } else {
        x = vW <= cW ? (cW - vW) / 2 : Math.max(cW - vW, Math.min(0, x));
        y = vH <= cH ? (cH - vH) / 2 : Math.max(cH - vH, Math.min(0, y));
      }
      img.style.transition = transition;
      img.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    };

    const centerImage = (animated = true) => {
      scale = 1; x = (cW - imgW) / 2; y = (cH - imgH) / 2;
      setTransform(animated ? 'transform 0.2s ease-out' : 'none');
      img.style.cursor = 'grab';
    };

    centerImage(false);
    img.style.opacity = '1';

    // ホイールズーム: クランプされていない x,y を基準にする → ドリフトなし
    let wheelSnapTimer = null;
    const onWheel = (e) => {
      e.preventDefault();
      if (wheelSnapTimer) { clearTimeout(wheelSnapTimer); wheelSnapTimer = null; }
      const newScale = scale * (1 + (e.deltaY > 0 ? -1 : 1) * 0.15);
      if (newScale <= 1) { centerImage(); return; }
      const rect = container.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const bx = (mx - x) / scale;
      const by = (my - y) / scale;
      x = mx - bx * newScale;
      y = my - by * newScale;
      scale = newScale;
      setTransform('transform 0.05s ease-out');
      wheelSnapTimer = setTimeout(() => { snap(); wheelSnapTimer = null; }, 300);
    };

    // マウスドラッグ
    let isDragging = false;
    let dragStartMouseX = 0, dragStartMouseY = 0, dragStartImageX = 0, dragStartImageY = 0;
    let canMoveX = false, canMoveY = false;

    const checkMovability = () => {
      canMoveX = imgW * scale > cW + 1;
      canMoveY = imgH * scale > cH + 1;
    };

    const onMouseDown = (e) => {
      if (scale <= 1) return;
      e.preventDefault();
      snap('none'); // ドラッグ開始前に有効な位置へ同期
      isDragging = true;
      checkMovability();
      dragStartMouseX = e.clientX; dragStartMouseY = e.clientY;
      dragStartImageX = x; dragStartImageY = y;
      img.style.cursor = 'grabbing';
      img.style.transition = 'none';
    };
    const onMouseMove = (e) => {
      if (!isDragging) return;
      e.preventDefault();
      let dx = e.clientX - dragStartMouseX;
      let dy = e.clientY - dragStartMouseY;
      if (!canMoveX) dx = 0;
      if (!canMoveY) dy = 0;
      x = dragStartImageX + dx;
      y = dragStartImageY + dy;
      setTransform();
    };
    const onMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        img.style.cursor = 'grab';
        snap('transform 0.1s ease-out');
      }
    };

    // タッチ: ピンチは絶対基準点（ドリフトなし）、単指パンは差分方式
    let isPinching = false;
    let pinchStartDist = 0, pinchStartScale = 1;
    let pinchStartBodyX = 0, pinchStartBodyY = 0;
    let singleTouching = false;
    let lastTouchX = 0, lastTouchY = 0;

    const getTouchDist = (t) => {
      const dx = t[0].clientX - t[1].clientX; const dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };
    const getTouchMid = (t) => ({
      x: (t[0].clientX + t[1].clientX) / 2,
      y: (t[0].clientY + t[1].clientY) / 2,
    });

    const onTouchStart = (e) => {
      e.preventDefault();
      if (e.touches.length === 2) {
        isPinching = true; singleTouching = false;
        const mid = getTouchMid(e.touches);
        pinchStartDist = getTouchDist(e.touches);
        pinchStartScale = scale;
        // 絶対基準点はクランプされていない x,y から1度だけ記録する
        pinchStartBodyX = (mid.x - x) / scale;
        pinchStartBodyY = (mid.y - y) / scale;
        img.style.transition = 'none';
      } else if (e.touches.length === 1 && !isPinching) {
        singleTouching = true;
        if (scale > 1) {
          checkMovability();
          lastTouchX = e.touches[0].clientX; lastTouchY = e.touches[0].clientY;
          img.style.transition = 'none';
        }
      }
    };

    const onTouchMove = (e) => {
      if (e.cancelable) e.preventDefault();
      if (e.touches.length === 2 && isPinching) {
        const currentDist = getTouchDist(e.touches);
        const currentMid = getTouchMid(e.touches);
        const newScale = pinchStartScale * currentDist / pinchStartDist;
        if (newScale <= 1) { centerImage(); return; }
        // 絶対基準点から毎フレーム再計算 — 誤差の蓄積なし
        scale = newScale;
        x = currentMid.x - pinchStartBodyX * newScale;
        y = currentMid.y - pinchStartBodyY * newScale;
        img.style.transition = 'none';
        setTransform();
      } else if (e.touches.length === 1 && singleTouching && !isPinching && scale > 1) {
        let dx = e.touches[0].clientX - lastTouchX;
        let dy = e.touches[0].clientY - lastTouchY;
        if (!canMoveX) dx = 0;
        if (!canMoveY) dy = 0;
        x += dx; y += dy;
        lastTouchX = e.touches[0].clientX; lastTouchY = e.touches[0].clientY;
        img.style.transition = 'none';
        setTransform();
      }
    };

    const onTouchEnd = (e) => {
      if (e.touches.length < 2) { isPinching = false; }
      if (e.touches.length === 1 && !isPinching) {
        singleTouching = true; checkMovability();
        lastTouchX = e.touches[0].clientX; lastTouchY = e.touches[0].clientY;
        img.style.transition = 'none';
      } else if (e.touches.length === 0) {
        singleTouching = false;
        snap();
      }
    };

    img.addEventListener('wheel', onWheel, { passive: false });
    img.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    img.addEventListener('touchstart', onTouchStart, { passive: false });
    img.addEventListener('touchmove', onTouchMove, { passive: false });
    img.addEventListener('touchend', onTouchEnd);

    cleanupZoomPan = () => {
      if (wheelSnapTimer) { clearTimeout(wheelSnapTimer); wheelSnapTimer = null; }
      img.removeEventListener('wheel', onWheel);
      img.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      img.removeEventListener('touchstart', onTouchStart);
      img.removeEventListener('touchmove', onTouchMove);
      img.removeEventListener('touchend', onTouchEnd);
    };
  };

  document.querySelectorAll(".zoomable").forEach(img => {
    img.addEventListener("click", () => {
      modalImg.style.opacity = '0';
      modalImg.src = img.src;
      modal.style.display = "block";
      document.body.style.overflow = "hidden";
      modalImg.onload = () => setupZoomPan();
      if (modalImg.complete) setupZoomPan();
    });
  });

  const closeModal = () => {
    modal.style.display = "none";
    document.body.style.overflow = "";
    if (cleanupZoomPan) { cleanupZoomPan(); cleanupZoomPan = null; }
  };

  document.querySelector(".close").addEventListener("click", closeModal);
  modal.addEventListener("click", e => {
    if (e.target.id === "imgModal") closeModal();
  });

  document.querySelectorAll("pre code").forEach(codeBlock => {
      const pre = codeBlock.parentElement;
      const button = document.createElement("button");
      button.className = "copy-btn";
      button.textContent = "Copy";
      pre.appendChild(button);
      button.addEventListener("click", async () => {
      let text = codeBlock.textContent.replace(/\[.*?\]/g, "").trim();
      try { await navigator.clipboard.writeText(text); button.textContent = "Copied!"; setTimeout(() => (button.textContent = "Copy"), 1500); } catch (err) { console.error(err); }
      });
  });

  function renderPreview(anchorElement, { title, image, description }) {
      const imageUrl = (image && typeof image === "object") ? image.url : image;
      if (title) {
          const titleElem = document.createElement("div");
          titleElem.textContent = title;
          titleElem.className = "preview-title";
          anchorElement.appendChild(titleElem);
      }
      if (imageUrl) {
          const img = document.createElement("img");
          img.src = imageUrl;
          img.alt = "Preview";
          img.width = 200;
          anchorElement.appendChild(img);
      }
      if (description) {
          const descElem = document.createElement("div");
          descElem.textContent = description;
          descElem.className = "preview-description";
          anchorElement.appendChild(descElem);
      }
  }

  async function fetchOGData(url, anchorElement) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
          const response = await fetch(`${OGP_WORKER_URL}/?url=${encodeURIComponent(url)}`, {
              signal: controller.signal
          });
          const { data, status } = await response.json();
          if (status === "success") {
              renderPreview(anchorElement, data);
          }
      } catch (error) {
          console.error("OGP error:", error);
      } finally {
          clearTimeout(timeoutId);
      }
  }

  // 記事一覧（title/path/category/image）を取得。内部リンクのプレビューと関連記事の両方で使い回す。
  async function getArticleIndex() {
      try {
          const res = await fetch('/articles.json');
          if (!res.ok) return [];
          return await res.json();
      } catch (err) {
          console.error("articles.json の取得に失敗しました:", err);
          return [];
      }
  }

  function findInternalArticle(articlesByPath, href) {
      try {
          const url = new URL(href, window.location.href);
          if (url.origin !== window.location.origin) return null;
          return articlesByPath.get(url.pathname.replace(/^\//, "")) || null;
      } catch {
          return null;
      }
  }

  // 外部リンクのOGP取得のみ、可視領域に入ってから遅延実行する（内部リンクは即座にローカルデータで描画）
  const externalPreviewObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          fetchOGData(entry.target.href, entry.target);
      });
  }, { rootMargin: "200px" });

  function setupLinkPreview(anchor, articlesByPath) {
      const article = findInternalArticle(articlesByPath, anchor.getAttribute('href'));
      if (article) {
          renderPreview(anchor, { title: article.title, image: article.image, description: null });
      } else {
          externalPreviewObserver.observe(anchor);
      }
  }

  async function loadDynamicRelatedArticles(articles, articlesByPath) {
    const section = Array.from(document.querySelectorAll('.box-section1')).find(
      sec => sec.querySelector('h2') && sec.querySelector('h2').textContent.includes('関連記事')
    );
    if (!section) return;

    const metaCat = document.querySelector('meta[name="category"]');
    if (!metaCat) return;
    const currentCats = metaCat.content.split(',').map(c => c.trim()).filter(Boolean);
    if (currentCats.length === 0) return;

    const currentPath = window.location.pathname;

    const related = articles.filter(article => {

      if (currentPath.includes(article.path)) return false;

      if (article.visibility === "private") return false;

      return article.category && article.category.some(c => currentCats.includes(c));
    });

    const existingLinks = Array.from(section.querySelectorAll('.link-preview')).map(a => {
      return new URL(a.getAttribute('href'), window.location.origin).href;
    });

    const MAX_ADD = 10;
    let addedCount = 0;

    for (const article of related) {
      if (addedCount >= MAX_ADD) break;

      const articleUrl = new URL("/" + article.path, window.location.origin).href;

      if (existingLinks.includes(articleUrl)) continue;

      const a = document.createElement('a');
      a.href = "/" + article.path;
      a.target = "_blank";
      a.className = "link-preview";
      section.appendChild(a);

      setupLinkPreview(a, articlesByPath);
      addedCount++;
    }
  }

  (async () => {
      const articles = await getArticleIndex();
      const articlesByPath = new Map(articles.map(a => [a.path, a]));

      document.querySelectorAll(".link-preview").forEach(anchor => setupLinkPreview(anchor, articlesByPath));

      await loadDynamicRelatedArticles(articles, articlesByPath);
  })();
});