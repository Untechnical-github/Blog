document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById("imgModal");
  const modalImg = document.getElementById("modalImage");

  // 【重要】座標計算を正確にするため、変形の起点を左上に固定
  modalImg.style.transformOrigin = "0 0";

  let state = { x: 0, y: 0, scale: 1 };

  const updateTransform = () => {
    modalImg.style.transform = `translate3d(${state.x}px, ${state.y}px, 0) scale(${state.scale})`;
  };

  // --- 座標の制限（はみ出し防止）を行う関数 ---
  const clampState = () => {
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const imgW = modalImg.offsetWidth;
    const imgH = modalImg.offsetHeight;

    // 現在のスケールでの画像の幅と高さ
    const currentW = imgW * state.scale;
    const currentH = imgH * state.scale;

    // --- 横方向(X)の制限 ---
    if (currentW <= winW) {
      // 画像が画面より小さい場合：常に中央寄せ
      state.x = (winW - currentW) / 2;
    } else {
      // 画像が画面より大きい場合：端が画面内に入り込まないように制限
      // 左端の制限: x は 0 以下（0を超えると左に隙間ができる）
      if (state.x > 0) {
        state.x = 0;
      }
      // 右端の制限: x は (画面幅 - 画像幅) 以上
      const minX = winW - currentW;
      if (state.x < minX) {
        state.x = minX;
      }
    }

    // --- 縦方向(Y)の制限 ---
    if (currentH <= winH) {
      // 画像が画面より小さい場合：常に中央寄せ
      state.y = (winH - currentH) / 2;
    } else {
      // 上端の制限
      if (state.y > 0) {
        state.y = 0;
      }
      // 下端の制限
      const minY = winH - currentH;
      if (state.y < minY) {
        state.y = minY;
      }
    }
  };

  const centerImage = () => {
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const imgW = modalImg.offsetWidth;
    const imgH = modalImg.offsetHeight;

    state.scale = 1;
    // clampStateのロジックで中央に来るが、初期値として計算
    state.x = (winW - imgW) / 2;
    state.y = (winH - imgH) / 2;
    
    // 念のため制限を適用
    clampState();

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

  // --- マウスホイールでの拡大縮小 ---
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
    
    // 現在の座標系でのマウス位置（左上基準）
    const currentOffsetX = mouseX - state.x;
    const currentOffsetY = mouseY - state.y;
    
    // 画像内部での正規化位置
    const imageInternalX = currentOffsetX / state.scale;
    const imageInternalY = currentOffsetY / state.scale;

    // 新しいスケールでのオフセット
    const newOffsetX = imageInternalX * newScale;
    const newOffsetY = imageInternalY * newScale;

    state.x = mouseX - newOffsetX;
    state.y = mouseY - newOffsetY;
    state.scale = newScale;

    // はみ出し防止を適用
    clampState();

    modalImg.style.transition = "transform 0.05s ease-out";
    updateTransform();
  }, { passive: false });

  // --- PCでのドラッグ操作 ---
  let isDraggingPC = false;
  let dragStartMouseX, dragStartMouseY;
  let dragStartImageX, dragStartImageY;

  modalImg.addEventListener('mousedown', e => {
    if (state.scale <= 1) return;
    e.preventDefault();
    isDraggingPC = true;
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
    const dx = e.clientX - dragStartMouseX;
    const dy = e.clientY - dragStartMouseY;
    state.x = dragStartImageX + dx;
    state.y = dragStartImageY + dy;

    // はみ出し防止を適用
    clampState();

    updateTransform();
  });

  window.addEventListener('mouseup', () => {
    if (isDraggingPC) {
      isDraggingPC = false;
      modalImg.style.cursor = "grab";
      modalImg.style.transition = "transform 0.1s ease-out";
    }
  });

  // --- スマホでのタッチ操作（ピンチ＆ドラッグ） ---
  let lastTouchDistance = 0;
  let lastTouchCenter = { x: 0, y: 0 };
  
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
          lastTouchX = e.touches[0].clientX;
          lastTouchY = e.touches[0].clientY;
          modalImg.style.transition = "none";
      }
    } else if (e.touches.length === 2) {
      isPinching = true;
      lastTouchDistance = getDistance(e.touches);
      lastTouchCenter = getMidpoint(e.touches);
      modalImg.style.transition = "none";
    }
  }, { passive: false });

  modalImg.addEventListener('touchmove', (e) => {
    if (e.cancelable) e.preventDefault();

    // シングルタッチ（ドラッグ）
    if (e.touches.length === 1 && !isPinching) {
      if (state.scale <= 1) return;

      const dx = e.touches[0].clientX - lastTouchX;
      const dy = e.touches[0].clientY - lastTouchY;
      
      state.x += dx;
      state.y += dy;
      
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
      
      // はみ出し防止を適用
      clampState();

      modalImg.style.transition = "none";
      updateTransform();

    } 
    // マルチタッチ（ピンチズーム）
    else if (e.touches.length === 2) {
      const currentDistance = getDistance(e.touches);
      const currentCenter = getMidpoint(e.touches);

      if (lastTouchDistance === 0) return;

      const scaleRatio = currentDistance / lastTouchDistance;
      let newScale = state.scale * scaleRatio;

      if (newScale <= 1) {
          centerImage();
          return;
      }

      const relativeX = lastTouchCenter.x - state.x;
      const relativeY = lastTouchCenter.y - state.y;
      
      state.x = currentCenter.x - (relativeX * scaleRatio);
      state.y = currentCenter.y - (relativeY * scaleRatio);
      state.scale = newScale;

      lastTouchDistance = currentDistance;
      lastTouchCenter = currentCenter;

      // はみ出し防止を適用
      clampState();

      modalImg.style.transition = "none";
      updateTransform();
    }
  }, { passive: false });

  modalImg.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
      isPinching = false;
    }

    if (e.touches.length === 1) {
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
      modalImg.style.transition = "none";
    } 
    else if (e.touches.length === 0) {
      modalImg.style.transition = "transform 0.1s ease-out";
    }
  });

  // --- その他の機能（リンクプレビュー、コピーボタン） ---
  async function fetchOGData(url, anchorElement) {
      try {
      const response = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`);
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
      } catch (error) { console.error("OGP error:", error); }
  }

  document.querySelectorAll(".link-preview").forEach(async (anchor) => { await fetchOGData(anchor.href, anchor); });

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
});