/* v81: minoritarios de la SEC (lector y parche), intereses de STRL, año base de AVAV en EBITA (D&A solo depreciación) y supuestos de STRL/AVAV/VICI
   solo si la ficha no tiene supuestos propios. Sin datos personales. Uso: node tests/parches_v81.test.js */
const assert = require('assert'), L = require('../js/logic.js'), S = require('../scripts/datos_sec.js');
global.window = global; const V = require('../js/val.js');
const clone = o => JSON.parse(JSON.stringify(o));
/* Lector de la SEC: minoritarios = beneficio total − el de la dominante (o la etiqueta directa) */
{
  const fy = (v, y) => ({ start: y + '-01-01', end: y + '-12-31', val: v * 1e6, form: '10-K', filed: (y + 1) + '-02-20' });
  const cf = { facts: { 'us-gaap': { Revenues: { units: { USD: [2023, 2024, 2025].map(y => fy(1000, y)) } }, OperatingIncomeLoss: { units: { USD: [2023, 2024, 2025].map(y => fy(100, y)) } },
    ProfitLoss: { units: { USD: [fy(80, 2023), fy(90, 2024), fy(95, 2025)] } }, NetIncomeLoss: { units: { USD: [fy(80, 2023), fy(85, 2024), fy(90, 2025)] } },
    NetIncomeLossAttributableToNoncontrollingInterest: { units: { USD: [fy(4.5, 2025)] } } } } };
  assert.deepEqual(S.construir(cf).hist.minoritarios, [0, 5, 4.5], 'diferencia, y la etiqueta directa cuando existe');
}
const an = [2021, 2022, 2023, 2024, 2025], base = (n, extra) => Object.assign({ nombre: n, divisa: 'USD', anios: an.slice(), anio_base: 2025, conf: {}, hist: { ventas: [1, 1, 1, 1, 1], ebit: [1, 1, 1, 1, 1], minoritarios: [0, 0, 0, 0, 0], intereses: [null, null, null, null, null] } }, extra || {});
const d0 = L.normalizar(null); delete d0.ajustes.parches;
d0.fichas = { STRL: base('Sterling Infrastructure'), VICI: base('VICI Properties', { escenarios: { conservador: { g: 0.01 } } }),
  AVAV: Object.assign(base('AeroVironment'), { anios: [2022, 2023, 2024, 2025, 2026], anio_base: 2026, verificada: '2026-11-01', hist: { ventas: [1, 1, 1, 1, 1976.845], ebit: [1, 1, 1, 1, -310.995], da: [1, 1, 1, 1, 265.037] } }) };
const d = L.normalizar(clone(d0)), F = d.fichas;
assert.deepEqual(F.STRL.hist.minoritarios, [2.478, 1.74, 4.19, 13.457, 19.572]); assert.equal(F.STRL.conf.minoritarios, 'A');
assert.deepEqual(F.STRL.hist.intereses.slice(-3), [29.32, 25.255, 19.786]);
assert.equal(F.STRL.escenarios.conservador.m, 0.115); assert.equal(F.STRL.escenarios.conservador.fade, false); assert.deepEqual(F.STRL.deuda_neta_proy, [149, 149, 149, 149, 149]);
assert.deepEqual(F.VICI.escenarios, { conservador: { g: 0.01 } }, 'supuestos propios: no se tocan'); assert.equal(F.VICI.hist.minoritarios[4], 43.051, 'pero sí los minoritarios');
/* AVAV (verificada): EBITA del año base y D&A sin la amortización de intangibles */
assert.equal(F.AVAV.hist.extra[4], -492.86); assert.equal(F.AVAV.hist.da[4], 61.06);
{ const f = Object.assign(clone(F.AVAV), { precio: 90, hist: Object.assign(clone(F.AVAV.hist), { acciones: [1, 1, 1, 1, 49.087], capex: [1, 1, 1, 1, 62.544], impuestos: [0, 0, 0, 0, -23.059], caja: [0, 0, 0, 0, 632], deuda: [0, 0, 0, 0, 729] }) });
  const r = V.proyectar(f, Object.assign({}, V.defaults(f).conservador, f.escenarios.conservador)), q = r.rows[4];
  assert(Math.abs(q.fcf - q.ni) / q.ni < 0.1, 'el FCF ya no suma dos veces la amortización: FCF ' + q.fcf.toFixed(0) + ' ≈ BN ' + q.ni.toFixed(0)); }
assert(/BlueHalo/.test(F.AVAV.notas.join(' ')) && d.ajustes.copia_v81.AVAV, 'nota y copia');
const d2 = L.normalizar(clone(d)); assert.deepEqual(d2.fichas, d.fichas, 'una sola vez');
console.log('parches v81 ok');
