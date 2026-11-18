const SYNC_INTERVAL_MS = 5000;

/**
 * @typedef {{signal: AbortSignal, canApply: () => boolean}} WorkspaceSyncRequest
 * @param {{canCheck: () => boolean, check: (request: WorkspaceSyncRequest) => Promise<void>}} options
 */
export function startWorkspaceSync({canCheck, check}) {
  const controller = new AbortController();
  const {signal} = controller;
  let inFlight = false;
  const canApply = () =>
    !signal.aborted && !document.hidden && navigator.onLine !== false && canCheck();

  async function checkNow() {
    if (inFlight || !canApply()) return;
    inFlight = true;
    try {
      await check({signal, canApply});
    } catch {
      // A temporary connection failure should leave the current view intact.
      // The next visible check will try again.
    } finally {
      inFlight = false;
    }
  }

  const events = ['focus', 'online', 'pageshow'];
  for (const event of events) window.addEventListener(event, checkNow);
  document.addEventListener?.('visibilitychange', checkNow);
  const timer = setInterval(checkNow, SYNC_INTERVAL_MS);
  void checkNow();

  return () => {
    controller.abort();
    clearInterval(timer);
    for (const event of events) window.removeEventListener(event, checkNow);
    document.removeEventListener?.('visibilitychange', checkNow);
  };
}
