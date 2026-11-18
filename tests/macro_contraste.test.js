/* Contraste con 12 meses y aviso de entorno de tipos en la ficha (ambos solo informativos). Autocontenido. */
const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
global.Val = require('../js/val.js'); const L = require('../js/logic.js');
const anios = [2020, 2021, 2022, 2023, 2024, 2025], rep = (v, n) => Array(n).fill(v);
const ficha = () => ({ nombre: 'Test Co', divisa: 'USD', anio_base: 2025, anios, precio: 150, fecha_precio: '2026-11-16', fecha_datos: '2026-03-01', estado: 'watchlist',
  hist: { ventas: rep(1000, 6), ebit: rep(100, 6), impuestos: rep(18, 6), intereses: rep(10, 6), da: rep(20, 6), capex: rep(30, 6), caja: rep(100, 6), deuda: rep(200, 6), acciones: rep(10, 6), leases: rep(0, 6), minoritarios: rep(0, 6) },
  mult_hist: { per: 15, pfcf: 15, ev_ebitda: 9, ev_ebit: 11 }, conf: { ventas: 'A', ebit: 'A', da: 'A', impuestos: 'A', acciones: 'A', capex: 'A', caja: 'A', deuda: 'A' } });
const doce = { fin: '2026-09-30', anio_base: 2025, dv: 0.2, de: 0.4, ventas: 1200, ebit: 140, fuente: 'IA' };
const base = { posiciones: [], movimientos: [], otras: { accounts: [] }, ajustes: {}, fichas: { CCC: ficha() }, precios: { CCC: { ticker: 'CCC', precio: 150, divisa: 'USD', fecha_precio: '2026-11-16' } }, resultados: [{ id: 'r1', tk: 'CCC', estado: 'pendiente', doce }] };
// lógica: con mejores cifras de 12 meses, la rentabilidad sube; la valoración normal no cambia
{
  const d = L.normalizar(JSON.parse(JSON.stringify(base))), v0 = L.valoracion(d, 'CCC', '2026-11-18').ref, rv = L.revision(d, 'CCC', doce, '2026-11-18');
  assert(rv && !rv.error && rv.despues > rv.antes, JSON.stringify(rv)); assert.equal(L.valoracion(d, 'CCC', '2026-11-18').ref, v0);
}
const macro = { actualizado: '2026-11-18', gs10: { fecha: '2026-10', valor: 6.2 }, gs10_anual: { 2020: 0.9, 2021: 1.4, 2022: 3, 2023: 4, 2024: 4.2, 2025: 4.3 }, baa10y: { fecha: '2026-10', valor: 3.2, mediana: 2 } };
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const fn = path.join(require('os').tmpdir(), 'mc.json'); fs.writeFileSync(fn, JSON.stringify(base));
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0, async () => {
  const b = await chromium.launch(), pg = await (await b.newContext({ serviceWorkers: 'block' })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '' }));
  await pg.route('**/datos/resumen.json*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ empresas: {} }) }));
  await pg.route('**/datos/macro.json*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(macro) }));
  await pg.goto('http://localhost:' + srv.address().port + '/'); await pg.click('#btn-ajustes'); await pg.setInputFiles('#a-imp', fn); await pg.waitForTimeout(800);
  await pg.click('[data-tab=valoracion]'); await pg.waitForTimeout(700); await pg.click('[data-v=abrir][data-k=CCC]'); await pg.waitForTimeout(900);
  const t = await pg.textContent('#vista');
  assert(/Contraste/.test(t) && /frente a/.test(t), 'contraste 12 meses: ' + t.slice(0, 1500));
  assert(/Entorno de tipos/.test(t) && /Entorno exigente/.test(t) && /diferencial de crédito/.test(t), 'aviso de tipos: ' + t.slice(0, 1500));
  assert.deepEqual(errs, []); console.log('macro_contraste ok'); await b.close(); srv.close();
});
