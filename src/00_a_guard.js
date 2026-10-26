/* Shivanag — startup guard: surfaces errors on the title card instead of failing silently */
(function () {
  const show = (msg) => {
    const t = document.querySelector('#title p'); if (!t) return;
    t.style.opacity = 1; t.style.maxWidth = '90vw'; t.style.wordBreak = 'break-word';
    t.textContent = 'Could not start: ' + msg;
    const tt = document.getElementById('title'); if (tt) tt.classList.remove('gone');
  };
  const bar = (msg) => {
    let d = document.getElementById('errbar');
    if (!d) { d = document.createElement('div'); d.id = 'errbar'; d.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99;background:#7a1020;color:#fff;font:12px/1.4 system-ui;padding:6px 10px;white-space:pre-wrap;word-break:break-word;pointer-events:none'; document.body.appendChild(d); }
    d.textContent = 'Error: ' + msg;
  };
  window.__showErr = (m) => { window.__failed = true; show(m); bar(m); };
  addEventListener('error', (e) => { if (window.__ready) bar((e && e.message) || 'error'); });
  addEventListener('error', (e) => { if (!window.__ready) window.__showErr((e && e.message) || 'script error'); });
  addEventListener('unhandledrejection', (e) => { if (!window.__ready) show(String(e.reason)); });
})();
