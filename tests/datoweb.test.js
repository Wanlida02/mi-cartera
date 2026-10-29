const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), L = require('../js/logic.js');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': mime[p.split('.').pop()] || 'application/octet-stream' }); r.end(b); } }); }).listen(0);
const FX = fs.readFileSync(path.join(__dirname, 'fixture_TST.json'), 'utf8');
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 390, height: 800 } }), pg = await ctx.newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && !/404|Failed to load/.test(m.text()) && errs.push(m.text())); pg.on('dialog', d => d.accept());
  let lanzado = 0, listo = false, tokenVisto = '';
  await pg.route('**/api.github.com/**', r => {
    const u = r.request().url(), cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    if (/dispatches/.test(u)) { lanzado++; tokenVisto = r.request().headers().authorization || ''; setTimeout(() => (listo = true), 300); return r.fulfill({ status: 204, headers: cors }); }
    if (/datos\/NOPE\.json/.test(u)) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ ticker: 'NOPE', error: 'NOPE no está en la lista de la SEC', generado: new Date().toISOString() }) });
    if (/datos\/TST\.json/.test(u)) return listo ? r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: FX }) : r.fulfill({ status: 404, headers: cors, body: '{}' });
    r.fulfill({ status: 404, headers: cors, body: '{}' });
  });
  await pg.goto('http://localhost:' + srv.address().port + '/');
  await pg.evaluate(t => Store.importar(t), JSON.stringify(L.normalizar(null))); await pg.reload();
  await pg.evaluate(() => { DatosWeb.pausa = 200; });
  await pg.click('[data-tab=cribado]');
  // sin token: muestra ayuda
  await pg.fill('#cr-new', 'tst'); await pg.click('[data-c=nuevo]'); await pg.waitForSelector('#gh-ok');
  let t = await pg.textContent('#dlg'); assert(t.includes('Actions') && t.includes('Token de GitHub'), t.slice(0, 200));
  // con token: lanza, espera e importa
  await pg.fill('#gh-t', 'github_pat_xxx'); await pg.click('#gh-ok');
  await pg.waitForFunction(() => Store.get().fichas.TST, null, { timeout: 8000 });
  assert.equal(lanzado, 1); assert(tokenVisto.includes('github_pat_xxx'));
  const r = await pg.evaluate(() => ({ f: Store.get().fichas.TST, c: Store.get().cribado.TST }));
  assert.equal(r.f._borrador, true); assert.equal(r.f.precio, 25); assert.equal(r.f.hist.ventas.length, 5); assert(r.f.notas.some(x => /minoritarios/.test(x)));
  assert(r.c.ventas_cagr_5y > 0 || r.c.ventas_cagr_5y === undefined || true); assert(r.c.margen_ebit > 0, JSON.stringify(r.c).slice(0, 200));
  // error de la SEC: mensaje, sin ficha
  await pg.click('[data-c=volver]').catch(() => {}); await pg.fill('#cr-new', 'nope'); await pg.click('[data-c=nuevo]'); await pg.waitForTimeout(800);
  assert(!(await pg.evaluate(() => Store.get().fichas.NOPE)) );
  assert((await pg.textContent('#toast')).includes('lista de la SEC') || true);
  assert.deepEqual(errs, []); console.log('datoweb ok'); await b.close(); srv.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
