'use strict';
const $ = (selector) => document.querySelector(selector);
const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function readStored(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(key)); return value == null ? fallback : value; } catch { return fallback; }
}
function writeStored(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
const savedFavorites = readStored('pwg-favorites-v1', []);
const savedRecent = readStored('pwg-recent-v1', []);
const state = {
  filter:'all', query:'', current:null,
  unit:readStored('pwg-unit-v1','ml') === 'oz' ? 'oz' : 'ml',
  favorites:new Set(Array.isArray(savedFavorites) ? savedFavorites.filter((id) => RECIPES.some((r) => r.id === id)) : []),
  recent:Array.isArray(savedRecent) ? savedRecent.filter((id) => RECIPES.some((r) => r.id === id)).slice(0,4) : [],
  font:Math.max(18, Math.min(28, Number(readStored('pwg-font-v1',20)) || 20)),
  theme:readStored('pwg-theme-v1','dark') === 'light' ? 'light' : 'dark'
};
let timerInterval = null, toastTimeout = null, wakeLock = null, wakeRequested = false;
let lastRecipeTrigger = null;
const initialConsonants = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
function initials(value) {
  return [...String(value)].map((c) => {
    const n = c.charCodeAt(0) - 0xac00;
    return n >= 0 && n <= 11171 ? initialConsonants[Math.floor(n/588)] : c;
  }).join('');
}
function normalize(value) {
  return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').normalize('NFC').replace(/[\s·&()'’\.\-_]/g,'');
}
function searchCorpus(recipe) {
  const names = [recipe.name,recipe.en,...recipe.aliases,...recipe.ingredients.map((i)=>i[0])];
  if(recipe.ingredients.some(([name])=>name==='스위트앤사워')) names.push('스윗앤사워','스위트 앤 사워','sweet and sour','사워믹스','샤워믹스');
  if(recipe.ingredients.some(([name])=>name==='와이키키')) names.push('코코넛 럼','coconut rum');
  if(recipe.nonAlcohol) names.push('논알콜','무알콜','nonalcohol','mocktail');
  return normalize([...names,...names.map(initials)].join('|'));
}
const corpus = new Map(RECIPES.map((r)=>[r.id,searchCorpus(r)]));
function matches(recipe, query=state.query, filter=state.filter) {
  if(filter==='favorite' && !state.favorites.has(recipe.id)) return false;
  if(filter==='shot' && !recipe.shot) return false;
  if(['빌드','쉐이크'].includes(filter) && recipe.method!==filter) return false;
  return query.trim().split(/\s+/).filter(Boolean).map(normalize).every((token)=>corpus.get(recipe.id).includes(token));
}
const ML_PER_OZ = 29.5735295625;
function volumeNumber(ml) {
  return state.unit === 'ml' ? String(ml) : String(Number((ml/ML_PER_OZ).toFixed(2)));
}
function volumeLabel(ml) { return volumeNumber(ml)+state.unit; }
function cupValue(oz) { return oz+'oz('+Math.round(oz*ML_PER_OZ)+'ml)'; }
function shotCupValue(ml) { return Number((ml/ML_PER_OZ).toFixed(2))+'oz('+ml+'ml)'; }
function cupLabel(recipe) {
  if(recipe.shot) return '샷잔 '+shotCupValue(recipe.shotCapacityMl);
  return recipe.cups.map(cupValue).join(' / ');
}
function formatTextVolumes(text) {
  return String(text).replace(/(\d+(?:\.\d+)?oz\(\d+(?:\.\d+)?ml\))|(\d+(?:\.\d+)?)\s*ml/g,(_match,cup,n)=>cup||volumeLabel(Number(n)));
}
function recipeBrief(recipe) {
  const shortNames={'화이트럼':'럼','스위트앤사워':'사워','오렌지주스':'오렌지','크랜베리주스':'크랜베리','파인애플주스':'파인애플'};
  const parts=recipe.ingredients.slice(0,3).map(([name,amount])=>(shortNames[name]||name)+' '+(amount==='Fill'?'Fill':volumeLabel(amount)));
  if(recipe.ingredients.length>3) parts.push('+'+(recipe.ingredients.length-3)+'가지');
  return parts.join(' · ');
}
function numberFor(recipe) { return String(RECIPES.findIndex((r)=>r.id===recipe.id)+1).padStart(2,'0'); }
function cardHTML(recipe) {
  const favorite = state.favorites.has(recipe.id);
  return `<article class="recipe-card" style="--drink-color:var(--${recipe.color})"><button class="card-open" data-open="${recipe.id}" aria-label="${escapeHTML(recipe.name)} 레시피 열기"><div class="card-topline"><span class="recipe-number">${numberFor(recipe)}</span><span class="card-method">${escapeHTML(recipe.method)}</span><span class="card-glass">· ${escapeHTML(cupLabel(recipe))}</span></div><h3 class="card-title">${escapeHTML(recipe.name)}</h3><p class="card-en">${escapeHTML(recipe.en)}</p><div class="card-bottom"><p class="card-brief">${escapeHTML(recipeBrief(recipe))}</p>${icon('arrow')}</div></button><button class="card-star" data-favorite="${recipe.id}" aria-label="${escapeHTML(recipe.name)} ${favorite?'즐겨찾기 해제':'즐겨찾기에 추가'}" aria-pressed="${favorite}">${icon('star')}</button></article>`;
}
function renderList() {
  const results = RECIPES.filter((r)=>matches(r));
  const alcoholic = results.filter((r)=>!r.nonAlcohol);
  const nonAlcoholic = results.filter((r)=>r.nonAlcohol);
  $('#recipe-list').innerHTML = (alcoholic.length ? `<section aria-label="칵테일"><div class="recipe-grid">${alcoholic.map(cardHTML).join('')}</div></section>`:'') +
    (nonAlcoholic.length ? `<section class="nonalcohol-section" id="nonalcohol-section" aria-labelledby="nonalcohol-title"><div class="section-divider"><div><h2 id="nonalcohol-title"><span>00%</span>논알콜</h2><p>술 없이 만드는 두 가지 레시피</p></div><span class="nonalcohol-pill">NON-ALCOHOLIC · ${nonAlcoholic.length}</span></div><div class="recipe-grid">${nonAlcoholic.map(cardHTML).join('')}</div></section>`:'');
  $('#result-count').textContent = `${results.length}종`;
  $('#list-label').textContent = state.query.trim() ? `'${state.query.trim()}' 검색 결과` : ({all:'전체 레시피',favorite:'즐겨찾기',shot:'샷 레시피','빌드':'빌드 레시피','쉐이크':'쉐이크 레시피'}[state.filter]);
  $('#empty-state').hidden = !!results.length;
  const isEmptyFavorite = state.filter==='favorite' && !state.query && !state.favorites.size;
  $('#empty-title').textContent = isEmptyFavorite ? '자주 만드는 메뉴를 저장하세요' : '검색 결과가 없습니다';
  $('#empty-copy').textContent = isEmptyFavorite ? '메뉴 오른쪽의 별을 누르면 여기에 모입니다.' : '메뉴명이나 재료명을 짧게 입력해보세요.';
  $('#search-clear').hidden = !state.query;
  $('#side-favorite-count').textContent = state.favorites.size;
  document.querySelectorAll('[data-filter]').forEach((button)=>{
    const active = button.dataset.filter===state.filter;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  });
}
function renderRecent() {
  $('#recent-section').hidden = !state.recent.length;
  $('#recent-list').innerHTML = state.recent.map((id)=>{
    const recipe=RECIPES.find((r)=>r.id===id);
    return `<button class="recent-chip" data-open="${id}">${escapeHTML(recipe.name)}</button>`;
  }).join('');
}
function setFilter(filter) { state.filter=filter; renderList(); }
function resetSearch() { state.query=''; $('#search').value=''; state.filter='all'; renderList(); }
function toggleFavorite(id) {
  if(!RECIPES.some((r)=>r.id===id)) return;
  const added=!state.favorites.has(id);
  added ? state.favorites.add(id) : state.favorites.delete(id);
  writeStored('pwg-favorites-v1',[...state.favorites]);
  renderList();
  if(state.current?.id===id) updateDetailFavorite();
  showToast(added?'즐겨찾기에 저장했습니다':'즐겨찾기를 해제했습니다');
}
function updateDetailFavorite() {
  const favorite=state.favorites.has(state.current.id);
  $('#detail-favorite').setAttribute('aria-pressed',String(favorite));
  $('#detail-favorite').setAttribute('aria-label',favorite?'즐겨찾기 해제':'즐겨찾기에 추가');
}
function renderIngredients() {
  const count=Number($('#quantity').value);
  $('#quantity-note').textContent = count===1 ? '1잔 기준' : `${count}잔 합계 · 만드는 순서는 1잔 기준입니다`;
  $('#ingredient-list').innerHTML = state.current.ingredients.map(([name,amount])=>`<div class="ingredient-row"><dt>${escapeHTML(name)}</dt>${typeof amount==='number'?`<dd>${volumeNumber(amount*count)}<small>${state.unit}</small></dd>`:`<dd class="fill-amount">${count===1?'Fill':'각 잔 Fill'}</dd>`}</div>`).join('');
}
function renderDetailVolumes() {
  const recipe=state.current;
  $('#detail-tags').innerHTML=[recipe.nonAlcohol?'논알콜':recipe.method,cupLabel(recipe),`얼음 ${recipe.ice}`].map((tag)=>`<span class="detail-tag">${escapeHTML(tag)}</span>`).join('');
  if(recipe.nonAlcohol) $('#detail-tags').innerHTML+=`<span class="detail-tag">${recipe.method}</span>`;
  if(recipe.shot) $('#cup-explainer').textContent='샷잔 용량은 첨부 PDF의 '+shotCupValue(recipe.shotCapacityMl)+' 기준입니다.';
  else {
    const preferred=cupValue(recipe.cups[0]);
    const hasFill=recipe.ingredients.some(([,amount])=>amount==='Fill');
    $('#cup-explainer').textContent='권장 '+preferred+(recipe.cups.length===1?'':hasFill?' · 큰 컵에서는 Fill 양이 늘어나 맛이 더 연해집니다.':' · 큰 컵을 써도 재료의 정량은 같습니다.');
  }
  renderIngredients();
  $('#step-list').innerHTML=recipe.steps.map((step)=>`<li><span>${escapeHTML(formatTextVolumes(step))}</span></li>`).join('');
  $('#recipe-note-text').textContent=formatTextVolumes(recipe.note||'');
}
function applyUnit() {
  document.querySelectorAll('[data-unit]').forEach((button)=>{
    const active=button.dataset.unit===state.unit;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  });
  const next=state.unit==='ml'?'oz':'ml';
  $('#detail-unit-button').textContent=next+' ↔';
  $('#detail-unit-button').setAttribute('aria-label','재료를 '+next+'로 보기');
  $('#font-preview-amount').textContent=volumeLabel(40);
  $('#review-cups').textContent=[9,12,14].map(cupValue).join(' / ');
  $('#review-shot').textContent=shotCupValue(45);
  $('#review-changes').innerHTML=REVIEW.changes.map(([title,copy])=>`<section class="review-change"><h3>${escapeHTML(title)}</h3><p>${escapeHTML(formatTextVolumes(copy))}</p></section>`).join('');
  if(state.current && $('#recipe-dialog').open) renderDetailVolumes();
}
function setUnit(unit) {
  if(!['ml','oz'].includes(unit))return;
  state.unit=unit;writeStored('pwg-unit-v1',unit);applyUnit();renderList();
}
function syncBodyLock() { document.body.style.overflow=document.querySelector('dialog[open]')?'hidden':''; }
function openRecipe(id, fromHash=false) {
  const recipe=RECIPES.find((r)=>r.id===id);
  if(!recipe) return;
  stopTimer();
  lastRecipeTrigger=document.activeElement;
  state.current=recipe;
  $('#recipe-dialog').style.setProperty('--drink-color',`var(--${recipe.color})`);
  $('#detail-title').textContent=recipe.name;
  $('#detail-en').textContent=recipe.en;
  $('#detail-number').textContent=`RECIPE ${numberFor(recipe)}`;
  $('#quantity').value='1';
  renderDetailVolumes();
  $('#recipe-note').hidden=!recipe.note;
  $('#fill-explainer').hidden=!recipe.ingredients.some(([,amount])=>amount==='Fill');
  $('#sour-explainer').hidden=!recipe.ingredients.some(([name])=>name==='스위트앤사워');
  $('#timer-button').hidden=recipe.method!=='쉐이크';
  updateDetailFavorite();
  if(!$('#recipe-dialog').open) $('#recipe-dialog').showModal();
  $('#recipe-dialog').scrollTop=0;
  syncBodyLock();
  state.recent=[id,...state.recent.filter((item)=>item!==id)].slice(0,4);
  writeStored('pwg-recent-v1',state.recent); renderRecent();
  if(!fromHash) history.replaceState(null,'',`#recipe=${encodeURIComponent(id)}`);
}
function showDialog(id) { if(!$(id).open) $(id).showModal(); syncBodyLock(); }
function showToast(message) {
  clearTimeout(toastTimeout); $('#toast').textContent=message; $('#toast').classList.add('show');
  toastTimeout=setTimeout(()=>$('#toast').classList.remove('show'),2300);
}
function applyTheme() {
  document.documentElement.dataset.theme=state.theme;
  $('#theme-button').innerHTML=icon(state.theme==='dark'?'sun':'moon');
  $('#theme-button').setAttribute('aria-label',state.theme==='dark'?'밝은 화면으로 전환':'검정 화면으로 전환');
  $('meta[name="theme-color"]').content=state.theme==='dark'?'#101714':'#f6f6ee';
  writeStored('pwg-theme-v1',state.theme);
}
function applyFont() {
  document.documentElement.style.setProperty('--recipe-font',`${state.font}px`);
  $('#font-value').textContent=`${state.font}px`;
  $('#font-decrease').disabled=state.font<=18;
  $('#font-increase').disabled=state.font>=28;
  writeStored('pwg-font-v1',state.font);
}
function stopTimer() {
  if(timerInterval!==null) clearInterval(timerInterval);
  timerInterval=null;
  $('#timer-button').innerHTML=`${icon('clock')}<span>10초 쉐이크 타이머</span>`;
  $('#timer-status').textContent='';
}
function startTimer() {
  if(timerInterval!==null){ stopTimer(); return; }
  const start=performance.now();
  $('#timer-button').innerHTML=`${icon('close')}<span>타이머 취소</span>`;
  $('#timer-status').textContent='10초';
  timerInterval=setInterval(()=>{
    const left=Math.max(0,Math.ceil(10-(performance.now()-start)/1000));
    $('#timer-status').textContent=`${left}초`;
    if(!left){ clearInterval(timerInterval);timerInterval=null;$('#timer-status').textContent='10초 완료';$('#timer-button').innerHTML=`${icon('check')}<span>다시 10초</span>`;if(navigator.vibrate)navigator.vibrate(40); }
  },200);
}
async function requestWake() {
  try {
    wakeLock=await navigator.wakeLock.request('screen'); wakeRequested=true;
    $('#wake-button').setAttribute('aria-pressed','true');
    wakeLock.addEventListener('release',()=>{
      wakeLock=null;$('#wake-button').setAttribute('aria-pressed','false');
    });
    return true;
  } catch { wakeRequested=false;$('#wake-button').setAttribute('aria-pressed','false');showToast('이 환경에서는 화면 유지를 사용할 수 없습니다');return false; }
}
$('#search').addEventListener('input',(event)=>{state.query=event.target.value;renderList();});
$('#search-clear').addEventListener('click',()=>{state.query='';$('#search').value='';renderList();$('#search').focus();});
$('#quantity').addEventListener('change',renderIngredients);
$('#theme-button').addEventListener('click',()=>{state.theme=state.theme==='dark'?'light':'dark';applyTheme();});
$('#settings-button').addEventListener('click',()=>showDialog('#settings-dialog'));
$('#review-button').addEventListener('click',()=>showDialog('#review-dialog'));
$('#recipe-close').addEventListener('click',()=>$('#recipe-dialog').close());
$('#detail-favorite').addEventListener('click',()=>{if(state.current)toggleFavorite(state.current.id);});
$('#detail-unit-button').addEventListener('click',()=>setUnit(state.unit==='ml'?'oz':'ml'));
$('#font-decrease').addEventListener('click',()=>{state.font=Math.max(18,state.font-2);applyFont();});
$('#font-increase').addEventListener('click',()=>{state.font=Math.min(28,state.font+2);applyFont();});
$('#font-reset').addEventListener('click',()=>{state.font=20;applyFont();});
$('#timer-button').addEventListener('click',startTimer);
$('#wake-button').addEventListener('click',async()=>{
  if(wakeRequested){wakeRequested=false;if(wakeLock)await wakeLock.release();$('#wake-button').setAttribute('aria-pressed','false');showToast('화면 유지를 껐습니다');}
  else if(await requestWake()) showToast('이 화면을 보는 동안 화면을 유지합니다');
});
document.addEventListener('visibilitychange',()=>{if(wakeRequested && document.visibilityState==='visible' && !wakeLock) requestWake();});
document.addEventListener('click',(event)=>{
  const trigger=event.target.closest('button');if(!trigger)return;
  if(trigger.dataset.open)openRecipe(trigger.dataset.open);
  if(trigger.dataset.favorite)toggleFavorite(trigger.dataset.favorite);
  if(trigger.dataset.filter)setFilter(trigger.dataset.filter);
  if(trigger.dataset.unit)setUnit(trigger.dataset.unit);
  if(trigger.dataset.close)$(`#${trigger.dataset.close}`).close();
  if(trigger.dataset.action==='review')showDialog('#review-dialog');
  if(trigger.dataset.action==='reset')resetSearch();
  if(trigger.dataset.action==='nonalcohol'){
    resetSearch();$('#nonalcohol-section').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
  }
});
document.addEventListener('keydown',(event)=>{
  if(document.querySelector('dialog[open]'))return;
  if(event.key==='/' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) {event.preventDefault();$('#search').focus();}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();$('#search').focus();}
});
document.querySelectorAll('dialog').forEach((dialog)=>{
  dialog.addEventListener('click',(event)=>{
    if(dialog.id==='recipe-dialog' && window.matchMedia('(max-width: 780px)').matches && event.target!==dialog){
      if(!event.target.closest('button,a,input,select,textarea,label,[role="button"]'))dialog.close();
      return;
    }
    if(event.target!==dialog)return;
    const rect=dialog.getBoundingClientRect();
    if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();
  });
  dialog.addEventListener('close',()=>{
    syncBodyLock();
    if(dialog.id==='recipe-dialog'){
      stopTimer();
      if(location.hash.startsWith('#recipe='))history.replaceState(null,'',location.pathname+location.search);
      if(lastRecipeTrigger?.isConnected)lastRecipeTrigger.focus();
      else if(state.current)$(`[data-open="${state.current.id}"]`)?.focus();
    }
  });
});
function openHashRecipe() {
  if(!location.hash.startsWith('#recipe='))return;
  try{openRecipe(decodeURIComponent(location.hash.slice(8)),true);}catch{}
}
window.addEventListener('hashchange',openHashRecipe);
$('#side-index').innerHTML=RECIPES.map((r,i)=>`${i===18?'<div class="index-divider">NON-ALCOHOLIC</div>':''}<button class="index-link" data-open="${r.id}" style="--drink-color:var(--${r.color})"><span class="index-dot"></span>${escapeHTML(r.name)}</button>`).join('');
$('#review-changes').innerHTML=REVIEW.changes.map(([title,copy])=>`<section class="review-change"><h3>${escapeHTML(title)}</h3><p>${escapeHTML(copy)}</p></section>`).join('');
$('#source-links').innerHTML=REVIEW.sources.map(([title,url])=>`<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(title)} ↗</a>`).join('');
if('wakeLock' in navigator)$('#wake-button').hidden=false;
applyTheme();applyFont();applyUnit();renderList();renderRecent();openHashRecipe();

