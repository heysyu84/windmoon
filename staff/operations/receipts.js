import {isPaidOnBehalf, receiptPaidAmount, inRange, paymentMethodLabel} from './core.js?v=20261119-private-receipts';
import {escape as esc, money} from './views.js?v=20261119-private-receipts';
import {createReceiptDrive, clientIdForDevice, loadGoogleIdentity, mimeForReceipt,receiptDigest} from './receipt-drive.js?v=20261119-private-receipts';

export function receiptFileInput(name) {
 return '<label class="field receipt-file"><span>영수증 첨부 (선택)</span><input name="'+name+'" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf"><small>주문상세, 카드전표 또는 포인트 사용 내역 · 여러 장 선택 가능</small></label>';
}
export function groupReceipts(entries,files,range) {
 const byEntry=new Map();
 for(const file of files){
  if(!byEntry.has(file.entryId))byEntry.set(file.entryId,new Map());
  const originals=byEntry.get(file.entryId),key=file.digest||file.appProperties?.digest||file.id;
  if(!originals.has(key))originals.set(key,file);
 }
 return entries.filter(entry=>entry.type==='expense'&&inRange(entry.businessDate,range)&&byEntry.has(entry.id))
  .sort((a,b)=>a.businessDate.localeCompare(b.businessDate)||a.title.localeCompare(b.title,'ko')||a.id.localeCompare(b.id))
  .map(entry=>({id:entry.id,date:entry.businessDate,title:entry.title,partner:entry.partner||'',method:paymentMethodLabel(entry),
   receiptPaid:receiptPaidAmount(entry),points:entry.personalPoints||0,voucher:entry.personalVoucherAmount||0,total:entry.amount,
   files:[...byEntry.get(entry.id).values()].sort((a,b)=>(a.createdTime||'').localeCompare(b.createdTime||'')||a.name.localeCompare(b.name,'ko')||a.id.localeCompare(b.id))}));
}
const button=(action,label,primary=false)=>'<button type="button" data-receipt-action="'+action+'" class="'+(primary?'primary-btn':'secondary-btn')+'">'+label+'</button>';

export function createReceiptPanel(root,{entries,range,showDialog,toast,changed,preparePdf,signal}) {
 const $=selector=>root.querySelector(selector);
 const drive=createReceiptDrive(signal);
 let files=[],localFiles=[],queue=[],target='',busy=false,notice='',previewUrl='',clientId=clientIdForDevice(),loaded=false;
 let googleLoading=false,accountId='';
 const available=()=>entries().filter(e=>e.type==='expense');
 const expense=id=>available().find(e=>e.id===id);
 const known=()=>[...(drive.active()?files:[]),...localFiles];
 const groups=()=>groupReceipts(available(),known(),range());
 function connectForm() {
  if(drive.active())return '<span class="receipt-account">'+esc(drive.account()?.emailAddress||'개인 Google Drive')+'</span>';
  const config='<label class="field"><span>Google 웹 클라이언트 ID</span><input data-receipt-client value="'+esc(clientId)+'" placeholder="…apps.googleusercontent.com" autocapitalize="none" spellcheck="false"></label>'+
   '<small>Google Cloud의 웹 애플리케이션에 이 사이트의 원본 <strong>'+esc(location.origin)+'</strong>을 등록하세요.</small>';
  return '<div class="receipt-connect">'+(window.WINDMOON_CONFIG?.receiptGoogleClientId?'':!clientId?config:'<details><summary>Drive 연결 설정</summary>'+config+'</details>')+
   button('connect','Google Drive 연결')+'</div>';
 }
 function pageHtml() {
  const rows=groups(),attached=new Set(rows.map(r=>r.id));
  const missing=available().filter(e=>isPaidOnBehalf(e)&&inRange(e.businessDate,range())&&!attached.has(e.id))
   .sort((a,b)=>b.businessDate.localeCompare(a.businessDate));
  const totals=rows.reduce((sum,r)=>sum+r.total,0);
  const list=rows.map(row=>'<article class="receipt-row"><div><time>'+esc(row.date)+'</time><strong>'+esc(row.title)+'</strong><span>'+esc(row.partner||row.method)+' · 실결제 '+money(row.receiptPaid)+'원'+(row.points?' + '+money(row.points)+'P':'')+(row.voucher?' + 상품권 '+money(row.voucher)+'원':'')+'</span></div><div><strong>'+money(row.total)+'원</strong>'+row.files.map(f=>'<button type="button" class="text-btn" data-receipt-view="'+esc(f.id)+'">'+esc(f.name)+'</button>').join('')+'</div></article>').join('');
  const missingList=missing.map(e=>'<button class="receipt-missing-item" type="button" data-receipt-attach="'+esc(e.id)+'"><span>'+esc(e.businessDate)+' · '+esc(e.title)+'</span><strong>'+money(e.amount)+'원</strong></button>').join('');
  const ids=new Set(available().map(e=>e.id));
  const orphans=known().filter(f=>!ids.has(f.entryId)&&inRange(f.date,range()));
  return '<section class="panel receipt-panel"><div class="panel-head"><div><h2>구매 내역</h2><p class="panel-sub">구매일 기준 · 선택 기간 '+rows.length+'건 · '+money(totals)+'원</p></div><div class="report-quick-links">'+button('attach','영수증 첨부',true)+(rows.length?button('pdf','기간 PDF 저장'):'')+'</div></div>'+
   '<div class="receipt-controls">'+connectForm()+(drive.active()?button('reload','Drive 목록 새로고침')+button('disconnect','계정 연결 닫기'):'')+'</div>'+
   (localFiles.length?'<p class="receipt-notice">기기에서 선택한 임시 첨부는 운영 화면을 벗어나면 지워집니다.</p>':'')+
   (notice?'<p class="receipt-notice" role="status">'+esc(notice)+'</p>':'')+
   (list||'<div class="empty-note">'+(drive.active()&&loaded?'선택한 기간에 첨부한 영수증이 없습니다.':'개인 Drive를 연결하거나 이번 PDF에 넣을 파일을 선택하세요.')+'</div>')+
   (drive.active()&&loaded&&missing.length?'<details class="receipt-missing"><summary>영수증 미첨부 대납 '+missing.length+'건</summary>'+missingList+'</details>':'')+
   (orphans.length?'<details class="receipt-missing"><summary>장부 연결을 확인할 원본 '+orphans.length+'개</summary>'+orphans.map(f=>'<button type="button" class="text-btn" data-receipt-view="'+esc(f.id)+'">'+esc(f.name)+'</button>').join('')+'</details>':'')+'</section>';
 }
 function options(current){
  const list=available().filter(e=>inRange(e.businessDate,range())||e.id===current||queue.some(q=>q.entryId===e.id)).sort((a,b)=>b.businessDate.localeCompare(a.businessDate)||a.title.localeCompare(b.title,'ko'));
  return '<option value="">구매 건 선택</option>'+list.map(e=>'<option value="'+esc(e.id)+'" '+(e.id===current?'selected':'')+'>'+esc(e.businessDate+' · '+e.title+' · '+money(e.amount)+'원')+'</option>').join('');
 }
 function modal(){
  if(!$('#receipt-dialog').open)return;
  const queueHtml=queue.map((item,i)=>'<div class="receipt-queue-item"><span>'+esc(item.file.name)+'</span><select aria-label="'+esc(item.file.name+' 연결할 지출')+'" data-receipt-row="'+i+'">'+options(item.entryId)+'</select><button type="button" class="text-btn" data-receipt-drop="'+i+'" aria-label="선택에서 제외">×</button></div>').join('');
  $('#receipt-body').innerHTML='<label class="field"><span>연결할 지출</span><select data-receipt-target>'+options(target)+'</select></label>'+
   receiptFileInput('receiptBatch')+queueHtml+'<div class="receipt-controls">'+connectForm()+'</div>';
  $('#receipt-feedback').textContent=notice;
  $('#receipt-buttons').innerHTML=button('local','이번 PDF에만 사용')+button('upload','Drive에 저장',true);
  for(const control of $('#receipt-dialog').querySelectorAll('button,input,select'))control.disabled=busy;
  if(!busy){$('#receipt-buttons [data-receipt-action="upload"]').disabled=!drive.active()||!queue.length;$('#receipt-buttons [data-receipt-action="local"]').disabled=!queue.length;}
 }
 function redraw(){if(signal.aborted)return;changed();modal();}
 function attach(entry,selected=[],fromSavedExpense=false){
  if(busy)return;
  queue=Array.from(selected,file=>({file,entryId:entry?.id||''}));target=entry?.id||'';notice=fromSavedExpense?'지출을 저장했습니다. 선택한 파일을 첨부해 주세요.':'';
  if($('#detail').open)$('#detail').close();
  showDialog('receipt-dialog');modal();
  if(fromSavedExpense&&drive.active()){void run('upload');return;}
  if(clientId)prepareConnection();
 }
 function releasePreview(){if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl='';}}
 async function readFile(file){return file.blob||drive.download(file);}
 async function sync(){files=await drive.originals();loaded=true;}
 async function run(action) {
  if(busy)return;
  busy=true;notice='';
  if($('#receipt-dialog').open)for(const el of $('#receipt-dialog').querySelectorAll('input,select,button'))el.disabled=true;
  try{
   if(action==='connect'){
    const box=$('#receipt-dialog').open?$('#receipt-dialog'):$('#page-content');
    const connectButton=box.querySelector('[data-receipt-action="connect"]');
    if(connectButton){connectButton.disabled=true;connectButton.textContent='Google 계정 연결 중…';}
    const input=box.querySelector('[data-receipt-client]');if(input)clientId=input.value.trim();
    await drive.connect(clientId);
    if(accountId&&accountId!==drive.account().permissionId){files=[];localFiles=[];}
    accountId=drive.account().permissionId;await sync();
   }else if(action==='reload'){await sync();}
   else if(action==='upload'||action==='local'){
    if(!queue.length)throw Error('영수증 파일을 선택해 주세요.');
    for(const item of queue){mimeForReceipt(item.file);if(!expense(item.entryId))throw Error('각 파일을 연결할 지출을 선택해 주세요.');}
    if(action==='upload')await sync();
    while(queue.length){
     signal.throwIfAborted();
     const {file,entryId}=queue[0],entry=expense(entryId);
     if(!entry)throw Error('연결할 지출을 다시 선택해 주세요.');
     if(action==='upload'){
      const uploaded=await drive.upload(entry,file,files);
      if(!files.some(f=>f.id===uploaded.id))files.push(uploaded);
      localFiles=localFiles.filter(f=>!(f.entryId===entryId&&f.digest===uploaded.appProperties.digest));
     }else{
      const digest=await receiptDigest(file);
      if(!known().some(f=>f.entryId===entryId&&(f.digest||f.appProperties?.digest)===digest))
       localFiles.push({id:crypto.randomUUID(),blob:file,digest,name:file.name,mimeType:mimeForReceipt(file),entryId,date:entry.businessDate,createdTime:new Date().toISOString()});
     }
     queue.shift();notice='남은 파일 '+queue.length+'개';modal();
    }
    $('#receipt-dialog').close();notice=action==='upload'?'개인 Drive에 영수증을 저장했습니다.':'이번 PDF에 사용할 파일을 추가했습니다.';
    toast(notice);
   }else if(action==='pdf'){
    if(drive.account()&&!drive.active())throw Error('개인 Drive를 다시 연결한 뒤 PDF를 저장해 주세요.');
    const rows=groups(),period=range();
    if(!rows.length)throw Error('선택 기간에 첨부한 영수증이 없습니다.');
    const modalOpen=$('#receipt-progress');showDialog('receipt-progress');
    modalOpen.querySelector('p').textContent='영수증을 모으고 있습니다…';
    try{
     const result=await preparePdf(rows,period,async file=>{signal.throwIfAborted();modalOpen.querySelector('p').textContent=file.name;return readFile(file);});
     signal.throwIfAborted();
     const link=document.createElement('a'),url=URL.createObjectURL(result);
     link.href=url;link.download=result.name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
     notice='기간 영수증 PDF를 저장했습니다.';
    }finally{modalOpen.close();}
   }
  }catch(error){
   if(!signal.aborted){notice=error.message||'처리하지 못했습니다. 다시 시도해 주세요.';toast(notice);}
  }finally{busy=false;redraw();}
 }
 async function preview(file){
  if(busy||!file)return;busy=true;
  try{
   const blob=await readFile(file);signal.throwIfAborted();releasePreview();previewUrl=URL.createObjectURL(blob);
   $('#receipt-preview-name').textContent=file.name;
   const container=$('#receipt-preview-body');container.replaceChildren();
   if(file.mimeType.startsWith('image/')){const img=document.createElement('img');img.src=previewUrl;img.alt=file.name;container.append(img);}
   const link=document.createElement('a');link.href=previewUrl;link.download=file.name;link.className='secondary-btn';link.textContent='원본 저장';container.append(link);
   showDialog('receipt-preview');
  }catch(error){if(!signal.aborted)toast(error.message);}
  finally{busy=false;redraw();}
 }
 root.addEventListener('change',event=>{
  const el=event.target;if(busy)return;
  if(el.hasAttribute('data-receipt-client'))clientId=el.value.trim();
  if(el.hasAttribute('data-receipt-target')){target=el.value;for(const item of queue)item.entryId=target;modal();}
  if(el.hasAttribute('data-receipt-row'))queue[Number(el.dataset.receiptRow)].entryId=el.value;
  if(el.name==='receiptBatch'){queue.push(...Array.from(el.files,file=>({file,entryId:target})));modal();}
 },{signal});
 root.addEventListener('click',event=>{
  const btn=event.target.closest('button');if(!btn||busy)return;
  if(btn.hasAttribute('data-receipt-drop')){queue.splice(Number(btn.dataset.receiptDrop),1);modal();return;}
  if(btn.hasAttribute('data-receipt-attach')){attach(expense(btn.dataset.receiptAttach));return;}
  if(btn.hasAttribute('data-receipt-view')){void preview(known().find(f=>f.id===btn.dataset.receiptView));return;}
  const action=btn.dataset.receiptAction;
  if(action==='attach'){attach(null);return;}
  if(action==='disconnect'){drive.lock();files=[];localFiles=[];loaded=false;accountId='';notice='';redraw();return;}
  if(action)void run(action);
 },{signal});
 $('#receipt-preview').addEventListener('close',()=>{$('#receipt-preview-body').replaceChildren();releasePreview();},{signal});
 $('#receipt-dialog').addEventListener('close',()=>{queue=[];target='';},{signal});
 for(const id of ['receipt-progress','receipt-dialog'])$('#'+id).addEventListener('cancel',event=>{if(busy)event.preventDefault();},{signal});
 function prepareConnection(){
  if(window.google?.accounts?.oauth2||googleLoading)return;
  googleLoading=true;loadGoogleIdentity().catch(()=>{}).finally(()=>{googleLoading=false;});
 }
 root.addEventListener('focusin',event=>{if(event.target.closest('[data-receipt-action="connect"],[data-receipt-client]'))prepareConnection();},{signal});
 return {pageHtml,attach,busy:()=>busy,prepareConnection,destroy(){releasePreview();files=[];localFiles=[];queue=[];drive.lock();}};
}
