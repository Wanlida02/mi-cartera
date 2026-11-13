/* Parche DANR: ficha corregida con los comunicados (7 años, 2026 incluido), precio de la acción de ahorro, no se repite ni pisa ediciones posteriores. Uso: node tests/danr_parche.test.js datos.json */
const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0, async () => {
  const b = await chromium.launch(), pg = await (await b.newContext()).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '' }));
  await pg.goto('http://localhost:' + srv.address().port + '/'); await pg.click('#btn-ajustes'); await pg.setInputFiles('#a-imp', process.argv[2]); await pg.waitForTimeout(800);
  const r = await pg.evaluate(() => { const d = Store.get(), f = d.fichas.DANR; if (!f) return null; const h = f.hist, i = h.ventas.length - 1; return { base: f.anio_base, n: f.anios.length, ult: f.anios[f.anios.length - 1], ventas: h.ventas[i], ebit: h.ebit[i], ni: h.ni_reportado[i], neta: h.caja[i] - h.deuda[i] - h.leases_deuda[i], long: Object.keys(h).every(k => h[k].length === f.anios.length), pr: d.precios.DANR.simbolo, val: Logic.valoracion(d, 'DANR'), falt: Logic.lineasFaltantes(f), par: d.ajustes.parches, cnt: d.cribado.DANR && d.cribado.DANR.ebitda_m }; });
  if (!r) { console.log('sin ficha DANR en estos datos: omitido'); await b.close(); srv.close(); return; }
  assert.equal(r.base, 2026); assert.equal(r.n, 7); assert(r.long, 'todas las series con 7 años'); assert.equal(r.ventas, 3833.5); assert.equal(r.ebit, 220.8); assert.equal(r.ni, 230.4);
  assert(Math.abs(r.neta - 1019.7) < 1, 'caja neta ajustada 1.020 M: ' + r.neta); assert.equal(r.pr, 'DANR.MI'); assert(!r.val.error && r.val.ref > 0.10 && r.val.ref < 0.35, JSON.stringify(r.val)); assert.deepEqual(r.falt, []); assert(r.par.includes('danr-2026-11-13')); assert.equal(r.cnt, 438.9);
  // una edición posterior tuya no se pisa al recargar
  await pg.evaluate(() => { const d = Store.get(); d.fichas.DANR.hist.capex[6] = 150; Store.save(); }); await pg.reload(); await pg.waitForTimeout(600);
  const c = await pg.evaluate(() => Store.get().fichas.DANR.hist.capex[6]); assert.equal(c, 150, 'no pisa ediciones');
  assert.deepEqual(errs, []); console.log('danr_parche ok'); await b.close(); srv.close();
});
