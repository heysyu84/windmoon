(() => {
  'use strict';
  const frame = document.getElementById('staff-frame');
  const copy = document.getElementById('copy-log');
  const view = document.getElementById('show-log');
  const reload = document.getElementById('reload-frame');
  const state = document.getElementById('state');
  const logEl = document.getElementById('log');
  const KEY = 'wm-pdf-diagnostics-20261104';
  function restore() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(KEY) || '[]');
      return Array.isArray(parsed) ? parsed.slice(-150) : [];
    } catch { return []; }
  }
  let entries = restore(), childVersion = 0, lastUi = '';
  function add(event, detail = {}) {
    entries.push({ time: new Date().toISOString(), event, ...detail });
    if (entries.length > 150) entries = entries.slice(-150);
    try { sessionStorage.setItem(KEY, JSON.stringify(entries)); } catch {}
    state.textContent = '진단 작동 중 · 기록 ' + entries.length + '건';
    if (logEl.classList.contains('visible')) logEl.textContent = JSON.stringify(entries, null, 2);
  }
  function safePath(value, base) {
    try {
      const url = new URL(String(value || ''), base || location.href);
      return (url.origin === location.origin ? '' : url.origin) + url.pathname;
    } catch { return 'unknown'; }
  }
  function connect() {
    const id = ++childVersion;
    let w, d;
    try {
      w = frame.contentWindow;
      d = w.document;
      if (w.location.origin !== window.location.origin) {
        add('FRAME-NOT-SAME-ORIGIN'); return;
      }
    } catch {
      add('FRAME-CANNOT-INSPECT'); return;
    }
    add('FRAME-LOAD', { path: safePath(w.location.href), id });
    state.textContent = '진단 연결됨';
    function ui() {
      try {
        const current = d.querySelector('.auth-page') ? 'login' : d.querySelector('.app-shell') ? 'staff' : 'loading';
        if (current !== lastUi) { lastUi = current; add('UI-SCREEN', { screen: current }); }
      } catch {}
    }
    ui();
    try {
      new w.MutationObserver(ui).observe(d.body || d.documentElement, { childList: true, subtree: true });
    } catch {}
    d.addEventListener('click', e => {
      const element = e.target?.closest?.('button,summary,a');
      if (!element) return;
      const label = String(element.textContent || '').replace(/\s+/g, ' ').trim();
      if (!/(PDF|XLSX|내보내기|다운로드|미리보기|인쇄|공유)/i.test(label)) return;
      add('BUTTON-CLICK', {
        label: label.slice(0, 35),
        tag: element.tagName,
        type: element.getAttribute('type') || 'default',
        actionPath: element.tagName === 'A' ? safePath(element.href) : undefined
      });
    }, true);
    d.addEventListener('submit', e => {
      add('FORM-SUBMIT', {
        actionPath: safePath(e.target?.getAttribute('action') || w.location.href),
        method: String(e.target?.method || 'get').toUpperCase()
      });
    }, true);
    w.addEventListener('beforeunload', () => add('FRAME-BEFOREUNLOAD', { id }), true);
    w.addEventListener('pagehide', () => add('FRAME-PAGEHIDE', { id }), true);
    w.addEventListener('error', e => {
      add('FRAME-ERROR', { kind: e.error?.name || 'ScriptError', script: safePath(e.filename) });
    }, true);
    w.addEventListener('unhandledrejection', e => {
      add('FRAME-PROMISE-ERROR', { kind: e.reason?.name || 'Error' });
    }, true);
    w.addEventListener('windmoon:unauthorized', () => add('GLOBAL-UNAUTHORIZED'), true);
    try {
      const originalFetch = w.fetch;
      w.fetch = function(input, options) {
        const path = safePath(typeof input === 'string' || input instanceof w.URL ? input : input?.url, w.location.href);
        const method = String(options?.method || input?.method || 'GET').toUpperCase();
        return Promise.resolve(originalFetch.apply(this, arguments)).then(
          response => {
            if (path.includes('/api/') || response.status >= 400 || response.redirected) {
              add('FETCH', { path, method, status: response.status, redirected: !!response.redirected });
            }
            return response;
          },
          error => {
            add('FETCH-FAILED', { path, method, kind: error?.name || 'Error' });
            throw error;
          }
        );
      };
      add('FETCH-WATCH-ACTIVE');
    } catch {
      add('FETCH-WATCH-UNAVAILABLE');
    }
    try {
      const oldPrint = w.print;
      w.print = function() { add('PRINT-CALLED'); return oldPrint.apply(this, arguments); };
    } catch {}
  }
  frame.addEventListener('load', connect);
  copy.addEventListener('click', async () => {
    const output = JSON.stringify({ version: 'pdf-20261104', site: location.origin + location.pathname, entries }, null, 2);
    try {
      await navigator.clipboard.writeText(output);
      copy.textContent = '복사 완료 · 채팅에 붙여넣기';
    } catch {
      logEl.classList.add('visible');
      logEl.textContent = output;
      copy.textContent = '아래 기록을 선택해서 복사';
      try {
        const selection = getSelection();
        const range = document.createRange();
        range.selectNodeContents(logEl);
        selection.removeAllRanges(); selection.addRange(range);
        document.execCommand('copy');
      } catch {}
    }
  });
  view.addEventListener('click', () => {
    logEl.classList.toggle('visible');
    logEl.textContent = JSON.stringify({ version: 'pdf-20261104', entries }, null, 2);
    view.textContent = logEl.classList.contains('visible') ? '기록 닫기' : '기록 보기';
  });
  reload.addEventListener('click', () => {
    add('MANUAL-RELOAD');
    frame.src = './?wm_debug=1&wm_frame_diagnostic=1&refresh=' + Date.now();
  });
  add('DIAGNOSTIC-PAGE-READY');
  if (frame.contentDocument?.readyState === 'complete') connect();
})();
