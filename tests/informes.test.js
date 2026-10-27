/* Pestaña Informes: cruce del índice con cartera/watchlist (lógica) + carga y detalle en pantalla móvil. */
const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), L = require('../js/logic.js');
const indice = { version: 1, generado: '2026-10-27T10:00:00', empresas: [
  { nombre: 'Linde', carpeta: 'Linde annual report', ticker: 'LIN', ident: 'CIK 1707925 (SEC)', ultimo_anio: 2025, csv: 'Linde_datos.csv',
    documentos: [{ anio: 2024, archivo: 'Linde_10K_2024.pdf', tipo: '10K', url: 'https://www.sec.gov/a', kb: 2048 }, { anio: 2025, archivo: 'Linde_10K_2025.pdf', tipo: '10K', url: 'https://www.sec.gov/b', kb: 3072 }],
    datos: { divisa: 'USD', anios: [2024, 2025], metricas: { Ventas: [33005, 33500], 'Margen operativo %': [27.1, 27.8] } } },
  { nombre: 'Kri-Kri', carpeta: 'Kri-Kri annual report', ticker: 'KRI.AT', ultimo_anio: 2023, documentos: [{ anio: 2023, archivo: 'Kri-Kri_AR_2023.pdf', tipo: 'AR' }], datos: null },
  { nombre: 'Empresa Rara', carpeta: 'Empresa Rara annual report', ticker: null, ultimo_anio: 2025, documentos: [{ anio: 2025, archivo: null, tipo: 'AR' }], datos: null }] };
// Lógica
const d = L.normalizar(null); d.informes = indice;
d.fichas.LIN = { nombre: 'Linde plc', divisa: 'USD' }; d.fichas.KRI = { nombre: 'Kri-Kri Milk Industry S.A.', divisa: 'EUR' }; d.fichas.MSFT = { nombre: 'Microsoft Corporation', divisa: 'USD', estado: 'watchlist' };
d.posiciones.push({ empresa: 'Linde', ticker: 'LIN', broker: 'XTB', cantidad: 1, moneda: 'USD' }, { empresa: 'KRI-KRI Milk Industry S.A.', ticker: 'KRI', broker: 'Degiro', cantidad: 1, moneda: 'EUR' });
const I = L.informes(d, '2026-10-27');
assert.deepEqual(I.lista.map(e => e.nombre + ':' + e.estado), ['Kri-Kri:cartera', 'Linde:cartera', 'Empresa Rara:otra'].sort((a, b) => a.split(':')[1].localeCompare(b.split(':')[1]) || a.localeCompare(b)).sort((a, b) => ({ cartera: 0, watchlist: 1, otra: 2 }[a.split(':')[1]] - { cartera: 0, watchlist: 1, otra: 2 }[b.split(':')[1]])));
assert.equal(I.lista.find(e => e.nombre === 'Kri-Kri').desactualizado, true, '2023 < 2025');
assert.equal(I.lista.find(e => e.nombre === 'Linde').desactualizado, false);
assert.deepEqual(I.sin.map(o => o.nombre), ['Microsoft Corporation']);
assert.equal(L.informes(L.normalizar(null)), null);
// Pantalla
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0);
(async () => {
  const b = await chromium.launch(), pg = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('http://localhost:' + srv.address().port + '/');
  await pg.evaluate(t => { Store.importar(t); }, JSON.stringify(Object.assign(L.normalizar(null), { posiciones: d.posiciones, fichas: d.fichas })));
  await pg.reload(); await pg.click('[data-tab=informes]');
  assert((await pg.textContent('#vista')).includes('indice_informes.json'), 'sin índice: explica cómo cargarlo');
  const tmp = path.join(__dirname, '_indice.tmp.json'); fs.writeFileSync(tmp, JSON.stringify(indice));
  await pg.click('#btn-ajustes'); await pg.setInputFiles('#a-inf', tmp); await pg.waitForTimeout(300); fs.unlinkSync(tmp);
  const t = await pg.textContent('#vista'); assert(t.includes('Linde') && t.includes('Sin informes descargados') && t.includes('Microsoft'), t.slice(0, 200));
  await pg.fill('#qi', 'lin'); assert.equal(await pg.locator('[data-inf]').count(), 1);
  await pg.click('[data-inf]'); const dlg = await pg.textContent('#dlg'); assert(dlg.includes('Linde_10K_2025.pdf') && dlg.includes('Ventas') && dlg.includes('33.500'), dlg.slice(0, 300));
  await pg.screenshot({ path: process.argv[2] || '/tmp/informes.png' });
  assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'sin scroll horizontal');
  assert.deepEqual(errs, []); console.log('informes ok'); await b.close(); srv.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
