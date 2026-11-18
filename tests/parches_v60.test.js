/* Parches v60: rellenan datos contrastados solo en fichas sin verificar, son idempotentes y no pisan fichas verificadas; FDX pierde su escenario guardado absurdo; ESEA y AIR reciben su interruptor. */
global.Val = require('../js/val.js'); const L = require('../js/logic.js'), assert = require('assert');
const nul = n => Array(n).fill(null);
const ficha = (anios, extra) => Object.assign({ anios, anio_base: anios[anios.length - 1], divisa: 'USD', hist: { ventas: anios.map(() => 100), caja: anios.map(() => 100), capex: nul(anios.length), deuda: nul(anios.length), acciones: anios.map(() => 10) }, conf: {} }, extra || {});
const base = () => ({ fichas: {
  PRDO: ficha([2020, 2021, 2022, 2023, 2024, 2025]),
  CHE: ficha([2024, 2025], { verificada: '2026-01-01' }),
  FDX: ficha([2024, 2025], { mult_hist: { ev_ebitda: 8.9 }, escenarios: { conservador: { ev_ebitda: 1.4, g: 0.05 } } }),
  ESEA: ficha([2024, 2025]), AIR: ficha([2024, 2025]) }, precios: {}, cribado: {}, posiciones: [] });
const d = L.normalizar(base());
assert.deepStrictEqual(d.fichas.PRDO.hist.caja, [406.4, 494.2, 508.7, 603.1, 568.9, 622.2], 'caja pisada con la de la SEC');
assert.strictEqual(d.fichas.PRDO.hist.capex[5], 8.6); assert.strictEqual(d.fichas.PRDO.hist.deuda[4], 56.5);
assert.deepStrictEqual(d.fichas.CHE.hist.deuda, [null, null], 'ficha verificada: no se toca');
assert.ok(!d.fichas.FDX.escenarios, 'FDX sin escenario guardado'); assert.ok(d.ajustes.copia_escenarios_FDX.conservador, 'queda copia');
assert.strictEqual(d.fichas.ESEA.flota, true); assert.strictEqual(d.fichas.AIR.crec_desde_previo, false);
const n1 = d.ajustes.parches.length, notas = d.fichas.PRDO.notas.length;
L.normalizar(d); assert.strictEqual(d.ajustes.parches.length, n1, 'idempotente'); assert.strictEqual(d.fichas.PRDO.notas.length, notas);
d.fichas.PRDO.hist.capex[5] = 99; L.normalizar(d); assert.strictEqual(d.fichas.PRDO.hist.capex[5], 99, 'no pisa ediciones posteriores');
const e = base(); e.fichas.FDX.escenarios.conservador.ev_ebitda = 8.5; assert.ok(L.normalizar(e).fichas.FDX.escenarios, 'escenario razonable: se respeta');
console.log('parches_v60 ok');
