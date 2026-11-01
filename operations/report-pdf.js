// Printable A4 PDF generator. Korean text is rendered with the browser's
// Korean-capable font into high-resolution JPEG pages before PDF packaging.
// This avoids corrupt CID/subset glyph maps in PDF viewers.
const PAGE={width:595.28,height:841.89,scale:2.25,margin:36};
const C={ink:'#243b32',muted:'#728777',line:'#dce6db',pale:'#f1f6f1',green:'#275342',white:'#ffffff',amber:'#a66a35',red:'#b54747'};
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const currency=value=>new Intl.NumberFormat('ko-KR').format(number(value))+'원';
const textValue=value=>String(value??'');
let fontPromise;
async function prepareFonts(){
 if(fontPromise)return fontPromise;
 fontPromise=(async()=>{
  if(typeof FontFace!=='function'||!document.fonts)return;
  await Promise.all([
   ['400','Pretendard-Regular.ttf'],
   ['600','Pretendard-SemiBold.ttf']
  ].map(async([weight,name])=>{
   const address=new URL('./assets/'+name,import.meta.url).href;
   const face=new FontFace('WMReportPDF','url("'+address+'")',{style:'normal',weight});
   await face.load();
   document.fonts.add(face);
  }));
 })().catch(error=>{console.warn('PDF Korean font fallback',error);});
 return fontPromise;
}
function painter(){
 const canvas=document.createElement('canvas');
 canvas.width=Math.round(PAGE.width*PAGE.scale);
 canvas.height=Math.round(PAGE.height*PAGE.scale);
 const ctx=canvas.getContext('2d',{alpha:false});
 if(!ctx)throw Error('PDF 페이지를 그릴 수 없습니다. 브라우저를 확인해 주세요.');
 ctx.scale(PAGE.scale,PAGE.scale);
 ctx.fillStyle=C.white;ctx.fillRect(0,0,PAGE.width,PAGE.height);
 ctx.textBaseline='alphabetic';
 return {canvas,ctx};
}
function font(ctx,size=10,bold=false){
 ctx.font=(bold?'600 ':'400 ')+size+'px WMReportPDF, "Malgun Gothic", "Noto Sans CJK KR", sans-serif';
}
function draw(ctx,value,x,y,opts={}){
 let s=textValue(value),size=opts.size||10;
 font(ctx,size,!!opts.bold);
 if(opts.maxWidth){
  while(size>8&&ctx.measureText(s).width>opts.maxWidth){size-=.4;font(ctx,size,!!opts.bold);}
 }
 ctx.fillStyle=opts.color||C.ink;
 ctx.textAlign=opts.align||'left';
 ctx.fillText(s,x,y,opts.maxWidth||undefined);
 ctx.textAlign='left';
}
function line(ctx,x1,y,x2,color=C.line){
 ctx.strokeStyle=color;ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(x1,y);ctx.lineTo(x2,y);ctx.stroke();
}
function block(ctx,x,y,w,h,color=C.pale){
 ctx.fillStyle=color;ctx.fillRect(x,y,w,h);
}
// Preserve the original PDF design: header logo, 70pt KPI cards, two-column
// income/expense ledger, rule placement and A4 margins. Only glyph rendering
// is replaced with the browser's loaded Korean font.
let logoPromise;
function prepareLogo(){
 if(!logoPromise)logoPromise=new Promise((resolve,reject)=>{
  const image=new Image();
  image.onload=()=>resolve(image);
  image.onerror=()=>reject(Error('PDF 로고 이미지를 불러오지 못했습니다. 다시 시도해 주세요.'));
  image.src=new URL('./assets/workspace-report-a-400-600.png',import.meta.url).href;
 }).catch(error=>{logoPromise=undefined;throw error;});
 return logoPromise;
}
function heading(ctx,report,label,pageIndex,pageCount,logo){
 const M=PAGE.margin,R=PAGE.width-M;
 if(!logo)throw Error('PDF 로고 이미지가 준비되지 않았습니다.');
 const scale=Math.min(104/logo.naturalWidth,56/logo.naturalHeight);
 const width=logo.naturalWidth*scale,height=logo.naturalHeight*scale;
 ctx.drawImage(logo,M,35,width,height);
 draw(ctx,label,M+126,56,{size:21,bold:true});
 draw(ctx,report.period||'',M+127,77,{size:10,color:C.muted,maxWidth:PAGE.width-M*2-127});
 line(ctx,M,106,R);
 line(ctx,M,796,R);
 draw(ctx,'WINDMOON Workspace',M,812,{size:8,color:C.muted});
 draw(ctx,String(pageIndex)+' / '+String(pageCount),R,812,{size:8,color:C.muted,align:'right'});
}
function card(ctx,x,w,label,value,featured=false){
 block(ctx,x,148,w,70,featured?C.ink:C.pale);
 draw(ctx,label,x+13,170,{size:10,color:featured?C.white:C.muted});
 draw(ctx,new Intl.NumberFormat('ko-KR').format(number(value)),x+13,198,{size:19,bold:true,color:featured?C.white:C.ink,maxWidth:w-26});
}
function summaryRow(ctx,x,y,w,label,value,strong=false,highlight=false){
 if(strong)line(ctx,x,y-15,x+w);
 if(highlight)block(ctx,x-5,y-18,w+10,29,C.pale);
 draw(ctx,label,x,y,{size:10,bold:strong,maxWidth:122});
 draw(ctx,new Intl.NumberFormat('ko-KR').format(number(value)),x+w,y,{size:11,bold:strong,align:'right',maxWidth:w-126});
}
function summaryPage(report,index,count,logo){
 const {canvas,ctx}=painter();
 const s=report.summary||{},t=report.totals||{},M=PAGE.margin,A=PAGE.width-2*M;
 heading(ctx,report,'운영보고서',index,count,logo);
 const status=[report.demo?'예시 자료':'실제 장부',number(report.activityDays)+'일 집계',report.unclosed?'미마감 '+number(report.unclosed)+'일 포함':'',report.stale?'이전 급여 연결 자료 사용':''].filter(Boolean).join(' · ');
 draw(ctx,status,M,130,{size:9,color:C.muted,maxWidth:A});
 const cardW=(A-20)/3;
 card(ctx,M,cardW,'총매출',s.revenue);
 card(ctx,M+cardW+10,cardW,'총비용',s.totalCosts);
 card(ctx,M+2*(cardW+10),cardW,'운영수익',s.profit,true);
 const colW=(A-22)/2;
 const rows=[
  [['카드 매출',t.card],['현금 매출',t.cash],['계좌이체 매출',t.bank],['인포 단말기 매출',t.info],...(number(t.other)?[['기타 매출',t.other]]:[]),['환불',-number(t.refund)],['매출 합계',s.revenue]],
  [['일반 지출',s.expenses],['직원 급여',s.payrollAccrued],['카드 정산 수수료',s.fees],['비용 합계',s.totalCosts]]
 ];
 rows.forEach((items,i)=>{
  const x=M+i*(colW+22);
  draw(ctx,i?'비용 내역':'매출 내역',x,254,{size:12,bold:true});
  line(ctx,x,266,x+colW);
  let y=292;
  items.forEach(([label,value],index)=>{
   const total=index===items.length-1;
   if(total)y+=6;
   summaryRow(ctx,x,y,colW,label,value,total,label==='직원 급여');
   y+=31;
  });
  if(i)draw(ctx,'직원 급여: 근무분의 공제 후 지급대상액',x,y+2,{size:8.5,color:C.muted,maxWidth:colW});
 });
 const foot=254+Math.max(...rows.map(x=>x.length))*31+62;
 line(ctx,M,foot-17,M+A);
 draw(ctx,'영업일 기준 · 카드 수수료는 정산일 기준 · 단위: 원',M,foot,{size:8.5,color:C.muted,maxWidth:A});
 draw(ctx,'기타 입금과 자금 이동은 제외합니다. 운영수익은 등록된 자료 기준 참고 집계입니다.',M,foot+19,{size:8.5,color:C.muted,maxWidth:A});
 if(report.unclosed)draw(ctx,'미마감 날짜는 입력된 금액까지만 반영됩니다.',M,foot+38,{size:8.5,color:C.amber,maxWidth:A});
 return canvas;
}
const COL=[78,99,89,86,100,PAGE.width-2*PAGE.margin-452];
const COL_NAMES=['영업일','매출','지출·수수료','직원 급여','운영수익','마감'];
function dailyPage(report,days,index,count,logo){
 const {canvas,ctx}=painter(),M=PAGE.margin,A=PAGE.width-2*M;
 heading(ctx,report,'일자별 내역',index,count,logo);
 block(ctx,M,120,A,29,C.ink);
 let x=M;
 COL.forEach((w,i)=>{
  draw(ctx,COL_NAMES[i],i>0&&i<5?x+w-8:x+8,139,{size:8.5,bold:true,color:C.white,align:i>0&&i<5?'right':'left',maxWidth:w-10});x+=w;
 });
 days.forEach((day,i)=>{
  const y=175+i*25;
  if(i%2===0)block(ctx,M,y-17,A,25,C.pale);
  const status=day.status==='closed'?'완료':day.status==='draft'?'임시':day.activity?'미마감':'정산만';
  const moneyAmount=v=>new Intl.NumberFormat('ko-KR').format(number(v));
  const values=[day.date,moneyAmount(day.revenue),moneyAmount(day.costs),moneyAmount(day.payroll),moneyAmount(day.profit),status];
  let left=M;
  values.forEach((value,j)=>{
   draw(ctx,value,j>0&&j<5?left+COL[j]-8:left+7,y,{size:9,bold:j===4,maxWidth:COL[j]-14,align:j>0&&j<5?'right':'left'});left+=COL[j];
  });
 });
 return canvas;
}
function canvasJpeg(canvas){
 return new Promise((resolve,reject)=>{
  canvas.toBlob(async blob=>{
   try{
    if(!blob||blob.type!=='image/jpeg')throw Error('PDF 이미지를 만들지 못했습니다.');
    resolve({width:canvas.width,height:canvas.height,data:new Uint8Array(await blob.arrayBuffer())});
   }catch(error){reject(error);}
  },'image/jpeg',.95);
 });
}
function assemblePdf(images){
 const encoder=new TextEncoder(),buffers=[],offsets=[],totalObjects=2+images.length*3;
 let pos=0;
 const write=input=>{const bytes=typeof input==='string'?encoder.encode(input):input;buffers.push(bytes);pos+=bytes.byteLength;};
 const begin=id=>{offsets[id]=pos;write(String(id)+' 0 obj\n');};
 const end=()=>write('endobj\n');
 write('%PDF-1.4\n');
 write(new Uint8Array([37,226,227,207,211,10]));
 begin(1);write('<< /Type /Catalog /Pages 2 0 R >>\n');end();
 begin(2);write('<< /Type /Pages /Count '+images.length+' /Kids ['+images.map((_,i)=>(3+i*3)+' 0 R').join(' ')+'] >>\n');end();
 images.forEach((img,i)=>{
  const page=3+i*3,image=4+i*3,contents=5+i*3;
  begin(page);write('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+PAGE.width+' '+PAGE.height+'] /Resources << /XObject << /Im'+i+' '+image+' 0 R >> >> /Contents '+contents+' 0 R >>\n');end();
  begin(image);write('<< /Type /XObject /Subtype /Image /Width '+img.width+' /Height '+img.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+img.data.byteLength+' >>\nstream\n');write(img.data);write('\nendstream\n');end();
  const commands='q\n'+PAGE.width+' 0 0 '+PAGE.height+' 0 0 cm\n/Im'+i+' Do\nQ\n';
  begin(contents);write('<< /Length '+encoder.encode(commands).byteLength+' >>\nstream\n'+commands+'endstream\n');end();
 });
 const start=pos;
 write('xref\n0 '+(totalObjects+1)+'\n0000000000 65535 f \n');
 for(let id=1;id<=totalObjects;id++)write(String(offsets[id]).padStart(10,'0')+' 00000 n \n');
 write('trailer\n<< /Size '+(totalObjects+1)+' /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF\n');
 const result=new Uint8Array(pos);let k=0;
 for(const bytes of buffers){result.set(bytes,k);k+=bytes.byteLength;}
 return result;
}
export async function createReportPdf(report,options={}){
 if(!report||!report.summary||!report.totals||!Array.isArray(report.daily))throw Error('보고서 자료를 확인한 뒤 다시 내보내 주세요.');
 if(report.payrollUnavailable)throw Error('직원관리 급여 연결 후 내보내 주세요.');
 const [logo]=await Promise.all([prepareLogo(),prepareFonts()]);
 const rows=options.includeDaily?report.daily:[];
 const dailyPages=[];
 for(let start=0;start<rows.length;start+=25)dailyPages.push(rows.slice(start,start+25));
 const count=1+dailyPages.length;
 const images=[await canvasJpeg(summaryPage(report,1,count,logo))];
 for(let i=0;i<dailyPages.length;i++)images.push(await canvasJpeg(dailyPage(report,dailyPages[i],i+2,count,logo)));
 return assemblePdf(images);
}
export function downloadReport(bytes,filename,type='application/pdf'){
 const blob=new Blob([bytes],{type}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
 anchor.href=url;anchor.download=filename;document.body.append(anchor);anchor.click();anchor.remove();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
}
