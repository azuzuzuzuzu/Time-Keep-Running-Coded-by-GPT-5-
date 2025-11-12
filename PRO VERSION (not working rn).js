// ==UserScript==
// @name         Time Keep Running 6.5 Pro (Worker Scroll + Page Hooks)
// @namespace    http://tampermonkey.net/
// @version      6.5
// @description  Balanced UI + Worker Scroll (background) + optional unsafe hooks for Date/perf/rAF/timers on page context (PRO). Use Page Hooks only if you understand the risks.
// @author       GPT-5 & Huy
// @match        *://*/*
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';
  if (window.top !== window.self) return;
  if (document.getElementById('kt-ui-box')) return;

  // ---- State ----
  let isActive = false;
  let startTime = null;
  let frameCount = 0;
  let fpsDisplay = 0;
  let fpsTimer = null;

  let FPS_LIMIT = parseInt(localStorage.getItem('kt-fps-limit')) || 5;
  let scrollSpeed = parseFloat(localStorage.getItem('kt-scroll-speed')) || 0.51;
  let scrollWorker = null;
  let scrollActive = false;

  let pageHooksEnabled = (localStorage.getItem('tk-page-hooks') === 'true');

  // ---- Worker Scroll (background-safe) ----
  function makeWorker() {
    const code = `
      let interval = null;
      self.onmessage = e => {
        if (!e.data) return;
        if (e.data.cmd === 'start') {
          const fps = Math.max(1, e.data.fps|0);
          const delay = Math.floor(1000 / fps);
          clearInterval(interval);
          interval = setInterval(() => postMessage('tick'), delay);
        } else if (e.data.cmd === 'stop') {
          clearInterval(interval);
        } else if (e.data.cmd === 'set') {
          clearInterval(interval);
          const fps = Math.max(1, e.data.fps|0);
          const delay = Math.floor(1000 / fps);
          interval = setInterval(() => postMessage('tick'), delay);
        }
      };
    `;
    const blob = new Blob([code], { type: 'application/javascript' });
    return new Worker(URL.createObjectURL(blob));
  }

  function startScrollWorker() {
    if (scrollActive) return;
    scrollActive = true;
    scrollWorker = makeWorker();
    scrollWorker.onmessage = () => {
      const el = document.scrollingElement || document.documentElement || document.body;
      try {
        el.scrollBy(0, -scrollSpeed);
        if (el.scrollTop <= 0) el.scrollTo(0, el.scrollHeight);
      } catch (e) {}
      frameCount++;
    };
    scrollWorker.postMessage({ cmd: 'start', fps: FPS_LIMIT });
    // fps display
    if (fpsTimer) clearInterval(fpsTimer);
    fpsTimer = setInterval(() => { fpsDisplay = frameCount; frameCount = 0; }, 1000);
  }

  function stopScrollWorker() {
    if (!scrollActive) return;
    scrollActive = false;
    try {
      if (scrollWorker) { scrollWorker.postMessage({ cmd: 'stop' }); scrollWorker.terminate(); }
    } catch (e) {}
    scrollWorker = null;
    if (fpsTimer) { clearInterval(fpsTimer); fpsTimer = null; fpsDisplay = 0; frameCount = 0; }
  }

  // ---- Page Hooks (inject into page context) ----
  // We'll inject a <script> element into page so it runs in page context.
  // That script creates window.__TK_PRO__ to store originals and state.
  function injectPageHookScript() {
    // if already injected, update enabled flag
    if (unsafeWindow.__TK_PRO__ && unsafeWindow.__TK_PRO__.injected) {
      unsafeWindow.__TK_PRO__.enabled = true;
      return;
    }

    const code = `(() => {
      if (window.__TK_PRO__ && window.__TK_PRO__.injected) { window.__TK_PRO__.enabled = true; return; }
      const P = { injected: true, enabled: true, offset: 0 };
      P._orig = {
        Date: window.Date,
        performance_now: performance.now.bind(performance),
        requestAnimationFrame: window.requestAnimationFrame.bind(window),
        setTimeout: window.setTimeout.bind(window),
        setInterval: window.setInterval.bind(window),
        clearTimeout: window.clearTimeout.bind(window),
        clearInterval: window.clearInterval.bind(window)
      };

      // Fake Date constructor
      function FakeDate(...args) {
        if (new.target) { // invoked with new
          if (args.length === 0) return new P._orig.Date(P._orig.Date.now() + P.offset);
          return new P._orig.Date(...args);
        }
        // called as function
        return new P._orig.Date(P._orig.Date.now() + P.offset).toString();
      }
      Object.getOwnPropertyNames(P._orig.Date).forEach(k => { try { FakeDate[k] = P._orig.Date[k]; } catch (e) {} });
      FakeDate.now = function() { return P._orig.Date.now() + P.offset; };
      FakeDate.prototype = P._orig.Date.prototype;

      // performance.now
      const perfNow = function() { return P._orig.performance_now() + P.offset; };

      // timers: manage our own wrappers but call original functions
      const timerMap = new Map(); // id -> {realId, cbWrap}
      let nextId = 1;

      function wrapSetTimeout(cb, delay, ...args) {
        const target = P._orig.performance_now() + (delay || 0);
        const realCb = () => cb(...args);
        const id = P._orig.setTimeout(realCb, delay);
        timerMap.set(id, { cb: realCb });
        return id;
      }

      // We'll keep native setInterval but it's okay — for safety we'll not try to emulate missed ticks here

      // Hook rAF: call original but translate timestamp via perfNow
      function wrappedRaf(cb) {
        return P._orig.requestAnimationFrame.call(window, function(ts) {
          // supply a timestamp adjusted
          try { cb(ts + P.offset); } catch(e) {}
        });
      }

      // expose control API
      window.__TK_PRO__ = P;
      window.__TK_PRO__.enable = function() {
        if (!window.__TK_PRO__) return;
        if (window.__TK_PRO__._hooked) return;
        // override
        window.Date = FakeDate;
        performance.now = perfNow;
        window.requestAnimationFrame = wrappedRaf;
        // override setTimeout/setInterval to keep originals but we keep them
        const origSetTimeout = P._orig.setTimeout;
        const origSetInterval = P._orig.setInterval;
        window.setTimeout = function(cb, delay, ...args) {
          return origSetTimeout(cb, delay, ...args);
        };
        window.setInterval = function(cb, delay, ...args) {
          return origSetInterval(cb, delay, ...args);
        };
        window.__TK_PRO__._hooked = true;
        window.__TK_PRO__.enabled = true;
      };

      window.__TK_PRO__.disable = function() {
        if (!window.__TK_PRO__._hooked) return;
        // restore
        window.Date = P._orig.Date;
        performance.now = P._orig.performance_now;
        window.requestAnimationFrame = P._orig.requestAnimationFrame;
        window.setTimeout = P._orig.setTimeout;
        window.setInterval = P._orig.setInterval;
        window.__TK_PRO__._hooked = false;
        window.__TK_PRO__.enabled = false;
      };

      window.__TK_PRO__.fastForward = function(ms) {
        P.offset += (ms|0);
      };

      // ensure initially enabled
      window.__TK_PRO__.enable();
    })();`;

    const s = document.createElement('script');
    s.type = 'text/javascript';
    s.textContent = code;
    (document.head||document.documentElement).appendChild(s);
    s.parentNode.removeChild(s);
  }

  function enablePageHooks() {
    try {
      // Allow injection only once
      injectPageHookScript();
      // Mark enabled
      localStorage.setItem('tk-page-hooks', 'true');
      pageHooksEnabled = true;
      // ensure page-side enable
      try { unsafeWindow.__TK_PRO__ && unsafeWindow.__TK_PRO__.enable && unsafeWindow.__TK_PRO__.enable(); } catch(e) {}
    } catch (e) {
      console.warn('Page hooks injection failed', e);
    }
  }

  function disablePageHooks() {
    try {
      localStorage.removeItem('tk-page-hooks');
      pageHooksEnabled = false;
      // try to restore
      try { unsafeWindow.__TK_PRO__ && unsafeWindow.__TK_PRO__.disable && unsafeWindow.__TK_PRO__.disable(); } catch(e) {}
    } catch (e) {}
  }

  function fastForwardPage(ms) {
    // fast-forward both page and internal
    try {
      if (unsafeWindow.__TK_PRO__ && unsafeWindow.__TK_PRO__.fastForward) {
        unsafeWindow.__TK_PRO__.fastForward(ms);
      }
    } catch (e) {}
  }

  // ---- UI (Balanced, compacted similar to 6.4.1) ----
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
      <div style="text-align:center;font-weight:800;margin-bottom:8px;font-size:16px;">⏱ Time Keep Running</div>
      <div id="kt-status" style="text-align:center;margin-bottom:6px;font-size:15px;color:#f33;">🔴 OFF</div>
      <div style="font-size:13px;text-align:left;margin-bottom:6px;">⏳ Time: <span id="kt-time">00:00</span></div>
      <div style="font-size:13px;text-align:left;margin-bottom:6px;">🎯 Current FPS: <span id="kt-fps">0</span></div>

      <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;margin-top:4px;">
        <div>🌀 Scroll:</div>
        <input id="kt-speed" type="number" step="0.01" min="0.01" value="${scrollSpeed}" style="width:90px;text-align:center;border:none;border-radius:6px;padding:4px;background:#222;color:#fff;">
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;margin-top:6px;">
        <div>⚙️ FPS LIMIT:</div>
        <input id="kt-fpslimit" type="number" step="1" min="1" value="${FPS_LIMIT}" style="width:90px;text-align:center;border:none;border-radius:6px;padding:4px;background:#222;color:#fff;">
      </div>

      <button id="kt-toggle" style="margin-top:8px;width:100%;border:none;border-radius:8px;background:#0078ff;color:#fff;padding:8px;font-size:14px;cursor:pointer;">Turn On</button>

      <button id="kt-skip" style="margin-top:6px;width:100%;border:none;border-radius:8px;background:#ff7a00;color:#fff;padding:8px;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1.2;">
        ⚡ Skip Time <span style="font-size:11px;color:#fff8;margin-left:8px;">(Not Working)</span>
      </button>

      <div style="margin-top:6px;font-size:12px;color:#ccc;">Auto-enable websites (comma separated):</div>
      <textarea id="kt-autosites" rows="3" style="width:100%;margin-top:4px;resize:none;border-radius:6px;padding:6px;font-size:13px;background:#222;color:#fff;border:1px solid #555;box-sizing:border-box"></textarea>
      <button id="kt-save" style="margin-top:6px;width:100%;border:none;border-radius:6px;background:#444;color:#fff;padding:6px;cursor:pointer;font-size:13px;">💾 Save List</button>

      <div style="display:flex;gap:6px;margin-top:8px;">
        <button id="kt-pagehooks" style="flex:1;border:none;border-radius:6px;padding:6px;background:#2b6cff;color:#fff;cursor:pointer;font-size:12px;">Page Hooks: ${pageHooksEnabled ? 'ON' : 'OFF'}</button>
        <button id="kt-ff" style="width:72px;border:none;border-radius:6px;padding:6px;background:#333;color:#fff;cursor:pointer;font-size:12px;">FF +5s</button>
      </div>

      <div style="margin-top:8px;text-align:center;font-size:11px;color:#aaa;">Version 6.5 Pro (Worker Scroll + Optional Page Hooks)</div>
    `;
    document.body.appendChild(box);

    // drag
    let dragging=false, sx=0, sy=0, sr=0, sb=0;
    box.addEventListener('mousedown', e => {
      if (['INPUT','TEXTAREA','BUTTON'].includes(e.target.tagName)) return;
      dragging=true;
      const r = box.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; sr = window.innerWidth - r.right; sb = window.innerHeight - r.bottom;
      e.preventDefault();
    });
    document.addEventListener('mouseup', ()=>dragging=false);
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      const newR = Math.max(0, sr - dx), newB = Math.max(0, sb - dy);
      box.style.right = newR + 'px'; box.style.bottom = newB + 'px';
      localStorage.setItem('kt-ui-x', `${newR}px`); localStorage.setItem('kt-ui-y', `${newB}px`);
    });

    // elements
    const statusEl = box.querySelector('#kt-status');
    const fpsEl = box.querySelector('#kt-fps');
    const timeEl = box.querySelector('#kt-time');
    const btn = box.querySelector('#kt-toggle');
    const skipBtn = box.querySelector('#kt-skip');
    const saveBtn = box.querySelector('#kt-save');
    const txt = box.querySelector('#kt-autosites');
    const speedInput = box.querySelector('#kt-speed');
    const fpsInput = box.querySelector('#kt-fpslimit');
    const pageHooksBtn = box.querySelector('#kt-pagehooks');
    const ffBtn = box.querySelector('#kt-ff');

    txt.value = localStorage.getItem('kt-auto-sites') || '';

    // controls
    function activate() {
      if (isActive) return;
      isActive = true; startTime = Date.now();
      startScrollWorker();
      statusEl.innerHTML = '🟢 ON'; statusEl.style.color = '#0f0'; btn.innerText = 'Turn Off';
    }
    function deactivate() {
      if (!isActive) return;
      isActive = false;
      stopScrollWorker();
      statusEl.innerHTML = '🔴 OFF'; statusEl.style.color = '#f33'; btn.innerText = 'Turn On';
      fpsDisplay = 0; frameCount = 0;
    }

    btn.onclick = () => { isActive ? deactivate() : activate(); };
    skipBtn.onclick = () => alert('Skip not implemented.');
    saveBtn.onclick = () => { localStorage.setItem('kt-auto-sites', txt.value.trim()); alert('Saved'); };

    speedInput.oninput = () => { scrollSpeed = parseFloat(speedInput.value) || 0.5; localStorage.setItem('kt-scroll-speed', scrollSpeed); };
    fpsInput.oninput = () => { FPS_LIMIT = Math.max(1, parseInt(fpsInput.value) || 5); localStorage.setItem('kt-fps-limit', FPS_LIMIT); if (scrollWorker) scrollWorker.postMessage({ cmd:'set', fps: FPS_LIMIT }); };

    pageHooksBtn.onclick = () => {
      pageHooksEnabled = !pageHooksEnabled;
      pageHooksBtn.innerText = 'Page Hooks: ' + (pageHooksEnabled ? 'ON' : 'OFF');
      localStorage.setItem('tk-page-hooks', pageHooksEnabled ? 'true' : 'false');
      if (pageHooksEnabled) enablePageHooks(); else disablePageHooks();
      alert('Page Hooks ' + (pageHooksEnabled ? 'enabled' : 'disabled') + '. Note: page may require reload to fully restore original functions.');
    };

    ffBtn.onclick = () => {
      // fast forward 5 seconds
      const ms = 5000;
      fastForwardPage(ms);
      alert('Fast-forwarded page-time by 5s (best-effort).');
    };

    // heartbeat display
    setInterval(() => {
      fpsEl.textContent = (isActive ? fpsDisplay : 0);
      if (isActive && startTime) timeEl.textContent = formatDuration(Date.now() - startTime);
    }, 1000);

    // auto-enable sites list
    const host = location.hostname.toLowerCase().replace(/^www\./,'');
    const list = (txt.value||'').split(',').map(s => s.trim().toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/\/+$/,'')).filter(Boolean);
    if (list.some(site => host.includes(site))) activate();

    // initialize page hooks state if previously enabled
    if (pageHooksEnabled) enablePageHooks();
  }

  // boot
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', createUI);
  else createUI();

  // helper format
  function formatDuration(ms) {
    const s = Math.floor(ms/1000), m = Math.floor(s/60), r = s%60;
    return `${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`;
  }

  // Expose some debug in console
  window.__TK_UI__ = {
    startWorker: startScrollWorker,
    stopWorker: stopScrollWorker,
    enablePageHooks,
    disablePageHooks,
    fastForwardPage
  };

})(); // end userscript
