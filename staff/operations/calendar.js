// Shared date picker for operations: saved entries, day closings, and linked payroll.
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const dayKey = value => value instanceof Date ? value.toISOString().slice(0,10) : value;
const shiftDay = (date, days) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0,10); };
export function markedDates(state) {
 // Completion is determined solely by a saved day-closing status.
 // Payroll and ordinary transactions do not imply that closing was completed.
 const dates = new Map();
 const mark = (date, type) => {
  if (!datePattern.test(String(date||''))) return;
  const item = dates.get(date)||{entries:0,payroll:0,closing:null};
  if (type==='entry') item.entries++;
  if (type==='payroll') item.payroll++;
  dates.set(date,item);
 };
 for (const entry of state?.entries||[]) mark(entry.businessDate,'entry');
 for (const salary of state?.payroll||[]) mark(salary.businessDate,'payroll');
 for (const [date,closing] of Object.entries(state?.closings||{})) {
  if (!closing||!datePattern.test(date)) continue;
  const item=dates.get(date)||{entries:0,payroll:0,closing:null};
  item.closing=closing.status==='closed'?'closed':'draft';
  dates.set(date,item);
 }
 return dates;
}

const calendarIcon='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v4m8-4v4M3 10h18"/><rect x="3" y="4" width="18" height="18" rx="2"/></svg>';
const caretIcon='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const labels = {day:'조회 일자',month:'조회 월',start:'조회 시작일',end:'조회 종료일'};
export function datePickerHtml({field,value,opened=false,viewMonth,counts=new Map(),today}) {
 const isMonth=field==='month';
 const label=labels[field]||'날짜';
 const display=String(value||'').replaceAll('-','.');
 const title=label+' 달력 '+(opened?'닫기':'열기');
 const trigger='<div class="operations-date-picker" data-picker-field="'+field+'"><button type="button" class="operations-date-trigger" data-calendar-toggle="'+field+'" aria-haspopup="dialog" aria-expanded="'+opened+'" aria-label="'+title+'">'+calendarIcon+'<time datetime="'+value+'">'+display+'</time><span class="picker-caret" aria-hidden="true">'+caretIcon+'</span></button>';
 if(!opened) return trigger+'</div>';
 const validMonth=/^\d{4}-\d{2}$/.test(viewMonth)?viewMonth:String(value).slice(0,7);
 const [year,month]=validMonth.split('-').map(Number);
 const first=validMonth+'-01';
 const firstWeekday=new Date(first+'T12:00:00Z').getUTCDay();
 const gridStart=shiftDay(first,-firstWeekday);
 const heads=['일','월','화','수','목','금','토'].map(x=>'<span class="operations-calendar-weekday">'+x+'</span>').join('');
 const days=Array.from({length:42},(_,i)=>{
  const date=shiftDay(gridStart,i),day=Number(date.slice(8)),info=counts.get(date);
  const n=info?(info.entries+info.payroll+(info.closing?1:0)):0;
  const status=info?.closing==='closed'?'closed':info?.closing==='draft'?'draft':n?'pending':'';
  const statusText=status==='closed'?'일마감 완료':status==='draft'?'일마감 임시 저장 · 미완료':status==='pending'?'일마감 미완료':'등록 기록 없음';
  const detail=info?' · 거래 '+info.entries+'건 · 직원급여 '+info.payroll+'건':'';
  const flags=[date.slice(0,7)===validMonth?'':'other-month',date===today?'today':'',isMonth?(date===value+'-01'?'selected':''):(date===value?'selected':''),n?'has-data':'',status?'status-'+status:''].filter(Boolean).join(' ');
  return '<button type="button" class="operations-calendar-day '+flags+'" data-calendar-day="'+date+'" aria-label="'+date+' · '+statusText+detail+'" title="'+date+' · '+statusText+detail+'" '+(date===value?'aria-current="date"':'')+'><span>'+day+'</span>'+(n?'<i class="operations-calendar-dot" aria-hidden="true"></i>':'')+'</button>';
 }).join('');
 const years=Array.from({length:201},(_,i)=>1900+i).map(y=>'<option value="'+y+'" '+(y===year?'selected':'')+'>'+y+'년</option>').join('');
 const months=Array.from({length:12},(_,i)=>i+1).map(m=>'<option value="'+m+'" '+(m===month?'selected':'')+'>'+m+'월</option>').join('');
 const directId=field==='day'||field==='month'?'period-value':field==='start'?'period-start':'period-end';
 const directType=isMonth?'month':'date';
 return trigger+'<div class="operations-calendar-popover" role="dialog" aria-label="'+label+' 달력"><div class="operations-calendar-heading"><strong>'+label+'</strong><button type="button" data-calendar-close="1" aria-label="달력 닫기" class="operations-calendar-x">×</button></div><div class="operations-calendar-monthbar"><button type="button" data-calendar-nav="-1" aria-label="이전 달">‹</button><div class="operations-calendar-selects"><select data-calendar-year aria-label="달력 연도">'+years+'</select><select data-calendar-month aria-label="달력 월">'+months+'</select></div><button type="button" data-calendar-nav="1" aria-label="다음 달">›</button></div><div class="operations-calendar-grid">'+heads+days+'</div><div class="operations-calendar-legend" aria-label="달력 상태 범례"><span><i class="closed" aria-hidden="true"></i>마감 완료</span><span><i class="draft" aria-hidden="true"></i>임시 저장</span><span><i class="pending" aria-hidden="true"></i>미마감</span></div>'+(isMonth?'<button type="button" class="operations-calendar-apply" data-calendar-apply-month="1">이 달 조회</button>':'')+'<label class="operations-calendar-direct">'+label+' 직접 입력<input id="'+directId+'" type="'+directType+'" value="'+value+'" aria-label="'+label+' 직접 입력"></label></div></div>';
}
