// Public backend URL only; credentials and encryption keys stay on the Worker.
// The same backend serves the Cloudflare Pages and GitHub Pages workspace frontends.
window.WINDMOON_CONFIG = {...(window.WINDMOON_CONFIG || {}), apiBase: 'https://windmoon-workspace-94a273fd.heysyu84.workers.dev'};
