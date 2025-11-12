(function () {
  'use strict';
  if (window.top !== window.self) return; // ⛔ Không chạy trong iframe (fix 1)
  if (document.getElementById('kt-ui-box')) return; // ⛔ Không tạo UI trùng (fix 2)

  let isActive = false;
  let skipOffset = 0;
  let startTime = null;
  let fps = 0, frameCount = 0, lastFpsUpdate = performance.now();
  let rafHooked = false;

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  function formatDuration(ms){const s=Math.floor(ms/1000),m=Math.floor(s/60),r=s%60;return `${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`;}

  function enableVisibilityOverride(){
    try{
      const fakeState='visible';
      Object.defineProperty(Document.prototype,'visibilityState',{configurable:true,get(){return fakeState;}});
      Object.defineProperty(Document.prototype,'hidden',{configurable:true,get(){return false;}});
    }catch(e){}
  }
  function blockVisibilityChange(){
    const _add=EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener=function(type,listener,opt){
      if(isActive && type==='visibilitychange') return;
      return _add.call(this,type,listener,opt);
    };
  }

  function hookRaf(){
    if(rafHooked) return; rafHooked=true;
    const nativeRaf=window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame=(cb)=>nativeRaf((t)=>{cb(t);frameCount++;const now=performance.now();if(now-lastFpsUpdate>=1000){fps=frameCount;frameCount=0;lastFpsUpdate=now;}});
  }

  function hookTime(){
    const RealDate=Date; const perfNow=performance.now.bind(performance);
    function FakeDate(...args){
      if(this instanceof FakeDate){
        if(args.length===0) return new RealDate(RealDate.now()+skipOffset);
        return new RealDate(...args);
      }
      return new RealDate(RealDate.now()+skipOffset).toString();
    }
    Object.getOwnPropertyNames(RealDate).forEach(p=>{try{FakeDate[p]=RealDate[p];}catch{}});
    FakeDate.now=()=>RealDate.now()+skipOffset;
    FakeDate.prototype=RealDate.prototype;
    Object.defineProperty(window,'Date',{configurable:true,value:FakeDate});
    performance.now=function(){return perfNow()+skipOffset;};
  }

  const nativeST = window.setTimeout.bind(window);
  const nativeSI = window.setInterval.bind(window);
  const nativeCT = window.clearTimeout.bind(window);
  const nativeCI = window.clearInterval.bind(window);

  const timeouts = new Map();
  const intervals = new Map();

  window.setTimeout = function(cb, delay, ...args){
    const now = performance.now();
    const id = nativeST(()=>{}, delay);
    timeouts.set(id, { due: now + (delay||0), cb, args });
    return id;
  };
  window.clearTimeout = function(id){
    timeouts.delete(id);
    try{ nativeCT(id); }catch{}
  };

  window.setInterval = function(cb, delay=0, ...args){
    const now = performance.now();
    const id = nativeSI(()=>{}, delay);
    intervals.set(id, { delay: Math.max(0, delay), cb, args, last: now });
    return id;
  };
  window.clearInterval = function(id){
    intervals.delete(id);
    try{ nativeCI(id); }catch{}
  };

  nativeSI(function timerDriver(){
    const now = performance.now();
    for(const [id, t] of Array.from(timeouts)){
      if(now >= t.due){
        timeouts.delete(id);
        try{ t.cb(...t.args); }catch(e){ console.warn('[KeepTimers] timeout error', e); }
      }
    }
    for(const [id, it] of intervals){
      if(it.delay <= 0){
        try{ it.cb(...it.args); }catch(e){ console.warn('[KeepTimers] interval error', e); }
        it.last = now;
        continue;
      }
      const missed = Math.floor((now - it.last) / it.delay);
      if(missed > 0){
        const calls = clamp(missed, 1, 1000);
        for(let k=0;k<calls;k++){
          try{ it.cb(...it.args); }catch(e){ console.warn('[KeepTimers] interval error', e); break; }
          it.last += it.delay;
        }
        if(now - it.last > it.delay*4) it.last = now;
      }
    }
  }, 50);

  function fastForward(ms){
    skipOffset += ms;
    hookTime();

    const target = performance.now();
    for(const [id, t] of Array.from(timeouts)){
      if(target >= t.due){
        timeouts.delete(id);
        try{ t.cb(...t.args); }catch(e){ console.warn('[KeepTimers] timeout FF error', e); }
      }
    }
    for(const [id, it] of intervals){
      if(it.delay <= 0) continue;
      const missed = Math.floor((target - it.last) / it.delay);
      const calls = clamp(missed, 0, 5000);
      for(let i=0;i<calls;i++){
        try{ it.cb(...it.args); }catch(e){ console.warn('[KeepTimers] interval FF error', e); break; }
        it.last += it.delay;
      }
    }
  }

  function createUI(){
    if (document.getElementById('kt-ui-box')) return; // ⛔ fix 3 - nếu có rồi thì không tạo thêm

    const box = document.createElement('div');
    box.id = 'kt-ui-box';
    box.style.position='fixed';
    box.style.bottom=localStorage.getItem('kt-ui-y')||'30px';
    box.style.right =localStorage.getItem('kt-ui-x')||'30px';
    box.style.zIndex='999999';
    box.style.padding='18px';
    box.style.borderRadius='14px';
    box.style.fontFamily='Consolas, system-ui, sans-serif';
    box.style.fontSize='16px';
    box.style.cursor='move';
    box.style.userSelect='none';
    box.style.background='linear-gradient(145deg,#111,#2b2b2b)';
    box.style.color='#fff';
    box.style.minWidth='300px';
    box.style.boxShadow='0 4px 20px rgba(0,0,0,.6)';
    box.style.backdropFilter='blur(8px)';
    box.innerHTML=`
      <div style="text-align:center;font-weight:800;margin-bottom:8px;font-size:18px;">⏱ Time Keep Running</div>
      <div id="kt-status" style="text-align:center;margin-bottom:6px;font-size:17px;color:#f33;">🔴 OFF</div>
      <div style="font-size:14px;text-align:center;">
        <span id="kt-fps">FPS: 0</span> |
        <span id="kt-time">00:00</span>
      </div>
      <button id="kt-toggle" style="margin-top:10px;width:100%;border:none;border-radius:8px;background:#0078ff;color:#fff;padding:10px 0;font-size:15px;cursor:pointer">Bật lại</button>
      <button id="kt-skip" style="margin-top:8px;width:100%;border:none;border-radius:8px;background:#ff7a00;color:#fff;padding:8px 0;font-size:15px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.2;">
        ⚡ Skip Time
        <span style="font-size:12px;color:#fff8;font-weight:600;">(Không Hoạt Động / Cannot be used)</span>
      </button>
      <div style="margin-top:10px;font-size:13px;color:#ccc;">Website tự bật (phân tách bằng dấu phẩy):</div>
      <textarea id="kt-autosites" rows="3" style="width:100%;margin-top:4px;resize:none;border-radius:6px;padding:6px;font-size:13px;background:#222;color:#fff;border:1px solid #555;box-sizing:border-box"></textarea>
      <button id="kt-save" style="margin-top:6px;width:100%;border:none;border-radius:6px;background:#444;color:#fff;padding:7px 0;cursor:pointer;font-size:13px">💾 Lưu danh sách</button>
    `;
    document.body.appendChild(box);

    // Drag
    let dragging=false,startX=0,startY=0,startRight=0,startBottom=0;
    box.addEventListener('mousedown',e=>{
      if(['kt-toggle','kt-skip','kt-autosites','kt-save'].includes(e.target.id)) return;
      dragging=true; const r=box.getBoundingClientRect();
      startX=e.clientX; startY=e.clientY; startRight=window.innerWidth-r.right; startBottom=window.innerHeight-r.bottom; e.preventDefault();
    });
    document.addEventListener('mouseup',()=>dragging=false);
    document.addEventListener('mousemove',e=>{
      if(!dragging) return;
      const dx=e.clientX-startX, dy=e.clientY-startY;
      const newRight=Math.max(0,startRight-dx);
      const newBottom=Math.max(0,startBottom-dy);
      box.style.right=`${newRight}px`; box.style.bottom=`${newBottom}px`;
      localStorage.setItem('kt-ui-x',`${newRight}px`);
      localStorage.setItem('kt-ui-y',`${newBottom}px`);
    });

    const status=box.querySelector('#kt-status');
    const fpsEl=box.querySelector('#kt-fps');
    const timeEl=box.querySelector('#kt-time');
    const btn=box.querySelector('#kt-toggle');
    const skipBtn=box.querySelector('#kt-skip');
    const txt=box.querySelector('#kt-autosites');
    const saveBtn=box.querySelector('#kt-save');

    txt.value = localStorage.getItem('kt-auto-sites') || '';

    function activate(){
      startTime=Date.now();
      isActive=true;
      enableVisibilityOverride();
      blockVisibilityChange();
      hookRaf();
      hookTime();
      status.innerHTML='🟢 ON'; status.style.color='#0f0'; btn.innerText='Tắt tạm thời';
    }
    function deactivate(){
      isActive=false;
      status.innerHTML='🔴 OFF'; status.style.color='#f33'; btn.innerText='Bật lại';
    }

    btn.onclick = () => { isActive ? deactivate() : activate(); };

    skipBtn.onclick = () => {
      alert('⚠️ Chức năng này hiện KHÔNG HOẠT ĐỘNG / Cannot be used.');
    };

    saveBtn.onclick = () => {
      const v = txt.value.trim();
      localStorage.setItem('kt-auto-sites', v);
      alert('✅ Đã lưu danh sách website tự bật!');
    };

    setInterval(()=>{
      fpsEl.textContent = `FPS: ${isActive ? fps : 0}`;
      if(isActive && startTime) timeEl.textContent = formatDuration(Date.now() - startTime);
    }, 1000);

    const host = location.hostname.toLowerCase().replace(/^www\./,'');
    const list = (txt.value||'').split(',').map(s=>s.trim().toLowerCase()).map(s=>s.replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/\/+$/,'')).filter(Boolean);
    if(list.some(site => host.includes(site))) activate();
  }

  // Safe init UI
  function safeCreateUI() {
    if (document.getElementById('kt-ui-box')) return;
    createUI();
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', safeCreateUI);
  else
    safeCreateUI();

})();
