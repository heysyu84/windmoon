// Optional first-click export diagnostic. Inert unless ?wm_debug=1 is present.
// Records only event names, URL paths, request methods and HTTP statuses.
// Never records tokens, passwords, request bodies, names, or response bodies.
(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('wm_debug') !== '1') return;
  const KEY = 'wm-export-diagnostic-v1';
  const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch { return []; } };
  const log = (event, details = {}) => {
    try {
      const items = read();
      items.push({ at: new Date().toISOString(), event, ...details });
      sessionStorage.setItem(KEY, JSON.stringify(items.slice(-120)));
    } catch {}
  };
  const pathOf = value => {
    try { const url = new URL(String(value || ''), location.href); return (url.origin === location.origin ? '' : url.origin) + url.pathname; }
    catch { return 'unknown'; }
  };
  log('script-loaded', { page: location.origin + location.pathname, queryDebug: true });
  for (const name of ['pageshow', 'pagehide', 'beforeunload', 'popstate', 'hashchange', 'focus']) {
    window.addEventListener(name, () => log(name, { page: location.pathname, hash: location.hash.slice(0, 35) }), true);
  }
  window.addEventListener('windmoon:unauthorized', () => log('windmoon-unauthorized'), true);
  document.addEventListener('submit', event => {
    const form = event.target;
    log('FORM-SUBMIT', { action: pathOf(form?.getAttribute?.('action') || location.href), method: form?.method || 'unknown', preventedAtCapture: event.defaultPrevented });
  }, true);
  document.addEventListener('click', event => {
    const element = event.composedPath?.().find(x => x && x.tagName && /^(BUTTON|SUMMARY|A)$/.test(x.tagName));
    if (!element) return;
    const raw = String(element.innerText || element.textContent || '').trim();
    const label = raw.replace(/\s+/g, ' ').slice(0, 45);
    if (!/(XLSX|PDF|인쇄|내보내기|다운로드|로그인|공유|미리보기)/i.test(label)) return;
    log('CLICK', { label, tag: element.tagName, type: element.getAttribute('type') || 'default', path: element.tagName === 'A' ? pathOf(element.href) : null });
  }, true);
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    const method = String(init?.method || input?.method || 'GET').toUpperCase();
    const path = pathOf(typeof input === 'string' || input instanceof URL ? input : input?.url);
    const args = arguments;
    try {
      return Promise.resolve(originalFetch.apply(this, args)).then(response => {
        if (path.includes('/api/') || response.status >= 400 || response.redirected) {
          log('FETCH', { method, path, status: response.status, redirected: response.redirected, destination: response.redirected ? pathOf(response.url) : undefined });
        }
        return response;
      }, error => {
        log('FETCH-FAILED', { method, path, kind: error?.name || 'Error' });
        throw error;
      });
    } catch (error) {
      log('FETCH-THREW', { method, path, kind: error?.name || 'Error' });
      throw error;
    }
  };
  window.addEventListener('error', event => log('JS-ERROR', { kind: event.error?.name || 'Error', script: pathOf(event.filename) }));
  window.addEventListener('unhandledrejection', event => log('UNHANDLED-REJECTION', { kind: event.reason?.name || 'Error' }));
  const button = document.createElement('button');
  button.textContent = '내보내기 진단 복사';
  button.type = 'button';
  button.setAttribute('aria-label', '내보내기 진단 로그 복사');
  Object.assign(button.style, { position: 'fixed', bottom: '14px', right: '14px', zIndex: '2147483647', background: '#172b27', color: 'white', border: '1px solid #c8ae7b', borderRadius: '8px', padding: '11px 14px', fontSize: '13px', cursor: 'pointer', boxShadow: '0 4px 14px #0003' });
  button.addEventListener('click', async () => {
    const text = JSON.stringify({ version: 1, currentPage: location.origin + location.pathname, entries: read() }, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = '복사 완료 · 채팅에 붙여넣기';
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      Object.assign(area.style, { position: 'fixed', inset: '15%', width: '70%', height: '65%', zIndex: '2147483647', background: 'white', color: 'black' });
      document.body.appendChild(area);
      area.focus(); area.select();
      try { document.execCommand('copy'); button.textContent = '복사 완료'; } catch { button.textContent = '텍스트를 선택해 복사'; }
    }
  });
  const attach = () => { if (!document.body.contains(button)) document.body.appendChild(button); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', attach) : attach();
})();
