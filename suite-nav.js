const root = new URL('./', import.meta.url);
const faviconHref = new URL('favicon.svg?v=20261022-wave', root).href;
let faviconLink = document.querySelector('link[rel~="icon"]');
if (!faviconLink) {
  faviconLink = document.createElement('link');
  faviconLink.rel = 'icon';
  document.head.append(faviconLink);
}
faviconLink.type = 'image/svg+xml';
faviconLink.href = faviconHref;

// iOS Home Screen uses a PNG touch icon independently of the tab favicon.
let touchIcon = document.querySelector('link[rel="apple-touch-icon"]');
if (!touchIcon) {
  touchIcon = document.createElement('link');
  touchIcon.rel = 'apple-touch-icon';
  document.head.append(touchIcon);
}
touchIcon.sizes = '180x180';
touchIcon.href = new URL('apple-touch-icon.png?v=20261028', root).href;

const page = document.body.dataset.suitePage;
// The staff/operations API is authenticated on the existing GitHub origin.
// Keep both admin apps there until a same-origin Cloudflare backend is deployed.
const isPagesHost = location.hostname.endsWith('.pages.dev');
const suiteModuleHref = id => id === 'home' ? root.href : isPagesHost && (id === 'staff' || id === 'operations')
  ? `https://heysyu84.github.io/windmoon/${id}/` : new URL(`${id}/`,root).href;
const paths = {
  home:'<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3Z"/>',
  staff:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-17a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5v2"/>',
  operations:'<path d="M21 8V6a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h16v10H5a3 3 0 0 1-3-3V7m19 6h-5v4h5"/>',
  menu:'<path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Zm3 4h8m-8 4h8m-8 4h4"/>',
  cards:'<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M5 16c.5-3 5.5-3 6 0m3-6h5m-5 4h4"/>',
  recipes:'<path d="m3 3 9 10L21 3ZM12 13v8m-5 0h10M6 6h12"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
const modules = [['home','홈'],['staff','직원관리'],['operations','운영관리'],['menu','메뉴판 편집'],['cards','명함 편집'],['recipes','바 레시피']];
const nav = document.createElement('aside');
nav.className='wm-suite-sidebar';
nav.setAttribute('aria-label','풍월 업무공간');
nav.innerHTML = `<a class="wm-suite-brand" href="${root}" aria-label="WIND MOON 홈"><picture><source media="(max-width:900px)" srcset="${new URL('brand/mark.svg',root)}"><img src="${new URL('brand/wordmark.png',root)}" alt="WIND MOON 풍월 · LOUNGE & CLUB" width="1774" height="887"></picture><span>통합 업무공간</span></a><span class="wm-nav-label">WORKSPACE</span><nav class="wm-suite-links" aria-label="프로그램">${modules.map(([id,label],i)=>`${i===3?'<span class="wm-nav-label wm-tools-label">STUDIO & TOOLS</span>':''}<a class="wm-suite-link${page===id?' is-active':''}" href="${suiteModuleHref(id)}" target="_top" data-wm-module="${id}" title="${label}"${page===id?' aria-current="page"':''}>${icon(id)}<span>${label}</span><i></i></a>`).join('')}</nav><a class="wm-suite-account" href="${root}" aria-label="풍월 업무공간 홈"><span class="wm-avatar">WM</span><span>풍월<small>LOUNGE & CLUB</small></span>${icon('home')}</a>`;
document.body.prepend(nav);
for(const anchor of document.querySelectorAll('[data-wm-home]')) {
  anchor.href=root; anchor.innerHTML=`${icon('home')}<span>홈으로</span>`;
}
document.addEventListener('click',event=>{
  const link=event.target.closest('[data-wm-module]');
  if(link && link.dataset.wmModule!=='home')try{localStorage.setItem('windmoon-suite-last-module',link.dataset.wmModule);}catch{}
});
