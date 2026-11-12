const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0);
(async () => {
  const b = await chromium.launch(), pg = await (await b.newContext()).newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); await pg.goto('http://localhost:' + srv.address().port + '/');
  const r = await pg.evaluate(() => {
    const d = Store.get(), n = 6, A = (x) => Array(n).fill(x), anios = [2020, 2021, 2022, 2023, 2024, 2025];
    const base = (tk, ebit, precio, acc) => ({ ticker: tk, nombre: tk, divisa: 'USD', anio_base: 2025, anios, leases_ok: true, precio, fecha_precio: '2026-11-11', conf: { ventas: 'A', ebit: 'A', da: 'A', impuestos: 'A', acciones: 'A', capex: 'A', caja: 'A', deuda: 'A' }, fuentes: ['test'], notas: [], extra: {},
      hist: { ventas: A(1000), ebit: A(ebit), ni_reportado: A(ebit), acciones: A(acc), da: A(30), intereses: A(10), impuestos: A(5), capex: A(20), caja: A(100), deuda: A(100), minoritarios: A(0), otros: A(0), leases: A(0), leases_deuda: A(0) } });
    d.fichas.PERD = base('PERD', -300, 10, 100); d.fichas.SINP = base('SINP', 150, null, 100); d.fichas.SINA = base('SINA', 150, 10, null); d.fichas.OK = base('OK', 150, 10, 100);
    const o = ['PERD', 'SINP', 'SINA', 'OK'].map(k => Logic.valoracion(d, k, '2026-11-12')); try { Logic.precioFicha(d, 'OK'); Val.fiabilidad(Object.assign({}, d.fichas.OK), '2026-11-12'); } catch (e) { o[3].stack = e.stack.split('\n').slice(0, 3).join(' / '); } return o;
  });
  assert.equal(r[0].ref, null, 'pérdidas: sin −100 %'); assert.equal(r[1].sinPrecio, true); assert.equal(r[2].sinAcciones, true); assert(r[3].ref != null, 'ficha sana valora: ' + JSON.stringify(r[3]));
  assert.deepEqual(errs, []); console.log('valoracion_sin_100 ok'); await b.close(); srv.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
