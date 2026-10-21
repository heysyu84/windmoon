import {DEFAULTS,GROUP_NAMES,LOGO_STYLE_DEFAULTS,freshState,sanitizeState,instagramURL,normalizeURL,buildScene,sceneSVG,sceneWarnings,createPDF,sampleFields} from './core.js';
import {zipBytes,pngWith300DPI,download} from './files.js';

const $=id=>document.getElementById(id),KEY='windmoon-card-studio-v1';
const orientationButtons=[...document.querySelectorAll('[data-orientation]')];
const designScaleIds=['nameScale','bodyScale','titleScale','englishScale','contactScale','addressScale'];
let state=freshState(),fonts=null,logos=null,ready=false,selected=null,drag=null,scenes=[],saveTimer,toastTimer,customFontData=null;
const history=[],future=[];
try{const stored=localStorage.getItem(KEY);if(stored)state=sanitizeState(JSON.parse(stored));}catch{}
const currentFonts=()=>state.customFontEnabled&&fonts?.custom?fonts:{...fonts,custom:null};
function toast(message,error=false){const t=$('toast');t.textContent=message;t.classList.toggle('error',error);t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.hidden=true;},4500);}
function remember(){history.push(structuredClone(state));if(history.length>45)history.shift();future.length=0;}
function persist(){clearTimeout(saveTimer);$('saveStatus').textContent='저장 중';saveTimer=setTimeout(()=>{try{localStorage.setItem(KEY,JSON.stringify(state));$('saveStatus').textContent='이 브라우저에 저장됨';}catch{$('saveStatus').textContent='자동 저장 불가';}},250);}
function commit(fn,{record=true}={}){if(record)remember();fn(state);render();syncControls();persist();}
function effectiveSelection(){return selected||{side:$('layoutSide').value||'front',id:$('layoutGroup').value||'logo'};}
const groupFor=sel=>scenes.find(s=>s.side===sel.side)?.groups.find(g=>g.id===sel.id);
function layout(sel=effectiveSelection()){return groupFor(sel)?.layout||state.layouts[state.orientation][sel.side][sel.id]||{dx:0,dy:0,scale:1};}
function editLayout(key,value){
  const sel=effectiveSelection(),next={...layout(),[key]:value};
  if(key==='dx')delete next.alignX;
  if(key==='dy')delete next.alignY;
  selected=sel;commit(s=>{s.layouts[s.orientation][sel.side][sel.id]=next;});
}
function alignSelection(sel,alignX,alignY){
  if(!ready||!groupFor(sel)?.items.length)return;
  const next={...layout(sel)};
  if(alignX)next.alignX=alignX;
  if(alignY)next.alignY=alignY;
  selected=sel;commit(s=>{s.layouts[s.orientation][sel.side][sel.id]=next;});
}
function resizeSelection(sel,value){
  const g=groupFor(sel);if(!ready||!g?.items.length)return;
  const l=layout(sel),b=g.baseBounds,a=g.anchor||b,next={...l,scale:value};
  if(!l.alignX)next.dx=Math.max(-60,Math.min(60,l.dx+(b.x+b.w/2-a.x)*(l.scale-value)));
  if(!l.alignY)next.dy=Math.max(-100,Math.min(100,l.dy+(b.y+b.h/2-a.y)*(l.scale-value)));
  selected=sel;commit(s=>{s.layouts[s.orientation][sel.side][sel.id]=next;});
}
const logoSelection=()=>({side:$('logoSide').value||'front',id:'logo'});
function syncControls(){
  for(const el of document.querySelectorAll('[data-field]'))if(document.activeElement!==el)el.value=state.fields[el.dataset.field];
  for(const k of ['syncQr','showQr','showGuides'])$(k).checked=state[k];
  document.querySelector('[data-field="qrUrl"]').readOnly=state.syncQr;
  for(const el of document.querySelectorAll('[data-color]'))el.value=state.design[el.dataset.color];
  for(const id of designScaleIds){$(id).value=Math.round(state.design[id]*100);$(id+'Value').textContent=Math.round(state.design[id]*100)+'%';}
  const sel=effectiveSelection();$('layoutSide').value=sel.side;
  $('logoSide').value=sel.side;
  const style=state.logoStyles[state.orientation][sel.side],logoSel={side:sel.side,id:'logo'},logoLayout=layout(logoSel),logoGroup=groupFor(logoSel);
  for(const el of document.querySelectorAll('[data-logo-style]'))if(document.activeElement!==el)el.value=Math.round(style[el.dataset.logoStyle]*100);
  $('logoOverall').value=Math.round(logoLayout.scale*100);$('logoOverallValue').textContent=Math.round(logoLayout.scale*100)+'%';
  $('logoDimensions').textContent=logoGroup?`현재 로고 ${logoGroup.bounds.w.toFixed(1)} × ${logoGroup.bounds.h.toFixed(1)} mm`:'로고를 불러오는 중입니다.';
  for(const button of document.querySelectorAll('[data-logo-align]')){button.disabled=!ready;button.setAttribute('aria-pressed',String(logoLayout.alignX===button.dataset.logoAlign));}
  $('centerLogoBoth').disabled=!ready;$('logoOverall').disabled=!ready;
  for(const el of document.querySelectorAll('[data-logo-style]'))el.disabled=!ready;
  const ids=sel.side==='front'?['logo']:['logo','identity','contacts','address',...(state.showQr?['qr']:[]),'rule'];
  $('layoutGroup').innerHTML=ids.map(id=>`<option value="${id}">${GROUP_NAMES[id]}</option>`).join('');
  $('layoutGroup').value=ids.includes(sel.id)?sel.id:'logo';
  const l=layout();
  if(document.activeElement!==$('offsetX'))$('offsetX').value=Number(l.dx.toFixed(2));
  if(document.activeElement!==$('offsetY'))$('offsetY').value=Number(l.dy.toFixed(2));
  $('groupScale').value=Math.round(l.scale*100);$('groupScaleValue').textContent=Math.round(l.scale*100)+'%';
  const selectedGroup=groupFor(sel);
  $('selectionSize').textContent=selectedGroup?.items.length?`선택 요소 ${selectedGroup.bounds.w.toFixed(1)} × ${selectedGroup.bounds.h.toFixed(1)} mm`:'';
  for(const button of document.querySelectorAll('[data-align-x]')){button.disabled=!selectedGroup?.items.length;button.setAttribute('aria-pressed',String(l.alignX===button.dataset.alignX));}
  for(const button of document.querySelectorAll('[data-align-y]')){button.disabled=!selectedGroup?.items.length;button.setAttribute('aria-pressed',String(l.alignY===button.dataset.alignY));}
  $('selectionHint').textContent=selected?`${selected.side==='front'?'앞면':'뒷면'} · ${GROUP_NAMES[selected.id]} 선택됨. 드래그하거나 이동 값을 입력하세요.`:'명함의 로고나 글자를 눌러 선택하세요. 드래그하거나 이동 값을 입력할 수 있습니다.';
  $('fontName').textContent=state.customFontEnabled&&customFontData?customFontData.name:'Pretendard';
  $('fontReset').hidden=!state.customFontEnabled;
  $('undo').disabled=!history.length;$('redo').disabled=!future.length;
}
function render(){
  orientationButtons.forEach(b=>{const active=b.dataset.orientation===state.orientation;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  const dim=state.orientation==='portrait'?'50 × 90 mm':'90 × 50 mm';
  $('dimensions').textContent=dim;$('exportDimensions').textContent=dim.toUpperCase();
  $('previewGrid').className='preview-grid '+state.orientation;
  $('sampleNotice').hidden=!sampleFields(state);
  if(!ready)return;
  scenes=['front','back'].map(side=>buildScene(state,state.orientation,side,currentFonts(),logos,window.qrcode));
  for(const s of scenes){$(s.side+'Preview').innerHTML=sceneSVG(s,{interactive:true,guides:state.showGuides,selected:selected?.side===s.side?selected.id:null});$(s.side+'Preview').setAttribute('aria-busy','false');}
  const errors=[...new Set(scenes.flatMap(sceneWarnings))];
  $('warnings').textContent=errors.join(' ');$('warnings').hidden=!errors.length;
  const qrError=scenes[1].qrError;
  $('qrHelp').classList.toggle('error',Boolean(qrError));$('qrHelp').textContent=qrError||'입력한 주소에 맞춰 QR이 자동 생성됩니다.';
  document.querySelector('[data-field="qrUrl"]').setAttribute('aria-invalid',String(Boolean(qrError)));
  try{$('qrLink').href=normalizeURL(state.fields.qrUrl);$('qrLink').removeAttribute('aria-disabled');}catch{$('qrLink').removeAttribute('href');$('qrLink').setAttribute('aria-disabled','true');}
  for(const id of ['exportPrint','exportPdf','exportSvg','exportPng','exportTop'])$(id).disabled=Boolean(qrError);
}
function select(side,id,focus=false){selected={side,id};$('layoutSection').open=true;if(id==='logo')$('logoSection').open=true;render();syncControls();if(focus)$(side+'Preview').querySelector(`[data-group="${id}"]`)?.focus?.({preventScroll:true});}
for(const el of document.querySelectorAll('[data-field]'))el.addEventListener('input',()=>{commit(s=>{s.fields[el.dataset.field]=el.value;if(el.dataset.field==='instagram'&&s.syncQr)s.fields.qrUrl=instagramURL(el.value);});});
for(const id of ['syncQr','showQr','showGuides'])$(id).addEventListener('change',()=>commit(s=>{s[id]=$(id).checked;if(id==='syncQr'&&s.syncQr)s.fields.qrUrl=instagramURL(s.fields.instagram);if(id==='showQr'&&!s.showQr&&selected?.id==='qr')selected=null;}));
orientationButtons.forEach(b=>b.addEventListener('click',()=>{selected=null;commit(s=>s.orientation=b.dataset.orientation);}));
for(const el of document.querySelectorAll('[data-color]'))el.addEventListener('input',()=>commit(s=>s.design[el.dataset.color]=el.value));
const palettes={classic:{frontBg:'#121617',frontInk:'#F4F1E8',backBg:'#F4F1E8',backInk:'#202020',muted:'#858582',rule:'#D5D4CE'},midnight:{frontBg:'#152D36',frontInk:'#ECE4D6',backBg:'#ECE4D6',backInk:'#152D36',muted:'#7B857D',rule:'#C9C7BA'},mono:{frontBg:'#151515',frontInk:'#FFFFFF',backBg:'#FFFFFF',backInk:'#151515',muted:'#777777',rule:'#DDDDDD'}};
document.querySelectorAll('[data-palette]').forEach(b=>b.addEventListener('click',()=>commit(s=>Object.assign(s.design,palettes[b.dataset.palette]))));
for(const id of designScaleIds)$(id).addEventListener('input',()=>commit(s=>s.design[id]=Number($(id).value)/100));
$('logoSide').addEventListener('change',()=>select($('logoSide').value,'logo'));
for(const button of document.querySelectorAll('[data-logo-align]'))button.addEventListener('click',()=>alignSelection(logoSelection(),button.dataset.logoAlign));
$('centerLogoBoth').addEventListener('click',()=>alignSelection(logoSelection(),'center','center'));
$('logoOverall').addEventListener('input',()=>resizeSelection(logoSelection(),Number($('logoOverall').value)/100));
for(const el of document.querySelectorAll('[data-logo-style]')){
  const apply=()=>{
    if(el.value===''||!Number.isFinite(Number(el.value)))return;
    const key=el.dataset.logoStyle,value=Math.max(Number(el.getAttribute('min')),Math.min(Number(el.getAttribute('max')),Number(el.value)))/100,sel=logoSelection();
    if(state.logoStyles[state.orientation][sel.side][key]===value)return;
    selected=sel;commit(s=>{s.logoStyles[s.orientation][sel.side][key]=value;});
  };
  el.addEventListener('input',apply);
  el.addEventListener('change',()=>{apply();el.value=Math.round(state.logoStyles[state.orientation][logoSelection().side][el.dataset.logoStyle]*100);});
}
$('resetLogoStyle').addEventListener('click',()=>{const sel=logoSelection();selected=sel;commit(s=>{s.logoStyles[s.orientation][sel.side]={...LOGO_STYLE_DEFAULTS};delete s.layouts[s.orientation][sel.side].logo;});toast('이 면의 로고 크기·간격·위치를 초기화했습니다.');});
$('layoutSide').addEventListener('change',()=>select($('layoutSide').value,'logo'));
$('layoutGroup').addEventListener('change',()=>select($('layoutSide').value,$('layoutGroup').value));
$('offsetX').addEventListener('input',()=>editLayout('dx',Math.min(60,Math.max(-60,Number($('offsetX').value)||0))));
$('offsetY').addEventListener('input',()=>editLayout('dy',Math.min(100,Math.max(-100,Number($('offsetY').value)||0))));
$('groupScale').addEventListener('input',()=>resizeSelection(effectiveSelection(),Number($('groupScale').value)/100));
for(const button of document.querySelectorAll('[data-align-x]'))button.addEventListener('click',()=>alignSelection(effectiveSelection(),button.dataset.alignX));
for(const button of document.querySelectorAll('[data-align-y]'))button.addEventListener('click',()=>alignSelection(effectiveSelection(),null,button.dataset.alignY));
$('resetGroup').addEventListener('click',()=>{const sel=effectiveSelection();commit(s=>delete s.layouts[s.orientation][sel.side][sel.id]);});
$('resetLayout').addEventListener('click',()=>{commit(s=>{s.layouts[s.orientation]={front:{},back:{}};s.logoStyles[s.orientation]={front:{...LOGO_STYLE_DEFAULTS},back:{...LOGO_STYLE_DEFAULTS}};});toast('현재 방향의 배치를 초기화했습니다.');});
document.querySelectorAll('.card-view').forEach(view=>{
  view.addEventListener('pointerdown',e=>{
    if(!ready)return;const g=e.target.closest('[data-group]');
    if(!g){selected=null;render();syncControls();return;}
    const side=view.closest('[data-side]').dataset.side,bounds=view.getBoundingClientRect(),scene=scenes.find(s=>s.side===side);
    select(side,g.dataset.group,true);const l=layout();
    drag={view,side,id:g.dataset.group,startX:e.clientX,startY:e.clientY,start:{...l},factorX:scene.w/bounds.width,factorY:scene.h/bounds.height,moved:false};
    e.preventDefault();
  });
  view.addEventListener('keydown',e=>{const g=e.target.closest('[data-group]');if(g&&['Enter',' '].includes(e.key)){e.preventDefault();select(view.closest('[data-side]').dataset.side,g.dataset.group,true);}});
});
document.addEventListener('pointermove',e=>{
  if(!drag)return;
  const dx=e.clientX-drag.startX,dy=e.clientY-drag.startY;if(!drag.moved&&Math.hypot(dx,dy)<2)return;
  if(!drag.moved){remember();drag.moved=true;}drag.view.classList.add('dragging');
  state.layouts[state.orientation][drag.side][drag.id]={dx:Math.max(-60,Math.min(60,drag.start.dx+dx*drag.factorX)),dy:Math.max(-100,Math.min(100,drag.start.dy+dy*drag.factorY)),scale:drag.start.scale};
  render();syncControls();persist();e.preventDefault();
},{passive:false});
const endDrag=()=>{if(drag)drag.view.classList.remove('dragging');drag=null;};
document.addEventListener('pointerup',endDrag);document.addEventListener('pointercancel',endDrag);window.addEventListener('blur',endDrag);
document.addEventListener('keydown',e=>{
  if(e.target.closest('input,textarea,select'))return;
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();(e.shiftKey?$('redo'):$('undo')).click();return;}
  if(!selected||!e.target.closest('.card-view')||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
  e.preventDefault();const l=layout(),step=e.shiftKey?1:.2;
  editLayout(e.key==='ArrowLeft'||e.key==='ArrowRight'?'dx':'dy',(e.key==='ArrowLeft'||e.key==='ArrowRight'?l.dx:l.dy)+(e.key==='ArrowLeft'||e.key==='ArrowUp'?-step:step));
  $(selected.side+'Preview').querySelector(`[data-group="${selected.id}"]`)?.focus?.({preventScroll:true});
});
$('undo').addEventListener('click',()=>{if(!history.length)return;future.push(structuredClone(state));state=history.pop();selected=null;render();syncControls();persist();});
$('redo').addEventListener('click',()=>{if(!future.length)return;history.push(structuredClone(state));state=future.pop();selected=null;render();syncControls();persist();});
$('resetAll').addEventListener('click',()=>{$('resetDialog').returnValue='';$('resetDialog').showModal();});
$('resetDialog').addEventListener('close',()=>{if($('resetDialog').returnValue==='reset'){commit(()=>{state=freshState();selected=null;});toast('처음 명함 시안으로 돌아왔습니다.');}});

async function fontDB(action,value){
  if(!('indexedDB' in window))return null;
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('windmoon-card-fonts',1);request.onupgradeneeded=()=>request.result.createObjectStore('fonts');
    request.onerror=()=>reject(new Error('이 브라우저에서 글꼴을 저장할 수 없습니다.'));
    request.onsuccess=()=>{const db=request.result,tx=db.transaction('fonts',action==='get'?'readonly':'readwrite'),store=tx.objectStore('fonts'),op=action==='get'?store.get('custom'):store.put(value,'custom');let result=null;op.onsuccess=()=>result=op.result;tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();reject(tx.error);};};
  });
}
$('fontButton').addEventListener('click',()=>$('fontFile').click());
$('fontFile').addEventListener('change',async()=>{
  const file=$('fontFile').files?.[0];if(!file||!ready)return;
  try{
    if(file.size>15*1024*1024)throw new Error('15MB 이하의 TTF·OTF 파일을 사용하세요.');
    const bytes=await file.arrayBuffer(),font=window.opentype.parse(bytes);
    if(!font.unitsPerEm||font.numGlyphs<2)throw new Error('올바른 글꼴 파일이 아닙니다.');
    customFontData={name:file.name.replace(/\.[^.]+$/,''),bytes};fonts.custom=font;
    commit(s=>s.customFontEnabled=true);
    try{await fontDB('put',customFontData);toast('내 글꼴을 적용하고 이 브라우저에 저장했습니다.');}catch{toast('글꼴을 적용했습니다. 설정 파일로 저장하면 글꼴도 함께 보관됩니다.');}
  }catch(e){toast('글꼴을 불러오지 못했습니다. '+e.message,true);}
  $('fontFile').value='';
});
$('fontReset').addEventListener('click',()=>commit(s=>s.customFontEnabled=false));
function toBase64(buffer){const bytes=new Uint8Array(buffer);let text='';for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(text);}
$('saveSettings').addEventListener('click',()=>{
  const result={...structuredClone(state),savedAt:new Date().toISOString()};
  if(state.customFontEnabled&&customFontData)result.customFont={name:customFontData.name,data:toBase64(customFontData.bytes)};
  download(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}),'WINDMOON_card_settings.json');toast('가로·세로 디자인과 입력한 정보를 저장했습니다.');
});
$('loadSettings').addEventListener('click',()=>$('settingsFile').click());
$('settingsFile').addEventListener('change',async()=>{
  const file=$('settingsFile').files?.[0];if(!file)return;
  try{
    if(file.size>22*1024*1024)throw new Error('설정 파일이 너무 큽니다.');
    const raw=JSON.parse(await file.text()),next=sanitizeState(raw);
    if(raw.customFont?.data){
      if(!ready)throw new Error('글꼴을 불러온 뒤 다시 시도하세요.');
      const bytes=Uint8Array.from(atob(raw.customFont.data),c=>c.charCodeAt(0)).buffer;
      if(bytes.byteLength>15*1024*1024)throw new Error('글꼴 파일이 너무 큽니다.');
      fonts.custom=window.opentype.parse(bytes);customFontData={name:String(raw.customFont.name||'내 글꼴').slice(0,120),bytes};
      try{await fontDB('put',customFontData);}catch{}
    }else if(next.customFontEnabled&&!fonts?.custom)next.customFontEnabled=false;
    commit(()=>{state=next;selected=null;});toast('명함 설정을 불러왔습니다.');
  }catch(e){toast(e.message||'설정 파일을 확인하세요.',true);}
  $('settingsFile').value='';
});
const exportButtons=['exportPrint','exportPdf','exportSvg','exportPng','exportTop'];
async function raster(scene){
  const source=new Blob([sceneSVG(scene)],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(source);
  try{
    const img=new Image();img.src=url;await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('이미지를 만들지 못했습니다.'));});
    const canvas=document.createElement('canvas');canvas.width=Math.round(scene.w/25.4*300);canvas.height=Math.round(scene.h/25.4*300);
    const context=canvas.getContext('2d');if(!context)throw new Error('이 브라우저에서 PNG 내보내기를 지원하지 않습니다.');context.drawImage(img,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('PNG 파일을 만들지 못했습니다.');
    return pngWith300DPI(await blob.arrayBuffer());
  }finally{URL.revokeObjectURL(url);}
}
async function exportFile(kind){
  if(!ready)return;const snapshot=structuredClone(state),orientation=snapshot.orientation,exportScenes=['front','back'].map(side=>buildScene(snapshot,orientation,side,currentFonts(),logos,window.qrcode));
  if(exportScenes.some(s=>s.qrError)){toast('QR 연결 주소를 확인하세요.',true);return;}
  const prefix='WINDMOON_'+(orientation==='portrait'?'50x90_Portrait':'90x50_Horizontal');
  exportButtons.forEach(id=>$(id).disabled=true);$('saveStatus').textContent='파일 만드는 중';
  try{
    if(kind==='pdf'||kind==='print'){
      const bytes=await createPDF(exportScenes,kind==='print',window.PDFLib);
      download(new Blob([bytes],{type:'application/pdf'}),prefix+(kind==='print'?'_Print':'')+'.pdf');
    }else{
      const entries=[];
      for(const scene of exportScenes)entries.push({name:prefix+'_'+scene.side+'.'+(kind==='svg'?'svg':'png'),data:kind==='svg'?'<?xml version="1.0" encoding="UTF-8"?>\n'+sceneSVG(scene):await raster(scene)});
      download(new Blob([zipBytes(entries)],{type:'application/zip'}),prefix+'_'+kind.toUpperCase()+'.zip');
    }
    toast(kind==='print'?'도련과 재단선을 넣은 양면 PDF를 만들었습니다.':'앞·뒷면 파일을 만들었습니다.');
  }catch(e){toast('파일을 만들지 못했습니다. '+e.message,true);}finally{render();persist();}
}
$('exportPrint').addEventListener('click',()=>exportFile('print'));
$('exportPdf').addEventListener('click',()=>exportFile('pdf'));
$('exportSvg').addEventListener('click',()=>exportFile('svg'));
$('exportPng').addEventListener('click',()=>exportFile('png'));
$('exportTop').addEventListener('click',()=>$('exportPanel').scrollIntoView({behavior:'smooth',block:'start'}));

async function waitForLibraries(){if(window.opentype&&window.qrcode&&window.PDFLib)return;if(document.readyState!=='complete')await new Promise(resolve=>window.addEventListener('load',resolve,{once:true}));if(!window.opentype||!window.qrcode||!window.PDFLib)throw new Error('편집 도구를 불러오지 못했습니다. 새로고침해 주세요.');}
async function init(){
  syncControls();render();
  try{
    const response=await Promise.all(['assets/Pretendard-regular.ttf','assets/Pretendard-bold.ttf','assets/logo.json'].map(async url=>{const r=await fetch(url);if(!r.ok)throw new Error('디자인 자산을 불러오지 못했습니다.');return url.endsWith('.json')?r.json():r.arrayBuffer();}));
    await waitForLibraries();fonts={regular:window.opentype.parse(response[0]),bold:window.opentype.parse(response[1]),custom:null};logos=response[2];
    if(state.customFontEnabled){try{const stored=await fontDB('get');if(stored?.bytes){fonts.custom=window.opentype.parse(stored.bytes);customFontData=stored;}else state.customFontEnabled=false;}catch{state.customFontEnabled=false;}}
    ready=true;render();syncControls();persist();
    window.windmoonStudio={getState:()=>structuredClone(state),getScenes:()=>scenes,exportFile};
    document.dispatchEvent(new Event('studio:ready'));
  }catch(e){
    for(const side of ['front','back']){$(side+'Preview').textContent=e.message;$(side+'Preview').classList.add('load-error');$(side+'Preview').setAttribute('aria-busy','false');}
    $('saveStatus').textContent='불러오기 실패';toast(e.message,true);
  }
}
init();
