(function () {
  'use strict';
  if (window.top !== window.self) return;
  if (document.getElementById('kt-ui-box')) return;

  let isActive = false;
  let skipOffset = 0;
  let startTime = null;
  let fps = 0, frameCount = 0, lastFpsUpdate = performance.now();
  let rafHooked = false;

  let scrollActive = false, scrollReq = null, lastScrollFrame = 0;
  const FPS_LIMIT = 20; // giới hạn 20FPS
  let scrollSpeed = parseFloat(localStorage.getItem('kt-scroll-speed')) || 0.8; // mặc định

  // ===== Auto Scroll =====
  function startAutoScroll() {
    if (scrollActive) return;
    scrollActive = true;
    console.log(`[AutoScroll] ▶ Cuộn liên tục (20FPS, speed=${scrollSpeed})`);

    const el = document.scrollingElement || document.body;
    let direction = -1;
    let distance = 0;
    const maxScroll = 800;

    function step(timestamp) {
      if (!scrollActive) return;
      const delta = timestamp - lastScrollFrame;
      if (delta >= 1000 / FPS_LIMIT) {
        el.scrollBy(0, direction * scrollSpeed);
        distance += scrollSpeed;
        if (Math.abs(distance) > maxScroll) {
          direction *= -1;
          distance = 0;
        }
        lastScrollFrame = timestamp;
      }
      scrollReq = requestAnimationFrame(step);
    }
    scrollReq = requestAnimationFrame(step);
  }

  function stopAutoScroll() {
    scrollActive = false;
    if (scrollReq) cancelAnimationFrame(scrollReq);
    console.log('[AutoScroll] ⛔ Dừng cuộn.');
  }

  // ===== Helpers =====
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const formatDuration = (ms) => {
    const s = Math.floor(ms / 1000), m = Math.floor(s / 60), r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  };

  // ===== Visibility spoof =====
  function enableVisibilityOverride() {
    try {
      const fakeState = 'visible';
      Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get() { return fakeState; } });
      Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get() { return false; } });
    } catch (e) {}
  }
  function blockVisibilityChange() {
    const _add = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, opt) {
      if (isActive && type === 'visibilitychange') return;
      return _add.call(this, type, listener, opt);
    };
  }

  // ===== rAF hook (vẫn đo FPS) =====
  function hookRaf() {
    if (rafHooked) return; rafHooked = true;
    const nativeRaf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) =>
      nativeRaf((t) => {
        cb(t);
        frameCount++;
        const now = performance.now();
        if (now - lastFpsUpdate >= 1000) {
          fps = frameCount;
          frameCount = 0;
          lastFpsUpdate = now;
        }
      });
  }

  // ===== Time hooks =====
  function hookTime() {
    const RealDate = Date;
    const perfNow = performance.now.bind(performance);
    function FakeDate(...args) {
      if (this instanceof FakeDate) {
        if (args.length === 0) return new RealDate(RealDate.now() + skipOffset);
        return new RealDate(...args);
      }
      return new RealDate(RealDate.now() + skipOffset).toString();
    }
    Object.getOwnPropertyNames(RealDate).forEach((p) => { try { FakeDate[p] = RealDate[p]; } catch {} });
    FakeDate.now = () => RealDate.now() + skipOffset;
    FakeDate.prototype = RealDate.prototype;
    Object.defineProperty(window, 'Date', { configurable: true, value: FakeDate });
    performance.now = function () { return perfNow() + skipOffset; };
  }

  // ===== Timer hooks =====
  const nativeST = window.setTimeout.bind(window);
  const nativeSI = window.setInterval.bind(window);
  const nativeCT = window.clearTimeout.bind(window);
  const nativeCI = window.clearInterval.bind(window);
  const timeouts = new Map(), intervals = new Map();

  window.setTimeout = function (cb, delay, ...args) {
    const now = performance.now();
    const id = nativeST(() => {}, delay);
    timeouts.set(id, { due: now + (delay || 0), cb, args });
    return id;
  };
  window.clearTimeout = function (id) {
    timeouts.delete(id); try { nativeCT(id); } catch {}
  };
  window.setInterval = function (cb, delay = 0, ...args) {
    const now = performance.now();
    const id = nativeSI(() => {}, delay);
    intervals.set(id, { delay: Math.max(0, delay), cb, args, last: now });
    return id;
  };
  window.clearInterval = function (id) {
    intervals.delete(id); try { nativeCI(id); } catch {}
  };

  nativeSI(function timerDriver() {
    const now = performance.now();
    for (const [id, t] of Array.from(timeouts)) {
      if (now >= t.due) {
        timeouts.delete(id);
        try { t.cb(...t.args); } catch (e) { console.warn('[KeepTimers] timeout error', e); }
      }
    }
    for (const [id, it] of intervals) {
      if (it.delay <= 0) {
        try { it.cb(...it.args); } catch (e) { console.warn('[KeepTimers] interval error', e); }
        it.last = now;
        continue;
      }
      const missed = Math.floor((now - it.last) / it.delay);
      if (missed > 0) {
        const calls = clamp(missed, 1, 1000);
        for (let k = 0; k < calls; k++) {
          try { it.cb(...it.args); } catch (e) { console.warn('[KeepTimers] interval error', e); break; }
          it.last += it.delay;
        }
        if (now - it.last > it.delay * 4) it.last = now;
      }
    }
  }, 50);

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
      min-width:300px;box-shadow:0 4px 20px rgba(0,0,0,.6);backdrop-filter:blur(8px);
      cursor:move;user-select:none;
    `;
    box.innerHTML = `
      <div style="text-align:center;font-weight:800;margin-bottom:8px;font-size:18px;">⏱ Time Keep Running</div>
      <div id="kt-status" style="text-align:center;margin-bottom:6px;font-size:17px;color:#f33;">🔴 OFF</div>
      <div style="font-size:14px;text-align:center;">FPS: <span id="kt-fps">0</span> | <span id="kt-time">00:00</span></div>
      <div style="margin-top:8px;font-size:14px;text-align:center;">
        🌀 Scroll Speed:
        <input id="kt-speed" type="number" step="0.1" min="0.1" value="${scrollSpeed}" style="width:60px;text-align:center;border:none;border-radius:6px;padding:2px 4px;background:#222;color:#fff;margin-left:6px;">
      </div>
      <button id="kt-toggle" style="margin-top:10px;width:100%;border:none;border-radius:8px;background:#0078ff;color:#fff;padding:10px 0;font-size:15px;cursor:pointer">Bật lại</button>
      <button id="kt-skip" style="margin-top:8px;width:100%;border:none;border-radius:8px;background:#ff7a00;color:#fff;padding:8px 0;font-size:15px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.2;">
        ⚡ Skip Time
        <span style="font-size:12px;color:#fff8;font-weight:600;">(Không Hoạt Động / Cannot be used)</span>
      </button>
      <div style="margin-top:10px;font-size:13px;color:#ccc;">Website tự bật:</div>
      <textarea id="kt-autosites" rows="3" style="width:100%;margin-top:4px;resize:none;border-radius:6px;padding:6px;font-size:13px;background:#222;color:#fff;border:1px solid #555;box-sizing:border-box"></textarea>
      <button id="kt-save" style="margin-top:6px;width:100%;border:none;border-radius:6px;background:#444;color:#fff;padding:7px 0;cursor:pointer;font-size:13px">💾 Lưu danh sách</button>
      <div style="margin-top:10px;text-align:center;font-size:12px;color:#aaa;">Version 5.6 (Scroll∞ + 20FPS + Speed Control)</div>
    `;
    document.body.appendChild(box);

    // Drag UI
    let dragging = false, startX = 0, startY = 0, startRight = 0, startBottom = 0;
    box.addEventListener('mousedown', e => {
      if (['kt-toggle','kt-skip','kt-autosites','kt-save','kt-speed'].includes(e.target.id)) return;
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

    const status = box.querySelector('#kt-status');
    const fpsEl = box.querySelector('#kt-fps');
    const timeEl = box.querySelector('#kt-time');
    const btn = box.querySelector('#kt-toggle');
    const skipBtn = box.querySelector('#kt-skip');
    const txt = box.querySelector('#kt-autosites');
    const saveBtn = box.querySelector('#kt-save');
    const speedInput = box.querySelector('#kt-speed');

    // Thay đổi tốc độ cuộn realtime
    speedInput.addEventListener('input', () => {
      const val = parseFloat(speedInput.value);
      if (!isNaN(val) && val > 0) {
        scrollSpeed = val;
        localStorage.setItem('kt-scroll-speed', val);
      }
    });

    txt.value = localStorage.getItem('kt-auto-sites') || '';

    function activate() {
      startTime = Date.now();
      isActive = true;
      enableVisibilityOverride();
      blockVisibilityChange();
      hookRaf();
      hookTime();
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
