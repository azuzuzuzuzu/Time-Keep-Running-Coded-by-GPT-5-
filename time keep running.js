
(function () {
  'use strict';
  if (window.top !== window.self) return;
  if (document.getElementById('kt-ui-box')) return;

  let isActive = false;
  let skipOffset = 0;
  let startTime = null;
  let fps = 0, frameCount = 0, lastFpsUpdate = performance.now();
  let scrollActive = false;
  let FPS_LIMIT = parseInt(localStorage.getItem('kt-fps-limit')) || 5;
  let scrollSpeed = parseFloat(localStorage.getItem('kt-scroll-speed')) || 0.51;
  let worker;

  // ===== Scroll Worker =====
  function startWorkerScroll() {
    if (scrollActive) return;
    scrollActive = true;
    const code = `
      let interval = null;
      self.onmessage = e => {
        if (e.data.cmd === 'start') {
          const fps = e.data.fps;
          const speed = e.data.speed;
          const delay = 1000 / fps;
          clearInterval(interval);
          interval = setInterval(() => self.postMessage('scroll'), delay);
        } else if (e.data.cmd === 'stop') {
          clearInterval(interval);
        }
      };
    `;
    const blob = new Blob([code], { type: 'application/javascript' });
    worker = new Worker(URL.createObjectURL(blob));
    worker.onmessage = e => {
      if (e.data === 'scroll') {
        const el = document.scrollingElement || document.body;
        el.scrollBy(0, -scrollSpeed);
        if (el.scrollTop <= 0) el.scrollTo(0, el.scrollHeight);
        frameCount++;
      }
    };
    worker.postMessage({ cmd: 'start', fps: FPS_LIMIT, speed: scrollSpeed });
  }

  function stopWorkerScroll() {
    scrollActive = false;
    if (worker) {
      worker.postMessage({ cmd: 'stop' });
      worker.terminate();
      worker = null;
    }
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
  position:fixed;bottom:${localStorage.getItem('kt-ui-y') || '25px'};
  right:${localStorage.getItem('kt-ui-x') || '25px'};
  z-index:999999;padding:12px 14px;border-radius:12px;
  font-family:Consolas,system-ui,sans-serif;font-size:14px;
  background:linear-gradient(145deg,#111,#2b2b2b);color:#fff;
  min-width:270px;max-width:290px;
  box-shadow:0 3px 12px rgba(0,0,0,.5);backdrop-filter:blur(6px);
  cursor:move;user-select:none;
`;

    box.innerHTML = `
      <div style="text-align:center;font-weight:800;margin-bottom:8px;font-size:18px;">⏱ Time Keep Running</div>
      <div id="kt-status" style="text-align:center;margin-bottom:6px;font-size:17px;color:#f33;">🔴 OFF</div>

      <div style="font-size:14px;text-align:center;margin-bottom:6px;">⏳ Time: <span id="kt-time">00:00</span></div>
      <div style="font-size:14px;text-align:center;margin-bottom:6px;">🎯 Current FPS: <span id="kt-fps">0</span></div>

      <div style="margin-top:6px;font-size:14px;text-align:center;">
        🌀 Scroll Speed:
        <input id="kt-speed" type="number" step="0.01" min="0.1" value="${scrollSpeed}" style="width:70px;text-align:center;border:none;border-radius:6px;padding:2px 4px;background:#222;color:#fff;margin-left:6px;">
      </div>
      <div style="margin-top:6px;font-size:14px;text-align:center;">
        ⚙️ FPS LIMIT:
        <input id="kt-fpslimit" type="number" step="1" min="1" value="${FPS_LIMIT}" style="width:60px;text-align:center;border:none;border-radius:6px;padding:2px 4px;background:#222;color:#fff;margin-left:6px;">
      </div>

      <button id="kt-toggle" style="margin-top:10px;width:100%;border:none;border-radius:8px;background:#0078ff;color:#fff;padding:10px 0;font-size:15px;cursor:pointer;">Turn On</button>
      <button id="kt-skip" style="margin-top:8px;width:100%;border:none;border-radius:8px;background:#ff7a00;color:#fff;padding:8px 0;font-size:15px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.2;">
        ⚡ Skip Time
        <span style="font-size:12px;color:#fff8;font-weight:600;">(Not Working / Cannot be used)</span>
      </button>

      <div style="margin-top:10px;font-size:13px;color:#ccc;">Auto-enable websites / Tự bật ở websites bạn muốn (comma separated / dùng dấu phẩy để cách):</div>
      <textarea id="kt-autosites" rows="3" style="width:100%;margin-top:4px;resize:none;border-radius:6px;padding:6px;font-size:13px;background:#222;color:#fff;border:1px solid #555;box-sizing:border-box"></textarea>
      <button id="kt-save" style="margin-top:6px;width:100%;border:none;border-radius:6px;background:#444;color:#fff;padding:7px 0;cursor:pointer;font-size:13px;">💾 Save List</button>
      <div style="margin-top:10px;text-align:center;font-size:12px;color:#aaa;">Version 6.4.2 (Balanced UI + Worker Scroll + English Buttons)</div>
    `;
    document.body.appendChild(box);

    // === Dragging ===
    let dragging = false, startX = 0, startY = 0, startRight = 0, startBottom = 0;
    box.addEventListener('mousedown', e => {
      if (['kt-toggle','kt-skip','kt-autosites','kt-save','kt-speed','kt-fpslimit'].includes(e.target.id)) return;
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

    // === Elements ===
    const status = box.querySelector('#kt-status');
    const fpsEl = box.querySelector('#kt-fps');
    const timeEl = box.querySelector('#kt-time');
    const btn = box.querySelector('#kt-toggle');
    const skipBtn = box.querySelector('#kt-skip');
    const txt = box.querySelector('#kt-autosites');
    const saveBtn = box.querySelector('#kt-save');
    const speedInput = box.querySelector('#kt-speed');
    const fpsInput = box.querySelector('#kt-fpslimit');

    // Inputs realtime
    speedInput.addEventListener('input', () => {
      const val = parseFloat(speedInput.value);
      if (!isNaN(val) && val > 0) {
        scrollSpeed = val;
        localStorage.setItem('kt-scroll-speed', val);
      }
    });
    fpsInput.addEventListener('input', () => {
      const val = parseInt(fpsInput.value);
      if (!isNaN(val) && val >= 1 && val <= 120) {
        FPS_LIMIT = val;
        localStorage.setItem('kt-fps-limit', val);
      }
    });

    txt.value = localStorage.getItem('kt-auto-sites') || '';

    // Control
    function activate() {
      startTime = Date.now();
      isActive = true;
      startWorkerScroll();
      status.innerHTML = '🟢 ON'; status.style.color = '#0f0'; btn.innerText = 'Turn Off';
    }
    function deactivate() {
      isActive = false;
      stopWorkerScroll();
      status.innerHTML = '🔴 OFF'; status.style.color = '#f33'; btn.innerText = 'Turn On';
    }

    btn.onclick = () => { isActive ? deactivate() : activate(); };
    skipBtn.onclick = () => alert('⚠️ This function is not active / Chức năng này hiện không hoạt động');
    saveBtn.onclick = () => {
      localStorage.setItem('kt-auto-sites', txt.value.trim());
      alert('✅ Auto site list saved! / Đã lưu danh sách website tự bật! ');
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
