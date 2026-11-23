/* Múltiplos propios (histórico de precios) y auditoría de divisas. Autocontenido. */
const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
global.Val = require('../js/val.js'); const L = require('../js/logic.js'), V = global.Val, H = require('../scripts/historico_precios.js');
const near = (a, b, t, m) => assert(Math.abs(a - b) <= t, m + ': ' + a + ' vs ' + b);
// ── Parser de Yahoo ──
const ts = []; for (let y = 2014; y <= 2026; y++) for (let m = 1; m <= 12; m++) ts.push(Date.UTC(y, m - 1, 1, 14) / 1000);
const yj = { chart: { result: [{ meta: { currency: 'GBp', exchangeTimezoneName: 'Europe/London' }, timestamp: ts, indicators: { quote: [{ close: ts.map((_, i) => 1000 + i) }] }, events: { splits: { 1: { date: Date.UTC(2021, 5, 1) / 1000, numerator: 4, denominator: 1 } } } }] } };
let ch0; const bars0 = () => { const b = []; for (let a = 2016; a <= 2026; a++) for (let m = 1; m <= 12; m++) b.push({ close: '110', tradeTime: a + String(m).padStart(2, '0') + '20000000' }); return b; };
const hy = H.leerHistorico(yj); assert.equal(hy.divisa, 'GBP'); near(hy.cierres['2014-01'], 10, 1e-9, 'peniques → libras'); assert.equal(hy.splits.length, 1); assert.equal(hy.splits[0].num, 4); assert(hy.cierres['2025-12']);
assert.throws(() => H.leerHistorico({ chart: { result: [{ meta: { currency: 'USD' }, timestamp: ts.slice(0, 5), indicators: { quote: [{ close: [1, 2, 3, 4, 5] }] } }] } }), /corto/);
{ const bars = []; for (let a = 2016; a <= 2026; a++) for (let m = 1; m <= 12; m++) { bars.push({ close: String(100 + a - 2016), tradeTime: a + String(m).padStart(2, '0') + '15000000' }); bars.push({ close: String(200 + a - 2016), tradeTime: a + String(m).padStart(2, '0') + '28000000' }); }
  const ch = H.leerCnbcHist({ barData: { priceBars: bars } }, 'EUR'); assert.equal(ch.divisa, 'EUR'); assert.equal(ch.cierres['2020-12'], 204, 'queda el último cierre del mes'); assert.equal(Object.keys(ch.cierres).length, 132);
  assert.throws(() => H.leerCnbcHist({}, 'USD'), /sin histórico/); }
ch0 = { cierres: { '2026-09': 110, '2026-10': 112 } }; assert(H.coherente(ch0, 111)); assert.throws(() => H.coherente(ch0, 1), /no cuadra/); assert.throws(() => H.coherente(ch0, 0), /sin precio actual/); assert.throws(() => H.coherente({ cierres: { '2020-01': 10, '2021-03': 10 } }, 10), /termina en/);
assert.deepEqual(H.candidatos({ y: ['A', 'B'], ficha: 'F', hist: 'H' }), ['H', 'F', 'A', 'B']);
// ── Motor ──
const anios = [2020, 2021, 2022, 2023, 2024, 2025], rep = (v, n) => Array(n).fill(v);
const ficha = (extra) => Object.assign({ nombre: 'Test Co', divisa: 'USD', anio_base: 2025, anios, precio: 150, fecha_precio: '2026-11-16',
  hist: { ventas: rep(1000, 6), ebit: rep(100, 6), impuestos: rep(18, 6), intereses: rep(10, 6), da: rep(20, 6), capex: rep(30, 6), caja: rep(100, 6), deuda: rep(200, 6), acciones: rep(10, 6), leases: rep(null, 6), leases_deuda: rep(null, 6), minoritarios: rep(null, 6), otros: rep(null, 6), extra: rep(null, 6) }, conf: {} }, extra || {});
const cierres = {}; anios.forEach(a => { cierres[a + '-12'] = 144; });   // cap 1.440 ⇒ PER 20x (ni 72)
let r = V.multiplosHistoricos(ficha(), cierres, []); assert(r.valido); near(r.mult.per, 20, 0.05, 'PER'); near(r.mult.pfcf, 1440 / 62, 0.06, 'P/FCF'); near(r.mult.ev_ebitda, (1440 + 100) / 120, 0.06, 'EV/EBITDA'); near(r.mult.ev_ebit, 1540 / 100, 0.06, 'EV/EBIT');
// un año de euforia no mueve la mediana
const c2 = Object.assign({}, cierres, { '2021-12': 400 }); near(V.multiplosHistoricos(ficha(), c2, []).mult.per, 20, 0.05, 'mediana robusta');
// sin deuda/caja no se inventa EV/EBITDA; sin capex no se inventa P/FCF
const f3 = ficha(); f3.hist.capex = rep(null, 6); f3.hist.caja = rep(null, 6); r = V.multiplosHistoricos(f3, cierres, []); assert(r.mult.pfcf === undefined && r.mult.ev_ebitda === undefined && r.mult.per); 
// pocos años: no vale
const poco = { '2022-12': 144, '2023-12': 144, '2024-12': 144, '2025-12': 144 }; assert(!V.multiplosHistoricos(ficha(), poco, []).valido);
// split 4:1 en jun-2021: acciones antiguas sin ajustar (10) y las nuevas 40, precios ajustados (36 → cap real 1.440)
const fs4 = ficha(); fs4.hist.acciones = [10, 10, 40, 40, 40, 40]; fs4.hist.ni_reportado = rep(72, 6); const c4 = {}; anios.forEach(a => { c4[a + '-12'] = a <= 2020 ? 36 : 36; });
r = V.multiplosHistoricos(fs4, c4, [{ fecha: '2021-06-01', num: 4, den: 1 }]); assert(r.ajustes.includes(2020), 'ajusta 2020 por el split de 2021: ' + r.ajustes);
// sin splits del proveedor (Stooq): se infiere el 4:1 del salto de las acciones y el resultado es el mismo
r = V.multiplosHistoricos(fs4, c4, []); assert(r.ajustes.includes(2020), 'split inferido: ' + r.ajustes); near(r.mult.per, 20, 0.05, 'PER con split inferido');
// los financieros / FCFA2S / margen objetivo no aplican
assert.equal(V.multiplosHistoricos(ficha({ tipo: 'banco' }), cierres, []), null); assert.equal(V.multiplosHistoricos(ficha({ metodo: 'fcfa2s' }), cierres, []), null);
// ── Lógica: aplicar a las provisionales ──
const hist = { simbolos: { AAA: { divisa: 'USD', cierres, splits: [] }, BBB: { divisa: 'EUR', cierres, splits: [] } } };
const d = L.normalizar({ fichas: { AAA: ficha(), BBB: ficha(), CCC: ficha({ mult_hist: { per: 12 } }), DDD: ficha({ tipo: 'banco' }), EEE: ficha() }, ajustes: {}, precios: {} });
assert(L.provisional(d.fichas.AAA) && !L.provisional(d.fichas.CCC) && !L.provisional(d.fichas.DDD));
const informe = L.aplicarMultiplos(d, hist); const q = k => informe.find(x => x.tk === k);
assert(q('AAA').aplicado && near(d.fichas.AAA.mult_hist.per, 20, 0.05, 'AAA') === undefined); assert(d.fichas.AAA.mult_hist_auto && d.fichas.AAA.mult_hist_auto.n.per === 6);
assert(!q('BBB').aplicado && /EUR/.test(q('BBB').motivo) && !d.fichas.BBB.mult_hist, 'divisa distinta: no se mezcla'); assert(!q('EEE').aplicado && /sin histórico/.test(q('EEE').motivo));
assert.deepEqual(d.fichas.CCC.mult_hist, { per: 12 }, 'no pisa los que ya tienen'); assert(!q('CCC') && !q('DDD'));
const v = V.defaults(Object.assign({}, d.fichas.AAA, { precio: 150 })).conservador; near(v.per, 20, 0.05, 'el motor usa el PER propio'); near(v.ev_ebitda, 1540 / 120, 0.06, 'y el EV/EBITDA propio');
{ const cal = {}; anios.forEach(a => { cal[a + '-12'] = 144 * 3; }); const dd = L.normalizar({ fichas: { ALTO: ficha() }, ajustes: {}, precios: {} }); const ra = L.aplicarMultiplos(dd, { simbolos: { ALTO: { divisa: 'USD', cierres: cal, splits: [] } } }); assert(!ra[0].aplicado && /muy alto/.test(ra[0].motivo) && !dd.fichas.ALTO.mult_hist, 'PER 60x no se aplica solo'); }
assert.deepEqual(L.deshacerMultiplos(d), ['AAA']); assert(L.provisional(d.fichas.AAA) && !d.fichas.AAA.mult_hist_auto);
// ── Auditoría de divisas ──
const hoy = '2026-11-17', a = L.normalizar({ ajustes: { fx: { EUR: 1, USD: 1.1, CAD: 1.57, fecha: '2026-11-10' } }, fichas: {
  OK: ficha({ precio: 100, fecha_precio: '2026-11-16' }), VIEJO: ficha({ precio: 100, fecha_precio: '2026-10-01' }), CAD: ficha({ precio: 100, fecha_precio: '2026-11-16' }), TWD: ficha({ divisa: 'TWD', precio: 2100, fecha_precio: '2026-11-16' }), SINP: ficha({ precio: null }) },
  precios: { OK: { ticker: 'OK', precio: 101, divisa: 'USD', fecha_precio: '2026-11-16' }, CAD: { ticker: 'CAD', precio: 140, divisa: 'CAD', fecha_precio: '2026-11-16' }, TWD: { ticker: 'TWD', precio: 370, divisa: 'USD', fecha_precio: '2026-11-16' } } });
const au = L.auditoriaDivisas(a, hoy), f = (tk, n) => au.filter(x => x.tk === tk && (!n || x.nivel === n));
assert(!f('OK').some(x => x.nivel !== 'i'), 'OK sin avisos'); assert(f('VIEJO', 'y').length === 1 && /hace 47 días/.test(f('VIEJO', 'y')[0].txt), JSON.stringify(f('VIEJO')));
assert(f('CAD', 'i').length === 1 && f('CAD', 'y').some(x => /tipo de cambio es de hace 7/.test(x.txt)), JSON.stringify(f('CAD')));
assert(f('TWD', 'y').some(x => /TWD/.test(x.txt) && /USD/.test(x.txt)), 'ADR sin @ficha avisa: ' + JSON.stringify(f('TWD'))); assert(f('SINP', 'r').length === 1);
// divisas con espacios o minúsculas se normalizan (caso real: «EUR » en BIT:SOL@ficha)
const sp = L.normalizar({ fichas: { SP: ficha({ divisa: 'eur' }) }, precios: { SP: { ticker: 'SP', precio: 5, divisa: 'EUR ', fecha_precio: '2026-11-16' }, 'SP@ficha': { ticker: 'SP', precio: 6, divisa: ' eur', fecha_precio: '2026-11-16' } }, ajustes: {} });
assert.equal(sp.fichas.SP.divisa, 'EUR'); assert.equal(sp.precios['SP@ficha'].divisa, 'EUR'); assert(!L.auditoriaDivisas(sp, '2026-11-17').some(x => x.nivel === 'y' && /EUR/.test(x.txt)));
// ── Pantalla ──
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const datos = { version: 1, posiciones: [], movimientos: [], otras: { accounts: [] }, ajustes: {}, fichas: { AAA: ficha(), CCC: ficha({ mult_hist: { per: 12 } }) }, precios: { AAA: { ticker: 'AAA', precio: 150, divisa: 'USD', fecha_precio: '2026-11-16' } }, cribado: {}, resultados: [], updatedAt: 1 };
const fn = path.join(require('os').tmpdir(), 'hm.json'); fs.writeFileSync(fn, JSON.stringify(datos));
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0, async () => {
  const b = await chromium.launch(), pg = await (await b.newContext({ serviceWorkers: 'block' })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '' }));
  await pg.route('**/datos/precios_anuales.json*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ simbolos: { AAA: { divisa: 'USD', cierres, splits: [] } } }) }));
  await pg.goto('http://localhost:' + srv.address().port + '/'); await pg.click('#btn-ajustes'); await pg.setInputFiles('#a-imp', fn); await pg.waitForTimeout(800);
  await pg.click('[data-tab=valoracion]'); await pg.waitForTimeout(900); let t = await pg.textContent('#vista');
  assert(/1 fichas usan múltiplos genéricos/.test(t), 'VISTA: ' + t.slice(0, 500) + ' BODY: ' + (await pg.evaluate(() => document.body.innerText)).slice(0, 400));
  await pg.evaluate(() => document.querySelectorAll('details.vgrp').forEach(x => { x.open = true; })); await pg.click('[data-v=multglobal]'); await pg.waitForTimeout(600); const dl = await pg.evaluate(() => document.body.innerText); assert(/Múltiplos propios de 1 fichas/.test(dl) && /20,0x/.test(dl), 'DLG: ' + dl.slice(-700));
  assert(await pg.evaluate(() => Store.get().fichas.AAA.mult_hist.per) === 20);
  await pg.click('[data-a=cerrar]'); await pg.waitForTimeout(300); t = await pg.textContent('#vista'); assert(/Todas las fichas tienen múltiplos propios/.test(t) && /Deshacer los automáticos/.test(t), t.slice(0, 400));
  await pg.click('[data-v=deshacermult]'); await pg.waitForTimeout(400); assert(await pg.evaluate(() => Store.get().fichas.AAA.mult_hist) === undefined);
  assert.deepEqual(errs, []); console.log('historico_multiplos ok'); await b.close(); srv.close();
});
