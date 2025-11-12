(function () {
  'use strict';
  if (window.top !== window.self) return;
  if (document.getElementById('kt-ui-box')) return;

  let isActive = false;
  let skipOffset = 0;
  let startTime = null;
  let fps = 0, frameCount = 0, lastFpsUpdate = performance.now();

  let scrollActive = false, scrollTimer = null;
  let FPS_LIMIT = parseInt(localStorage.getItem('kt-fps-limit')) || 5;
  let scrollSpeed = parseFloat(localStorage.getItem('kt-scroll-speed')) || 0.51;
  let collapsed = localStorage.getItem('kt-ui-collapsed') === 'true';

  // ===== Auto Scroll (vẫn chạy khi tab ẩn) =====
  function startAutoScroll() {
    if (scrollActive) return;
    scrollActive = true;

    const el = document.scrollingElement || document.body;
    let direction = -1, distance = 0;
    const maxScroll = 800, interval = 1000 / FPS_LIMIT;

    scrollTimer = setInterval(() => {
      if (!scrollActive) return;
      el.scrollBy(0, direction * scrollSpeed);
      distance += scrollSpeed;
      frameCount++;

      if (el.scrollTop <= 0 && direction === -1) {
        el.scrollTo(0, el.scrollHeight);
        distance = 0;
      } else if (el.scrollTop + el.clientHeight >= el.scrollHeight && direction === 1) {
        el.scrollTo(0, 0);
        distance = 0;
      }

      if (Math.abs(distance) > maxScroll) {
        direction *= -1;
        distance = 0;
      }
    }, interval);

    setInterval(() => {
      if (!scrollActive) return;
      fps = frameCount;
      frameCount = 0;
    }, 1000);
  }

  function stopAutoScroll() {
    scrollActive = false;
    if (scrollTimer) clearInterval(scrollTimer);
  }

  // ===== Giữ hoạt động khi tab ẩn =====
  function enableVisibilityOverride() {
    try {
      Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => false });
      Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => 'visible' });
      const origAdd = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function (type, listener, opt) {
        if (type === 'visibilitychange') return;
        return origAdd.call(this, type, listener, opt);
      };
    } catch (e) {}
  }

  const formatDuration = (ms) => {
    const s = Math.floor(ms / 1000), m = Math.floor(s / 60), r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  };

  // ===== UI =====
  function createUI() {
    const box = document.createElement('div');
    box.id = 'kt-ui-box';
    box.style.cssText = `
      position:fixed;bottom:${localStorage.getItem('kt-ui-y') || '30px'};
      right:${localStorage.getItem('kt-ui-x') || '30px'};
      z-index:999999;padding:18px;border-radius:14px;
      font-family:Consolas,system-ui,sans-serif;font-size:16px;
      background:linear-gradient(145deg,#111,#2b2b2b);color:#fff;
      min-width:320px;box-shadow:0 4px 20px rgba(0,0,0,.6);backdrop-filter:blur(8px);
      cursor:move;user-select:none;overflow:hidden;transition:all .3s ease;
    `;

    // CSS cho animation thu/phóng
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideUp { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-15px); opacity: 0; } }
      @keyframes slideDown { from { transform: translateY(-15px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      .slide-up { animation: slideUp .25s ease forwards; }
      .slide-down { animation: slideDown .25s ease forwards; }
    `;
    document.head.appendChild(style);

    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="font-weight:800;font-size:18px;">⏱ Time Keep Running</div>
        <button id="kt-collapse" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer;">${collapsed ? '🔼' : '🔽'}</button>
      </div>
      <div id="kt-content" style="${collapsed ? 'display:none;' : ''}">
        <div id="kt-status" style="text-align:center;margin:8px 0;font-size:17px;color:#f33;">🔴 OFF</div>
        <div style="font-size:14px;text-align:center;">⏳ Thời gian: <span id="kt-time">00:00</span></div>
        <div style="font-size:14px;text-align:center;margin:6px 0;">🎯 FPS Hiện tại: <span id="kt-fps">0</span></div>

        <div style="margin-top:6px;font-size:14px;text-align:center;">
          🌀 Scroll Speed:
          <input id="kt-speed" type="number" step="0.01" min="0.1" value="${scrollSpeed}" style="width:70px;text-align:center;border:none;border-radius:6px;padding:2px 4px;background:#222;color:#fff;margin-left:6px;">
        </div>
        <div style="margin-top:6px;font-size:14px;text-align:center;">
          ⚙️ FPS LIMIT:
          <input id="kt-fpslimit" type="number" step="1" min="1" value="${FPS_LIMIT}" style="width:60px;text-align:center;border:none;border-radius:6px;padding:2px 4px;background:#222;color:#fff;margin-left:6px;">
        </div>

        <button id="kt-toggle" style="margin-top:10px;width:100%;border:none;border-radius:8px;background:#0078ff;color:#fff;padding:10px 0;font-size:15px;cursor:pointer">Bật lại</button>
        <button id="kt-skip" style="margin-top:8px;width:100%;border:none;border-radius:8px;background:#ff7a00;color:#fff;padding:8px 0;font-size:15px;cursor:pointer;">
          ⚡ Skip Time<br><span style="font-size:12px;color:#fff8;">(Không Hoạt Động / Cannot be used)</span>
        </button>

        <div style="margin-top:10px;font-size:13px;color:#ccc;">Website tự bật (phân tách bằng dấu phẩy):</div>
        <textarea id="kt-autosites" rows="3" style="width:100%;margin-top:4px;resize:none;border-radius:6px;padding:6px;font-size:13px;background:#222;color:#fff;border:1px solid #555;box-sizing:border-box"></textarea>
        <button id="kt-save" style="margin-top:6px;width:100%;border:none;border-radius:6px;background:#444;color:#fff;padding:7px 0;cursor:pointer;font-size:13px">💾 Lưu danh sách</button>

        <div style="margin-top:10px;text-align:center;font-size:12px;color:#aaa;">Version 6.2 (Full UI + Cuộn khi ẩn tab + FPS mặc định 5 + Thu nhỏ trượt mượt)</div>
      </div>
    `;
    document.body.appendChild(box);

    // ===== Kéo thả UI =====
    let dragging = false, startX = 0, startY = 0, startRight = 0, startBottom = 0;
    box.addEventListener('mousedown', e => {
      if (['kt-toggle','kt-skip','kt-autosites','kt-save','kt-speed','kt-fpslimit','kt-collapse'].includes(e.target.id)) return;
      dragging = true;
      const r = box.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY;
      startRight = window.innerWidth - r.right; startBottom = window.innerHeight - r.bottom;
      e.preventDefault();
    });
    document.addEventListener('mouseup', () => dragging = false);
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      const newRight = Math.max(0, startRight - dx);
      const newBottom = Math.max(0, startBottom - dy);
      box.style.right = `${newRight}px`; box.style.bottom = `${newBottom}px`;
      localStorage.setItem('kt-ui-x', `${newRight}px`);
      localStorage.setItem('kt-ui-y', `${newBottom}px`);
    });

    // ===== Collapse (Thu nhỏ/mở rộng) =====
    const collapseBtn = box.querySelector('#kt-collapse');
    const content = box.querySelector('#kt-content');
    collapseBtn.onclick = () => {
      if (!collapsed) {
        content.classList.remove('slide-down');
        content.classList.add('slide-up');
        setTimeout(() => { content.style.display = 'none'; }, 200);
      } else {
        content.style.display = '';
        content.classList.remove('slide-up');
        content.classList.add('slide-down');
      }
      collapsed = !collapsed;
      collapseBtn.textContent = collapsed ? '🔼' : '🔽';
      localStorage.setItem('kt-ui-collapsed', collapsed);
    };

    // ===== Các phần tử chính =====
    const status = box.querySelector('#kt-status');
    const fpsEl = box.querySelector('#kt-fps');
    const timeEl = box.querySelector('#kt-time');
    const btn = box.querySelector('#kt-toggle');
    const skipBtn = box.querySelector('#kt-skip');
    const txt = box.querySelector('#kt-autosites');
    const saveBtn = box.querySelector('#kt-save');
    const speedInput = box.querySelector('#kt-speed');
    const fpsInput = box.querySelector('#kt-fpslimit');

    speedInput.addEventListener('input', () => {
      const val = parseFloat(speedInput.value);
      if (!isNaN(val) && val > 0) { scrollSpeed = val; localStorage.setItem('kt-scroll-speed', val); }
    });
    fpsInput.addEventListener('input', () => {
      const val = parseInt(fpsInput.value);
      if (!isNaN(val) && val >= 1) { FPS_LIMIT = val; localStorage.setItem('kt-fps-limit', val); }
    });

    txt.value = localStorage.getItem('kt-auto-sites') || '';

    function activate() {
      startTime = Date.now();
      isActive = true;
      enableVisibilityOverride();
      startAutoScroll();
      status.innerHTML = '🟢 ON'; status.style.color = '#0f0'; btn.innerText = 'Tắt tạm thời';
    }
    function deactivate() {
      isActive = false;
      stopAutoScroll();
      status.innerHTML = '🔴 OFF'; status.style.color = '#f33'; btn.innerText = 'Bật lại';
    }

    btn.onclick = () => { isActive ? deactivate() : activate(); };
    skipBtn.onclick = () => alert('⚠️ Chức năng này hiện KHÔNG HOẠT ĐỘNG / Cannot be used.');
    saveBtn.onclick = () => {
      const v = txt.value.trim();
      localStorage.setItem('kt-auto-sites', v);
      alert('✅ Đã lưu danh sách website tự bật!');
    };

    setInterval(() => {
      fpsEl.textContent = `${isActive ? fps : 0}`;
      if (isActive && startTime) timeEl.textContent = formatDuration(Date.now() - startTime);
    }, 1000);

    const host = location.hostname.toLowerCase().replace(/^www\./, '');
    const list = (txt.value || '').split(',').map(s => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '')).filter(Boolean);
    if (list.some(site => host.includes(site))) activate();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', createUI);
  else createUI();
})();
