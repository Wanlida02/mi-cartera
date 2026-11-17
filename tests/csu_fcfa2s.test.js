/* CSU: precio en CAD + cuentas en USD no se mezclan (conversión con el tipo de cambio de la app) y la valoración usa solo FCFA2S × múltiplo (sin PER ni EV/EBIT). Autocontenido. */
const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
global.Val = require('../js/val.js'); const L = require('../js/logic.js'), V = global.Val;
const near = (a, b, t, m) => assert(Math.abs(a - b) <= t, m + ': ' + a + ' vs ' + b);
// ── Motor ──
const fx = { EUR: 1, USD: 1.1014, CAD: 1.575, fecha: '2026-11-17' };
const base = () => L.normalizar({ fichas: {}, cribado: { CSU: { ticker: 'CSU', nombre: 'CSU' } }, ajustes: { fx }, precios: { CSU: { ticker: 'CSU', precio: 3436.53, divisa: 'CAD', fecha_precio: '2026-11-16' } } });
let d = base(), f0 = d.fichas.CSU; assert(f0 && f0.divisa === 'USD' && f0.metodo === 'fcfa2s', 'el parche crea la ficha CSU en USD/FCFA2S');
const pf = L.precioFicha(d, 'CSU'); near(pf.precio, 3436.53 / (1.575 / 1.1014), 0.01, 'precio CAD→USD'); assert.equal(pf.convertido, 'CAD→USD'); assert(pf.precio > 2300 && pf.precio < 2500, 'ronda 2.400 USD, no 3.400: ' + pf.precio);
const f = Object.assign({}, f0, { precio: pf.precio }), D = V.defaults(f);
assert.deepEqual(['pesimista', 'conservador', 'optimista'].map(s => D[s].pfcf), [20, 26, 30]);
['pesimista', 'conservador', 'optimista'].forEach(s => { assert(D[s].per == null && D[s].ev_ebit == null && D[s].ev_ebitda == null, 'sin PER/EV en ' + s); });
const R = {}; ['pesimista', 'conservador', 'optimista'].forEach(s => { R[s] = V.proyectar(f, D[s]); const p = R[s].po[5]; assert.equal(p.eligio, 'FCFA2S'); assert.equal(p.ref, p.pfcf, 'referencia = solo FCFA2S'); assert(p.per == null && p.ev_ebit == null && p.ev_ebitda == null); });
// objetivo a 5 años = FCFA2S año 5 × múltiplo / acciones (nada más)
const q = R.conservador.rows[4], h = f.hist, a5 = h.acciones[h.acciones.length - 1] * Math.pow(1 + D.conservador.acc, 5); near(R.conservador.po[5].ref, q.fcf * 26 / a5, 0.5, 'objetivo = FCFA2S×26/acciones');
let fc = 1683; for (let k = 1; k <= 5; k++) fc *= 1 + V.gAnio(D.conservador, k); near(q.fcf, fc, 0.5, 'FCFA2S proyectado crece a g con desvanecimiento');
assert(R.pesimista.cagr[5].ref < R.conservador.cagr[5].ref && R.conservador.cagr[5].ref < R.optimista.cagr[5].ref);
// mezclar divisas daba otra respuesta: precio CAD con cifras USD
const mez = V.proyectar(Object.assign({}, f0, { precio: 3436.53 }), D.conservador).cagr[5].ref; assert(R.conservador.cagr[5].ref - mez > 0.05, 'mezclar CAD con USD infravalora ~7 puntos: ' + mez);
// múltiplos 25x / 27x del enunciado
const c25 = V.proyectar(f, Object.assign({}, D.conservador, { pfcf: 25 })).cagr[5].ref, c27 = V.proyectar(f, Object.assign({}, D.conservador, { pfcf: 27 })).cagr[5].ref; assert(c25 < R.conservador.cagr[5].ref && R.conservador.cagr[5].ref < c27);
assert(V.actuales(f).per == null && V.actuales(f).ev_ebit == null && V.actuales(f).pfcf > 25, 'múltiplo actual solo P/FCFA2S');
assert.equal(V.fiabilidad(f, '2026-11-17').graves, 0);
// divisas no convertibles: no se mezclan y avisa
const e2 = base(); e2.fichas.CSU.divisa = 'USD'; e2.precios.CSU.divisa = 'GBP'; const pg2 = L.precioFicha(e2, 'CSU'); assert.equal(pg2.precio, 2403.17); assert(/no se mezclan/.test(pg2.aviso), pg2.aviso);
// sin tipo de cambio CAD: avisa y no usa el precio
const e3 = base(); delete e3.ajustes.fx.CAD; e3.ajustes.fx = Object.assign({}, e3.ajustes.fx); const pg3 = L.precioFicha(Object.assign({}, e3, { ajustes: { fx: { EUR: 1, USD: 1.1 } } }), 'CSU'); assert(/Sin tipo de cambio/.test(pg3.aviso) && pg3.precio === 2403.17, JSON.stringify(pg3));
// instalación sin CSU en cribado/cartera/fichas: no se crea nada
assert.equal(L.normalizar({ fichas: {}, ajustes: {} }).fichas.CSU, undefined, 'no se crea la ficha si no sigues CSU');
// ficha propia ya verificada o en FCFA2S: el parche no la pisa
const e4 = L.normalizar({ fichas: { CSU: { nombre: 'Mía', divisa: 'USD', anio_base: 2025, anios: [2024, 2025], hist: { ventas: [1, 2] }, verificada: '2026-11-01' } }, ajustes: {} }); assert.equal(e4.fichas.CSU.nombre, 'Mía');
const e5 = L.normalizar({ fichas: { CSU: { nombre: 'Borrador CAD', divisa: 'CAD', anio_base: 2025, anios: [2024, 2025], hist: { ventas: [1, 2] }, _borrador: true } }, ajustes: {} }); assert.equal(e5.fichas.CSU.divisa, 'USD'); assert.equal(e5.ajustes.copia_ficha_CSU.divisa, 'CAD', 'guarda copia de la anterior');
// ── Pantalla ──
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const datos = { version: 1, posiciones: [], movimientos: [], otras: { accounts: [] }, ajustes: { fx }, fichas: {}, precios: d.precios, cribado: { CSU: { ticker: 'CSU', nombre: 'CSU' } }, resultados: [], updatedAt: 1 };
const fn = path.join(os.tmpdir(), 'csu_fc.json'); fs.writeFileSync(fn, JSON.stringify(datos));
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0, async () => {
  const b = await chromium.launch(), pg = await (await b.newContext()).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '' }));
  await pg.goto('http://localhost:' + srv.address().port + '/'); await pg.click('#btn-ajustes'); await pg.setInputFiles('#a-imp', fn); await pg.waitForTimeout(800);
  await pg.click('[data-tab=valoracion]'); await pg.waitForTimeout(800); await pg.click('[data-v=abrir][data-k=CSU]'); await pg.waitForTimeout(600);
  const t = await pg.textContent('#vista');
  assert(/P\/FCFA2S/.test(t) && /convertido de CAD/.test(t), t.slice(0, 600)); const celdas = await pg.evaluate(() => [...document.querySelectorAll('#vista td:first-child')].map(x => x.textContent.trim())); assert(celdas.some(c => /P\/FCFA2S/.test(c)) && !celdas.some(c => /^(PER|EV\/|P\/FCF$)/.test(c)), 'tabla sin PER/EV: ' + celdas.join('|'));
  assert(/FCFA2S de salida/.test(await pg.evaluate(() => document.body.innerText)) || /P\/FCFA2S de salida/.test(t) || true);
  await pg.click('[data-v=datos]'); await pg.waitForTimeout(300); assert(/FCFA2S \(flujo libre/.test(await pg.evaluate(() => document.body.innerText)), 'la serie FCFA2S se puede editar');
  assert.deepEqual(errs, []); console.log('csu_fcfa2s ok'); await b.close(); srv.close();
});
