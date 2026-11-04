// Standalone dependency-free PDF renderer for Windmoon expense registers.
// Canvas is used so Korean text and the report logo render consistently across PDF viewers.
const W=595.28,H=841.89,M=36,AREA=W-2*M,SCALE=3;
const palette={ink:'#233c30',muted:'#748575',pale:'#f1f5ef',line:'#dce5d9',white:'#ffffff',red:'#a65d48'};
const fmt=n=>new Intl.NumberFormat('ko-KR').format(Number(n)||0);
const str=x=>String(x??'');
const periodText=report=>report.mode==='personal'?'전체 기간 · 미정산 우선':report.period;
async function loadLogo(){
 try{const img=new Image();img.decoding='async';img.src=new URL('./assets/workspace-report-a-400-600.png',import.meta.url).href;await img.decode();return img;}catch{return null;}
}
function text(ctx,value,x,y,size=10,{bold=false,color=palette.ink,right=false,maxWidth}={}){
 ctx.font=(bold?'600 ':'400 ')+size+'px Pretendard, sans-serif';
 ctx.fillStyle=color;
 let string=str(value);
 if(maxWidth){while(string.length>1&&ctx.measureText(string).width>maxWidth)string=string.slice(0,-2)+'…';}
 if(right)x-=ctx.measureText(string).width;
 ctx.fillText(string,x,y);
}
function rule(ctx,y){ctx.strokeStyle=palette.line;ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(M,y);ctx.lineTo(W-M,y);ctx.stroke();}
function newPage(logo,title,period,index){
 const canvas=document.createElement('canvas');canvas.width=Math.round(W*SCALE);canvas.height=Math.round(H*SCALE);
 const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw Error('PDF용 화면을 그릴 수 없습니다.');
 ctx.scale(SCALE,SCALE);ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
 if(logo){const ratio=Math.min(104/logo.width,56/logo.height);const w=logo.width*ratio,h=logo.height*ratio;ctx.drawImage(logo,M,H-40-h,w,h);}
 else text(ctx,'WINDMOON',M,H-64,16,{bold:true});
 text(ctx,title,M+126,H-65,20,{bold:true});
 text(ctx,period,M+127,H-87,9,{color:palette.muted,maxWidth:AREA-132});
 rule(ctx,H-111);
 return {canvas,ctx,index};
}
function drawCards(ctx,cards,y){
 const w=(AREA-20)/3;
 cards.forEach((card,i)=>{
  const x=M+i*(w+10),highlight=i===2;
  ctx.fillStyle=highlight?palette.ink:palette.pale;ctx.fillRect(x,y,w,72);
  text(ctx,card.label,x+12,y+23,9,{color:highlight?palette.white:palette.muted});
  text(ctx,fmt(card.value)+'원',x+12,y+53,16,{bold:true,color:highlight?palette.white:palette.ink,maxWidth:w-24});
 });
}
function columnsFor(report){
 if(report.mode==='personal')return [{title:'구매일',w:66},{title:'구매 내용 · 거래처',w:190},{title:'대납액',w:89,right:true},{title:'정산액',w:89,right:true},{title:'미정산',w:89,right:true}];
 return [{title:'영업일',w:62},{title:'거래 내용 · 거래처',w:150},{title:'지출항목',w:81},{title:'결제수단',w:86},{title:'지출액',w:72,right:true},{title:'미지급액',w:72,right:true}];
}
function drawTableHead(ctx,columns,y){
 ctx.fillStyle=palette.ink;ctx.fillRect(M,y,AREA,30);
 let x=M;
 columns.forEach(c=>{text(ctx,c.title,c.right?x+c.w-8:x+8,y+19,8.6,{bold:true,right:!!c.right,color:palette.white,maxWidth:c.w-14});x+=c.w;});
 return y+36;
}
function drawRow(ctx,report,columns,row,y,index){
 if(index%2===0){ctx.fillStyle=palette.pale;ctx.fillRect(M,y-3,AREA,29);}
 const unsettled=Math.max(0,row.amount-row.settled);
 const cells=report.mode==='personal'?
  [row.date,row.title,fmt(row.amount),fmt(row.settled),fmt(unsettled)]:
  [row.date,row.title,row.category,row.method,fmt(row.amount),fmt(unsettled)];
 let x=M;
 columns.forEach((c,i)=>{
  const isTitle=i===1, isImportant=i===columns.length-1, color=isImportant&&unsettled>0?palette.red:palette.ink;
  text(ctx,cells[i],c.right?x+c.w-8:x+8,y+12,8.8,{bold:isImportant,right:!!c.right,color,maxWidth:c.w-16});
  if(isTitle)text(ctx,row.partner||' ',x+8,y+24,7.7,{color:palette.muted,maxWidth:c.w-16});
  x+=c.w;
 });
 ctx.strokeStyle=palette.line;ctx.lineWidth=.3;ctx.beginPath();ctx.moveTo(M,y+29);ctx.lineTo(W-M,y+29);ctx.stroke();
}
function buildPages(report,logo){
 const pages=[],columns=columnsFor(report);
 let page=newPage(logo,report.mode==='personal'?'개인카드 대납 정산':'지출관리 내보내기',periodText(report),1),ctx=page.ctx;
 text(ctx,report.mode==='personal'?'미정산 거래는 조회 월과 관계없이 누적합니다.':'조회 기간의 등록 지출 · 정산 기준 / 단위: 원',M,133,9,{color:palette.muted});
 drawCards(ctx,report.mode==='personal'?
  [{label:'전체 누적 대납액',value:report.total},{label:'정산 완료 금액',value:report.settled},{label:'돌려받을 잔액',value:report.outstanding}]:
  [{label:'선택 기간 지출액',value:report.total},{label:'지급 기록액',value:report.settled},{label:'미지급액',value:report.outstanding}],153);
 text(ctx,'거래별 상세 내역',M,252,12,{bold:true});
 let y=drawTableHead(ctx,columns,265),count=0;
 const rows=report.rows||[];
 if(!rows.length)text(ctx,'조회된 지출 내역이 없습니다.',M+8,y+25,10,{color:palette.muted});
 for(const row of rows){
  if(y+34>H-74){pages.push(page);page=newPage(logo,report.mode==='personal'?'개인카드 대납 정산':'지출관리 내보내기',periodText(report),pages.length+1);ctx=page.ctx;y=drawTableHead(ctx,columns,129);count=0;}
  drawRow(ctx,report,columns,row,y,count++);y+=30;
 }
 pages.push(page);
 for(const [i,p] of pages.entries()){
  rule(p.ctx,45);
  text(p.ctx,'WINDMOON Workspace  ·  '+(report.demo?'예시 자료':'실제 장부'),M,30,8,{color:palette.muted});
  text(p.ctx,(i+1)+' / '+pages.length,W-M,30,8,{right:true,color:palette.muted});
 }
 return pages.map(p=>p.canvas);
}
function fromBase64(input){
 const raw=atob(input);const result=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)result[i]=raw.charCodeAt(i);
 return result;
}
function pdfFromCanvases(canvases){
 const encoder=new TextEncoder(),parts=[],offsets=[0];let size=0;
 const append=data=>{const bytes=typeof data==='string'?encoder.encode(data):data;parts.push(bytes);size+=bytes.length;};
 const object=(id,data,stream)=>{
  offsets[id]=size;append(id+' 0 obj\n');
  append(data);
  if(stream){append('\nstream\n');append(stream);append('\nendstream');}
  append('\nendobj\n');
 };
 append('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
 object(1,'<< /Type /Catalog /Pages 2 0 R >>');
 object(2,'<< /Type /Pages /Kids ['+canvases.map((_,i)=>(3+3*i)+' 0 R').join(' ')+'] /Count '+canvases.length+' >>');
 canvases.forEach((canvas,i)=>{
  const id=3+i*3,content='q '+W+' 0 0 '+H+' 0 0 cm /Im0 Do Q\n',img=fromBase64(canvas.toDataURL('image/jpeg',.9).split(',')[1]);
  object(id,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+W+' '+H+'] /Resources << /XObject << /Im0 '+(id+2)+' 0 R >> >> /Contents '+(id+1)+' 0 R >>');
  object(id+1,'<< /Length '+encoder.encode(content).length+' >>',encoder.encode(content));
  object(id+2,'<< /Type /XObject /Subtype /Image /Width '+canvas.width+' /Height '+canvas.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+img.length+' >>',img);
 });
 const end=size;const count=3+canvases.length*3;
 append('xref\n0 '+count+'\n0000000000 65535 f \n');
 for(let i=1;i<count;i++)append(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
 append('trailer\n<< /Size '+count+' /Root 1 0 R >>\nstartxref\n'+end+'\n%%EOF\n');
 const result=new Uint8Array(size);let at=0;for(const chunk of parts){result.set(chunk,at);at+=chunk.length;}return result;
}
export async function createExpensePdf(report){
 if(typeof document==='undefined')throw Error('PDF는 브라우저에서 생성할 수 있습니다.');
 if(document.fonts){await Promise.all([document.fonts.load('400 11px Pretendard'),document.fonts.load('600 11px Pretendard')]);}
 const logo=await loadLogo();
 const rows=(report.rows||[]).slice().sort((a,b)=>(report.mode==='personal'?(a.outstanding===0?1:0)-(b.outstanding===0?1:0):0)||b.date.localeCompare(a.date));
 return pdfFromCanvases(buildPages({...report,rows},logo));
}
export function downloadExpensePdf(bytes,name){
 const blob=new Blob([bytes],{type:'application/pdf'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;a.style.display='none';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
