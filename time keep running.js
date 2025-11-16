
(function () {
  'use strict';
  if (window.top !== window.self) return;
  if (document.getElementById('kt-ui-box')) return;

  let isActive = false;
  let startTime = null;

  // ===== Auto Scroll =====
  let scrollActive = false, scrollReq = null;
  let scrollSpeed = parseFloat(localStorage.getItem('kt-scroll-speed')) || 0.501;

  function startAutoScroll() {
    if (scrollActive) return;
    scrollActive = true;

    const el = document.scrollingElement || document.body;

    function step() {
      if (!scrollActive) return;
      el.scrollBy(0, -scrollSpeed);
      if (el.scrollTop <= 0) el.scrollTo(0, el.scrollHeight);
      scrollReq = requestAnimationFrame(step);
    }

    scrollReq = requestAnimationFrame(step);
  }

  function stopAutoScroll() {
    scrollActive = false;
    if (scrollReq) cancelAnimationFrame(scrollReq);
  }

  const formatDuration = (ms) => {
    const s = Math.floor(ms / 1000), m = Math.floor(s / 60), r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  };

  function enableVisibilityOverride() {
    try {
      const fakeState = 'visible';
      Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get() { return fakeState; } });
      Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get() { return false; } });
    } catch { }
  }

  function blockVisibilityChange() {
    const _add = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, opt) {
      if (isActive && type === 'visibilitychange') return;
      return _add.call(this, type, listener, opt);
    };
  }

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
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="font-weight:800;font-size:16px;">⏱ Time Keep Running</div>
        <button id="kt-hide" style="background:none;border:none;color:#ccc;font-size:16px;cursor:pointer;">⬇</button>
      </div>

      <div id="kt-status" style="text-align:center;margin:6px 0;font-size:15px;color:#f33;">🔴 OFF</div>

      <div style="font-size:13px;text-align:center;margin-bottom:6px;">
        ⏳ Time: <span id="kt-time">00:00</span>
      </div>

      <div style="margin-top:6px;font-size:13px;text-align:center;">
        🌀 Speed: <input id="kt-speed" type="number" step="0.01" min="0.1" value="${scrollSpeed}"
          style="width:60px;text-align:center;border:none;border-radius:6px;padding:2px 4px;background:#222;color:#fff;">
      </div>

      <button id="kt-toggle" style="margin-top:8px;width:100%;border:none;border-radius:8px;background:#0078ff;color:#fff;padding:8px 0;font-size:14px;cursor:pointer">
        Turn On
      </button>

      <button id="kt-skip" style="margin-top:6px;width:100%;border:none;border-radius:8px;background:#ff7a00;color:#fff;padding:7px 0;font-size:14px;cursor:pointer;">
        ⚡ Skip Time
      </button>

      <div style="margin-top:8px;font-size:12px;color:#ccc;">Website tự bật (mỗi dòng 1 website):</div>
      <textarea id="kt-autosites" rows="3" style="width:100%;margin-top:4px;resize:none;border-radius:6px;padding:5px;font-size:12px;background:#222;color:#fff;border:1px solid #555;box-sizing:border-box"></textarea>

      <button id="kt-save" style="margin-top:5px;width:100%;border:none;border-radius:6px;background:#444;color:#fff;padding:6px 0;cursor:pointer;font-size:12px">
        💾 Save
      </button>

      <div style="margin-top:6px;text-align:center;font-size:11px;color:#aaa;">
        Version 6.4.3 (Hide UI + Multiline AutoSites)
      </div>
    `;
    document.body.appendChild(box);

    // ===== Hide UI =====
    const hideBtn = box.querySelector('#kt-hide');
    hideBtn.onclick = () => {
      box.style.display = 'none';
      const icon = document.createElement('div');
      icon.id = 'kt-mini';
      icon.innerHTML = '⏱';
      icon.style.cssText = `
        position:fixed;bottom:20px;right:20px;background:#0078ff;
        color:#fff;font-size:18px;padding:10px;border-radius:50%;
        cursor:pointer;z-index:999999;box-shadow:0 2px 8px rgba(0,0,0,.5);
      `;
      icon.onclick = () => { icon.remove(); box.style.display = 'block'; };
      document.body.appendChild(icon);
    };

    // ===== Drag =====
    let dragging=false,startX=0,startY=0,startRight=0,startBottom=0;
    box.addEventListener('mousedown',e=>{
      if(['kt-toggle','kt-skip','kt-autosites','kt-save','kt-speed','kt-hide'].includes(e.target.id))return;
      dragging=true;
      const r=box.getBoundingClientRect();
      startX=e.clientX;startY=e.clientY;
      startRight=window.innerWidth-r.right;
      startBottom=window.innerHeight-r.bottom;
      e.preventDefault();
    });

    document.addEventListener('mouseup',()=>dragging=false);
    document.addEventListener('mousemove',e=>{
      if(!dragging)return;
      const dx=e.clientX-startX,dy=e.clientY-startY;
      const newRight=Math.max(0,startRight-dx);
      const newBottom=Math.max(0,startBottom-dy);
      box.style.right=`${newRight}px`;
      box.style.bottom=`${newBottom}px`;
      localStorage.setItem('kt-ui-x',`${newRight}px`);
      localStorage.setItem('kt-ui-y',`${newBottom}px`);
    });

    const status=box.querySelector('#kt-status'),
          timeEl=box.querySelector('#kt-time'),
          btn=box.querySelector('#kt-toggle'),
          skipBtn=box.querySelector('#kt-skip'),
          txt=box.querySelector('#kt-autosites'),
          saveBtn=box.querySelector('#kt-save'),
          speedInput=box.querySelector('#kt-speed');

    txt.value = localStorage.getItem('kt-auto-sites') || '';

    speedInput.oninput = () => {
      const val = parseFloat(speedInput.value);
      if (!isNaN(val) && val > 0) {
        scrollSpeed = val;
        localStorage.setItem('kt-scroll-speed', val);
      }
    };

    function activate() {
      startTime = Date.now();
      isActive = true;
      enableVisibilityOverride();
      blockVisibilityChange();
      startAutoScroll();
      status.innerHTML = '🟢 ON';
      status.style.color = '#0f0';
      btn.innerText = 'Turn Off';
    }

    function deactivate() {
      isActive = false;
      stopAutoScroll();
      status.innerHTML = '🔴 OFF';
      status.style.color = '#f33';
      btn.innerText = 'Turn On';
    }

    btn.onclick = () => isActive ? deactivate() : activate();
    skipBtn.onclick = () => alert('⚠️ Tính năng này hiện KHÔNG HOẠT ĐỘNG.');

    saveBtn.onclick = () => {
      localStorage.setItem('kt-auto-sites', txt.value.trim());
      alert('✅ Đã lưu danh sách website tự bật!');
    };

    setInterval(() => {
      if (isActive && startTime)
        timeEl.textContent = formatDuration(Date.now() - startTime);
    }, 1000);

    // ===== Auto Run on sites =====
    const host = location.hostname.toLowerCase().replace(/^www\./, '');
    const list = (txt.value || '')
      .split(/\n+/)
      .map(s => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, ''))
      .filter(Boolean);

    if (list.some(site => host.includes(site)))
      activate();
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', createUI);
  else
    createUI();
})();
