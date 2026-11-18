/* Calidad de fichas: detector, acciones enlazadas, método de flujo de caja y procedimiento de 12 meses (SEC / no SEC). Autocontenido. */
const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
global.Val = require('../js/val.js'); const L = require('../js/logic.js'), V = global.Val;
const anios = [2020, 2021, 2022, 2023, 2024, 2025], rep = (v, n) => Array(n).fill(v), HOY = '2026-11-17';
const ficha = extra => Object.assign({ nombre: 'Test Co', divisa: 'USD', anio_base: 2025, anios, precio: 150, fecha_precio: '2026-11-16', fecha_datos: '2026-03-01', estado: 'watchlist',
  hist: { ventas: rep(1000, 6), ebit: rep(100, 6), impuestos: rep(18, 6), intereses: rep(10, 6), da: rep(20, 6), capex: rep(30, 6), caja: rep(100, 6), deuda: rep(200, 6), acciones: rep(10, 6), leases: rep(0, 6), minoritarios: rep(0, 6), leases_deuda: rep(0, 6) },
  conf: { ventas: 'A', ebit: 'A', da: 'A', impuestos: 'A', acciones: 'A', capex: 'A', caja: 'A', deuda: 'A' } }, extra || {});
const dist = () => { const f = ficha(); f.hist.capex = rep(70, 6); return f; };   // beneficio 72, FCF 22 → 0,3x
const mk = fs_ => ({ posiciones: [], movimientos: [], otras: { accounts: [] }, ajustes: {}, fichas: fs_, precios: Object.fromEntries(Object.keys(fs_).map(k => [k, { ticker: k, precio: 150, divisa: 'USD', fecha_precio: '2026-11-16' }])), cribado: {}, resultados: [], updatedAt: 1 });
const cierres = {}; anios.forEach(a => { cierres[a + '-12'] = 144; });
const hist = { simbolos: { AAA: { divisa: 'USD', cierres, splits: [] }, CCC: { divisa: 'USD', cierres, splits: [] } } };
const cod = (c, k) => c.problemas.filter(p => p.cod === k);
// ── Lógica ──
{
  const d = L.normalizar(mk({ AAA: dist(), CCC: ficha(), BBB: ficha({ mult_hist: { per: 15, pfcf: 15, ev_ebitda: 9, ev_ebit: 11 } }) }));
  const ctx = { hist, secListo: true, sec: () => null, secEntrada: () => undefined };
  const r = L.calidadFichas(d, HOY, ctx), A = r.find(x => x.tk === 'AAA'), B = r.find(x => x.tk === 'BBB');
  assert(A && B); assert(cod(A, 'distorsion').length === 1 && cod(A, 'distorsion')[0].acc === 'solofcf', 'distorsionada → ofrece método de flujo');
  assert(!cod(B, 'distorsion').length, 'ficha normal: sin distorsión'); assert(cod(B, 'multprov').length === 0, 'con múltiplos propios no es provisional');
  const C = r.find(x => x.tk === 'CCC'); assert(cod(C, 'multprov')[0].acc === 'multpropios', 'con histórico válido: acción calcular múltiplos propios');
  assert.deepEqual(cod(A, 'multprov').map(p => p.acc), ['multguia'], 'P/FCF de 65x: no se aplica solo, pide ponerlos a mano'); assert(/muy alto/.test(cod(A, 'multprov')[0].txt));
  assert.deepEqual(cod(L.calidadFichas(d, HOY, { sec: () => null }).find(x => x.tk === 'CCC'), 'multprov').map(p => p.acc), ['multguia'], 'sin histórico: pide ponerlos a mano');
  assert(r.indexOf(A) < r.indexOf(B), 'ordenadas por fiabilidad (peor primero)');
  // ── 12 meses: SEC / no SEC ──
  assert.equal(cod(A, 'ttm_falta')[0].acc, 'cifras12'); assert(/IA/.test(cod(A, 'ttm_falta')[0].accTxt), 'no está en la SEC → IA/manual');
  const cs = L.calidadFichas(d, HOY, { hist, secListo: true, sec: () => null, secEntrada: () => ({ nombre: 'x' }) }).find(x => x.tk === 'AAA'); assert(/SEC/.test(cod(cs, 'ttm_falta')[0].accTxt), 'en la SEC → se traen de la SEC');
  const ce = L.calidadFichas(d, HOY, { hist, secListo: true, sec: () => null, secEntrada: () => ({ error: 'no hay' }) }).find(x => x.tk === 'AAA'); assert(/IA/.test(cod(ce, 'ttm_falta')[0].accTxt), 'entrada con error en la SEC → IA');
  const c1 = L.calidadFichas(d, HOY, { hist, secListo: true, sec: () => ({ doce: { fin: '2026-09-30', dv: 0.05, de: 0.04, fuente: 'SEC' } }), secEntrada: () => ({}) }).find(x => x.tk === 'AAA'); assert(!cod(c1, 'ttm_falta').length && !cod(c1, 'ttm_difiere').length, 'con cifras de 12 meses parecidas no avisa');
  const c2 = L.calidadFichas(d, HOY, { hist, secListo: true, sec: () => ({ doce: { fin: '2026-09-30', dv: 0.3, de: 0.4, fuente: 'IA' } }), secEntrada: () => undefined }).find(x => x.tk === 'AAA'); assert(cod(c2, 'ttm_difiere').length === 1, 'TTM muy distinto al ejercicio: avisa');
  const c3 = L.calidadFichas(d, '2026-03-10', { hist, secListo: true, sec: () => null, secEntrada: () => undefined }).find(x => x.tk === 'AAA'); assert(!cod(c3, 'ttm_falta').length, 'recién cerrado el ejercicio no exige 12 meses');
  const c4 = L.calidadFichas(d, HOY, { hist, secListo: true, sec: () => ({ nuevo: 2026 }), secEntrada: () => ({}) }).find(x => x.tk === 'AAA'); assert(cod(c4, 'nuevoej')[0].acc === 'nuevoej');
  // ── Método de flujo: vista previa no cambia nada; aplicar y deshacer ──
  const ref0 = L.valoracion(d, 'AAA', HOY).ref, pv = L.previsualizarSoloFcf(d, 'AAA'); assert(pv.antes === ref0 && pv.despues != null && pv.despues !== pv.antes, 'la vista previa cambia el resultado'); assert(!d.fichas.AAA.solo_fcf, 'la vista previa no deja rastro');
  L.aplicarSoloFcf(d, 'AAA', true); assert.equal(L.valoracion(d, 'AAA', HOY).ref, pv.despues); const A2 = L.calidadFichas(d, HOY, ctx).find(x => x.tk === 'AAA'); assert(!cod(A2, 'distorsion').length && cod(A2, 'solofcf')[0].acc === 'quitarsolofcf', 'activo: ofrece volver');
  L.aplicarSoloFcf(d, 'AAA', false); assert.equal(L.valoracion(d, 'AAA', HOY).ref, ref0, 'deshacer devuelve el valor exacto'); assert(d.fichas.AAA.solo_fcf === undefined);
  // fichas sanas y bancos no se tocan; ficha incompleta es poco fiable con acción
  const inc = L.normalizar(mk({ ZZZ: Object.assign(ficha(), { _borrador: true, hist: Object.assign(ficha().hist, { caja: undefined }) }) })); const z = L.calidadFichas(inc, HOY, {})[0]; assert.equal(z.nivel, 'r'); assert(cod(z, 'incompleta')[0].acc === 'abrir');
}
// ── Pantalla ──
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const fn = path.join(require('os').tmpdir(), 'cal.json'); fs.writeFileSync(fn, JSON.stringify(mk({ AAA: dist(), CCC: ficha() })));
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0, async () => {
  const b = await chromium.launch(), pg = await (await b.newContext({ serviceWorkers: 'block' })).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '' }));
  await pg.route('**/datos/resumen.json*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ empresas: {} }) }));
  await pg.route('**/datos/precios_anuales.json*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(hist) }));
  await pg.goto('http://localhost:' + srv.address().port + '/'); await pg.click('#btn-ajustes'); await pg.setInputFiles('#a-imp', fn); await pg.waitForTimeout(800);
  await pg.click('[data-tab=valoracion]'); await pg.waitForTimeout(900); let t = await pg.textContent('#vista');
  assert(/Calidad de las fichas/.test(t) && /Valorar solo con el flujo de caja/.test(t) && /Calcular múltiplos propios/.test(t) && /Cifras con una IA/.test(t), 'PANEL: ' + t.slice(0, 900));
  // acción: flujo de caja (vista previa → aplicar)
  const abre = () => pg.evaluate(() => document.querySelectorAll('details.cal-f').forEach(x => { x.open = true; }));
  await abre(); await pg.click('button[data-ac=solofcf]'); await pg.waitForTimeout(400); let dl = await pg.evaluate(() => document.body.innerText); assert(/solo con el flujo de caja/.test(dl) && /Rentabilidad a 5 años/.test(dl), dl.slice(-600));
  await pg.click('#v-sf-ok'); await pg.waitForTimeout(500); assert(await pg.evaluate(() => Store.get().fichas.AAA.solo_fcf) === true);
  t = await pg.textContent('#vista'); assert(/Volver al método normal/.test(t) && !/Valorar solo con el flujo de caja/.test(t), t.slice(0, 700));
  // acción: 12 meses fuera de la SEC → diálogo de IA
  await abre(); await pg.click('button[data-ac=cifras12]'); await pg.waitForTimeout(500); dl = await pg.evaluate(() => document.body.innerText); assert(/Cifras de 12 meses con una IA/.test(dl), dl.slice(-500));
  await pg.click('#ia-vuelve'); await pg.waitForTimeout(300); assert(!(await pg.evaluate(() => document.getElementById('dlg').open)), 'Volver cierra el diálogo');
  // la ficha enlaza con lo mismo
  await pg.click('[data-v=abrir][data-k=AAA]'); await pg.waitForTimeout(500); t = await pg.textContent('#vista'); assert(/Calidad de esta ficha/.test(t) && /Volver al método normal/.test(t), t.slice(0, 600));
  await pg.click('[data-ac=quitarsolofcf]'); await pg.waitForTimeout(400); assert(await pg.evaluate(() => Store.get().fichas.AAA.solo_fcf) === undefined);
  assert.deepEqual(errs, []); console.log('calidad_fichas ok'); await b.close(); srv.close();
});
