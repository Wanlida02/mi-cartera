const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), L = require('../js/logic.js');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': mime[p.split('.').pop()] || 'application/octet-stream' }); r.end(b); } }); }).listen(0);
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 390, height: 800 } }), pg = await ctx.newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && !/404|Failed to load/.test(m.text()) && errs.push(m.text()));
  let lanzado = 0, listo = false, ultimo = null; const hoy = L.today();
  const mk = (gen, fecha, pr) => JSON.stringify({ generado: gen, estado: { ok: 1, total: 1, fallos: [] }, fx: { EUR: 1, USD: 1.1, fecha: hoy }, precios: { AAA: { ticker: 'AAA', precio: pr, divisa: 'USD', fecha_precio: fecha, fuente: 'cnbc' } } });
  await pg.route('**/api.github.com/**', r => {
    const u = r.request().url(), cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    if (/dispatches/.test(u)) { lanzado++; assert(/precios\.yml/.test(u)); ultimo = r.request().postData(); setTimeout(() => (listo = true), 300); return r.fulfill({ status: 204, headers: cors }); }
    if (/contents\/precios\.json/.test(u)) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: listo ? mk(new Date().toISOString(), hoy, 99) : mk('2020-01-01T00:00:00Z', '2020-01-01', 5) });
    r.fulfill({ status: 404, headers: cors, body: '{}' });
  });
  await pg.goto('http://localhost:' + srv.address().port + '/');
  const d = L.normalizar(null); d.posiciones.push({ empresa: 'Alfa', ticker: 'AAA', broker: 'XTB', cantidad: 2, moneda: 'USD', precio_medio_compra: 50 });
  d.precios.AAA = { ticker: 'AAA', precio: 80, divisa: 'USD', fecha_precio: '2026-10-01', fuente: 'cnbc' };
  await pg.evaluate(t => Store.importar(t), JSON.stringify(d)); await pg.reload(); await pg.evaluate(() => { DatosWeb.pausa = 200; });
  await pg.click('[data-tab=cartera]');
  let t = await pg.textContent('#vista'); assert(t.includes('Precios automáticos') && t.includes('01/10'), t.slice(0, 300));
  await pg.click('[data-a=precios]'); await pg.click('#pr-ult'); await pg.waitForFunction(() => /Hecho/.test(document.querySelector('#pr-msg').textContent));
  assert.equal(await pg.evaluate(() => Store.get().precios.AAA.precio), 80, 'el precio antiguo no pisa uno mas nuevo');
  // forzar sin token -> pide token; con token lanza y aplica
  await pg.click('#pr-forzar'); await pg.waitForSelector('#pr-tok:not([hidden])');
  await pg.fill('#pr-t', 'github_pat_zzz'); await pg.click('#pr-tok-ok');
  await pg.waitForFunction(() => /Listo/.test(document.querySelector('#pr-msg').textContent), null, { timeout: 8000 });
  assert.equal(lanzado, 1); assert.equal(await pg.evaluate(() => Store.get().precios.AAA.precio), 99);
  assert(/forzar/.test(ultimo));
  await pg.click('#dlg [data-a=cerrar]'); t = await pg.textContent('#vista'); assert(/hoy/.test(t), 'fecha de hoy en la fila');
  assert.deepEqual(errs, []); console.log('precios_ui ok'); await b.close(); srv.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
