const enc=new TextEncoder();
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xEDB88320^(n>>>1):n>>>1;return n>>>0;});
export function crc32(data){let c=0xFFFFFFFF;for(const b of data)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function concat(parts){const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let pos=0;for(const p of parts){out.set(p,pos);pos+=p.length;}return out;}
export function zipBytes(entries){
  const local=[],central=[];let offset=0;
  const stamp=new Date(),time=(stamp.getHours()<<11)|(stamp.getMinutes()<<5)|(stamp.getSeconds()>>1),date=((stamp.getFullYear()-1980)<<9)|((stamp.getMonth()+1)<<5)|stamp.getDate();
  for(const {name,data} of entries){
    const file=enc.encode(name),bytes=typeof data==='string'?enc.encode(data):new Uint8Array(data),crc=crc32(bytes);
    const header=new Uint8Array(30+file.length),v=new DataView(header.buffer);
    v.setUint32(0,0x04034B50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(10,time,true);v.setUint16(12,date,true);v.setUint32(14,crc,true);v.setUint32(18,bytes.length,true);v.setUint32(22,bytes.length,true);v.setUint16(26,file.length,true);header.set(file,30);local.push(header,bytes);
    const ch=new Uint8Array(46+file.length),cv=new DataView(ch.buffer);
    cv.setUint32(0,0x02014B50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(12,time,true);cv.setUint16(14,date,true);cv.setUint32(16,crc,true);cv.setUint32(20,bytes.length,true);cv.setUint32(24,bytes.length,true);cv.setUint16(28,file.length,true);cv.setUint32(42,offset,true);ch.set(file,46);central.push(ch);offset+=header.length+bytes.length;
  }
  const c=concat(central),end=new Uint8Array(22),e=new DataView(end.buffer);
  e.setUint32(0,0x06054B50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,c.length,true);e.setUint32(16,offset,true);
  return concat([...local,c,end]);
}
export function pngWith300DPI(bytes){
  bytes=new Uint8Array(bytes);
  const payload=new Uint8Array(9),v=new DataView(payload.buffer);v.setUint32(0,11811);v.setUint32(4,11811);payload[8]=1;
  const chunk=new Uint8Array(21),cv=new DataView(chunk.buffer);cv.setUint32(0,9);chunk.set(enc.encode('pHYs'),4);chunk.set(payload,8);cv.setUint32(17,crc32(chunk.slice(4,17)));
  const parts=[bytes.slice(0,8)];let inserted=false;
  for(let pos=8;pos<bytes.length;){const n=new DataView(bytes.buffer,bytes.byteOffset+pos,4).getUint32(0),end=pos+n+12,type=new TextDecoder().decode(bytes.slice(pos+4,pos+8));if(type!=='pHYs')parts.push(bytes.slice(pos,end));if(type==='IHDR'&&!inserted){parts.push(chunk);inserted=true;}pos=end;}
  return concat(parts);
}
export function download(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
