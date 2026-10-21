export const MM = 72 / 25.4;
export const GROUP_NAMES = {logo:'로고',identity:'이름·직책',contacts:'연락처',address:'주소',qr:'인스타 QR',rule:'구분선'};
export const LOGO_STYLE_DEFAULTS = {symbolScale:1,wordmarkScale:1,taglineScale:1,symbolGap:1,taglineGap:1};
const freshLogoStyles=()=>Object.fromEntries(['horizontal','portrait'].map(o=>[o,Object.fromEntries(['front','back'].map(side=>[side,{...LOGO_STYLE_DEFAULTS}]))]));
export const DEFAULTS = {
  version:1, orientation:'horizontal', syncQr:true, showQr:true, showGuides:false, customFontEnabled:false,
  fields:{koreanName:'권병욱',englishName:'Kwon Byeong Wook',titleKo:'이사',titleEn:'DIRECTOR',phone:'010-0000-0000',email:'director@windmoon.example',instagram:'@windmoon.preview',addressLine1:'B1, 28-5, Donhwamun-ro 11-gil',addressLine2:'Seoul, Republic of Korea',qrUrl:'https://www.instagram.com/windmoon.preview/'},
  design:{frontBg:'#121617',frontInk:'#F4F1E8',backBg:'#F4F1E8',backInk:'#202020',muted:'#858582',rule:'#D5D4CE',nameScale:1,bodyScale:1,titleScale:1,englishScale:1,contactScale:1,addressScale:1},
  logoStyles:freshLogoStyles(),
  layouts:{horizontal:{front:{},back:{}},portrait:{front:{},back:{}}}
};
export function freshState(){return structuredClone(DEFAULTS);}
const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number.isFinite(Number(v))?Number(v):a));
export function sanitizeState(raw){
  if(!raw||typeof raw!=='object'||raw.version!==1)throw new Error('WINDMOON 설정 파일이 아닙니다.');
  const s=freshState();
  s.orientation=raw.orientation==='portrait'?'portrait':'horizontal';
  for(const k of ['syncQr','showQr','showGuides','customFontEnabled'])if(typeof raw[k]==='boolean')s[k]=raw[k];
  for(const k of Object.keys(s.fields))if(typeof raw.fields?.[k]==='string')s.fields[k]=raw.fields[k].slice(0,k==='qrUrl'?500:120);
  for(const k of ['frontBg','frontInk','backBg','backInk','muted','rule'])if(/^#[0-9a-f]{6}$/i.test(raw.design?.[k]||''))s.design[k]=raw.design[k];
  for(const k of ['nameScale','bodyScale'])if(raw.design?.[k]!=null)s.design[k]=clamp(raw.design[k],.6,1.6);
  for(const k of ['titleScale','englishScale','contactScale','addressScale'])if(raw.design?.[k]!=null)s.design[k]=clamp(raw.design[k],.5,2);
  for(const o of ['horizontal','portrait'])for(const side of ['front','back'])for(const k of Object.keys(LOGO_STYLE_DEFAULTS)){
    if(raw.logoStyles?.[o]?.[side]?.[k]!=null)s.logoStyles[o][side][k]=clamp(raw.logoStyles[o][side][k],k.endsWith('Gap')?0:.3,3);
  }
  for(const o of ['horizontal','portrait'])for(const side of ['front','back'])for(const id of Object.keys(GROUP_NAMES)){
    const g=raw.layouts?.[o]?.[side]?.[id];
    if(g&&typeof g==='object'){
      const next={dx:clamp(g.dx??0,-60,60),dy:clamp(g.dy??0,-100,100),scale:clamp(g.scale??1,.5,1.8)};
      if(['left','center','right'].includes(g.alignX))next.alignX=g.alignX;
      if(['top','center','bottom'].includes(g.alignY))next.alignY=g.alignY;
      s.layouts[o][side][id]=next;
    }
  }
  return s;
}
export function instagramURL(handle){
  const id=String(handle).trim().replace(/^@/,'').replace(/^https?:\/\/(www\.)?instagram\.com\//i,'').split(/[/?#]/)[0];
  return id?'https://www.instagram.com/'+encodeURIComponent(id)+'/':'';
}
export function normalizeURL(value){
  if(!String(value).trim())throw new Error('QR에 연결할 주소를 입력하세요.');
  let u;
  try{u=new URL(String(value).trim());}catch{throw new Error('https://로 시작하는 전체 주소를 입력하세요.');}
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new Error('http 또는 https 주소만 사용할 수 있습니다.');
  if(u.href.length>900)throw new Error('QR 주소가 너무 깁니다.');
  return u.href;
}
const qrCache=new Map();
export function buildQR(value,factory){
  const url=normalizeURL(value);
  if(qrCache.has(url))return qrCache.get(url);
  const q=factory(0,'M');q.addData(url,'Byte');q.make();
  const count=q.getModuleCount();
  const result={url,count,total:count+8,matrix:Array.from({length:count},(_,r)=>Array.from({length:count},(_,c)=>q.isDark(r,c)))};
  qrCache.set(url,result);if(qrCache.size>12)qrCache.delete(qrCache.keys().next().value);
  return result;
}
const round=n=>Number(Number(n).toFixed(5));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const pathCache=new Map();
const fontIds=new WeakMap();let nextFontId=1;
function chooseFont(fonts,bold,value){
  const preferred=fonts.custom||fonts[bold?'bold':'regular'];
  if(fonts.custom&&[...value].some(c=>!preferred.charToGlyphIndex(c)&&c!==' '))return fonts[bold?'bold':'regular'];
  return preferred;
}
function glyphPath(font,value,size,tracking){
  if(!fontIds.has(font))fontIds.set(font,nextFontId++);
  const key=[fontIds.get(font),value,size,tracking].join('|');
  if(pathCache.has(key))return pathCache.get(key);
  const options={kerning:true,letterSpacing:tracking/size};
  const p=font.getPath(value,0,0,size/MM,options);
  const bounds=p.getBoundingBox();
  const result={path:p.toPathData(5),width:Math.max(0,font.getAdvanceWidth(value,size/MM,options)-tracking/MM),bounds};
  pathCache.set(key,result);if(pathCache.size>600)pathCache.delete(pathCache.keys().next().value);
  return result;
}
function union(items){
  if(!items.length)return {x:0,y:0,w:0,h:0};
  const bounds=items.map(i=>i.bounds);
  const x=Math.min(...bounds.map(b=>b.x)),y=Math.min(...bounds.map(b=>b.y));
  return {x,y,w:Math.max(...bounds.map(b=>b.x+b.w))-x,h:Math.max(...bounds.map(b=>b.y+b.h))-y};
}
function applyLayout(g,layout,scene){
  const {dx=0,dy=0,scale=1}=layout||{};
  g.baseBounds={...g.bounds};
  const ax=g.anchor?.x??g.bounds.x,ay=g.anchor?.y??g.bounds.y;
  let tx=dx,ty=dy;
  if(g.items.length&&layout?.alignX){
    const width=g.bounds.w*scale,left=ax+(g.bounds.x-ax)*scale+dx;
    const target=layout.alignX==='left'?3:layout.alignX==='right'?scene.w-3-width:(scene.w-width)/2;
    tx+=target-left;
  }
  if(g.items.length&&layout?.alignY){
    const height=g.bounds.h*scale,top=ay+(g.bounds.y-ay)*scale+dy;
    const target=layout.alignY==='top'?3:layout.alignY==='bottom'?scene.h-3-height:(scene.h-height)/2;
    ty+=target-top;
  }
  const px=x=>ax+(x-ax)*scale+tx,py=y=>ay+(y-ay)*scale+ty;
  for(const i of g.items){
    i.x=px(i.x);i.y=py(i.y);
    if(i.kind==='path')i.scale*=scale;
    if(i.kind==='rect'){i.w*=scale;i.h*=scale;}
    if(i.kind==='line'){i.x2=px(i.x2);i.y2=py(i.y2);i.thickness*=scale;}
    const b=i.bounds;i.bounds={x:px(b.x),y:py(b.y),w:b.w*scale,h:b.h*scale};
  }
  g.bounds=union(g.items);g.layout={dx:tx,dy:ty,scale};
  if(layout?.alignX)g.layout.alignX=layout.alignX;
  if(layout?.alignY)g.layout.alignY=layout.alignY;
  return g;
}
export function buildScene(state,orientation,side,fonts,logos,qrFactory){
  const portrait=orientation==='portrait',w=portrait?50:90,h=portrait?90:50;
  const d=state.design,f=state.fields,groups=[];
  const scene={orientation,side,w,h,background:side==='front'?d.frontBg:d.backBg,groups,qrError:null};
  let active;
  const group=id=>{active={id,label:GROUP_NAMES[id],items:[]};groups.push(active);};
  const add=i=>{active.items.push(i);return i;};
  const rect=(x,y,rw,rh,fill)=>add({kind:'rect',x,y,w:rw,h:rh,fill,bounds:{x,y,w:rw,h:rh}});
  const line=(x,y,x2,y2,fill,thickness=.35/MM)=>add({kind:'line',x,y,x2,y2,fill,thickness,bounds:{x:Math.min(x,x2),y:Math.min(y,y2)-thickness/2,w:Math.abs(x2-x),h:Math.max(thickness,Math.abs(y2-y))}});
  const text=(value,x,y,size,{bold=false,tracking=0,fill=d.backInk,align='left',maxWidth=Infinity}={})=>{
    if(!value)return;
    const font=chooseFont(fonts,bold,value);let result=glyphPath(font,value,size,tracking);
    if(result.width>maxWidth){size*=maxWidth/result.width;tracking*=maxWidth/result.width;result=glyphPath(font,value,size,tracking);}
    if(align==='center')x-=result.width/2;
    if(align==='right')x-=result.width;
    const b=result.bounds;
    if(!Number.isFinite(b.x1))return;
    add({kind:'path',path:result.path,x,y,scale:1,fill,text:value,bounds:{x:x+b.x1,y:y+b.y1,w:b.x2-b.x1,h:b.y2-b.y1}});
  };
  const logo=(x,y,width,colour,version='normal')=>{
    const asset=logos[version],scale=width/asset.width;
    active.anchor={x,y};
    const style={...LOGO_STYLE_DEFAULTS,...state.logoStyles?.[orientation]?.[side]};
    const parts=asset.parts,items=[];
    if(!parts){
      for(const path of asset.paths)add({kind:'path',path,x,y,scale,fill:colour,bounds:{x,y,w:width,h:asset.height*scale}});
      return;
    }
    let previous,previousBase;
    for(const id of ['symbol','wordmark','tagline']){
      const part=parts[id],base=part.bounds,factor=style[id+'Scale'];
      const cx=base.x+base.w/2,cy=base.y+base.h/2;
      let top=cy-base.h*factor/2;
      if(previous){
        const gap=base.y-previousBase.y-previousBase.h;
        top=previous.y+previous.h+gap*style[id==='wordmark'?'symbolGap':'taglineGap'];
      }
      const shiftX=cx*(1-factor),shiftY=top-base.y*factor;
      for(let index=part.start;index<part.end;index++){
        const b=asset.pathBounds[index];
        items.push({kind:'path',path:asset.paths[index],logoPart:id,x:x+shiftX*scale,y:y+shiftY*scale,scale:scale*factor,fill:colour,bounds:{x:x+(shiftX+b.x*factor)*scale,y:y+(shiftY+b.y*factor)*scale,w:b.w*scale*factor,h:b.h*scale*factor}});
      }
      previous={y:top,h:base.h*factor};previousBase=base;
    }
    const bounds=union(items),baseTop=parts.symbol.bounds.y,baseBottom=parts.tagline.bounds.y+parts.tagline.bounds.h;
    const shiftY=y+(baseTop+baseBottom)*scale/2-(bounds.y+bounds.h/2);
    for(const item of items){item.y+=shiftY;item.bounds.y+=shiftY;add(item);}
  };
  if(side==='front'){
    group('logo');const width=portrait?46:80,asset=logos[portrait?'portrait':'normal'];
    logo((w-width)/2,(h-width*asset.height/asset.width)/2,width,d.frontInk,portrait?'portrait':'normal');
  }else{
    group('logo');const width=portrait?22:24;
    logo(portrait?6.5:59,h-(portrait?73:33.3)-width*logos.normal.height/logos.normal.width,width,d.backInk);
    group('identity');
    const x=portrait?6.5:7,max=portrait?37:48;
    text([f.titleKo,f.titleEn].filter(Boolean).join('  /  '),x,portrait?23.8:7.7,6.5*(d.titleScale??1),{tracking:portrait?.4:.5,fill:d.muted,maxWidth:max});
    text(f.koreanName,x,portrait?33.3:15.9,(portrait?17.5:16.2)*d.nameScale,{bold:true,tracking:.6,maxWidth:max});
    text(f.englishName,x,portrait?38.7:21.2,(portrait?8.6:8.7)*d.bodyScale*(d.englishScale??1),{tracking:portrait?0:.2,maxWidth:max});
    group('rule');line(x,portrait?42.6:23,portrait?43.5:83,portrait?42.6:23,d.rule);
    group('contacts');
    const rows=portrait?[['T',f.phone,46.2],['E',f.email,50.8],['IG',f.instagram,55.4]]:[['PHONE',f.phone,27.9],['EMAIL',f.email,32.4],['INSTAGRAM',f.instagram,36.9]];
    for(const [label,value,y] of rows){
      text(label,x,y,(portrait?5.7:5.3)*(d.contactScale??1),{tracking:portrait?.1:.45,fill:d.muted,maxWidth:portrait?4:14});
      text(value,portrait?12:23,y,(portrait?7.1:7.35)*d.bodyScale*(d.contactScale??1),{maxWidth:portrait?31.5:35});
    }
    group('address');
    text(f.addressLine1,x,portrait?83.6:41.7,(portrait?5.9:6.4)*d.bodyScale*(d.addressScale??1),{maxWidth:portrait?37:52});
    text(f.addressLine2,x,portrait?86.4:45,(portrait?5.9:6.4)*d.bodyScale*(d.addressScale??1),{maxWidth:portrait?37:52});
    if(state.showQr){
      group('qr');
      try{
        const qr=buildQR(f.qrUrl,qrFactory),size=20,qx=portrait?15:63,qy=portrait?58:24,unit=size/qr.total;
        rect(qx,qy,size,size,'#FFFFFF');let path='';
        for(let row=0;row<qr.count;row++)for(let col=0;col<qr.count;col++)if(qr.matrix[row][col])path+=`M${col+4} ${row+4}h1v1h-1Z`;
        add({kind:'path',path,x:qx,y:qy,scale:unit,fill:'#000000',bounds:{x:qx+4*unit,y:qy+4*unit,w:qr.count*unit,h:qr.count*unit}});
        text('INSTAGRAM',portrait?25:73,portrait?80.7:46.75,portrait?5.2:5.1,{tracking:portrait?.4:.3,fill:d.muted,align:'center'});
        scene.qr=qr;
      }catch(e){scene.qrError=e.message;}
    }
  }
  for(const g of groups){g.bounds=union(g.items);applyLayout(g,state.layouts[orientation][side][g.id],scene);}
  scene.items=groups.flatMap(g=>g.items);
  return scene;
}
function itemSVG(i){
  if(i.kind==='path')return `<path d="${i.path}" transform="translate(${round(i.x)} ${round(i.y)}) scale(${round(i.scale)})" fill="${i.fill}"/>`;
  if(i.kind==='rect')return `<rect x="${round(i.x)}" y="${round(i.y)}" width="${round(i.w)}" height="${round(i.h)}" fill="${i.fill}"/>`;
  return `<path d="M${round(i.x)} ${round(i.y)}L${round(i.x2)} ${round(i.y2)}" stroke="${i.fill}" stroke-width="${round(i.thickness)}" fill="none"/>`;
}
export function sceneSVG(scene,{interactive=false,guides=false,selected=null}={}){
  let out=`<svg xmlns="http://www.w3.org/2000/svg" width="${scene.w}mm" height="${scene.h}mm" viewBox="0 0 ${scene.w} ${scene.h}" role="img" aria-label="${scene.side==='front'?'앞면':'뒷면'} 명함"><title>WINDMOON | 풍월 · ${scene.side==='front'?'앞면':'뒷면'}</title><rect width="${scene.w}" height="${scene.h}" fill="${scene.background}"/>`;
  for(const g of scene.groups){
    out+=interactive?`<g data-group="${g.id}" role="button" tabindex="0" aria-label="${g.label} 배치 편집">`:'<g>';
    out+=g.items.map(itemSVG).join('');
    if(interactive&&g.items.length){
      const b=g.bounds,p=.8,minHeight=2.5;
      out+=`<rect class="hit-area" x="${round(b.x-p)}" y="${round(b.y-p)}" width="${round(b.w+2*p)}" height="${round(Math.max(b.h+2*p,minHeight))}" fill="transparent"/>`;
    }
    out+='</g>';
  }
  if(guides)out+=`<g fill="none" stroke="${scene.side==='front'?'#FFFFFF':'#6B665B'}" stroke-opacity=".35" stroke-width=".1" stroke-dasharray="1 .7" pointer-events="none"><rect x="3" y="3" width="${scene.w-6}" height="${scene.h-6}"/><path d="M${scene.w/2} 0V${scene.h}M0 ${scene.h/2}H${scene.w}"/></g>`;
  if(interactive&&selected){const g=scene.groups.find(g=>g.id===selected);if(g&&g.items.length){const b=g.bounds;out+=`<rect x="${round(b.x-.8)}" y="${round(b.y-.8)}" width="${round(b.w+1.6)}" height="${round(Math.max(b.h+1.6,2.5))}" fill="none" stroke="#A86C45" stroke-width=".3" stroke-dasharray="1 .5" pointer-events="none"/>`;}}
  return out+'</svg>';
}
export function sceneWarnings(scene){
  const out=[];
  for(const g of scene.groups){const b=g.bounds;if(g.items.length&&(b.x<1.8||b.y<1.8||b.x+b.w>scene.w-1.8||b.y+b.h>scene.h-1.8))out.push(g.label+'이 재단 가장자리에 가깝습니다.');}
  if(scene.qrError)out.push(scene.qrError);
  if(scene.qr){const g=scene.groups.find(g=>g.id==='qr');if(20*(g?.layout.scale||1)/scene.qr.total<.25)out.push('QR이 작습니다. QR 크기를 키우세요.');}
  return out;
}
export async function createPDF(scenes,printReady,lib){
  if(scenes.some(s=>s.qrError))throw new Error('QR 연결 주소를 확인한 뒤 내보내세요.');
  const {PDFDocument,rgb}=lib,doc=await PDFDocument.create();
  doc.setTitle('WINDMOON | 풍월 · Business card');doc.setAuthor('WINDMOON');
  const color=hex=>rgb(parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255);
  for(const s of scenes){
    const extra=printReady?16:0,origin=printReady?8:0,bleed=printReady?3:0;
    const page=doc.addPage([(s.w+extra)*MM,(s.h+extra)*MM]);
    page.setTrimBox(origin*MM,origin*MM,s.w*MM,s.h*MM);
    if(printReady)page.setBleedBox((origin-3)*MM,(origin-3)*MM,(s.w+6)*MM,(s.h+6)*MM);
    page.drawRectangle({x:(origin-bleed)*MM,y:(origin-bleed)*MM,width:(s.w+2*bleed)*MM,height:(s.h+2*bleed)*MM,color:color(s.background)});
    for(const i of s.items){
      if(i.kind==='path')page.drawSvgPath(i.path,{x:(origin+i.x)*MM,y:(s.h+extra-origin-i.y)*MM,scale:i.scale*MM,color:color(i.fill)});
      else if(i.kind==='rect')page.drawRectangle({x:(origin+i.x)*MM,y:(s.h+extra-origin-i.y-i.h)*MM,width:i.w*MM,height:i.h*MM,color:color(i.fill)});
      else page.drawLine({start:{x:(origin+i.x)*MM,y:(s.h+extra-origin-i.y)*MM},end:{x:(origin+i.x2)*MM,y:(s.h+extra-origin-i.y2)*MM},thickness:i.thickness*MM,color:color(i.fill)});
    }
    if(printReady){
      const crop=(x,y,x2,y2)=>page.drawLine({start:{x:x*MM,y:y*MM},end:{x:x2*MM,y:y2*MM},thickness:.25,color:rgb(0,0,0)});
      for(const y of [8,s.h+8]){crop(1,y,4,y);crop(s.w+12,y,s.w+15,y);}
      for(const x of [8,s.w+8]){crop(x,1,x,4);crop(x,s.h+12,x,s.h+15);}
    }
  }
  return doc.save();
}
export function svgBlob(scene){return new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n',sceneSVG(scene)],{type:'image/svg+xml;charset=utf-8'});}
export function sampleFields(s){return s.fields.phone==='010-0000-0000'||s.fields.email.endsWith('.example')||s.fields.instagram==='@windmoon.preview'||(s.showQr&&s.fields.qrUrl===DEFAULTS.fields.qrUrl);}
