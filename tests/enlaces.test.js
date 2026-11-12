const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0);
(async () => {
  const datos = JSON.parse(fs.readFileSync(process.argv[2])), b = await chromium.launch(), pg = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.goto('http://localhost:' + srv.address().port + '/');
  await pg.evaluate(d => { Object.assign(Store.get(), d); UI.render(); }, datos);
  const tk = await pg.evaluate(() => { const d = Store.get(); return d.posiciones.map(p => Logic.tickerDe(d, p)).find(t => t && d.fichas[t] && (d.cribado || {})[t]) || Object.keys(d.fichas)[0]; });
  // Inicio → fila clicable abre Valoración
  await pg.click('[data-tab=inicio]'); const n = await pg.locator('#vista .row.click[data-go=val]').count(); assert(n > 0, 'filas de Inicio clicables');
  await pg.click('[data-tab=valoracion]'); await pg.click('[data-v=abrir][data-k="' + tk + '"]');
  assert(await pg.locator('.links .lk[data-go=pos]').count() === 1, 'enlace a Posición en Valoración');
  assert(await pg.locator('.links .lk[data-go=val]').count() === 0, 'no se enlaza a sí misma');
  // Valoración → Posición (diálogo)
  await pg.click('.links .lk[data-go=pos]'); await pg.waitForTimeout(150); assert((await pg.textContent('#dlg')).includes('Comprar más'), 'abre la posición');
  assert(await pg.locator('#dlg .links .lk[data-go=val]').count() === 1, 'desde la posición se vuelve a Valoración');
  await pg.click('#dlg .links .lk[data-go=val]'); await pg.waitForTimeout(150); assert((await pg.textContent('#vista')).includes('Escenarios'), 'vuelve a la valoración');
  // Cribado
  if (await pg.locator('.links .lk[data-go=cri]').count()) { await pg.click('.links .lk[data-go=cri]'); await pg.waitForTimeout(150); assert((await pg.textContent('#vista')).includes('Cribado'), 'abre cribado'); }
  // Informes
  await pg.click('[data-tab=valoracion]'); const hay = await pg.locator('.links .lk[data-go=inf]').count();
  if (hay) { await pg.click('.links .lk[data-go=inf]'); await pg.waitForTimeout(150); assert((await pg.textContent('#dlg')).includes('Informes anuales'), 'abre informes'); }
  assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'sin scroll horizontal');
  assert.deepEqual(errs, []); console.log('enlaces ok'); await b.close(); srv.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
