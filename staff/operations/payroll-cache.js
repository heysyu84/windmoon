// Read-only payroll snapshot reuse for the operations panel.
// No storage or timers: the caller owns an in-memory snapshot for this page.
export async function fetchPayrollSnapshot(fetchJson, previous) {
  const known=previous&&Number.isSafeInteger(previous.revision)&&previous.revision>=0&&Array.isArray(previous.payroll);
  const path=known
    ? '/api/operations/payroll?knownRevision='+encodeURIComponent(String(previous.revision))
    : '/api/operations/payroll';
  let response=await fetchJson(path);
  if(response?.unchanged){
    if(known&&response.revision===previous.revision){
      // Data was validated by the authenticated server's revision check.
      return {...previous,stale:false,cached:true,fetchedAt:new Date().toISOString()};
    }
    // An "unchanged" acknowledgement with no matching local snapshot is
    // insufficient to render anything: fetch complete data instead.
    response=await fetchJson('/api/operations/payroll');
  }
  if(!Array.isArray(response?.payroll)||!Number.isSafeInteger(response.revision)||response.revision<0)
    throw Error('급여 자료 응답을 확인해 주세요.');
  return response;
}
