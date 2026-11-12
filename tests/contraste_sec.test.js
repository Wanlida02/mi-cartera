/* Contrastar una ficha de informes con la SEC: rellena lo que falta, verifica lo que coincide y sube la fiabilidad. Uso: node tests/contraste_sec.test.js datos.json (necesita PRDO en el fichero y datos/PRDO.json) */
const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0, async () => {
  const b = await chromium.launch(), pg = await (await b.newContext({ viewport: { width: 390, height: 900 } })).newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.goto('http://localhost:' + srv.address().port + '/'); await pg.click('#btn-ajustes'); await pg.setInputFiles('#a-imp', process.argv[2]); await pg.waitForTimeout(700);
  await pg.evaluate(() => { const d = Store.get(), f = d.fichas.PRDO; ['capex', 'deuda'].forEach(k => delete f.hist[k]); f._borrador = true; d.precios['PRDO@ficha'] = { ticker: 'PRDO', precio: 60, divisa: 'USD', fecha_precio: '2026-11-12' }; });
  await pg.evaluate(() => window.UI.abrirFicha('PRDO')); await pg.waitForTimeout(200);
  assert(/Ficha incompleta/.test(await pg.textContent('#vista')), 'incompleta antes'); const f0 = await pg.evaluate(() => { const f = JSON.parse(JSON.stringify(Store.get().fichas.PRDO)); f.hist.capex = f.hist.capex || Array(f.anios.length).fill(null); f.hist.deuda = f.hist.deuda || Array(f.anios.length).fill(null); return Val.fiabilidad(f, '2026-11-12').puntuacion; });
  await pg.click('[data-v=contraste]'); await pg.waitForTimeout(400); const t = await pg.textContent('#dlg'); assert(/Capex.*falta en tu ficha/.test(t) && /Ventas.*coinciden/.test(t), t.slice(0, 400));
  await pg.click('#cs-ok'); await pg.waitForTimeout(300);
  const r = await pg.evaluate(() => { const f = Store.get().fichas.PRDO; return { falta: Logic.lineasFaltantes(f), p: Val.fiabilidad(f, '2026-11-12').puntuacion, A: f.conf.ventas, capex: f.hist.capex.slice(-1)[0], borr: !!f._borrador, v: Logic.valoracion(Store.get(), 'PRDO') }; });
  assert.deepEqual(r.falta, []); assert.equal(r.A, 'A'); assert(r.capex > 5 && r.capex < 12, 'capex SEC'); assert(r.p > f0 + 15, 'sube la fiabilidad ' + f0 + ' → ' + r.p); assert(!r.borr && !r.v.error, JSON.stringify(r.v).slice(0, 200));
  assert.deepEqual(errs, []); console.log('contraste_sec ok · fiabilidad ' + f0 + ' → ' + r.p); await b.close(); srv.close();
});
