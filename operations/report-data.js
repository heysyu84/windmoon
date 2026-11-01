import {summarize,inRange,infoSaleId,isInfoTerminalSale,groupPayrollPeriod,paidAmount,outstanding} from './core.js?v=20261102-report';

export const REPORT_BASIS='매출·지출·급여는 영업일 기준, 카드 수수료는 정산일 기준입니다. 기타 입금과 자금 이동은 제외합니다.';
export const reportPeriod=range=>range.start===range.end?range.start:range.start+' ~ '+range.end;
export const closingLabel=day=>day.status==='closed'?'마감 완료':day.status==='draft'?'임시 저장':day.activity?'미마감':'정산만';
const sum=(rows,key)=>rows.reduce((n,row)=>n+row[key],0);
function validDate(value){const date=new Date(value+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;}

// This is a read-only projection. Saved ledger records and linked salaries stay intact.
export function buildReport(state,range){
 if(!validDate(range.start)||!validDate(range.end)||range.start>range.end)throw Error('조회 기간을 확인해 주세요.');
 const buckets=new Map(),allIds=new Set(state.entries.map(e=>e.id));
 const get=date=>{if(!buckets.has(date))buckets.set(date,{date,card:0,cash:0,bank:0,info:0,other:0,refund:0,expenses:0,fees:0,payroll:0,activity:false,status:null});return buckets.get(date);};
 const sales=[],expenses=[],fees=[];
 for(const entry of state.entries){
  if(inRange(entry.businessDate,range)&&['sale','refund','expense'].includes(entry.type)){
   const day=get(entry.businessDate);day.activity=true;
   if(entry.type==='sale'){
    const key=isInfoTerminalSale(entry)?'info':['card','cash','bank'].includes(entry.method)?entry.method:'other';
    day[key]+=entry.amount;sales.push({...entry});
   }else if(entry.type==='refund'){day.refund+=entry.amount;sales.push({...entry});}
   else{day.expenses+=entry.amount;expenses.push({...entry});}
  }
  // Fees can settle outside the sale's business-date range.
  if(entry.type!=='transfer')for(const payment of entry.payments||[])if(payment.fee&&inRange(payment.date,range)){
   get(payment.date).fees+=payment.fee;
   fees.push({businessDate:payment.date,title:entry.title+' · 정산 수수료',category:'카드 수수료',partner:entry.partner||'',amount:payment.fee,method:'bank',note:'정산일 기준'});
  }
 }
 for(const [date,closing] of Object.entries(state.closings||{}))if(inRange(date,range)){
  const day=get(date);day.activity=true;day.status=closing.status==='closed'?'closed':'draft';
  // Older closings stored info-terminal sales only in the closing object.
  if(Number(closing.info)>0&&!allIds.has(infoSaleId(date))){
   day.info+=Number(closing.info);
   sales.push({id:infoSaleId(date),type:'sale',businessDate:date,title:'인포 단말기 매출 · 일마감',category:'인포 단말기 매출',partner:'인포 단말기',amount:Number(closing.info),method:'card',payments:[],note:'과거 일마감 자료'});
  }
 }
 const payroll=state.payroll.filter(row=>inRange(row.businessDate,range));
 for(const row of payroll){if(!row.advanceOnly||row.amount){const day=get(row.businessDate);day.payroll+=row.amount;day.activity=true;}}
 const daily=[...buckets.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(day=>({...day,revenue:day.card+day.cash+day.bank+day.info+day.other-day.refund,costs:day.expenses+day.fees,totalCosts:day.expenses+day.fees+day.payroll,profit:day.card+day.cash+day.bank+day.info+day.other-day.refund-day.expenses-day.fees-day.payroll}));
 const totals=Object.fromEntries(['card','cash','bank','info','other','refund'].map(key=>[key,sum(daily,key)]));
 const summary=Object.fromEntries(Object.entries(summarize(state,range)).map(([key,value])=>[key,typeof value==='number'&&value===0?0:value]));
 const unclosed=daily.filter(day=>day.activity&&day.status!=='closed').length;
 const payrollGroups=groupPayrollPeriod(payroll).map(row=>({...row,paid:paidAmount(row),pending:outstanding(row)}));
 const byDate=(a,b)=>a.businessDate.localeCompare(b.businessDate)||(a.title||'').localeCompare(b.title||'','ko');
 return {range:{...range},period:reportPeriod(range),summary,totals,daily,unclosed,closed:daily.filter(day=>day.status==='closed').length,activityDays:daily.filter(day=>day.activity).length,sales:sales.sort(byDate),expenses:[...expenses,...fees].sort(byDate),payrollGroups,payrollUnavailable:!!state.integration?.error,stale:!!state.integration?.stale,demo:!!state.integration?.demo};
}

export function assertReportReady(report){if(report.payrollUnavailable)throw Error('급여 자료를 연결한 뒤 내보내 주세요. 상단의 서버 새로고침을 눌러 주세요.');}

export function reportSheets(report){
 assertReportReady(report);
 const {summary:s,totals:t}=report;
 const notice=[report.demo?'예시 자료':'실제 장부',report.unclosed?'미마감 '+report.unclosed+'일 포함':report.activityDays?'마감 확인 완료':'영업 기록 없음',report.stale?'이전 급여 연결 자료 사용':''].filter(Boolean).join(' · ');
 const sheet=(name,headers,rows)=>({name,headerRow:2,rows:[['WINDMOON · 운영보고서 · '+report.period],[notice],headers,...rows]});
 return [
  sheet('기간요약',['항목','금액·내용'],[
   ['카드 매출',t.card],['현금 매출',t.cash],['계좌이체 매출',t.bank],['인포 단말기 매출',t.info],...(t.other?[['기타 매출',t.other]]:[]),['환불',-t.refund],['매출 합계',s.revenue],['일반 지출',s.expenses],['직원 급여',s.payrollAccrued],['카드 정산 수수료',s.fees],['비용 합계',s.totalCosts],['운영수익',s.profit],['미지급 지출·환불',s.payables],['미지급 직원 급여',s.payrollPending],['미수 매출',s.receivables],['집계 기준',REPORT_BASIS],['급여 기준','선택 기간 근무분의 공제 후 지급대상액. 선지급과 잔금은 비용에 중복 합산하지 않습니다.'],['직원급여 시트의 지급액','선택 기간 근무분에 연결된 지급 누계. 실제 이체일 기준 합계와 다를 수 있습니다.'],['운영수익','등록된 자료를 기준으로 한 참고 집계입니다.']]),
  sheet('일자별',['영업일','카드 매출','현금 매출','계좌이체 매출','인포 단말기 매출','기타 매출','환불','매출 합계','일반 지출','카드 수수료','직원 급여','비용 합계','운영수익','마감 상태'],report.daily.map(d=>[d.date,d.card,d.cash,d.bank,d.info,d.other,-d.refund,d.revenue,d.expenses,d.fees,d.payroll,d.totalCosts,d.profit,closingLabel(d)])),
  sheet('매출내역',['영업일','구분','거래 내용','분류','결제수단','거래처','매출액','비고'],report.sales.map(e=>[e.businessDate,e.type==='refund'?'환불':'매출',e.title,e.category||'',isInfoTerminalSale(e)?'인포 단말기':({card:'카드',cash:'현금',bank:'계좌이체'}[e.method]||'기타'),e.partner||'',e.type==='refund'?-e.amount:e.amount,e.note||''])),
  sheet('지출내역',['영업일','거래 내용','분류','거래처','지출액','비고'],report.expenses.map(e=>[e.businessDate,e.title,e.category||'',e.partner||'',e.amount,e.note||''])),
  sheet('직원급여',['직원','팀','직책','근무일수','발생 급여','선지급 포함 지급액','미지급액'],report.payrollGroups.map(e=>[e.employee,e.team,e.role,e.workDays,e.amount,e.paid,e.pending]))
 ];
}
