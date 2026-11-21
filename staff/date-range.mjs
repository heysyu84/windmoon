// The first tap starts a new range. Either end can be picked first.
export function pickRangeDay(range, day) {
 if (!range.pickingEnd) return {start:day,end:day,pickingEnd:true};
 return {start:day<range.start?day:range.start,end:day<range.start?range.start:day,pickingEnd:false};
}
export function rangeLabel(start,end) {
 const full=date=>date.replaceAll('-','.');
 if(start===end)return full(start);
 return full(start)+' – '+full(start.slice(0,4)===end.slice(0,4)?end.slice(5):end);
}
