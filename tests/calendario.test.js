const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0);
(async () => {
  const cal = JSON.parse(fs.readFileSync(path.join(root, 'calendario_resultados.json')));
  assert(Object.keys(cal.fechas).length > 20);
  Object.values(cal.fechas).forEach(c => assert(/^\d{4}-\d\d-\d\d$/.test(c.fecha) && typeof c.confirmada === 'boolean'));
  const b = await chromium.launch(), pg = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.addInitScript(() => { if (!localStorage.getItem('x')) { localStorage.setItem('x', '1'); } });
  await pg.goto('http://localhost:' + srv.address().port + '/');
  await pg.evaluate(() => { const d = Store.get(); d.fichas.AZO = { nombre: 'AutoZone', estado: 'cartera' }; d.fichas.NET = { nombre: 'Cloudflare', estado: 'watchlist' }; });
  await pg.click('[data-tab=resultados]'); await pg.waitForTimeout(600);
  let t = await pg.textContent('#vista'); assert(t.includes('Calendario público'), t.slice(0, 300));
  await pg.click('[data-r=calall]'); await pg.waitForTimeout(200);
  t = await pg.textContent('#vista'); assert(t.includes('2026-12-08') && t.includes('estimada'), t.slice(0, 400));
  assert.deepEqual(errs, []); console.log('calendario ok'); await b.close(); srv.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
