export const SITE_ORIGIN = 'https://windmoon-staff.heysyu457310.chatgpt.site';
export const GITHUB_ORIGIN = 'https://heysyu84.github.io';
export const CLOUDFLARE_ORIGIN = 'https://windmoon.pages.dev';
export const PUBLIC_ORIGINS = Object.freeze([GITHUB_ORIGIN, CLOUDFLARE_ORIGIN]);
export const isSuiteOrigin = origin => PUBLIC_ORIGINS.includes(origin);
export function suiteHome(origin = '') {
  if (origin === GITHUB_ORIGIN) return GITHUB_ORIGIN + '/windmoon/';
  return CLOUDFLARE_ORIGIN + '/';
}
export function suitePaths(origin = '') {
  const home = suiteHome(origin);
  return { home, staff: new URL('staff/', home).href, operations: new URL('operations/', home).href };
}

export function operationsReturnPath(origin, target) {
  if (!isSuiteOrigin(origin)) return null;
  const path = new URL('operations/', suiteHome(origin)).pathname;
  return target === path ? path : null;
}
