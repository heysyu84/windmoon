const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FIELDS = 'id,name,mimeType,description,appProperties,createdTime';
const FOLDER = 'application/vnd.google-apps.folder';
const CLIENT_KEY = 'windmoon.receipts.googleClientId';
const mimeByExtension = {jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',pdf:'application/pdf'};
let scriptReady;

export const validClientId = value => /^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(value);
export function clientIdForDevice() {
 try { return window.WINDMOON_CONFIG?.receiptGoogleClientId || localStorage.getItem(CLIENT_KEY) || ''; }
 catch { return window.WINDMOON_CONFIG?.receiptGoogleClientId || ''; }
}
export function mimeForReceipt(file) {
 const type=file.type || mimeByExtension[file.name.split('.').pop().toLowerCase()];
 if (!Object.values(mimeByExtension).includes(type) || !file.size) throw Error('JPG, PNG, WebP 이미지 또는 PDF를 선택해 주세요.');
 return type;
}
export async function receiptDigest(file) {
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()));
 return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}

export function loadGoogleIdentity() {
 if (window.google?.accounts?.oauth2) return Promise.resolve(window.google.accounts.oauth2);
 if (!scriptReady) scriptReady=new Promise((resolve,reject)=>{
  const tag=document.createElement('script');
  const timer=setTimeout(failed,20000);
  function failed() {
   clearTimeout(timer);tag.remove();scriptReady=undefined;
   reject(Error('Google 연결 화면을 불러오지 못했습니다. 다시 시도해 주세요.'));
  }
  tag.src='https://accounts.google.com/gsi/client';tag.async=true;
  tag.onload=()=>{if(!window.google?.accounts?.oauth2){failed();return;}clearTimeout(timer);resolve(window.google.accounts.oauth2);};
  tag.onerror=failed;document.head.appendChild(tag);
 });
 return scriptReady;
}

// Each instance belongs to one mounted, authenticated workspace. Only the public client ID persists.
export function createReceiptDrive(signal) {
 let token='',expires=0,account=null;
 const folders=new Map(),pendingIds=new Map();
 function lock() {token='';expires=0;account=null;folders.clear();pendingIds.clear();}
 signal.addEventListener('abort',lock,{once:true});
 function active() {return Boolean(token && Date.now()<expires && !signal.aborted);}
 async function request(url,init={}) {
  signal.throwIfAborted();
  if(!active())throw Error('Google Drive에 다시 연결해 주세요.');
  const response=await fetch(url,{...init,signal,cache:'no-store',credentials:'omit',headers:{...init.headers,Authorization:'Bearer '+token}});
  if(response.status===401){token='';throw Error('Google 연결 시간이 지났습니다. 같은 계정으로 다시 연결해 주세요.');}
  if(!response.ok){
   const body=await response.json().catch(()=>({}));
   const reason=body.error?.errors?.[0]?.reason;
   const message=reason==='storageQuotaExceeded'?'Google Drive의 저장 공간을 확인해 주세요.':
    response.status===403?'Google Drive API 사용 설정과 이 계정의 접근 권한을 확인해 주세요.':
    response.status===404?'Drive에서 영수증 파일을 찾을 수 없습니다.':'Google Drive 요청에 실패했습니다. 다시 시도해 주세요.';
   throw Object.assign(Error(message),{status:response.status});
  }
  return response;
 }
 async function connect(id) {
  id=id.trim();
  if(!validClientId(id))throw Error('웹 애플리케이션용 Google OAuth 클라이언트 ID를 입력해 주세요.');
  const oauth=window.google?.accounts?.oauth2 || await loadGoogleIdentity();
  const auth=await new Promise((resolve,reject)=>{
   const client=oauth.initTokenClient({client_id:id,scope:SCOPE,include_granted_scopes:false,
    callback:r=>r.error?reject(Error(r.error==='access_denied'?'Google의 Drive 접근 동의를 확인해 주세요. 테스트 중인 앱은 본인 이메일을 테스트 사용자로 등록해야 합니다.':'Google 연결을 완료하지 못했습니다.')):resolve(r),
    error_callback:()=>reject(Error('Google 계정 선택 창을 열어 연결해 주세요.'))});
   client.requestAccessToken({prompt:'select_account'});
  });
  signal.throwIfAborted();
  const previous=account;
  token=auth.access_token;expires=Date.now()+Number(auth.expires_in)*1000-10000;
  try{
   const {user}=await (await request(API+'/about?fields=user(permissionId,emailAddress)')).json();
   if(!user?.permissionId)throw Error('연결한 Drive 계정을 확인하지 못했습니다.');
   if(previous && previous.permissionId!==user.permissionId)throw Error('처리 중인 영수증이 있습니다. 처음 연결한 Google 계정을 선택해 주세요.');
   account=user;
   try{localStorage.setItem(CLIENT_KEY,id);}catch{}
   return account;
  }catch(error){token='';throw error;}
 }
 async function list(query,fields) {
  const files=[];let next='';
  do{
   const params=new URLSearchParams({q:"trashed = false and 'me' in owners and "+query,spaces:'drive',pageSize:'100',fields:'nextPageToken,files('+fields+')'});
   if(next)params.set('pageToken',next);
   const page=await (await request(API+'/files?'+params)).json();files.push(...(page.files||[]));next=page.nextPageToken||'';
  }while(next);
  return files;
 }
 async function originals(){
  const files=await list("appProperties has { key='wmKind' and value='receipt-v1' }",FIELDS);
  return files.map(file=>{
   let link;try{link=JSON.parse(file.description);}catch{}
   return {...file,entryId:typeof link?.entryId==='string'?link.entryId:'',date:file.appProperties?.purchaseDate||''};
  });
 }
 async function folder(key,name,parent) {
  if(folders.has(key))return folders.get(key);
  const query="mimeType = '"+FOLDER+"' and '"+parent+"' in parents and appProperties has { key='wmFolder' and value='"+key+"' }";
  const existing=await list(query,'id,createdTime');
  let id=existing.sort((a,b)=>a.createdTime.localeCompare(b.createdTime)||a.id.localeCompare(b.id))[0]?.id;
  if(!id){
   const response=await request(API+'/files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,mimeType:FOLDER,parents:[parent],appProperties:{wmFolder:key}})});
   id=(await response.json()).id;
  }
  folders.set(key,id);return id;
 }
 async function upload(entry,file,knownFiles){
  const mime=mimeForReceipt(file);
  const hash=await receiptDigest(file);
  const already=knownFiles.find(f=>f.entryId===entry.id&&f.appProperties?.digest===hash);
  if(already)return already;
  const root=await folder('windmoon-receipts-v1','풍월관 영수증','root'),month=entry.businessDate.slice(0,7);
  const parent=await folder(month,month,root),key=entry.id+'|'+hash;
  let id=pendingIds.get(key);
  if(!id){
   const generated=await (await request(API+'/files/generateIds?count=1&space=drive')).json();
   id=generated.ids[0];pendingIds.set(key,id);
  }
  const metadata={id,name:file.name,mimeType:mime,parents:[parent],description:JSON.stringify({entryId:entry.id}),
   appProperties:{wmKind:'receipt-v1',purchaseDate:entry.businessDate,digest:hash}};
  let saved;
  try{
   const start=await request(UPLOAD+'?uploadType=resumable&fields='+encodeURIComponent(FIELDS),{method:'POST',
    headers:{'Content-Type':'application/json','X-Upload-Content-Type':mime},body:JSON.stringify(metadata)});
   const session=new URL(start.headers.get('Location'));
   if(!['https://www.googleapis.com','https://content.googleapis.com'].includes(session.origin))throw Error('Google 업로드 주소를 확인하지 못했습니다.');
   const result=await request(session.href,{method:'PUT',headers:{'Content-Type':mime},body:file});
   saved=await result.json();
  }catch(error){
   if(error.status!==409)throw error;
   saved=await (await request(API+'/files/'+encodeURIComponent(id)+'?fields='+encodeURIComponent(FIELDS))).json();
   if(saved.appProperties?.digest!==hash||saved.description!==metadata.description)throw Error('Drive 파일을 확인하고 다시 시도해 주세요.');
  }
  pendingIds.delete(key);
  return {...saved,entryId:entry.id,date:entry.businessDate};
 }
 async function download(file){
  const response=await request(API+'/files/'+encodeURIComponent(file.id)+'?alt=media');
  return response.blob();
 }
 return {active,connect,originals,upload,download,lock,account:()=>account};
}
