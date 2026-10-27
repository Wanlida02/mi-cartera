const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0);
(async () => {
  const b = await chromium.launch(), pg = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && !/404/.test(m.text()) && errs.push(m.text())); pg.on('dialog', d => d.accept());
  await pg.goto('http://localhost:' + srv.address().port + '/');
  await pg.click('#btn-ajustes'); await pg.setInputFiles('#a-imp', process.argv[2]); await pg.waitForTimeout(500);
  await pg.click('[data-tab=valoracion]'); let t = await pg.textContent('#vista');
  assert(t.includes('En cartera') && t.includes('Watchlist'), t.slice(0, 200));
  const n = await pg.locator('[data-v=abrir]').count(); assert(n > 20, 'fichas: ' + n);
  await pg.click('[data-v=abrir][data-k=LIN]'); t = await pg.textContent('#vista');
  assert(t.includes('Escenarios') && t.includes('Precio objetivo') && t.includes('Control de realismo'), 'detalle');
  const antes = await pg.evaluate(() => document.querySelector('.card .kpi b').textContent);
  await pg.fill('input[data-sc=conservador][data-k=g]', '0'); await pg.dispatchEvent('input[data-sc=conservador][data-k=g]', 'change'); await pg.waitForTimeout(150);
  const despues = await pg.evaluate(() => document.querySelectorAll('.card .kpi b')[1].textContent);
  assert.equal(await pg.evaluate(() => Store.get().fichas.LIN.escenarios.conservador.g), 0);
  await pg.screenshot({ path: process.argv[3] || '/tmp/val.png', fullPage: true });
  assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'sin scroll horizontal');
  await pg.click('[data-v=reset]'); assert.equal(await pg.evaluate(() => Store.get().fichas.LIN.escenarios), undefined);
  await pg.click('[data-v=datos]'); assert(await pg.locator('#dlg .hc').count() > 50); await pg.click('#v-ds'); await pg.waitForTimeout(150);
  for (const k of ['MSFT', 'JPM', 'BAC']) if (await pg.locator('[data-v=abrir][data-k=' + k + ']').count()) { await pg.click('[data-v=volver]'); await pg.click('[data-v=abrir][data-k=' + k + ']'); assert((await pg.textContent('#vista')).includes('Precio objetivo'), k); }
  await pg.click('[data-v=volver]'); await pg.click('[data-v=nueva]'); await pg.fill('#n-tk', 'nvt'); await pg.fill('#n-nom', 'Nueva'); await pg.click('#n-ok'); await pg.waitForTimeout(200);
  t = await pg.textContent('#vista'); assert(t.includes('NVT'), 'ficha nueva'); 
  assert.deepEqual(errs, []); console.log('valoracion ok'); await b.close(); srv.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
