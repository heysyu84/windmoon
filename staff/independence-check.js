(() => {
'use strict';
const api = 'https://windmoon-workspace-94a273fd.heysyu84.workers.dev';
const sessionKey = 'windmoon-admin-session-v1';
const headline = document.getElementById('headline');
const details = document.getElementById('details');
const panel = document.getElementById('result');
const checkButton = document.getElementById('check');
let report = { checkedAt: null, result: 'not_checked' };
function show(level,title,description) {
  panel.dataset.level = level;
  headline.textContent = title;
  details.textContent = description;
}
async function get(path,token) {
  const abort = new AbortController();
  const stop = setTimeout(() => abort.abort(),12000);
  try {
    const result = await fetch(api+path,{
      method:'GET',
      headers:{'Authorization':'Bearer '+token,'X-WM-Client':'staff'},
      cache:'no-store',
      credentials:'omit',
      signal:abort.signal
    });
    let json=null;
    try { json=await result.json(); } catch {}
    return {status:result.status,ok:result.ok,data:json};
  } finally {clearTimeout(stop);}
}
async function run() {
  checkButton.disabled=true;
  show('unknown','검사 중','Cloudflare Worker의 관리자 인증·운영관리 이전 상태·운영 장부 조회 경로를 확인합니다.');
  report={checkedAt:new Date().toISOString(),result:'running'};
  try {
    const token=sessionStorage.getItem(sessionKey);
    if (!token) {
      report.result='login_required';
      show('unknown','먼저 직원관리 로그인이 필요합니다','위의 직원관리 로그인 버튼을 눌러 로그인한 다음, 같은 탭의 주소창에 이 진단 주소를 다시 입력해 주세요.');
      return;
    }
    const auth=await get('/api/auth',token);
    report.authStatus=auth.status;
    if (!auth.ok || auth.data?.authenticated!==true) {
      report.result='session_expired';
      show('unknown','인증 확인 필요','직원관리 페이지에서 다시 로그인한 뒤 같은 탭에서 검사해 주세요. 인증 응답 상태: '+auth.status);
      return;
    }
    const merge=await get('/api/workspace/merge',token);
    report.mergeStatus=merge.status;
    if (!merge.ok) {
      report.result='cannot_read_merge';
      show('unknown','운영자료 이전 상태를 읽지 못했습니다','Cloudflare 인증은 성공했지만 이전 상태 조회가 실패했습니다. HTTP '+merge.status);
      return;
    }
    const phase=String(merge.data?.phase || 'unknown');
    report.mergePhase=phase;
    if (phase!=='active') {
      report.result='not_fully_independent';
      show('bad','운영관리 완전 독립 미완료','운영자료 이전 상태: '+phase+'\nChatGPT 원본 서버를 호출하는 경로가 남아 있을 수 있습니다.');
      return;
    }
    const operations=await get('/api/suite/operations/state',token);
    report.operationsStatus=operations.status;
    report.operationsUnified=operations.data?.unified===true;
    if (operations.ok && operations.data?.unified===true) {
      report.result='core_independent';
      show('ok','핵심 업무 독립 실행 확인','운영자료 이전: active\n운영 장부: Cloudflare 통합 D1에서 직접 조회 성공\n직원관리 인증: 성공\n※ ChatGPT 코드 변경 자동 배포는 별도 문제입니다.');
    } else {
      report.result='merge_active_but_operations_unverified';
      show('unknown','이전 완료 · 운영관리 조회 추가 확인 필요','운영자료 이전 상태는 active입니다. 그러나 운영장부 독립 조회를 확정하지 못했습니다. HTTP '+operations.status+' / unified='+(operations.data?.unified===true));
    }
  } catch(error) {
    report.result='request_failed';
    report.errorType=error?.name==='AbortError'?'timeout':'request_or_cors_error';
    show('unknown','서버 연결 확인 실패','인증·데이터를 변경하지 않았습니다. 인터넷 연결 또는 브라우저 요청 차단을 확인해 주세요.');
  } finally {checkButton.disabled=false;}
}
document.getElementById('copy').addEventListener('click',async()=>{
  const text=JSON.stringify(report,null,2);
  try{await navigator.clipboard.writeText(text);document.getElementById('copy').textContent='결과 복사됨';}
  catch {details.textContent += '\n복사할 결과: '+text;}
});
checkButton.addEventListener('click',run);
})();