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
function heading(ctx,report,label,pageIndex,pageCount){
 const M=PAGE.margin,R=PAGE.width-M;
 draw(ctx,'WIND MOON',M,39,{size:12,bold:true,color:C.green});
 draw(ctx,label,M,80,{size:23,bold:true});
 draw(ctx,report.period||'',M,103,{size:10,color:C.muted});
 line(ctx,M,121,R);
 line(ctx,M,792,R);
 draw(ctx,'WIND MOON  ·  운영보고서  ·  영업일 기준',M,810,{size:8,color:C.muted});
 draw(ctx,String(pageIndex)+' / '+String(pageCount),R,810,{size:9,color:C.muted,align:'right'});
}
function card(ctx,x,y,w,label,value,featured=false){
 block(ctx,x,y,w,96,featured?C.green:C.pale);
 draw(ctx,label,x+14,y+27,{size:11,color:featured?C.white:C.muted});
 draw(ctx,currency(value),x+14,y+69,{size:18,bold:true,color:featured?C.white:C.ink,maxWidth:w-28});
}
function summaryRow(ctx,x,y,w,label,value,strong=false){
 if(strong){line(ctx,x,y-21,x+w);}
 draw(ctx,label,x,y,{size:10,bold:strong,maxWidth:w*.55});
 draw(ctx,currency(value),x+w,y,{size:11,bold:strong,align:'right',maxWidth:w*.47});
}
function summaryPage(report,index,count){
 const {canvas,ctx}=painter();
 const s=report.summary||{},t=report.totals||{},M=PAGE.margin,A=PAGE.width-2*M;
 heading(ctx,report,'운영보고서',index,count);
 const flag=report.demo?'예시 자료':'실제 장부';
 const periodInfo=flag+'  ·  '+number(report.activityDays)+'일 집계'+(report.unclosed?'  ·  미마감 '+number(report.unclosed)+'일 포함':'');
 draw(ctx,periodInfo,M,148,{size:10,color:C.muted,maxWidth:A});
 const gap=11,w=(A-gap*2)/3;
 card(ctx,M,170,w,'총매출',s.revenue);
 card(ctx,M+w+gap,170,w,'총비용',s.totalCosts);
 card(ctx,M+2*(w+gap),170,w,'운영수익',s.profit,true);
 const cw=(A-34)/2,left=M,right=M+cw+34;
 draw(ctx,'매출 내역',left,301,{size:13,bold:true});
 draw(ctx,'비용 내역',right,301,{size:13,bold:true});
 line(ctx,left,315,left+cw);line(ctx,right,315,right+cw);
 const sales=[
  ['카드 매출',t.card],['현금 매출',t.cash],['계좌이체 매출',t.bank],
  ['인포 단말기 매출',t.info],...(number(t.other)?[['기타 매출',t.other]]:[]),
  ['환불',-number(t.refund)],['매출 합계',s.revenue]
 ];
 const costs=[['일반 지출',s.expenses],['발생 인건비',s.payrollAccrued],['카드 정산 수수료',s.fees],['비용 합계',s.totalCosts]];
 sales.forEach(([label,value],i)=>summaryRow(ctx,left,342+i*34,cw,label,value,i===sales.length-1));
 costs.forEach(([label,value],i)=>summaryRow(ctx,right,342+i*34,cw,label,value,i===costs.length-1));
 const bottom=Math.max(sales.length,costs.length)*34+366;
 line(ctx,M,bottom,M+A);
 draw(ctx,'기준: 매출·지출·직원 급여는 선택 기간 영업일, 카드 정산 수수료는 실제 정산일',M,bottom+24,{size:9,color:C.muted,maxWidth:A});
 draw(ctx,'직원 급여는 공제 후 지급대상액이며, 선지급·잔금 지급을 비용에 중복 합산하지 않습니다.',M,bottom+44,{size:9,color:C.muted,maxWidth:A});
 draw(ctx,'기타 입금·내부 자금 이동은 매출에 포함하지 않습니다. 운영수익은 참고 집계입니다.',M,bottom+64,{size:9,color:C.muted,maxWidth:A});
 if(report.unclosed)draw(ctx,'주의: 미마감 날짜는 입력된 금액까지만 반영됩니다.',M,bottom+88,{size:9,color:C.amber,maxWidth:A});
 if(!number(report.activityDays))draw(ctx,'해당 기간에 기록된 매출·지출·급여가 없습니다.',M,bottom+115,{size:11,bold:true,color:C.red,maxWidth:A});
 return canvas;
}
const COL=[82,95,94,90,95,67];
const COL_NAMES=['영업일','매출','지출·수수료','직원 급여','운영수익','마감'];
function dailyPage(report,days,index,count){
 const {canvas,ctx}=painter(),M=PAGE.margin,A=PAGE.width-2*M;
 heading(ctx,report,'일자별 내역',index,count);
 draw(ctx,'매출·지출·급여는 각 영업일에 귀속, 수수료는 정산일 기준',M,147,{size:10,color:C.muted,maxWidth:A});
 block(ctx,M,164,A,31,C.green);
 let x=M;
 COL.forEach((w,i)=>{draw(ctx,COL_NAMES[i],i>=1&&i<=4?x+w-7:x+8,184,{size:9,bold:true,color:C.white,align:i>=1&&i<=4?'right':'left',maxWidth:w-12});x+=w;});
 days.forEach((day,i)=>{
  const y=217+i*23.5;
  if(i%2===0)block(ctx,M,y-17,A,23,C.pale);
  const status=day.status==='closed'?'완료':day.status==='draft'?'임시':day.activity?'미마감':'정산만';
  const values=[day.date,currency(day.revenue),currency(day.costs),currency(day.payroll),currency(day.profit),status];
  let left=M;
  values.forEach((val,j)=>{draw(ctx,val,j>=1&&j<=4?left+COL[j]-7:left+7,y,{size:9,bold:j===4,maxWidth:COL[j]-11,align:j>=1&&j<=4?'right':'left'});left+=COL[j];});
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
 await prepareFonts();
 const rows=options.includeDaily?report.daily:[];
 const dailyPages=[];
 for(let start=0;start<rows.length;start+=23)dailyPages.push(rows.slice(start,start+23));
 const count=1+dailyPages.length;
 const images=[await canvasJpeg(summaryPage(report,1,count))];
 for(let i=0;i<dailyPages.length;i++)images.push(await canvasJpeg(dailyPage(report,dailyPages[i],i+2,count)));
 return assemblePdf(images);
}
export function downloadReport(bytes,filename,type='application/pdf'){
 const blob=new Blob([bytes],{type}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
 anchor.href=url;anchor.download=filename;document.body.append(anchor);anchor.click();anchor.remove();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
}
