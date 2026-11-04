import {STORAGE_KEY,STAFF_URL,ACCOUNTS,accountDefinitions,selectableAccounts,paymentMethodDefinitions,selectablePaymentMethods,paymentMethodLabel,personalCardSummary,SALE_CHANNELS,saleChannel,CATEGORIES,expenseCategoryOptions,TYPE_NAMES,localDate,shiftDate,monthRange,inRange,makeDemo,parseStored,validateEntry,addPayment,paidAmount,outstanding,paymentStatus,makeEmpty,validateWorkspace,saveDayClosing,dayClosed,dailySales,saleMethodName,savedVendors} from './core.js?v=20261105-sales-export-v1';
import {NAV,escape as esc,money,icon,shortDate,accountName,statusPill,renderOverview,renderLedger,renderPersonalCardDashboard,renderPayroll,renderFunds,renderClosing} from './views.js?v=20261105-sales-export-v1';
import {buildReport,assertReportReady,reportSheets} from './report-data.js?v=20261102-sales-channels';
import {renderReport,reportBreakdown} from './report-view.js?v=20261102-sales-channels';
import {markedDates,datePickerHtml} from './calendar.js?v=20261102-closing-status';
import {fetchPayrollSnapshot} from './payroll-cache.js?v=20261104-d1';
// Memory-only cache: survives navigating between workspace panels, never
// persists payroll or bank data in localStorage/sessionStorage.
let sharedPayrollCache=null;
export function mountOperations(root,workspaceOptions={}) {
const controller=new AbortController();let disposed=false;
const listen=(type,callback)=>root.addEventListener(type,callback,{signal:controller.signal});
const listenWindow=(type,callback)=>window.addEventListener(type,callback,{signal:controller.signal});
const $=s=>root.querySelector(s),today=localDate();
if(location.hostname==='windmoon-operations.heysyu457310.chatgpt.site')for(const link of root.querySelectorAll('a[href^="../"]'))link.href=new URL(link.getAttribute('href').slice(3),'https://windmoon.pages.dev/').href;
let state=makeEmpty(today),demoState=makeDemo(today),serverState=makeEmpty(today),mode='real',revision=0,serverReady=false,saving=false,loading=false,pendingSave=null,payrollData=sharedPayrollCache;
let loadMessage='';
let reportSnapshot=null,reportExporting=false,expenseExporting=false;
try{const raw=localStorage.getItem(STORAGE_KEY);if(raw)demoState=parseStored(raw);mode=localStorage.getItem('windmoon-operations-mode')==='demo'?'demo':'real';}catch{loadMessage='이전 브라우저 자료를 읽지 못했습니다. 서버 장부는 별도로 연결합니다.';}
demoState.closings||={};demoState.staffUrl=STAFF_URL;
const operatingDay=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',hour12:false}).format(new Date()))<12?shiftDate(today,-1):today;
if(mode==='demo')state={...demoState,integration:{demo:true}};
const ui={page:NAV.some(n=>n.id===workspaceOptions.page)?workspaceOptions.page:'overview',period:'month',day:operatingDay,month:operatingDay.slice(0,7),start:shiftDate(today,-6),end:today,fundsView:'cash',expenseView:'ledger',filters:{search:'',status:'',method:''}};
let editorEntry=null,editorType='sale',toastTimer,confirmCallback;
let calendarField=null,calendarMonth=ui.month;
const uid=()=>crypto.randomUUID();
const options=(values,selected)=>values.map(([v,l])=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(l)}</option>`).join('');
function getRange(){return ui.period==='day'?{start:ui.day,end:ui.day}:ui.period==='month'?monthRange(ui.month):{start:ui.start,end:ui.end};}
function toast(text){if(disposed)return;$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3200);}
let suiteLoginRedirecting=false;
let merged=false;
async function prepareWorkspace(){if(merged||mode==='demo')return;for(let n=0;n<1000;n++){const response=await workspaceOptions.apiFetch('/api/workspace/merge',{method:'POST',signal:controller.signal});const value=await response.json();if(!response.ok)throw Error(value.error||'운영자료를 통합하지 못했습니다. 다시 연결해 주세요.');if(value.phase==='active'){merged=true;return;}$('#save-status').textContent='운영자료 통합 중 · '+(value.completed||0)+' / '+(value.total||0);}throw Error('통합을 이어서 진행하려면 새로고침해 주세요.');}
function suiteLogin(){if(suiteLoginRedirecting)return;suiteLoginRedirecting=true;const login=new URL('../staff/',import.meta.url);login.searchParams.set('return_to',new URL('./',import.meta.url).pathname);window.location.replace(login.href);}
async function jsonFetch(path,init={}) {
 const response=await workspaceOptions.apiFetch(path.replace('/api/operations/','/api/suite/operations/'),{...init,signal:controller.signal,headers:{...(init.body?{'Content-Type':'application/json'}:{}),...init.headers}});
 let body;try{body=await response.json();}catch{throw Error('서버 연결을 확인해 주세요.');}
 if(!response.ok)throw Object.assign(Error(body.error||'서버 요청에 실패했습니다.'),{status:response.status});return body;
}

function attachPayroll(value){return {...value,staffUrl:STAFF_URL,payroll:payrollData?.payroll||[],integration:payrollData?{demo:false,stale:!!payrollData.stale,fetchedAt:payrollData.fetchedAt,sourceUpdatedAt:payrollData.sourceUpdatedAt,revision:payrollData.revision}:{demo:false,error:true}};}
function updateModeBanner(){if(disposed)return;const banner=$('.demo-banner');banner.classList.toggle('real-mode',mode==='real');banner.innerHTML=mode==='demo'?'<span class="demo-label"><span class="demo-dot"></span>예시 화면</span><span>예시 입력은 이 브라우저에만 저장됩니다.</span><button data-action="about">안내 ↗</button>':'<span class="demo-label"><span class="demo-dot"></span>실제 장부</span><span>서버 저장 · PC와 휴대폰에서 같은 자료를 사용합니다.</span><button data-action="about">안내 ↗</button>';$('#mode-toggle').textContent=mode==='demo'?'실제 장부로':'예시 보기';$('#refresh-server').textContent=loading?'연결 중…':'서버 새로고침 ↻';$('#save-status').textContent=mode==='demo'?'예시 화면 · 이 브라우저에 저장':serverReady?'서버 연결됨 · 장부 버전 '+revision:'서버 연결 확인 중';}
async function fetchCurrentPayroll(){
 const result=await fetchPayrollSnapshot(jsonFetch,sharedPayrollCache);
 sharedPayrollCache=result;
 return result;
}
async function refreshServer(quiet=false){
 if(loading||saving||reportExporting)return;
 loading=true;updateModeBanner();
 try{await prepareWorkspace();}
 catch(e){if(disposed)return;loading=false;serverReady=false;toast(e.message);$('#save-status').textContent=e.message;renderContent();return;}
 const results=await Promise.allSettled([
  jsonFetch('/api/operations/state'),
  fetchCurrentPayroll()
 ]);
 const [ledger,payroll]=results;
 if(disposed)return;
 if(payroll.status==='fulfilled')payrollData=payroll.value;
 else if(payrollData)payrollData={...payrollData,stale:true};
 if(ledger.status==='fulfilled'){
  revision=ledger.value.revision;
  serverState=ledger.value.state;
  serverReady=true;
  if(mode==='real')state=attachPayroll(serverState);
 }else{if(!quiet)toast(ledger.reason.message);serverReady=false;}
 if(payroll.status==='rejected'&&!quiet&&serverReady)toast(payroll.reason.message);
 loading=false;updateModeBanner();renderPeriod();renderContent();
}
async function persist(next,label='장부 저장'){
 if(saving){toast('저장 중입니다. 잠시만 기다려 주세요.');return false;}
 if(mode==='real'&&!serverReady){toast('서버 연결 후 저장할 수 있습니다. 서버 새로고침을 눌러 주세요.');return false;}
 try{
  const clean=validateWorkspace(next,mode==='real'?serverState:demoState);
  if(mode==='demo'){demoState={...clean,payroll:next.payroll||demoState.payroll};localStorage.setItem(STORAGE_KEY,JSON.stringify(demoState));state={...demoState,integration:{demo:true}};renderPeriod();renderContent();return true;}
  saving=true;root.querySelectorAll('button[type="submit"]').forEach(b=>b.disabled=true);
  const serialized=JSON.stringify(clean);if(!pendingSave||pendingSave.serialized!==serialized)pendingSave={serialized,requestId:uid()};
  const result=await jsonFetch('/api/operations/state',{method:'POST',body:JSON.stringify({revision,state:clean,requestId:pendingSave.requestId,label})});
  revision=result.revision;serverState=result.state;state=attachPayroll(serverState);pendingSave=null;renderPeriod();renderContent();return true;
 }catch(error){toast(error.message);return false;}finally{saving=false;root.querySelectorAll('button[type="submit"]').forEach(b=>b.disabled=false);updateModeBanner();}
}
function renderPeriod(){if(disposed)return;
 root.querySelectorAll('[data-period]').forEach(b=>b.classList.toggle('active',b.dataset.period===ui.period));
 const input=$('#period-inputs');
 input.classList.toggle('custom',ui.period==='custom');
 const counts=markedDates(state);
 const picker=(field,value)=>datePickerHtml({field,value,opened:calendarField===field,viewMonth:calendarMonth,counts,today});
 input.innerHTML=ui.period==='custom'
  ?picker('start',ui.start)+'<span class="operations-period-divider">—</span>'+picker('end',ui.end)
  :'<button class="date-step" data-shift="-1" aria-label="이전 '+(ui.period==='day'?'날':'달')+'">‹</button>'+
   picker(ui.period==='day'?'day':'month',ui.period==='day'?ui.day:ui.month)+
   '<button class="date-step" data-shift="1" aria-label="다음 '+(ui.period==='day'?'날':'달')+'">›</button>'+
   '<button class="text-btn" data-action="period-today">'+(ui.period==='day'?'오늘':'이번 달')+'</button>';
}
function chooseCalendarDate(field,date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
 const next=field==='month'?date.slice(0,7):date;
 if(field==='start'&&next>ui.end||field==='end'&&next<ui.start){toast('시작일은 종료일보다 늦을 수 없습니다.');return;}
 if(!['day','month','start','end'].includes(field))return;
 ui[field]=next;
 calendarField=null;
 renderPeriod();
 renderContent();
}
function renderContent(){if(disposed)return;const r=getRange();$('#period-note').textContent=ui.page==='funds'?(ui.fundsView==='accrual'?'영업일 기준':'실제 입출금일 기준'):'영업일 기준';if(mode==='real'&&!serverReady){$('#page-content').innerHTML='<div class="panel loading-state">'+(loading?'서버 장부와 급여를 연결하고 있습니다…':'서버에 연결하지 못했습니다. 상단의 서버 새로고침을 눌러 주세요.')+'</div>';return;}$('#page-content').innerHTML=(state.integration?.error?'<div class="integration-warning">급여 자료가 연결되지 않아 현재 집계에 인건비가 반영되지 않았습니다. 서버 새로고침으로 다시 연결해 주세요.</div>':state.integration?.stale?'<div class="integration-warning">최신 급여 연결에 실패해 마지막으로 가져온 자료를 표시합니다.</div>':'')+(ui.page==='report'?renderReport(state,r,{dailyOpen:!!$('#report-daily')?.open}):ui.page==='closing'?renderClosing(state,ui.day):ui.page==='overview'?renderOverview(state,r):ui.page==='sales'?('<div class="funds-view-switch"><span>매출 내역</span><button type="button" class="secondary-btn" data-sales-pdf="1">'+icon('arrowDown',14)+' 매출 PDF 내보내기</button></div>'+renderLedger(state,r,ui.page,ui.filters)):ui.page==='expenses'?('<div class="funds-view-switch"><span>지출 메뉴</span><div class="funds-view-buttons" role="group" aria-label="지출 조회 종류"><button type="button" data-expense-view="ledger" aria-pressed="'+(ui.expenseView==='ledger')+'" class="'+(ui.expenseView==='ledger'?'active':'')+'">일반 지출</button><button type="button" data-expense-view="personal" aria-pressed="'+(ui.expenseView==='personal')+'" class="'+(ui.expenseView==='personal'?'active':'')+'">개인카드 대납 정산 · '+money(personalCardSummary(state).outstanding)+'원</button></div><button type="button" class="secondary-btn" data-expense-pdf="1">'+icon('arrowDown',14)+' 지출 PDF 내보내기</button></div>'+(ui.expenseView==='personal'?renderPersonalCardDashboard(state):renderLedger(state,r,ui.page,ui.filters))):ui.page==='payroll'?renderPayroll(state,r,ui.filters,ui.period):renderFunds(state,r,ui.fundsView));}
function renderPage(){if(disposed)return;
 if(ui.page==='closing')ui.period='day';
 const n=NAV.find(n=>n.id===ui.page);$('#crumb').textContent=n.name;$('#page-title').textContent=n.name;$('#eyebrow').textContent=n.eyebrow;$('#page-description').textContent=n.description;$('#period-note').textContent=ui.page==='funds'?(ui.fundsView==='accrual'?'영업일 기준':'실제 입출금일 기준'):'영업일 기준';
 $('#desktop-nav').innerHTML=NAV.map(v=>`<button class="nav-item ${v.id===ui.page?'active':''}" data-page="${v.id}" ${v.id===ui.page?'aria-current="page"':''}>${icon(v.icon)}<span>${v.name}</span>${v.id===ui.page?'<i class="nav-dot"></i>':''}</button>`).join('');
 $('#mobile-nav').innerHTML=NAV.map(v=>`<button class="nav-item ${v.id===ui.page?'active':''}" data-page="${v.id}" ${v.id===ui.page?'aria-current="page"':''}>${icon(v.icon)}<span>${v.mobile}</span></button>`).join('');
 const button=$('#new-entry');button.classList.toggle('hidden',ui.page==='closing');button.innerHTML=icon(ui.page==='report'?'arrowDown':ui.page==='payroll'?'link':'plus',15)+(ui.page==='report'?'내보내기':ui.page==='expenses'?'지출 등록':ui.page==='sales'?'매출 등록':ui.page==='payroll'?'연동 안내':'거래 등록');
 renderPeriod();root.querySelectorAll('[data-period]').forEach(b=>b.classList.toggle('hidden',ui.page==='closing'&&b.dataset.period!=='day'));renderContent();
}
function navigate(page){ui.page=page;ui.filters={search:'',status:'',method:''};workspaceOptions.onNavigate?.(page);renderPage();window.scrollTo({top:0,behavior:'instant'});}
function showDialog(id){const d=$('#'+id);if(!d.open)d.showModal();}
function openReportDay(date){
 const report=buildReport(state,{start:date,end:date});
 $('#report-day-title').textContent=shortDate(date)+' 세부내역';
 $('#report-day-body').innerHTML=`<div class="report-day-meta"><span>영업일 기준 · 단위: 원</span><span>${report.closed?'마감 완료':report.activityDays?'미마감':'정산 내역'}</span></div>${reportBreakdown(report)}<div class="report-day-totals"><span>운영수익</span><strong>${money(report.payrollUnavailable?null:report.summary.profit)}원</strong></div>`;
 showDialog('report-day');
}
function openReportExport(){
 if(reportExporting||loading||saving){toast('연결·저장이 끝난 뒤 내보내 주세요.');return;}
 if(mode==='real'&&!serverReady){toast('서버 새로고침 후 내보내 주세요.');return;}
 try{
  reportSnapshot=buildReport(state,getRange());assertReportReady(reportSnapshot);
  $('#report-export-period').textContent=reportSnapshot.period;
  $('#report-export-warning').textContent=[reportSnapshot.demo?'예시 자료로 내보냅니다.':'',reportSnapshot.unclosed?'미마감 '+reportSnapshot.unclosed+'일이 포함되어 있습니다. 입력된 금액까지만 반영됩니다.':'',reportSnapshot.stale?'마지막으로 연결한 급여 자료가 반영됩니다.':''].filter(Boolean).join(' ');
  $('#report-export-error').textContent='';showDialog('report-export');
 }catch(error){toast(error.message);}
}
async function exportSalesPdf(){
 if(expenseExporting)return;
 expenseExporting=true;
 const btn=$('[data-sales-pdf]'),old=btn?.textContent;
 if(btn){btn.disabled=true;btn.textContent='PDF 준비 중…';}
 try{
  const range=getRange();
  const rows=state.entries.filter(e=>['sale','refund'].includes(e.type)&&inRange(e.businessDate,range))
   .filter(e=>(!ui.filters.search||[e.title,e.partner,e.category,e.note].join(' ').toLowerCase().includes(ui.filters.search.toLowerCase()))
    &&(!ui.filters.status||paymentStatus(e)===ui.filters.status)
    &&(!ui.filters.method||(e.type==='refund'?ui.filters.method==='refund':saleChannel(e)===ui.filters.method)))
   .map(e=>({date:e.businessDate,title:e.title,partner:e.partner||'',
    category:e.type==='refund'?'매출 환불':saleMethodName(e),
    amount:(e.type==='refund'?-1:1)*e.amount,
    settled:(e.type==='refund'?-1:1)*paidAmount(e),
    outstanding:(e.type==='refund'?-1:1)*outstanding(e)}));
  const total=rows.reduce((n,e)=>n+e.amount,0),settled=rows.reduce((n,e)=>n+e.settled,0),
   outstanding=rows.filter(e=>e.amount>0).reduce((n,e)=>n+Math.max(0,e.outstanding),0);
  const exporter=await import('./expense-export.js?v=20261105-sales-pdf-v2');
  const period=range.start===range.end?range.start:range.start+' ~ '+range.end;
  const bytes=await exporter.createExpensePdf({mode:'sales',period,rows,total,settled,outstanding,demo:mode==='demo'});
  exporter.downloadExpensePdf(bytes,'WINDMOON_매출관리_'+range.start+(range.start===range.end?'':'_'+range.end)+'.pdf');
  toast('매출 PDF를 저장했습니다.');
 }catch(error){toast('매출 PDF 내보내기 실패: '+(error.message||'다시 시도해 주세요.'));}
 finally{expenseExporting=false;if(btn&&btn.isConnected){btn.disabled=false;btn.textContent=old;}}
}
async function exportExpensePdf(){
 if(expenseExporting)return;
 expenseExporting=true;
 const btn=$('[data-expense-pdf]'),old=btn?.textContent;
 if(btn){btn.disabled=true;btn.textContent='PDF 준비 중…';}
 try{
  const range=getRange(),personal=ui.expenseView==='personal';
  const entries=state.entries.filter(e=>e.type==='expense'&&(personal?e.method==='personalCard':inRange(e.businessDate,range))).filter(e=>
   personal||(!ui.filters.search||[e.title,e.partner,e.category,e.note].join(' ').toLowerCase().includes(ui.filters.search.toLowerCase()))&&(!ui.filters.status||paymentStatus(e)===ui.filters.status)&&(!ui.filters.method||e.method===ui.filters.method));
  const rows=entries.map(e=>({
   date:e.businessDate,title:e.title,partner:e.partner||'',category:e.category,method:paymentMethodLabel(e,state),
   amount:e.amount,settled:paidAmount(e),outstanding:outstanding(e)
  }));
  const total=rows.reduce((n,e)=>n+e.amount,0),settled=rows.reduce((n,e)=>n+e.settled,0);
  const exporter=await import('./expense-export.js?v=20261105-sales-pdf-v2');
  const bytes=await exporter.createExpensePdf({mode:personal?'personal':'expenses',period:range.start===range.end?range.start:range.start+' ~ '+range.end,rows,total,settled,outstanding:total-settled,demo:mode==='demo'});
  const label=personal?'대납정산_전체기간':'지출관리_'+range.start+(range.start===range.end?'':'_'+range.end);
  exporter.downloadExpensePdf(bytes,'WINDMOON_'+label+'.pdf');
  toast('지출 PDF를 저장했습니다.');
 }catch(error){toast('PDF 내보내기 실패: '+(error.message||'다시 시도해 주세요.'));}
 finally{expenseExporting=false;if(btn&&btn.isConnected){btn.disabled=false;btn.textContent=old;}}
}
async function exportReport(format){
 if(reportExporting||!reportSnapshot||!['pdf','xlsx'].includes(format))return;
 reportExporting=true;
 const snapshot=reportSnapshot,includeDaily=$('#report-export-daily').checked;
 $('#report-export-error').textContent='';
 const buttons=[...$('#report-export').querySelectorAll('button')];buttons.forEach(button=>{button.disabled=true;});
 const clicked=$(`[data-report-format="${format}"]`),label=clicked.textContent;clicked.textContent='준비 중…';
 try{
  assertReportReady(snapshot);
  const exporter=await import('./assets/report-export-XZXZDWEK.js');
  const filename='WINDMOON_운영보고서_'+(snapshot.demo?'예시_':'')+snapshot.range.start+(snapshot.range.start===snapshot.range.end?'':'_'+snapshot.range.end);
  const bytes=format==='pdf'?await exporter.createReportPdf(snapshot,{includeDaily}):exporter.createReportWorkbook(reportSheets(snapshot));
  exporter.downloadReport(bytes,filename+'.'+format,format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  $('#report-export').close();toast((format==='pdf'?'PDF':'엑셀')+' 보고서를 저장했습니다.');
 }catch(error){$('#report-export-error').textContent=error.message||'보고서를 만들지 못했습니다. 다시 시도해 주세요.';}
 finally{reportExporting=false;buttons.forEach(button=>{button.disabled=false;});clicked.textContent=label;}
}
$('#report-export').addEventListener('cancel',event=>{if(reportExporting)event.preventDefault();});
function confirmAction(title,copy,action,label='삭제하기'){$('#confirm-title').textContent=title;$('#confirm-body').innerHTML=`<p style="font-size:12px;color:#849775;line-height:1.9;margin:0">${esc(copy)}</p>`;$('#confirm-ok').textContent=label;confirmCallback=action;showDialog('confirm-dialog');}
function readCategory(f){if(editorType==='sale'){const channel=SALE_CHANNELS.find(c=>c.id===f.elements.saleChannel?.value);return channel?.name||'';}const choice=f.elements.categoryChoice;return choice?(choice.value==='__custom__'?f.elements.category?.value.trim()||'':choice.value.trim()):(f.elements.category?.value||'').trim();}
function categoryControl(type,e,cats){
 if(type==='sale'){
  const selected=e.category?saleChannel(e):'';
  return `<select name="saleChannel" id="entry-sale-channel" required><option value="">매출 구분 선택</option>${['점포 매출','인포 매출'].map(group=>`<optgroup label="${group}">${SALE_CHANNELS.filter(c=>c.group===group).map(c=>`<option value="${c.id}" ${c.id===selected?'selected':''}>${c.name}</option>`).join('')}</optgroup>`).join('')}</select><small>일마감과 동일한 점포 3종·인포 2종 구분입니다.</small>`;
 }
 if(type!=='expense')return `<input name="category" list="category-options" maxlength="50" value="${esc(e.category||CATEGORIES[type][0])}" placeholder="선택하거나 직접 입력"><datalist id="category-options">${cats.map(c=>`<option value="${esc(c)}"></option>`).join('')}</datalist><small>목록에서 선택하거나 새로운 항목을 직접 입력하세요.</small>`;
 return `<select name="categoryChoice" id="entry-category-choice" required><option value="">지출항목 선택</option>${options(cats.map(c=>[c,c]),e.category||'')}<option value="__custom__">+ 직접 입력</option></select><input name="category" id="entry-category-custom" class="hidden" maxlength="50" placeholder="새 지출항목 입력" autocomplete="off"><small>항목을 선택하거나 '직접 입력'으로 새 항목을 작성하세요.</small>`;
}
function methodOptionsFor(type,selected){const methods=type==='sale'?[{id:'card',name:'카드'},{id:'cash',name:'현금'},{id:'bank',name:'계좌이체'}]:paymentMethodDefinitions(state).filter(m=>m.active!==false||m.id===selected);return options(methods.map(m=>[m.id,m.name]),selected);}
function accountSelectOptions(selected){return options(accountDefinitions(state).filter(a=>a.active!==false||a.id===selected).map(a=>[a.id,a.name]),selected);}
function draftFromForm(){const f=$('#entry-form');return {title:f.elements.title?.value||'',amount:f.elements.amount?.value||'',businessDate:f.elements.businessDate?.value||today,category:readCategory(f),method:f.elements.method?.value||'bank',partner:f.elements.partner?.value||'',note:f.elements.note?.value||''};}
function openEditor(type='sale',entry=null,draft=null){
 editorEntry=entry;editorType=type;
 if(entry?.closingDate){ui.day=entry.businessDate;navigate('closing');toast('일마감 매출은 일마감 화면에서 수정해 주세요.');return;}
 const r=getRange(),defaultDate=ui.period==='day'?ui.day:operatingDay>=r.start&&operatingDay<=r.end?operatingDay:r.end;
 if(dayClosed(state,entry?.businessDate||defaultDate)){toast('마감된 영업일입니다. 일마감에서 다시 열어 주세요.');return;}
 const e=draft||entry||{title:'',amount:'',businessDate:defaultDate,category:['expense','sale'].includes(type)?'':CATEGORIES[type][0],method:type==='sale'?'card':type==='expense'?(ui.expenseView==='personal'?'personalCard':'card'):'bank',partner:'',note:''};
 $('#editor-title').textContent=entry?'거래 수정':'거래 등록';
 const types=['sale','expense','funding','transfer','refund'];
 const cats=type==='expense'?[...new Set([...expenseCategoryOptions(state),...(e.category?[e.category]:[])])]:[...new Set([...(CATEGORIES[type]||[]),...(state.customCategories||[]),...state.entries.filter(x=>x.type===type).map(x=>x.category)])];
 const partners=[...new Set(state.entries.map(x=>x.partner).filter(Boolean))],vendors=savedVendors(state);
 const partnerField=type==='expense'?`<label class='field vendor-field'><span>거래처</span><select name='partnerPreset' id='partner-preset' aria-label='고정 거래처 선택'><option value=''>직접 입력</option>${options(vendors.map(v=>[v,v]),vendors.includes(e.partner)?e.partner:'')}</select><input name='partner' id='partner-value' maxlength='60' value='${esc(e.partner)}' ${vendors.includes(e.partner)?'readonly':''} placeholder='일회성 거래처명을 직접 입력'><small>고정 거래처를 선택하거나 ‘직접 입력’으로 작성하세요.</small><button class='text-btn' type='button' data-action='save-vendor' ${vendors.includes(e.partner)?'disabled':''}>${icon('plus',13)} 현재 거래처를 고정 목록에 추가</button></label>`:`<label class='field'><span>거래처 · 대상</span><input name='partner' list='partner-options' maxlength='60' value='${esc(e.partner)}' placeholder='직접 입력 또는 선택'><datalist id='partner-options'>${partners.map(p=>`<option value='${esc(p)}'></option>`).join('')}</datalist></label>`;
 $('#editor-body').innerHTML=`<div class="type-selector">${types.map(t=>`<button type="button" data-editor-type="${t}" class="${type===t?'active':''}" ${entry&&t!==type?'disabled':''}>${TYPE_NAMES[t]}</button>`).join('')}</div><label class="field amount-field"><span>거래 금액 · 원</span><input name="amount" type="number" min="1" max="99999999999" step="1" inputmode="numeric" required placeholder="0" value="${esc(e.amount)}"></label><label class="field"><span>거래 내용</span><input name="title" maxlength="100" required placeholder="예: 주류 추가 발주 / 카드 매출 일마감" value="${esc(e.title)}"></label><div class="field-row"><label class="field"><span>영업일</span><input name="businessDate" type="date" required value="${esc(e.businessDate)}"><small>자정 이후 거래도 해당 영업일로 지정</small></label><label class="field"><span>${type==='expense'?'지출항목':type==='sale'?'매출 구분':'분류'}</span>${categoryControl(type,e,cats)}</label></div>${type==='transfer'?`<div class="field-row"><label class="field"><span>출금 위치</span><select name="fromAccount">${accountSelectOptions(entry?.fromAccount||'cash')}</select></label><label class="field"><span>입금 위치</span><select name="toAccount">${accountSelectOptions(entry?.toAccount||'bank')}</select></label></div><label class="field"><span>실제 이동일</span><input name="paymentDate" type="date" value="${entry?.paymentDate||e.businessDate}" required></label><div class="inline-note">자금 이동은 현금·계좌 잔액에만 반영하며, 매출과 비용에는 포함하지 않습니다.</div>`:`<div class="field-row">${type==='sale'?`<label class="field"><span>결제·입금 방식</span><input type="hidden" name="method" value="${esc(e.method)}"><div class="inline-note" id="sale-method-description">${esc(SALE_CHANNELS.find(c=>c.id===(e.category?saleChannel(e):''))?.group||'매출 구분을 먼저 선택하세요.')}</div></label>`:`<label class="field"><span>결제수단</span><select name="method">${methodOptionsFor(type,e.method)}</select></label>`}${partnerField}</div>${entry?`<div class="inline-note">기존 입출금 ${entry.payments.length}건 · 합계 ${money(paidAmount(entry))}원은 유지됩니다.<br>입금·지급 내역은 상세 화면에서 추가하거나 삭제할 수 있습니다.</div>`:`<hr class="field-divider"><label class="checkbox-line"><input id="record-payment" name="recordPayment" type="checkbox" ${(type==='sale'&&e.method==='card'||type==='expense'&&['card','repCard','personalCard'].includes(e.method))?'':'checked'}>실제 입금·지급도 함께 기록</label><div id="initial-payment-fields" ${(type==='sale'&&e.method==='card'||type==='expense'&&['card','repCard','personalCard'].includes(e.method))?'class="hidden"':''}><div class="field-row"><label class="field"><span>실제 입출금일</span><input name="paidDate" type="date" value="${esc(e.businessDate)}"></label><label class="field"><span>입출금 위치</span><select name="accountId">${accountSelectOptions(e.method==='cash'?'cash':'bank')}</select></label></div><div class="field-row"><label class="field"><span>입금·지급액 · 원</span><input name="paidAmount" type="number" min="1" step="1" inputmode="numeric" placeholder="비우면 거래금액 전체"><small>일부 금액만 기록할 수도 있습니다.</small></label><label class="field"><span>카드 정산 수수료 · 원</span><input name="fee" type="number" min="0" step="1" inputmode="numeric" value="0" ${type!=='sale'?'disabled':''}><small>매출 입금 시 실제 차감된 수수료</small></label></div></div><div class="inline-note">${type==='sale'?'카드 매출은 정산 입금 전까지 미수로 남겨두고, 실제 입금일에 상세 화면에서 정산을 기록하세요.':type==='funding'?'대표자 입금·차입금 등은 잔액에 반영하고 매출에는 포함하지 않습니다.':'지급하지 않은 거래는 체크를 해제하면 미지급으로 등록됩니다.'}</div>`}`}
 <label class="field" style="margin-top:17px;margin-bottom:0"><span>비고</span><textarea name="note" maxlength="500" placeholder="필요한 내용을 남겨 주세요.">${esc(e.note)}</textarea></label><div id="entry-error" class="form-error" role="alert"></div>`;
 showDialog('editor');
}
function syncVendorOptions(){
 const f=$('#entry-form');if(!f.elements.partnerPreset)return;
 const current=f.elements.partner.value.trim(),vendors=savedVendors(state),known=vendors.includes(current);
 f.elements.partnerPreset.innerHTML='<option value="">직접 입력</option>'+options(vendors.map(v=>[v,v]),known?current:'');
 f.elements.partner.readOnly=known;f.querySelector('[data-action="save-vendor"]').disabled=known;
}
async function registerVendor(){
 const f=$('#entry-form'),name=f.elements.partner.value.trim();
 if(!name){$('#entry-error').textContent='고정 목록에 추가할 거래처명을 직접 입력해 주세요.';f.elements.partner.focus();return;}
 if(savedVendors(state).includes(name)){toast('이미 등록한 거래처입니다.');return;}
 if(await persist({...state,vendors:[...(state.vendors||[]),name]},'고정 거래처 추가')){syncVendorOptions();$('#entry-error').textContent='';toast('고정 거래처 목록에 추가했습니다.');}
}
async function submitEntry(event){
 event.preventDefault();const f=event.currentTarget;
 try{
  const selectedCategory=readCategory(f);if(editorType==='expense'&&!selectedCategory)throw new Error('지출항목을 선택하거나 직접 입력해 주세요.');
  const chosenSale=editorType==='sale'?SALE_CHANNELS.find(c=>c.id===f.elements.saleChannel.value):null;
  if(editorType==='sale'&&!chosenSale)throw Error('일마감과 동일한 매출 구분을 선택해 주세요.');
  const e={...editorEntry,id:editorEntry?.id||uid(),type:editorType,title:f.elements.title.value.trim(),amount:Number(f.elements.amount.value),businessDate:f.elements.businessDate.value,category:chosenSale?(editorEntry&&chosenSale.id===saleChannel(editorEntry)?editorEntry.category:chosenSale.name):selectedCategory||CATEGORIES[editorType][0],partner:f.elements.partner?.value.trim()||'',note:f.elements.note.value.trim(),method:f.elements.method?.value||'bank',payments:editorEntry?.payments||[]};
  if(chosenSale){e.method=chosenSale.method;e.saleLocation=chosenSale.saleLocation;}
  if(editorType==='transfer'){e.fromAccount=f.elements.fromAccount.value;e.toAccount=f.elements.toAccount.value;e.paymentDate=f.elements.paymentDate.value;}
  else if(!editorEntry&&f.elements.recordPayment.checked){e.payments=addPayment({...e,payments:[]},{id:uid(),date:f.elements.paidDate.value,amount:f.elements.paidAmount.value?Number(f.elements.paidAmount.value):e.amount,accountId:f.elements.accountId.value,fee:editorType==='sale'?Number(f.elements.fee.value||0):0},accountDefinitions(state)).payments;}
  validateEntry(e,accountDefinitions(state));
  const entries=editorEntry?state.entries.map(x=>x.id===e.id?e:x):[...state.entries,e];
  const freshCategory=editorType==='expense'&&f.elements.categoryChoice?.value==='__custom__'&&!expenseCategoryOptions(state).includes(e.category);
  const next= freshCategory?{...state,entries,expenseCategories:[...expenseCategoryOptions(state),e.category]}:{...state,entries};
  if(await persist(next)){$('#editor').close();const visible=inRange(e.businessDate,getRange());toast(editorEntry?'거래를 수정했습니다.':visible?'거래를 등록했습니다.':'거래를 등록했습니다. 현재 조회 기간 밖의 거래입니다.');}
 }catch(error){$('#entry-error').textContent=error.message;}
}
function paymentRows(entry,readonly=false){return entry.payments.length?entry.payments.map(p=>`<div class="payment-row"><span>${shortDate(p.date)} · ${accountName(p.accountId,state)}${p.kind==='advance'?' · 선지급':''}${p.fee?`<br><small>수수료 ${money(p.fee)}원 차감 · 실입금 ${money(p.amount-p.fee)}원</small>`:''}</span><span><strong>${money(p.amount)}원</strong>${readonly?'':` <button class="icon-btn" style="display:inline-grid;width:23px;height:23px;font-size:15px;vertical-align:middle" data-delete-payment="${esc(p.id)}" data-entry-id="${esc(entry.id)}" aria-label="${shortDate(p.date)} 입출금 기록 삭제">×</button>`}</span></div>`).join(''):'<div class="inline-note">기록된 실제 입출금이 없습니다.</div>';}
function openEntryDetail(id){
 const e=state.entries.find(e=>e.id===id);if(!e)return;
 $('#detail-title').textContent=e.title;$('#detail-eyebrow').textContent='TRANSACTION DETAIL';
 const transfer=e.type==='transfer',owed=outstanding(e),isIncoming=e.type==='sale'||e.type==='funding';
 $('#detail-body').innerHTML=`<div style="display:flex;gap:8px;align-items:center"><span class="type-pill">${TYPE_NAMES[e.type]}</span>${statusPill(e)}</div><div class="detail-amount">${money(e.amount)}<small>원</small></div><dl class="detail-meta"><dt>영업일</dt><dd>${shortDate(e.businessDate)}</dd><dt>분류</dt><dd>${esc(e.category)}</dd><dt>거래처 · 대상</dt><dd>${esc(e.partner||'—')}</dd>${transfer?`<dt>자금 이동</dt><dd>${accountName(e.fromAccount,state)} → ${accountName(e.toAccount,state)}</dd><dt>실제 이동일</dt><dd>${shortDate(e.paymentDate)}</dd>`:`<dt>결제수단</dt><dd>${esc(e.type==='sale'?saleMethodName(e):paymentMethodLabel(e,state))}</dd><dt>${isIncoming?'입금 기록액':'지급 기록액'}</dt><dd>${money(paidAmount(e))}원</dd><dt>${isIncoming?'받을 금액':'지급할 금액'}</dt><dd><strong>${money(owed)}원</strong></dd>`}<dt>비고</dt><dd style="white-space:pre-wrap">${esc(e.note||'—')}</dd></dl>${transfer?'<div class="inline-note">계좌 간 이동으로 매출·비용에는 반영하지 않습니다.</div>':`<h3 class="detail-section-title">입출금 기록</h3>${paymentRows(e)}${owed>0?`<form id="settlement-form" class="payment-form" data-entry-id="${esc(e.id)}" novalidate><h3>${e.method==='personalCard'?'개인카드 대납금 정산':isIncoming?'입금·정산':'지급'} 기록 추가</h3><div class="field-row"><label class="field"><span>금액 · 원</span><input name="amount" type="number" min="1" max="${owed}" step="1" inputmode="numeric" value="${owed}"></label><label class="field"><span>실제 입출금일</span><input name="date" type="date" value="${today}"></label></div><div class="field-row"><label class="field"><span>입출금 위치</span><select name="accountId">${accountSelectOptions(e.method==='cash'?'cash':'bank')}</select></label>${e.type==='sale'?'<label class="field"><span>정산 수수료 · 원</span><input name="fee" type="number" min="0" step="1" inputmode="numeric" value="0"></label>':''}</div><div id="settlement-error" class="form-error" role="alert"></div><button class="primary-btn" type="submit">${e.method==='personalCard'?'대납금 정산':isIncoming?'입금':'지급'} 내역 기록</button></form>`:'<div class="soft-callout">거래금액 전체의 입출금이 기록되었습니다.</div>'}`}`;
 $('#detail-footer').innerHTML=`<button class="danger-text" data-delete-entry="${esc(e.id)}">거래 삭제</button><button class="secondary-btn" data-close="detail">닫기</button><button class="primary-btn" data-edit-entry="${esc(e.id)}">수정하기</button>`;showDialog('detail');
}
function openPayrollDetail(id){const e=state.payroll.find(e=>e.id===id);if(!e)return;$('#detail-title').textContent=e.employee+' · 급여';$('#detail-eyebrow').textContent='PAYROLL PREVIEW';$('#detail-body').innerHTML=`${statusPill(e)}<div class="detail-amount">${money(e.amount)}<small>원</small></div><dl class="detail-meta"><dt>영업일</dt><dd>${shortDate(e.businessDate)}</dd><dt>소속</dt><dd>${esc(e.team)} · ${esc(e.role)}</dd><dt>지급액</dt><dd>${money(paidAmount(e))}원</dd><dt>남은 급여</dt><dd>${money(outstanding(e))}원</dd><dt>원본 기록</dt><dd>${esc(e.sourceId)}${mode==='demo'?' · 예시':''}</dd></dl><h3 class="detail-section-title">지급 내역 · 선지급 포함</h3>${paymentRows(e,true)}<div class="soft-callout">직원관리의 공제 후 지급대상액을 기준으로 합니다. 선지급과 잔금은 동일 급여의 지급 내역으로 합산합니다. 선지급일은 직원관리의 영업일 기준입니다.</div>`;$('#detail-footer').innerHTML=`<button class="secondary-btn" data-close="detail">닫기</button><a href="${esc(state.staffUrl)}" target="_blank" rel="noopener" class="primary-btn">직원관리 열기 ↗</a>`;showDialog('detail');}
function openAbout(payrollOnly=false){
 $('#detail-title').textContent=payrollOnly?'급여 연동 방식':'운영관리 안내';$('#detail-eyebrow').textContent='WIND MOON OPERATIONS';
 $('#detail-body').innerHTML=payrollOnly?'<div class="inline-note">실제 장부에서는 직원관리의 근무·급여 계산 결과와 선지급·지급 내역을 가져옵니다.</div><ol class="about-list"><li>급여 계산과 지급 처리는 직원관리에서 합니다.</li><li>운영관리에서는 공제 후 지급대상액을 인건비로 집계합니다.</li><li>선지급과 잔금은 같은 급여의 실제 지급액으로 합산합니다.</li><li>선지급일은 직원관리의 영업일 기준입니다.</li><li>근무 없는 선지급과 초과 지급은 직원별 잔여 금액에 반영합니다.</li></ol>':'<div class="inline-note">실제 장부는 서버에 저장돼 PC와 휴대폰에서 함께 사용합니다. 예시 화면은 현재 브라우저에만 저장됩니다.</div><ul class="about-list"><li>일마감에서 카드·현금·이체 매출을 한 번에 입력합니다.</li><li>개별 등록한 매출을 포함한 하루 총액을 입력하면 중복 없이 합산합니다.</li><li>마감된 영업일의 거래는 다시 열기 후 수정합니다.</li><li>카드 정산 입금과 자금 이동은 매출로 다시 집계하지 않습니다.</li><li>서버 새로고침으로 다른 기기의 저장 내용과 최신 급여를 가져옵니다.</li></ul><div class="soft-callout">처음 사용 시 설정에서 기초 잔액 기준일과 현금·계좌 시작 잔액을 입력해 주세요. 조회 종료일이 기준일보다 이르면 잔액은 표시하지 않습니다.</div>';
 $('#detail-footer').innerHTML='<button class="primary-btn" data-close="detail">확인</button>';showDialog('detail');
}
function openPending(kind){
 const r=getRange(),pay=kind==='payroll',entries=(pay?state.payroll:state.entries).filter(e=>inRange(e.businessDate,r)&&outstanding(e)>0&&(pay||kind==='sales'&&e.type==='sale'||kind==='expenses'&&(e.type==='expense'||e.type==='refund')));
 $('#detail-title').textContent=kind==='sales'?'미수 매출':kind==='expenses'?'미지급 비용':'미지급 급여';$('#detail-eyebrow').textContent='OUTSTANDING BALANCE';$('#detail-body').innerHTML=entries.length?`<div class="pending-list">${entries.map(e=>`<button class="pending-item" ${pay?`data-payroll="${esc(e.id)}"`:`data-entry="${esc(e.id)}"`}><span>${esc(pay?e.employee:e.title)}<br><small>${shortDate(e.businessDate)} · ${esc(pay?e.team:e.partner)}</small></span><strong>${money(outstanding(e))}원</strong></button>`).join('')}</div>`:'<div class="empty-note">선택한 기간에 남은 금액이 없습니다.</div>';$('#detail-footer').innerHTML='<button class="primary-btn" data-close="detail">닫기</button>';showDialog('detail');
}
function legacyEntries(){const demoIds=new Set(makeDemo(demoState.demoDate||today).entries.map(e=>e.id));return demoState.entries.filter(e=>!demoIds.has(e.id)&&!e.closingDate);}
function settingsMethodRow(method){
 return `<div class="field-row" data-method-row data-id="${esc(method.id)}"><label class="field"><span>결제수단명</span><input data-method-name maxlength="50" value="${esc(method.name)}" required></label><label class="field"><span>상태</span><span class="checkbox-line"><input type="checkbox" data-method-active ${method.active!==false?'checked':''} ${method.id==='card'?'disabled':''}>사용</span></label><button class="secondary-btn" type="button" data-action="remove-method" data-id="${esc(method.id)}">삭제</button></div>`;
}
function settingsAccountRow(account){
 return `<div class="field-row" data-account-row data-id="${esc(account.id)}"><label class="field"><span>입출금 위치명</span><input data-account-name maxlength="50" value="${esc(account.name)}" required></label><label class="field"><span>기초 잔액 · 원</span><input data-account-opening type="number" step="1" inputmode="numeric" value="${Number(state.openingBalances[account.id]||0)}"></label><label class="field"><span>상태</span><span class="checkbox-line"><input type="checkbox" data-account-active ${account.active!==false?'checked':''} ${['cash','bank'].includes(account.id)?'disabled':''}>사용</span></label><button class="secondary-btn" type="button" data-action="remove-account" data-id="${esc(account.id)}">삭제</button></div>`;
}
function openSettings(){
 const legacy=legacyEntries();
 $('#settings-body').innerHTML=`<div class="inline-note">${mode==='real'?'실제 장부와 설정은 서버에 저장됩니다. 다른 기기에서도 같은 계정으로 접속하면 이어서 사용할 수 있습니다.':'예시 입력은 이 브라우저에만 저장됩니다. 실제 서버 장부와 분리됩니다.'}</div><h3 class="settings-section">기초 잔액</h3><label class="field"><span>기초 잔액 기준일 · 해당 날짜 시작 시점</span><input name="openingDate" type="date" value="${state.openingDate||today.slice(0,7)+'-01'}"><small>이 날짜 이후의 실제 입출금만 시작 잔액에 더합니다. 과거 급여를 가져와도 기준일 이전 출금은 잔액에서 제외됩니다.</small></label><div id="account-settings-list">${accountDefinitions(state).map(settingsAccountRow).join('')}</div><button type="button" class="secondary-btn" data-action="add-account">+ 입출금 위치 추가</button><div class="inline-note">입출금 위치는 풍월관의 실제 현금·계좌 잔액을 계산합니다. 사용 이력이 있는 위치는 삭제 대신 사용 안 함으로 전환해 기록을 보존합니다.</div><h3 class="settings-section">결제수단 관리</h3><div id="method-settings-list">${paymentMethodDefinitions(state).map(settingsMethodRow).join('')}</div><button type="button" class="secondary-btn" data-action="add-method">+ 결제수단 추가</button><div class="inline-note">개인카드(대납)·대표카드는 결제 시점과 풍월관 자금 출금 시점을 분리합니다. 사용 이력이 있는 수단은 삭제 대신 비활성화할 수 있습니다.</div><h3 class="settings-section">고정 거래처 목록</h3><label class="field"><span>한 줄에 거래처 하나씩 입력</span><textarea name="vendors" rows="4" maxlength="6100" placeholder="예: 풍월주류&#10;시설관리업체">${esc((state.vendors||[]).join('\n'))}</textarea><small>지출 등록의 드롭다운에 표시됩니다. 여기서 추가·이름 수정·삭제할 수 있으며 기존 거래 기록은 유지됩니다.</small></label><h3 class="settings-section">지출항목 관리</h3><label class="field"><span>한 줄에 하나씩 입력 · 이름 수정이나 삭제 가능</span><textarea name="expenseCategories" rows="7" maxlength="3500" placeholder="예: 주류 매입&#10;공과금">${esc(expenseCategoryOptions(state).join('\n'))}</textarea><small>여기서 제거한 항목은 새 지출의 선택 목록에서 사라집니다. 기존 거래 내역은 변경되지 않습니다.</small></label><h3 class="settings-section">기타 거래의 추가 분류</h3><label class="field"><span>쉼표로 구분해 입력</span><input name="categories" maxlength="500" placeholder="예: 장비 수리, 행사비" value="${esc((state.customCategories||[]).join(', '))}"></label><div class="soft-callout">${mode==='real'?'급여 연결: '+(state.integration?.error?'연결 확인 필요':state.integration?.stale?'마지막 연결 자료 표시':'직원관리 자료 연결됨')+' · 서버 장부 버전 '+revision:'예시 데이터로 입력과 마감 흐름을 확인할 수 있습니다.'}</div>${mode==='demo'?'<div class="danger-zone"><button type="button" class="secondary-btn" data-action="reset-demo">예시 데이터로 초기화</button></div>':legacy.length?`<div class="danger-zone"><h3 class="settings-section">이전 브라우저 입력</h3><p class="warning-copy">직접 추가한 거래 ${legacy.length}건을 서버 장부로 가져올 수 있습니다. 기존 예시 거래와 예시 마감은 제외합니다.</p><button class="secondary-btn" type="button" data-action="import-legacy">직접 추가한 거래 가져오기</button></div>`:''}<div id="settings-error" class="form-error" role="alert"></div>`;showDialog('settings');
}
async function submitClosing(status='closed'){
 const f=$('#closing-form');if(!f)return;
 try{const next=saveDayClosing(state,ui.day,{card:f.elements.card.value,cash:f.elements.cash.value,bank:f.elements.bank.value,infoCard:f.elements.infoCard.value,infoBank:f.elements.infoBank.value,actualCash:f.elements.actualCash.value,note:f.elements.note.value,status});if(await persist(next,ui.day+' 일마감 '+(status==='closed'?'완료':'임시 저장')))toast(status==='closed'?'일마감을 완료했습니다.':'마감을 임시 저장했습니다.');}
 catch(error){$('#closing-error').textContent=error.message;}
}
function syncInitialPaymentDate(event){
 const f=$('#entry-form'),paidDate=f?.elements.paidDate;
 if(!paidDate)return;
 if(event.target===paidDate){paidDate.dataset.manuallyEdited='true';return;}
 if(event.target===f.elements.businessDate&&paidDate.dataset.manuallyEdited!=='true')paidDate.value=f.elements.businessDate.value;
}
$('#entry-form').addEventListener('submit',submitEntry);
$('#entry-form').addEventListener('input',syncInitialPaymentDate);
$('#entry-form').addEventListener('change',syncInitialPaymentDate);
$('#settings-form').addEventListener('submit',async event=>{event.preventDefault();try{
 const f=event.currentTarget,openingBalances={};
 const accounts=[...f.querySelectorAll('[data-account-row]')].map(row=>{
  const id=row.dataset.id,name=row.querySelector('[data-account-name]').value.trim(),value=Number(row.querySelector('[data-account-opening]').value);
  if(!name||!Number.isSafeInteger(value))throw Error('입출금 위치 이름과 기초 잔액을 확인해 주세요.');
  openingBalances[id]=value;
  const original=accountDefinitions(state).find(a=>a.id===id);
  return {id,name,short:original?.short||name,icon:original?.icon||'bank',active:['cash','bank'].includes(id)||row.querySelector('[data-account-active]').checked};
 });
 const paymentMethods=[...f.querySelectorAll('[data-method-row]')].map(row=>{
  const id=row.dataset.id,name=row.querySelector('[data-method-name]').value.trim();
  if(!name)throw Error('결제수단 이름을 입력해 주세요.');
  return {id,name,active:id==='card'||row.querySelector('[data-method-active]').checked};
 });
 if(new Set(accounts.map(a=>a.name)).size!==accounts.length)throw Error('입출금 위치 이름이 중복됐습니다.');
 if(new Set(paymentMethods.map(m=>m.name)).size!==paymentMethods.length)throw Error('결제수단 이름이 중복됐습니다.');
 const expenseCategories=[...new Set(f.elements.expenseCategories.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean))];
 const customCategories=[...new Set(f.elements.categories.value.split(',').map(x=>x.trim()).filter(Boolean))],vendors=[...new Set(f.elements.vendors.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean))];
 if(await persist({...state,openingDate:f.elements.openingDate.value,openingBalances,accounts,paymentMethods,expenseCategories,customCategories,vendors},'결제수단·계좌·지출 설정 저장')){$('#settings').close();toast('설정을 저장했습니다.');}
 }catch(error){$('#settings-error').textContent=error.message;}});
listen('submit',async event=>{if(event.target.id!=='settlement-form')return;event.preventDefault();const f=event.target,e=state.entries.find(e=>e.id===f.dataset.entryId);try{const next=addPayment(e,{id:uid(),date:f.elements.date.value,amount:Number(f.elements.amount.value),accountId:f.elements.accountId.value,fee:Number(f.elements.fee?.value||0)},accountDefinitions(state));if(await persist({...state,entries:state.entries.map(x=>x.id===e.id?next:x)})){openEntryDetail(e.id);toast('실제 입출금 내역을 기록했습니다.');}}catch(error){$('#settlement-error').textContent=error.message;}});
$('#new-entry').addEventListener('click',()=>ui.page==='report'?openReportExport():ui.page==='payroll'?openAbout(true):openEditor(ui.page==='expenses'?'expense':'sale'));
$('#settings-button').innerHTML=icon('settings',17);$('#settings-button').addEventListener('click',openSettings);$('#sidebar-settings-icon').innerHTML=icon('settings',18);$('#staff-icon').innerHTML=icon('users',18);$('#staff-sidebar').href=STAFF_URL;
listen('click',async event=>{
 const button=event.target.closest('button,[data-entry],[data-payroll]');if(!button)return;
 if(button.dataset.close){if(button.dataset.close==='report-export'&&reportExporting)return;$('#'+button.dataset.close).close();return;}
 if(button.dataset.reportDay){openReportDay(button.dataset.reportDay);return;}
 if(button.dataset.reportFormat){await exportReport(button.dataset.reportFormat);return;}
 if(button.dataset.page){navigate(button.dataset.page);return;}
 if(button.dataset.new){openEditor(button.dataset.new);return;}
 if(button.dataset.salesPdf){await exportSalesPdf();return;}
 if(button.dataset.expensePdf){await exportExpensePdf();return;}
 if(button.dataset.expenseView){if(!['ledger','personal'].includes(button.dataset.expenseView))return;ui.expenseView=button.dataset.expenseView;renderContent();return;}
 if(button.dataset.settlePersonal){openEntryDetail(button.dataset.settlePersonal);return;}
 if(button.dataset.fundsView){if(!['cash','accrual'].includes(button.dataset.fundsView))return;ui.fundsView=button.dataset.fundsView;renderContent();return;}
 if(button.dataset.calendarToggle){const field=button.dataset.calendarToggle;calendarField=calendarField===field?null:field;if(calendarField)calendarMonth=(field==='day'?ui.day:field==='month'?ui.month:ui[field]).slice(0,7);renderPeriod();return;}
 if(button.dataset.calendarClose){calendarField=null;renderPeriod();return;}
 if(button.dataset.calendarNav){const [year,month]=calendarMonth.split('-').map(Number);calendarMonth=new Date(Date.UTC(year,month-1+Number(button.dataset.calendarNav),1)).toISOString().slice(0,7);renderPeriod();return;}
 if(button.dataset.calendarDay){chooseCalendarDate(calendarField,button.dataset.calendarDay);return;}
 if(button.dataset.calendarApplyMonth){chooseCalendarDate('month',calendarMonth+'-01');return;}
 if(button.dataset.period){calendarField=null;ui.period=button.dataset.period;renderPeriod();renderContent();return;}
 if(button.dataset.shift){calendarField=null;const step=Number(button.dataset.shift);if(ui.period==='day')ui.day=shiftDate(ui.day,step);else{const [year,month]=ui.month.split('-').map(Number);ui.month=new Date(Date.UTC(year,month-1+step,1)).toISOString().slice(0,7);}renderPeriod();renderContent();return;}
 if(button.dataset.editorType){const type=button.dataset.editorType,draft=draftFromForm();draft.category=['sale','expense'].includes(type)?'':CATEGORIES[type][0];openEditor(type,editorEntry,draft);return;}
 if(button.dataset.editEntry){const e=state.entries.find(e=>e.id===button.dataset.editEntry);$('#detail').close();openEditor(e.type,e);return;}
 if(button.dataset.deleteEntry){const id=button.dataset.deleteEntry;confirmAction('거래를 삭제할까요?','연결된 입출금 내역도 함께 삭제되며, 잔액과 집계가 다시 계산됩니다.',async ()=>{if(await persist({...state,entries:state.entries.filter(e=>e.id!==id)})){$('#detail').close();toast('거래를 삭제했습니다.');}});return;}
 if(button.dataset.deletePayment){const id=button.dataset.entryId,pid=button.dataset.deletePayment;confirmAction('입출금 기록을 삭제할까요?','이 금액은 미입금·미지급 상태로 돌아가고 잔액을 다시 계산합니다.',async ()=>{if(await persist({...state,entries:state.entries.map(e=>e.id===id?{...e,payments:e.payments.filter(p=>p.id!==pid)}:e)})){openEntryDetail(id);toast('입출금 기록을 삭제했습니다.');}});return;}
 if(button.dataset.entry){openEntryDetail(button.dataset.entry);return;}
 if(button.dataset.payroll){openPayrollDetail(button.dataset.payroll);return;}
 if(button.dataset.closingDate){ui.day=button.dataset.closingDate;navigate('closing');return;}
 const action=button.dataset.action;
 if(action==='settings'){openSettings();return;}
 if(action==='personal-card'){navigate('expenses');ui.expenseView='personal';renderContent();return;}
 if(action==='add-method'){
  const list=$('#method-settings-list');list.insertAdjacentHTML('beforeend',settingsMethodRow({id:'pm-'+uid(),name:'',active:true}));list.lastElementChild.querySelector('[data-method-name]').focus();return;
 }
 if(action==='add-account'){
  const list=$('#account-settings-list');list.insertAdjacentHTML('beforeend',settingsAccountRow({id:'ac-'+uid(),name:'',active:true}));list.lastElementChild.querySelector('[data-account-name]').focus();return;
 }
 if(action==='remove-method'){
  const row=button.closest('[data-method-row]'),id=row?.dataset.id;
  const used=state.entries.some(e=>e.method===id);
  if(['card','cash','bank','repCard','personalCard'].includes(id)||used){toast(used?'기존 거래가 있으므로 삭제할 수 없습니다. 사용 체크를 해제해 주세요.':'기본 결제수단은 기록 보호를 위해 삭제할 수 없습니다. 사용 체크를 해제해 주세요.');return;}
  row?.remove();return;
 }
 if(action==='remove-account'){
  const row=button.closest('[data-account-row]'),id=row?.dataset.id;
  const used=state.entries.some(e=>e.fromAccount===id||e.toAccount===id||(e.payments||[]).some(p=>p.accountId===id))||(state.payroll||[]).some(e=>(e.payments||[]).some(p=>p.accountId===id))||Number(state.openingBalances[id]||0)!==0;
  if(['cash','bank'].includes(id)||used){toast(used?'자금 기록이 있으므로 삭제할 수 없습니다. 사용 체크를 해제해 주세요.':'기본 현금·운영계좌는 삭제할 수 없습니다.');return;}
  row?.remove();return;
 }
 if(action==='save-vendor'){await registerVendor();return;}
 if(action==='refresh-server'){await refreshServer();return;}
 if(action==='toggle-mode'){if(saving||loading){toast('연결·저장이 끝난 뒤 전환해 주세요.');return;}mode=mode==='demo'?'real':'demo';try{localStorage.setItem('windmoon-operations-mode',mode);}catch{}state=mode==='demo'?{...demoState,integration:{demo:true}}:attachPayroll(serverState);updateModeBanner();renderPage();return;}
 if(action==='draft-closing'){await submitClosing('draft');return;}
 if(action==='reopen-closing'){confirmAction('마감을 다시 열까요?','해당 영업일의 매출과 지출을 다시 수정할 수 있습니다.',async()=>{const closings={...state.closings,[ui.day]:{...state.closings[ui.day],status:'draft',reopenedAt:new Date().toISOString()}};if(await persist({...state,closings},ui.day+' 마감 다시 열기'))toast('마감을 다시 열었습니다.');},'다시 열기');return;}
 if(action==='import-legacy'){const rows=legacyEntries().filter(e=>!state.entries.some(x=>x.id===e.id));confirmAction('이전 입력을 가져올까요?',`예시를 제외한 직접 추가 거래 ${rows.length}건을 실제 서버 장부에 저장합니다.`,async()=>{if(await persist({...state,entries:[...state.entries,...rows]},'이전 브라우저 거래 가져오기')){$('#settings').close();toast('이전 입력을 가져왔습니다.');}},'가져오기');return;}
 if(action==='about')openAbout();if(action==='payroll-about')openAbout(true);if(action?.startsWith('pending-'))openPending(action.slice(8));if(action==='period-today'){ui.day=operatingDay;ui.month=operatingDay.slice(0,7);renderPeriod();renderContent();}if(action==='reset-demo'&&mode==='demo')confirmAction('예시 데이터로 초기화할까요?','직접 입력한 예시 거래와 설정이 삭제됩니다. 실제 서버 장부는 유지됩니다.',async ()=>{const next=makeDemo(today);if(await persist(next)){$('#settings').close();ui.period='month';ui.month=today.slice(0,7);renderPage();toast('오늘 기준 예시 데이터로 초기화했습니다.');}},'초기화하기');
});
listen('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target.matches('tr[data-entry],tr[data-payroll]')){event.preventDefault();event.target.click();}});
listen('change',event=>{
 const el=event.target;
 if(el.matches('[data-calendar-year],[data-calendar-month]')){const year=Number(root.querySelector('[data-calendar-year]')?.value),month=Number(root.querySelector('[data-calendar-month]')?.value);if(year>=1900&&year<=2100&&month>=1&&month<=12)calendarMonth=year+'-'+String(month).padStart(2,'0');renderPeriod();return;}if(el.id==='partner-preset'){const f=$('#entry-form');f.elements.partner.value=el.value;f.elements.partner.readOnly=!!el.value;f.querySelector('[data-action="save-vendor"]').disabled=!!el.value;if(!el.value)f.elements.partner.focus();}
 if(el.id==='entry-sale-channel'){
  const selected=SALE_CHANNELS.find(c=>c.id===el.value),f=$('#entry-form');
  if(selected){
   f.elements.method.value=selected.method;
   const description=$('#sale-method-description');
   if(description)description.textContent=selected.group+' · '+selected.name;
   if(!editorEntry&&f.elements.recordPayment){
    const isCard=selected.method==='card';
    f.elements.recordPayment.checked=!isCard;
    $('#initial-payment-fields').classList.toggle('hidden',isCard);
    f.elements.accountId.value=selected.method==='cash'?'cash':'bank';
   }
  }
 }
 if(el.id==='entry-category-choice'){const custom=$('#entry-category-custom');custom.classList.toggle('hidden',el.value!=='__custom__');custom.required=el.value==='__custom__';if(el.value==='__custom__')custom.focus();}
 if(el.id==='record-payment')$('#initial-payment-fields').classList.toggle('hidden',!el.checked);
 if(el.name==='method'&&$('#entry-form')?.contains(el)){
  const f=$('#entry-form'),method=el.value;
  if(f.elements.recordPayment&&!editorEntry&&editorType==='expense'){
   const settleLater=['repCard','personalCard'].includes(method);
   f.elements.recordPayment.checked=!settleLater;
   $('#initial-payment-fields').classList.toggle('hidden',settleLater);
   if(method==='cash')f.elements.accountId.value='cash';else if(method==='bank'||method==='card')f.elements.accountId.value='bank';
  }
 }
 if(el.id==='ledger-status'||el.id==='ledger-method'){ui.filters[el.id==='ledger-status'?'status':'method']=el.value;renderContent();}
 if(el.id==='period-value'){if(!el.value)return;ui[ui.period==='day'?'day':'month']=el.value;calendarField=null;renderPeriod();renderContent();}
 if(el.id==='period-start'||el.id==='period-end'){if(!el.value)return;const start=el.id==='period-start'?el.value:ui.start,end=el.id==='period-end'?el.value:ui.end;if(start>end){toast('시작일은 종료일보다 늦을 수 없습니다.');renderPeriod();return;}ui.start=start;ui.end=end;calendarField=null;renderPeriod();renderContent();}
});
listen('pointerdown',event=>{if(calendarField&&!event.target.closest('#period-inputs')){calendarField=null;renderPeriod();}});
listen('keydown',event=>{if(calendarField&&event.key==='Escape'){event.preventDefault();calendarField=null;renderPeriod();root.querySelector('[data-calendar-toggle]')?.focus();}});
listen('input',event=>{if(event.target.id==='ledger-search'){const position=event.target.selectionStart;ui.filters.search=event.target.value;renderContent();const input=$('#ledger-search');input.focus();input.setSelectionRange(position,position);}});
$('#confirm-ok').addEventListener('click',()=>{const action=confirmCallback;confirmCallback=null;$('#confirm-dialog').close();action?.();});$('#confirm-cancel').addEventListener('click',()=>$('#confirm-dialog').close());
for(const dialog of root.querySelectorAll('dialog'))dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
if(!workspaceOptions.embedded)listenWindow('hashchange',()=>{const id=location.hash.slice(1);if(NAV.some(n=>n.id===id)){ui.page=id;ui.filters={search:'',status:'',method:''};renderPage();}});
listenWindow('storage',event=>{if(event.key===STORAGE_KEY)toast('다른 탭에서 내용이 변경되었습니다. 새로고침하면 반영됩니다.');});

listen('submit',event=>{if(event.target.id==='closing-form'){event.preventDefault();submitClosing('closed');}});
listen('input',event=>{
 if(!event.target.closest('#closing-form'))return;const f=$('#closing-form'),sales=dailySales(state,ui.day),summary=state.entries.filter(e=>e.type==='refund'&&e.businessDate===ui.day).reduce((n,e)=>n+e.amount,0);
 const values=['card','cash','bank'].map(k=>Number(f.elements[k].value)||0),storeTotal=values.reduce((a,b)=>a+b,0),infoTotal=(Number(f.elements.infoCard.value)||0)+(Number(f.elements.infoBank.value)||0);$('#closing-total').textContent=money(storeTotal+infoTotal-summary)+'원';
 $('#closing-store').textContent=money(storeTotal)+'원';$('#closing-info').textContent=money(infoTotal)+'원';
 const currentCash=state.closings?.[ui.day]?.expectedCash;
 let expectedCash;try{const next=saveDayClosing(state,ui.day,{card:values[0],cash:values[1],bank:values[2],infoCard:f.elements.infoCard.value,infoBank:f.elements.infoBank.value,actualCash:'',note:'',status:'draft'});expectedCash=next.closings[ui.day].expectedCash;}catch{expectedCash=currentCash;}
 $('#closing-expected').textContent=money(expectedCash)+'원';$('#closing-difference').textContent=f.elements.actualCash.value===''||expectedCash==null?'미입력':money(Number(f.elements.actualCash.value)-expectedCash)+'원';
});

renderPage();updateModeBanner();refreshServer();if(loadMessage)toast(loadMessage);
return {navigate(page){if(NAV.some(n=>n.id===page)&&ui.page!==page){ui.page=page;ui.filters={search:'',status:'',method:''};renderPage();}},canLeave(){return !saving&&!reportExporting&&(!root.querySelector('dialog[open]')||window.confirm('열려 있는 입력 창을 닫고 이동할까요?'));},refresh:refreshServer,destroy(){disposed=true;controller.abort();clearTimeout(toastTimer);}};
}

