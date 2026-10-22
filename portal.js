const paths={users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.9"/><circle cx="9" cy="7" r="4"/><path d="M16 3.2a4 4 0 0 1 0 7.6"/>',wallet:'<path d="M21 8V6a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h16v10H5a3 3 0 0 1-3-3V7M21 12h-5v5h5"/>',menu:'<path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3ZM8 7h8M8 11h8M8 15h4"/>',card:'<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M5 16c.5-3 5.5-3 6 0M14 10h5M14 14h4"/>',glass:'<path d="m3 3 9 10L21 3ZM12 13v8M7 21h10M6 6h12"/>'};
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=(name,size=22)=>`<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.menu}</svg>`;
const container=document.querySelector('#modules');let modules=[];
const isPagesHost = location.hostname.endsWith('.pages.dev');
const appHref = m => isPagesHost && ['staff','operations'].includes(m.id)
  ? `https://heysyu84.github.io/windmoon/${m.id}/` : m.href;
document.querySelector('#today').textContent=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',weekday:'short'}).format(new Date());
const labels={staff:'근무 · 직원 정보 · 급여 정산',operations:'일마감 · 매출 · 지출',menu:'A3 메뉴판 편집',cards:'명함 디자인 · 내보내기',recipes:'제조법 · 재료 · 즐겨찾기'};
function render(query=''){
 const matching=modules.filter(m=>[m.name,m.english,m.description,m.group].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
 const arrow='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>';
 container.innerHTML=matching.length?[...new Set(matching.map(m=>m.group))].map(group=>`<section class="module-section"><div class="section-heading"><h2>${escape(group)}</h2><span>${matching.filter(m=>m.group===group).length}</span></div><div class="module-grid ${group==='매장 운영'?'primary-grid':''}">${matching.filter(m=>m.group===group).map(m=>`<a class="module-card ${m.group==='매장 운영'?'primary-card':''}" href="${escape(appHref(m))}" target="_top" data-module="${m.id}"><div class="card-top"><span class="module-icon">${icon(m.icon,23)}</span><span class="card-arrow">${arrow}</span></div><h3>${escape(m.name)}</h3><p>${escape(m.description)}</p><div class="card-foot"><span>${escape(labels[m.id]||'업무 도구')}</span><span>열기</span></div></a>`).join('')}</div></section>`).join(''):'<div class="home-empty">검색한 도구가 없습니다. 다른 이름으로 검색해 주세요.</div>';
}
try{
 const response=await fetch('./modules.json',{cache:'no-cache'});if(!response.ok)throw Error();modules=await response.json();render();
 try{const last=modules.find(m=>m.id===localStorage.getItem('windmoon-suite-last-module'));if(last){const resume=document.querySelector('#resume');resume.hidden=false;resume.href=appHref(last);resume.target='_top';resume.dataset.module=last.id;document.querySelector('#resume-name').textContent=last.name;}}catch{}
}catch{container.innerHTML='<div class="home-empty">도구를 불러오지 못했습니다. <a href="./staff/">직원관리</a> 또는 <a href="./operations/">운영관리</a>를 직접 열 수 있습니다.</div>';}
document.querySelector('#module-search').addEventListener('input',event=>render(event.target.value));
document.addEventListener('click',event=>{const link=event.target.closest('[data-module]');if(link)try{localStorage.setItem('windmoon-suite-last-module',link.dataset.module);}catch{}});
document.addEventListener('keydown',event=>{if(event.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){event.preventDefault();document.querySelector('#module-search').focus();}});
