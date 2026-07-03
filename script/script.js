document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById("imgModal");
  const modalImg = document.getElementById("modalImage");

  modalImg.style.transformOrigin = "0 0";

  let state = { x: 0, y: 0, scale: 1 };
  let canMoveX = false;
  let canMoveY = false;

  const updateTransform = () => {
    modalImg.style.transform = `translate3d(${state.x}px, ${state.y}px, 0) scale(${state.scale})`;
  };

  const checkMoveability = () => {
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const currentW = modalImg.offsetWidth * state.scale;
    const currentH = modalImg.offsetHeight * state.scale;
    canMoveX = currentW > winW + 1;
    canMoveY = currentH > winH + 1;
  };

  // 画像が画面より大きい辺だけ、その場でリアルタイムに範囲内へ収める。
  // 画面より小さい辺には一切触れない（カーソル/指を中心にしたズームの挙動を崩さないため）。
  const clampToViewport = () => {
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const currentW = modalImg.offsetWidth * state.scale;
    const currentH = modalImg.offsetHeight * state.scale;

    if (currentW > winW) {
      const minX = winW - currentW;
      if (state.x > 0) state.x = 0;
      else if (state.x < minX) state.x = minX;
    }

    if (currentH > winH) {
      const minY = winH - currentH;
      if (state.y > 0) state.y = 0;
      else if (state.y < minY) state.y = minY;
    }
  };

  const centerImage = () => {
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const imgW = modalImg.offsetWidth;
    const imgH = modalImg.offsetHeight;

    state.scale = 1;
    state.x = (winW - imgW) / 2;
    state.y = (winH - imgH) / 2;

    modalImg.style.transition = "transform 0.1s ease-out";
    updateTransform();
    modalImg.style.cursor = "grab";
  };

  document.querySelectorAll(".zoomable").forEach(img => {
    img.addEventListener("click", () => {
      modalImg.src = img.src;
      modal.style.display = "block";
      document.body.style.overflow = "hidden";
      modalImg.onload = () => centerImage();
      if (modalImg.complete) centerImage();
    });
  });

  const closeModal = () => {
    modal.style.display = "none";
    document.body.style.overflow = "";
    state = { x: 0, y: 0, scale: 1 };
  };

  document.querySelector(".close").addEventListener("click", closeModal);
  modal.addEventListener("click", e => {
    if (e.target.id === "imgModal") closeModal();
  });

  modalImg.addEventListener('wheel', (e) => {
    e.preventDefault();

    const direction = e.deltaY > 0 ? -1 : 1;
    const factorStep = 0.15;
    let newScale = state.scale * (1 + direction * factorStep);

    if (newScale <= 1) {
      centerImage();
      return;
    }

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    // クランプされていない現在位置を基準にカーソル位置を固定してズーム
    const imageInternalX = (mouseX - state.x) / state.scale;
    const imageInternalY = (mouseY - state.y) / state.scale;

    state.x = mouseX - imageInternalX * newScale;
    state.y = mouseY - imageInternalY * newScale;
    state.scale = newScale;

    clampToViewport();

    modalImg.style.transition = "transform 0.05s ease-out";
    updateTransform();
  }, { passive: false });

  let isDraggingPC = false;
  let dragStartMouseX, dragStartMouseY;
  let dragStartImageX, dragStartImageY;

  modalImg.addEventListener('mousedown', e => {
    if (state.scale <= 1) return;
    e.preventDefault();

    isDraggingPC = true;
    checkMoveability();

    dragStartMouseX = e.clientX;
    dragStartMouseY = e.clientY;
    dragStartImageX = state.x;
    dragStartImageY = state.y;
    modalImg.style.cursor = "grabbing";
    modalImg.style.transition = "none";
  });

  window.addEventListener('mousemove', e => {
    if (!isDraggingPC) return;
    e.preventDefault();
    let dx = e.clientX - dragStartMouseX;
    let dy = e.clientY - dragStartMouseY;

    if (!canMoveX) dx = 0;
    if (!canMoveY) dy = 0;

    state.x = dragStartImageX + dx;
    state.y = dragStartImageY + dy;

    clampToViewport();
    updateTransform();
  });

  window.addEventListener('mouseup', () => {
    if (isDraggingPC) {
      isDraggingPC = false;
      modalImg.style.cursor = "grab";
      modalImg.style.transition = "transform 0.1s ease-out";
    }
  });

  let pinchStartDistance = 0;
  let pinchStartScale = 1;
  let pinchStartImageX = 0; // ピンチ開始時のズーム中心（画像内部座標、以後固定）
  let pinchStartImageY = 0;
  let isPinching = false;
  let lastTouchX = 0;
  let lastTouchY = 0;

  const getDistance = (touches) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getMidpoint = (touches) => {
      return {
          x: (touches[0].clientX + touches[1].clientX) / 2,
          y: (touches[0].clientY + touches[1].clientY) / 2
      };
  };

  modalImg.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      if (state.scale > 1) {
          checkMoveability();
          lastTouchX = e.touches[0].clientX;
          lastTouchY = e.touches[0].clientY;
          modalImg.style.transition = "none";
      }
    } else if (e.touches.length === 2) {
      isPinching = true;
      pinchStartDistance = getDistance(e.touches);
      pinchStartScale = state.scale;
      const mid = getMidpoint(e.touches);
      // 基準点はジェスチャー開始時に1度だけ記録する（毎フレーム更新すると誤差が蓄積し、
      // 指の中心がズームの中心からずれてしまうため）
      pinchStartImageX = (mid.x - state.x) / state.scale;
      pinchStartImageY = (mid.y - state.y) / state.scale;
      modalImg.style.transition = "none";
    }
  }, { passive: false });

  modalImg.addEventListener('touchmove', (e) => {
    if (e.cancelable) e.preventDefault();

    if (e.touches.length === 1 && !isPinching) {
      if (state.scale <= 1) return;

      let dx = e.touches[0].clientX - lastTouchX;
      let dy = e.touches[0].clientY - lastTouchY;
      
      if (!canMoveX) dx = 0;
      if (!canMoveY) dy = 0;

      state.x += dx;
      state.y += dy;

      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;

      clampToViewport();

      modalImg.style.transition = "none";
      updateTransform();

    }
    else if (e.touches.length === 2) {
      const currentDistance = getDistance(e.touches);
      const currentCenter = getMidpoint(e.touches);

      if (pinchStartDistance === 0) return;

      const newScale = pinchStartScale * (currentDistance / pinchStartDistance);

      if (newScale <= 1) {
          centerImage();
          return;
      }

      // 開始時に固定した基準点から毎フレーム再計算することで、指の中心を維持する
      state.x = currentCenter.x - pinchStartImageX * newScale;
      state.y = currentCenter.y - pinchStartImageY * newScale;
      state.scale = newScale;

      clampToViewport();

      modalImg.style.transition = "none";
      updateTransform();
    }
  }, { passive: false });

  modalImg.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
      isPinching = false;
    }

    if (e.touches.length === 1) {
      checkMoveability();
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
      modalImg.style.transition = "none";
    }
    else if (e.touches.length === 0) {
      modalImg.style.transition = "transform 0.1s ease-out";
    }
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

  async function fetchOGData(url, anchorElement) {
      const WORKER_URL = "https://untechnical.eusng90912.workers.dev/";

      try {
          const response = await fetch(`${WORKER_URL}/?url=${encodeURIComponent(url)}`);
          const { data, status } = await response.json();
          if (status === "success") {
              if (data.title) {
                  const titleElem = document.createElement("div");
                  titleElem.textContent = data.title;
                  titleElem.className = "preview-title";
                  anchorElement.appendChild(titleElem);
              }
              if (data.image?.url) {
                  const img = document.createElement("img");
                  img.src = data.image.url;
                  img.alt = "Preview";
                  img.width = 200;
                  anchorElement.appendChild(img);
              }
              if (data.description) {
                  const descElem = document.createElement("div");
                  descElem.textContent = data.description;
                  descElem.className = "preview-description";
                  anchorElement.appendChild(descElem);
              }
          }
      } catch (error) { 
          console.error("OGP error:", error); 
      }
  }

  document.querySelectorAll(".link-preview").forEach(async (anchor) => { await fetchOGData(anchor.href, anchor); });

  async function loadDynamicRelatedArticles() {
    const section = Array.from(document.querySelectorAll('.box-section1')).find(
      sec => sec.querySelector('h2') && sec.querySelector('h2').textContent.includes('関連記事')
    );
    if (!section) return;

    const metaCat = document.querySelector('meta[name="category"]');
    if (!metaCat) return;
    const currentCats = metaCat.content.split(',').map(c => c.trim()).filter(Boolean);
    if (currentCats.length === 0) return;

    try {

      const res = await fetch('/articles.json');
      if (!res.ok) return;
      const articles = await res.json();

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

        fetchOGData(a.href, a);
        addedCount++;
      }
    } catch (err) {
      console.error("関連記事の動的読み込みに失敗しました:", err);
    }
  }

  loadDynamicRelatedArticles();
});