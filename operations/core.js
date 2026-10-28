export const STORAGE_KEY = 'windmoon-operations-demo-v1';
export const STAFF_URL = new URL('../staff/', import.meta.url).href;
export const ACCOUNTS = [{id:'cash',name:'현금 시재',short:'현금',icon:'wallet'},{id:'bank',name:'운영계좌',short:'계좌',icon:'bank'}];
export const CATEGORIES = {sale:['보틀·세트','칵테일·샷','입장료','인포 매출','기타 매출'],expense:['주류 매입','임대료','공과금','소모품','광고·홍보','식비·복리후생','기타 지출'],funding:['대표자 입금','차입금','기타 입금'],refund:['매출 환불'],transfer:['자금 이동']};
export const TYPE_NAMES = {sale:'매출',expense:'지출',funding:'기타 입금',transfer:'자금 이동',refund:'매출 환불'};
export function localDate(now=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function shiftDate(date,delta){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10);}
export function monthRange(month){const [y,m]=month.split('-').map(Number);return {start:month+'-01',end:new Date(Date.UTC(y,m,0)).toISOString().slice(0,10)};}
export function inRange(date,range){return !!date && date>=range.start && date<=range.end;}
export function paidAmount(entry){return (entry.payments||[]).reduce((n,p)=>n+p.amount,0);}
export function outstanding(entry){return Math.max(0,Number.isFinite(entry.sourceBalance)?entry.sourceBalance:entry.amount-paidAmount(entry));}
export function payrollBalance(entry){return Number.isFinite(entry.sourceBalance)?entry.sourceBalance:entry.amount-paidAmount(entry);}
export function pendingPayroll(rows){const balances=new Map();for(const e of rows){const key=e.employeeId||e.employee;balances.set(key,(balances.get(key)||0)+payrollBalance(e));}return [...balances.values()].reduce((n,v)=>n+Math.max(0,v),0);}
// Keep the same job precedence and Korean name ordering as staff/lib/domain.ts.
export const STAFF_ROLES=['사장','부사장','운영이사','영업이사','점장','바텐더','홀담당','인포','DJ','드랙퀸','알바','PR'];
export function comparePayrollStaff(a,b){
 const teamRank=e=>e.team==='운영팀'?0:e.team==='영업팀'?1:2;
 const jobRank=e=>{const rank=STAFF_ROLES.indexOf(e.role);return rank<0?99:rank;};
 return teamRank(a)-teamRank(b)||jobRank(a)-jobRank(b)||(a.employee||'').localeCompare(b.employee||'','ko');
}
export function groupPayrollPeriod(rows){
 const groups=new Map();
 for(const row of rows){
  const key=row.employeeId||row.employee;
  let group=groups.get(key);
  if(!group){group={id:'employee:'+key,employeeId:key,employee:row.employee,team:row.team,role:row.role,businessDate:row.businessDate,amount:0,sourceBalance:0,payments:[],days:new Set(),sourceCount:0};groups.set(key,group);}
  if(row.businessDate>group.businessDate){group.employee=row.employee;group.team=row.team;group.role=row.role;group.businessDate=row.businessDate;}
  group.amount+=row.amount;group.sourceBalance+=payrollBalance(row);group.payments.push(...row.payments);group.sourceCount++;
  if(!row.advanceOnly)group.days.add(row.businessDate);
 }
 return [...groups.values()].map(({days,...group})=>({...group,workDays:days.size})).sort(comparePayrollStaff);
}
export function savedVendors(state){return [...new Set(state.vendors||[])].sort((a,b)=>a.localeCompare(b,'ko'));}
export function paymentStatus(entry){return entry.type==='transfer'||outstanding(entry)===0?'paid':paidAmount(entry)>0?'partial':'pending';}
export function revenueValue(entry){return entry.type==='sale'?entry.amount:entry.type==='refund'?-entry.amount:0;}
export function entrySign(entry){return entry.type==='expense'||entry.type==='refund'?-1:1;}
export function accountBalances(state,end='9999-12-31'){
 const balances={...state.openingBalances},since=state.openingDate||'0000-01-01';
 if(end<since)return Object.fromEntries(ACCOUNTS.map(a=>[a.id,null]));
 for(const e of state.entries){
  if(e.type==='transfer'){
   if(e.paymentDate>=since&&e.paymentDate<=end){balances[e.fromAccount]-=e.amount;balances[e.toAccount]+=e.amount;}
  }else for(const p of e.payments||[])if(p.date>=since&&p.date<=end)balances[p.accountId]+=entrySign(e)*p.amount-(p.fee||0);
 }
 for(const p of state.payroll)for(const pay of p.payments||[])if(pay.date>=since&&pay.date<=end)balances[pay.accountId]-=pay.amount;
 return balances;
}
export function cashEvents(state,range){
 const events=[];
 for(const e of state.entries){
  if(e.type==='transfer'){
   if(inRange(e.paymentDate,range))events.push({id:e.id,type:'transfer',date:e.paymentDate,title:e.title,partner:e.partner,amount:e.amount,accountId:e.fromAccount,toAccount:e.toAccount,entryId:e.id});
  }else for(const p of e.payments||[])if(inRange(p.date,range)){
   events.push({id:p.id,type:e.type,date:p.date,title:e.title,partner:e.partner,amount:entrySign(e)*p.amount,accountId:p.accountId,entryId:e.id});
   if(p.fee)events.push({id:p.id+'-fee',type:'fee',date:p.date,title:'카드 정산 수수료',partner:e.partner,amount:-p.fee,accountId:p.accountId,entryId:e.id});
  }
 }
 for(const e of state.payroll)for(const p of e.payments||[])if(inRange(p.date,range))events.push({id:p.id,type:'payroll',date:p.date,title:e.employee+' · '+(p.kind==='advance'?'선지급':'급여 지급'),partner:e.team,amount:-p.amount,accountId:p.accountId,payrollId:e.id});
 return events.sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
}
export function summarize(state,range){
 const entries=state.entries.filter(e=>inRange(e.businessDate,range));
 const payroll=state.payroll.filter(e=>inRange(e.businessDate,range));
 const revenue=entries.reduce((n,e)=>n+revenueValue(e),0);
 const expenses=entries.filter(e=>e.type==='expense').reduce((n,e)=>n+e.amount,0);
 const payrollAccrued=payroll.reduce((n,e)=>n+e.amount,0);
 const events=cashEvents(state,range);
 const fees=-events.filter(e=>e.type==='fee').reduce((n,e)=>n+e.amount,0);
 const inflow=events.filter(e=>e.type!=='transfer'&&e.amount>0).reduce((n,e)=>n+e.amount,0);
 const outflow=-events.filter(e=>e.type!=='transfer'&&e.amount<0).reduce((n,e)=>n+e.amount,0);
 const receivables=entries.filter(e=>e.type==='sale').reduce((n,e)=>n+outstanding(e),0);
 const payables=entries.filter(e=>e.type==='expense'||e.type==='refund').reduce((n,e)=>n+outstanding(e),0);
 const payrollPending=pendingPayroll(payroll);
 const payrollPaid=-events.filter(e=>e.type==='payroll').reduce((n,e)=>n+e.amount,0);
 const balances=accountBalances(state,range.end);
 return {revenue,expenses,payrollAccrued,fees,totalCosts:expenses+payrollAccrued+fees,profit:revenue-expenses-payrollAccrued-fees,receivables,payables,payrollPending,payrollPaid,inflow,outflow,netflow:inflow-outflow,balances,totalBalance:range.end<(state.openingDate||'0000-01-01')?null:Object.values(balances).reduce((a,b)=>a+b,0),entryCount:entries.length,payrollCount:payroll.length};
}
export function costGroups(state,range){
 const totals={};
 for(const e of state.entries)if(e.type==='expense'&&inRange(e.businessDate,range))totals[e.category]=(totals[e.category]||0)+e.amount;
 const s=summarize(state,range);
 if(s.payrollAccrued)totals['인건비']=s.payrollAccrued;
 if(s.fees)totals['카드 수수료']=s.fees;
 return Object.entries(totals).map(([name,amount])=>({name,amount})).sort((a,b)=>b.amount-a.amount);
}
export function addPayment(entry,payment){
 const amount=Number(payment.amount),fee=Number(payment.fee||0);
 if(!Number.isSafeInteger(amount)||amount<=0||amount>outstanding(entry))throw new Error('남은 금액 안에서 지급·입금액을 입력해 주세요.');
 if(!ACCOUNTS.some(a=>a.id===payment.accountId))throw new Error('계좌를 선택해 주세요.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(payment.date))throw new Error('입출금일을 선택해 주세요.');
 if(!Number.isSafeInteger(fee)||fee<0||fee>=amount)throw new Error('수수료는 정산 금액보다 작아야 합니다.');
 return {...entry,payments:[...(entry.payments||[]),{...payment,amount,fee}]};
}
export function validateEntry(e){
 if(!TYPE_NAMES[e.type])throw new Error('거래 종류를 선택해 주세요.');
 if(!e.title?.trim())throw new Error('거래 내용을 입력해 주세요.');
 if(!Number.isSafeInteger(e.amount)||e.amount<=0||e.amount>99999999999)throw new Error('금액은 1원 이상 정수로 입력해 주세요.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(e.businessDate))throw new Error('영업일을 선택해 주세요.');
 if(e.type==='transfer'){
  if(!ACCOUNTS.some(a=>a.id===e.fromAccount)||!ACCOUNTS.some(a=>a.id===e.toAccount)||e.fromAccount===e.toAccount)throw new Error('서로 다른 출금·입금 계좌를 선택해 주세요.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(e.paymentDate))throw new Error('이동일을 선택해 주세요.');
 }else{
  let amount=0;
  for(const p of e.payments||[]){
   if(!ACCOUNTS.some(a=>a.id===p.accountId)||!Number.isSafeInteger(p.amount)||p.amount<=0||!/^\d{4}-\d{2}-\d{2}$/.test(p.date))throw new Error('입출금 내역을 확인해 주세요.');
   if(!Number.isSafeInteger(p.fee||0)||(p.fee||0)<0||(p.fee||0)>=p.amount)throw new Error('수수료를 확인해 주세요.');
   amount+=p.amount;
  }
  if(amount>e.amount)throw new Error('거래금액이 이미 입금·지급한 금액보다 작을 수 없습니다.');
 }
 return e;
}
export function makeDemo(today=localDate()){
 const entries=[],payroll=[];
 let counter=0;
 const payment=(date,amount,accountId='bank',fee=0)=>({id:'sample-pay-'+(++counter),date,amount,accountId,fee});
 const day=n=>shiftDate(today,-n);
 for(let i=13;i>=0;i--){
  const date=day(i),idx=13-i,card=420000+(idx%5)*135000,cash=180000+(idx%4)*75000,bank=140000+(idx%3)*90000;
  entries.push({id:'sale-card-'+idx,type:'sale',title:'카드 매출 일마감',businessDate:date,category:'보틀·세트',method:'card',partner:'카드 매출',note:'예시 매출 · 영업일 합계',amount:card,payments:i>=3?[payment(day(i-2),card,'bank',Math.round(card*.022))]:[]});
  entries.push({id:'sale-cash-'+idx,type:'sale',title:'현금 매출 일마감',businessDate:date,category:'칵테일·샷',method:'cash',partner:'현장 매출',note:'',amount:cash,payments:[payment(date,cash,'cash')]});
  entries.push({id:'sale-bank-'+idx,type:'sale',title:'보틀·테이블 이체 매출',businessDate:date,category:'보틀·세트',method:'bank',partner:idx===12?'테이블 A':'현장 매출',note:idx===12?'잔금 입금 예정':'',amount:bank,payments:idx===12?[payment(date,80000)]:[payment(date,bank)]});
  for(const [j,employee,team,role,amount] of [[0,'김직원','운영팀','매니저',130000],[1,'이직원','운영팀','스태프',90000],[2,'박직원','영업팀','영업',110000]]){
   const advance=idx===12&&j===2?payment(date,40000,'cash'):null;
   const pays=advance?[{...advance,kind:'advance'}]:i>=2?[{...payment(date,amount,j===1?'cash':'bank'),kind:'final'}]:[];
   payroll.push({id:'payroll-'+idx+'-'+j,employee,team,role,amount,businessDate:date,payments:pays,sourceId:'DEMO-'+idx+'-'+j});
  }
 }
 const expense=(id,title,category,amount,date,partner,pays,note='')=>entries.push({id,type:'expense',title,category,amount,businessDate:date,partner,method:'bank',payments:pays,note});
 expense('expense-liquor-1','주류 정기 발주','주류 매입',1280000,day(10),'풍월주류',[payment(day(10),1280000)]);
 expense('expense-liquor-2','주류 추가 발주','주류 매입',870000,day(3),'풍월주류',[payment(day(3),400000)],'잔금 지급 예정');
 expense('expense-rent','매장 임대료','임대료',1800000,day(12),'건물 관리실',[payment(day(12),1800000)]);
 expense('expense-utilities','전기·수도요금','공과금',420000,day(7),'공과금',[payment(day(7),420000)]);
 expense('expense-supplies','컵·냅킨·청소용품','소모품',126000,day(5),'소모품 거래처',[payment(day(5),126000)]);
 expense('expense-food','직원 식사','식비·복리후생',54000,day(1),'직원 식사',[payment(day(1),54000,'cash')]);
 expense('expense-ad','주말 홍보비','광고·홍보',150000,day(2),'홍보 거래처',[]);
 entries.push({id:'funding-1',type:'funding',title:'운영자금 입금',category:'대표자 입금',businessDate:day(11),partner:'대표자',amount:1000000,method:'bank',note:'매출에 포함되지 않는 기타 입금',payments:[payment(day(11),1000000)]});
 entries.push({id:'transfer-1',type:'transfer',title:'현금 매출 계좌 입금',category:'자금 이동',businessDate:day(4),paymentDate:day(4),fromAccount:'cash',toAccount:'bank',amount:800000,partner:'',note:'매출·비용에 중복 반영하지 않음',payments:[]});
 entries.push({id:'refund-1',type:'refund',title:'예약 취소 환불',category:'매출 환불',businessDate:day(6),method:'bank',partner:'예약 고객',amount:80000,note:'',payments:[payment(day(6),80000)]});
 return {version:1,demoDate:today,openingBalances:{cash:350000,bank:4200000},entries,payroll,customCategories:[],staffUrl:STAFF_URL};
}
export function parseStored(raw){
 const value=JSON.parse(raw);
 if(value?.version!==1||!Array.isArray(value.entries)||!Array.isArray(value.payroll)||!value.openingBalances||!ACCOUNTS.every(a=>Number.isSafeInteger(value.openingBalances[a.id])))throw new Error('저장 형식을 확인할 수 없습니다.');
 value.entries.forEach(validateEntry);
 for(const p of value.payroll){if(!Number.isSafeInteger(p.amount)||p.amount<=0||!Array.isArray(p.payments))throw new Error('급여 자료를 확인할 수 없습니다.');validateEntry({...p,type:'expense',title:p.employee});}
 return value;
}

export function makeEmpty(today=localDate()){
 return {version:1,demoDate:today,openingDate:today.slice(0,7)+'-01',openingBalances:{cash:0,bank:0},entries:[],payroll:[],closings:{},customCategories:[],vendors:[],staffUrl:STAFF_URL};
}
export const dayClosed=(state,date)=>state.closings?.[date]?.status==='closed';
export function dailySales(state,date){return Object.fromEntries(['card','cash','bank'].map(method=>[method,state.entries.filter(e=>e.type==='sale'&&e.businessDate===date&&e.method===method).reduce((n,e)=>n+e.amount,0)]));}
export function saveDayClosing(state,date,input){
 if(dayClosed(state,date))throw Error('마감된 영업일입니다. 먼저 마감을 다시 열어 주세요.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('영업일을 확인해 주세요.');
 const entries=[...state.entries],now=new Date().toISOString();
 for(const method of ['card','cash','bank']){
  const total=Number(input[method]);if(!Number.isSafeInteger(total)||total<0||total>99999999999)throw Error('매출은 0원 이상의 정수로 입력해 주세요.');
  const manual=entries.filter(e=>e.type==='sale'&&e.businessDate===date&&e.method===method&&e.closingDate!==date).reduce((n,e)=>n+e.amount,0);
  if(total<manual)throw Error(({card:'카드',cash:'현금',bank:'이체'}[method])+' 매출은 이미 등록된 개별 매출 '+manual.toLocaleString('ko-KR')+'원 이상이어야 합니다. 개별 거래를 먼저 수정해 주세요.');
  const amount=total-manual,id=`closing:${date}:${method}`,index=entries.findIndex(e=>e.id===id),old=index<0?null:entries[index];
  if(!amount){if(old&&old.payments.some(p=>p.kind!=='closing'))throw Error('정산 기록이 있는 일마감 매출은 상세에서 입출금을 먼저 정리해 주세요.');if(index>=0)entries.splice(index,1);continue;}
  const payments=method==='card'?(old?.payments||[]):old?.payments.some(p=>p.kind!=='closing')?old.payments:[{id:'settle:'+id,date,amount,accountId:method==='cash'?'cash':'bank',fee:0,kind:'closing'}];
  const record={id,type:'sale',title:({card:'카드',cash:'현금',bank:'이체'}[method])+' 매출 · 일마감',businessDate:date,category:'일마감 매출',method,partner:'일마감',note:'영업일 합계 중 개별 매출을 제외한 금액',amount,payments,closingDate:date};
  validateEntry(record);if(index<0)entries.push(record);else entries[index]=record;
 }
 const info=Number(input.info??0),gross=Number(input.card)+Number(input.cash)+Number(input.bank);
 if(!Number.isSafeInteger(info)||info<0||info>99999999999)throw Error('인포 매출은 0원 이상의 정수로 입력해 주세요.');
 if(info>gross)throw Error('인포 매출은 카드·현금·계좌이체 매출 합계보다 클 수 없습니다.');
 const actualCash=input.actualCash===''||input.actualCash==null?null:Number(input.actualCash);
 if(actualCash!==null&&(!Number.isSafeInteger(actualCash)||actualCash<0))throw Error('실제 현금은 0원 이상의 정수로 입력해 주세요.');
 const next={...state,entries,closings:{...(state.closings||{})}},sum=summarize(next,{start:date,end:date});
 next.closings[date]={date,status:input.status==='draft'?'draft':'closed',card:Number(input.card),cash:Number(input.cash),bank:Number(input.bank),info,actualCash,expectedCash:sum.balances.cash,difference:actualCash===null?null:sum.balances.cash==null?null:actualCash-sum.balances.cash,note:String(input.note||'').slice(0,500),savedAt:now,closedAt:input.status==='draft'?null:now};
 return next;
}
export function validateWorkspace(input,previous=null){
 if(!input||input.version!==1||!Array.isArray(input.entries)||input.entries.length>20000)throw Error('장부 형식을 확인해 주세요.');
 const clone=JSON.parse(JSON.stringify(input));
 if(!clone.openingBalances||!ACCOUNTS.every(a=>Number.isSafeInteger(clone.openingBalances[a.id])&&Math.abs(clone.openingBalances[a.id])<=1000000000000))throw Error('기초 잔액을 확인해 주세요.');
 const ids=new Set(),pids=new Set();
 for(const e of clone.entries){
  validateEntry(e);
  if(typeof e.id!=='string'||!e.id||e.id.length>150||ids.has(e.id))throw Error('거래 번호가 올바르지 않거나 중복됐습니다.');ids.add(e.id);
  for(const field of ['title','category','partner','note'])if(typeof e[field]!=='string'||e[field].length>(field==='note'?1000:150))throw Error('거래 내용과 비고 길이를 확인해 주세요.');
  if(e.type!=='transfer'&&!['card','cash','bank'].includes(e.method))throw Error('결제수단을 확인해 주세요.');
  if((e.payments||[]).length>500)throw Error('입출금 기록이 너무 많습니다.');
  for(const p of e.payments||[]){if(typeof p.id!=='string'||!p.id||p.id.length>200||pids.has(p.id))throw Error('입출금 기록 번호가 중복됐습니다.');pids.add(p.id);}
 }
 const closings=clone.closings||{};
 if(typeof closings!=='object'||Array.isArray(closings)||Object.keys(closings).length>10000)throw Error('마감 형식을 확인해 주세요.');
 for(const [date,c] of Object.entries(closings)){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||c.date!==date||!['draft','closed'].includes(c.status)||['card','cash','bank'].some(k=>!Number.isSafeInteger(c[k])||c[k]<0)||typeof c.note!=='string'||c.note.length>500)throw Error('마감 내용을 확인해 주세요.');
  if(c.info!==undefined&&(!Number.isSafeInteger(c.info)||c.info<0||c.info>c.card+c.cash+c.bank))throw Error('인포 매출 금액을 확인해 주세요.');
 }
 if(previous){
  for(const e of previous.entries){
   if(!dayClosed(previous,e.businessDate)||!dayClosed({closings},e.businessDate))continue;
   const next=clone.entries.find(n=>n.id===e.id);
   const signature=x=>JSON.stringify({...x,payments:[]});
   if(!next||signature(next)!==signature(e))throw Error('마감된 영업일의 거래는 일마감에서 마감을 다시 연 뒤 수정해 주세요.');
  }
  for(const e of clone.entries)if(dayClosed(previous,e.businessDate)&&dayClosed({closings},e.businessDate)&&!previous.entries.some(p=>p.id===e.id))throw Error('마감된 영업일에 거래를 추가하려면 먼저 마감을 다시 열어 주세요.');
  for(const [date,c] of Object.entries(previous.closings||{}))if(c.status==='closed'&&!closings[date])throw Error('마감 내역은 삭제할 수 없습니다. 다시 열기를 이용해 주세요.');
 }
 if(clone.openingDate&&!/^\d{4}-\d{2}-\d{2}$/.test(clone.openingDate))throw Error('기초 잔액 기준일을 확인해 주세요.');
 const categories=Array.isArray(clone.customCategories)?clone.customCategories:[];
 if(categories.length>30||categories.some(c=>typeof c!=='string'||c.length>50))throw Error('추가 분류를 확인해 주세요.');
 if(clone.vendors!==undefined&&!Array.isArray(clone.vendors))throw Error('고정 거래처 목록을 확인해 주세요.');
 const vendors=clone.vendors||[];
 if(vendors.length>100||vendors.some(v=>typeof v!=='string'||!v.trim()||v.trim().length>60))throw Error('고정 거래처는 이름당 60자 이내, 최대 100개까지 등록할 수 있습니다.');
 return {version:1,demoDate:typeof clone.demoDate==='string'?clone.demoDate:localDate(),openingDate:clone.openingDate||'1900-01-01',openingBalances:{cash:clone.openingBalances.cash,bank:clone.openingBalances.bank},entries:clone.entries,payroll:[],closings,customCategories:[...new Set(categories.map(c=>c.trim()).filter(Boolean))],vendors:[...new Set(vendors.map(v=>v.trim()))],staffUrl:STAFF_URL};
}

