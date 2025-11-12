(function () {
  'use strict';
  if (window.top !== window.self) return;
  if (document.getElementById('kt-ui-box')) return;

  // -------------------- State --------------------
  let isActive = false;
  let startTime = null;

  let FPS_LIMIT = parseInt(localStorage.getItem('kt-fps-limit')) || 5;
  let scrollSpeed = parseFloat(localStorage.getItem('kt-scroll-speed')) || 0.51;
  let collapsed = localStorage.getItem('kt-ui-collapsed') === 'true';

  // FPS cuộn thực (đếm tick xử lý)
  let scrollFPS = 0, frameCount = 0;
  let fpsDisplayTimer = null;

  // Scroll state
  let worker = null;
  let workerAlive = false;

  // -------------------- Visibility spoof (nhẹ) --------------------
  // Không phá nghiêm trọng, chỉ ngăn app chặn khi tab ẩn
  try {
    Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => 'visible' });
  } catch (e) { /* ignore */ }

  // -------------------- Worker builder --------------------
  function buildWorker() {
    const code = `
      let running = false;
      let fps = 5;
      let timer = null;

      function schedule() {
        const interval = Math.max(1, Math.floor(1000 / fps));
        timer = setTimeout(() => {
          if (!running) return;
          postMessage({ t: 'tick', now: Date.now() });
          schedule();
        }, interval);
      }

      onmessage = (e) => {
        const d = e.data || {};
        if (d.t === 'start') {
          fps = Math.max(1, d.fps|0);
          if (running) return;
          running = true;
          schedule();
          postMessage({ t: 'status', running: true });
        } else if (d.t === 'stop') {
          running = false;
          if (timer) clearTimeout(timer);
          postMessage({ t: 'status', running: false });
        } else if (d.t === 'set_fps') {
          fps = Math.max(1, d.fps|0);
        }
      };
    `;
    const blob = new Blob([code], { type: 'application/javascript' });
    return new Worker(URL.createObjectURL(blob));
  }

  // -------------------- Auto-scroll using worker ticks --------------------
  let direction = -1; // -1 lên, 1 xuống
  let distance = 0;
  const maxScroll = 800;

  function startWorker() {
    if (workerAlive) return;
    worker = buildWorker();
    worker.onmessage = (e) => {
      const msg = e.data || {};
      if (msg.t === 'status') {
        workerAlive = !!msg.running;
        return;
      }
      if (msg.t === 'tick') {
        handleScrollTick();
      }
    };
    worker.postMessage({ t: 'start', fps: FPS_LIMIT });
    workerAlive = true;

    // FPS display counter
    if (fpsDisplayTimer) clearInterval(fpsDisplayTimer);
    fpsDisplayTimer = setInterval(() => {
      if (!isActive) return;
      scrollFPS = frameCount;
      frameCount = 0;
    }, 1000);
  }

  function stopWorker() {
    if (worker) {
      try { worker.postMessage({ t: 'stop' }); worker.terminate(); } catch (e) {}
    }
    worker = null;
    workerAlive = false;
    if (fpsDisplayTimer) { clearInterval(fpsDisplayTimer); fpsDisplayTimer = null; }
  }

  function handleScrollTick() {
    const el = document.scrollingElement || document.documentElement || document.body;
    // tick scroll
    el.scrollBy(0, direction * scrollSpeed);
    distance += scrollSpeed;
    frameCount++;

    // chạm đầu/cuối -> vòng
    if (el.scrollTop <= 0 && direction === -1) {
      el.scrollTo(0, el.scrollHeight);
      distance = 0;
    } else if (el.scrollTop + el.clientHeight >= el.scrollHeight && direction === 1) {
      el.scrollTo(0, 0);
      distance = 0;
    }
  }

  function setWorkerFPS(n) {
    FPS_LIMIT = Math.max(1, n|0);
    localStorage.setItem('kt-fps-limit', FPS_LIMIT.toString());
    if (workerAlive && worker) worker.postMessage({ t: 'set_fps', fps: FPS_LIMIT });
  }

  // -------------------- UI helpers --------------------
  const formatDuration = (ms) => {
    const s = Math.floor(ms / 1000), m = Math.floor(s / 60), r = s % 60;
    return `${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`;
  };

  // -------------------- UI --------------------
  function createUI() {
    // style for slide animations
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideUp { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-15px); opacity: 0; } }
      @keyframes slideDown { from { transform: translateY(-15px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      .slide-up { animation: slideUp .25s ease forwards; }
      .slide-down { animation: slideDown .25s ease forwards; }
      .kt-input { width:70px;text-align:center;border:none;border-radius:6px;padding:2px 4px;background:#222;color:#fff;margin-left:6px; }
      .kt-btn { width:100%;border:none;border-radius:8px;padding:10px 0;font-size:15px;cursor:pointer }
    `;
    document.head.appendChild(style);

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
          <input id="kt-speed" type="number" step="0.01" min="0.1" value="${scrollSpeed}" class="kt-input">
        </div>
        <div style="margin-top:6px;font-size:14px;text-align:center;">
          ⚙️ FPS LIMIT:
          <input id="kt-fpslimit" type="number" step="1" min="1" value="${FPS_LIMIT}" class="kt-input">
        </div>

        <button id="kt-toggle" class="kt-btn" style="background:#0078ff;color:#fff;margin-top:10px;">Bật lại</button>
        <button id="kt-skip" class="kt-btn" style="background:#ff7a00;color:#fff;margin-top:8px;">
          ⚡ Skip Time<br><span style="font-size:12px;color:#fff8;">(Không Hoạt Động / Cannot be used)</span>
        </button>

        <div style="margin-top:10px;font-size:13px;color:#ccc;">Website tự bật (phân tách bằng dấu phẩy):</div>
        <textarea id="kt-autosites" rows="3" style="width:100%;margin-top:4px;resize:none;border-radius:6px;padding:6px;font-size:13px;background:#222;color:#fff;border:1px solid #555;box-sizing:border-box"></textarea>
        <button id="kt-save" class="kt-btn" style="background:#444;color:#fff;margin-top:6px;">💾 Lưu danh sách</button>

        <div style="margin-top:10px;text-align:center;font-size:12px;color:#aaa;">Version 6.3 (Worker Scroll + Full UI + FPS mặc định 5)</div>
      </div>
    `;
    document.body.appendChild(box);

    // ---- Drag UI ----
    let dragging=false,startX=0,startY=0,startRight=0,startBottom=0;
    box.addEventListener('mousedown', e => {
      if (['kt-toggle','kt-skip','kt-autosites','kt-save','kt-speed','kt-fpslimit','kt-collapse'].includes(e.target.id)) return;
      dragging = true;
      const r = box.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY;
      startRight = window.innerWidth - r.right; startBottom = window.innerHeight - r.bottom;
      e.preventDefault();
    });
    document.addEventListener('mouseup', () => dragging=false);
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      const newRight = Math.max(0, startRight - dx);
      const newBottom = Math.max(0, startBottom - dy);
      box.style.right = `${newRight}px`; box.style.bottom = `${newBottom}px`;
      localStorage.setItem('kt-ui-x', `${newRight}px`);
      localStorage.setItem('kt-ui-y', `${newBottom}px`);
    });

    // ---- Collapse (slide up/down) ----
    const collapseBtn = box.querySelector('#kt-collapse');
    const content = box.querySelector('#kt-content');
    collapseBtn.onclick = () => {
      if (content.style.display === 'none') {
        content.style.display = '';
        content.classList.remove('slide-up');
        content.classList.add('slide-down');
        collapseBtn.textContent = '🔽';
      } else {
        content.classList.remove('slide-down');
        content.classList.add('slide-up');
        setTimeout(() => { content.style.display = 'none'; }, 200);
        collapseBtn.textContent = '🔼';
      }
      collapsed = content.style.display === 'none';
      localStorage.setItem('kt-ui-collapsed', collapsed ? 'true' : 'false');
    };

    // ---- Elements ----
    const status = box.querySelector('#kt-status');
    const fpsEl = box.querySelector('#kt-fps');
    const timeEl = box.querySelector('#kt-time');
    const btn = box.querySelector('#kt-toggle');
    const skipBtn = box.querySelector('#kt-skip');
    const txt = box.querySelector('#kt-autosites');
    const saveBtn = box.querySelector('#kt-save');
    const speedInput = box.querySelector('#kt-speed');
    const fpsInput = box.querySelector('#kt-fpslimit');

    // Load autosites
    txt.value = localStorage.getItem('kt-auto-sites') || '';

    // Inputs realtime
    speedInput.addEventListener('input', () => {
      const v = parseFloat(speedInput.value);
      if (!isNaN(v) && v > 0) { scrollSpeed = v; localStorage.setItem('kt-scroll-speed', v); }
    });
    fpsInput.addEventListener('input', () => {
      const v = parseInt(fpsInput.value);
      if (!isNaN(v) && v >= 1 && v <= 120) { setWorkerFPS(v); }
    });

    function activate() {
      if (isActive) return;
      isActive = true;
      startTime = Date.now();
      startWorker();
      status.innerHTML = '🟢 ON'; status.style.color = '#0f0'; btn.innerText = 'Tắt tạm thời';
    }
    function deactivate() {
      if (!isActive) return;
      isActive = false;
      stopWorker();
      status.innerHTML = '🔴 OFF'; status.style.color = '#f33'; btn.innerText = 'Bật lại';
      scrollFPS = 0; frameCount = 0;
    }

    btn.onclick = () => (isActive ? deactivate() : activate());
    skipBtn.onclick = () => alert('⚠️ Chức năng này hiện KHÔNG HOẠT ĐỘNG / Cannot be used.');
    saveBtn.onclick = () => {
      const v = txt.value.trim();
      localStorage.setItem('kt-auto-sites', v);
      alert('✅ Đã lưu danh sách website tự bật!');
    };

    // UI heartbeat
    setInterval(() => {
      fpsEl.textContent = isActive ? scrollFPS : 0;
      if (isActive && startTime) timeEl.textContent = formatDuration(Date.now() - startTime);
    }, 1000);

    // Auto-enable theo domain
    const host = location.hostname.toLowerCase().replace(/^www\./, '');
    const list = (txt.value || '')
      .split(',')
      .map(s => s.trim().toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/\/+$/,''))
      .filter(Boolean);
    if (list.some(site => host.includes(site))) activate();
  }

  // Boot UI
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createUI);
  } else {
    createUI();
  }
})();
