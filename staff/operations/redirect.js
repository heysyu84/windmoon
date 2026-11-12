const pages=['overview','report','closing','sales','expenses','payroll','funds'];
const page=location.hash.slice(1).replace(/^ops-/,'');
location.replace(new URL('../#ops-'+(pages.includes(page)?page:'overview'),location.href).href);
