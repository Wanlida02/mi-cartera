/* v79: ficha duplicada (NEURONES = NRO) unida, cribado duplicado de SOL, mes de cierre fiscal, múltiplos recalculados con ese mes,
   datos oficiales de Danieli y Constellation también en fichas verificadas, últimos 12 meses de Indra; todo una sola vez y con copia.
   Sin datos personales. Uso: node tests/parches_v79.test.js */
const assert = require('assert'), L = require('../js/logic.js');
const clone = o => JSON.parse(JSON.stringify(o)), an = [2020, 2021, 2022, 2023, 2024, 2025];
const ficha = (nombre, extra) => Object.assign({ nombre, divisa: 'EUR', anios: an.slice(), anio_base: 2025, hist: { ventas: an.map(() => 100), ebit: an.map(() => 10) }, conf: {} }, extra || {});
const d0 = L.normalizar(null); delete d0.ajustes.parches;
d0.fichas = { NRO: ficha('Neurones SA'), NEURONES: ficha('NEURONES S.A.', { _borrador: true }), AZO: ficha('AutoZone', { divisa: 'USD', mult_hist: { per: 20 } }), AAPL: ficha('Apple', { divisa: 'USD', verificada: '2026-11-01', mult_hist: { per: 25 } }),
  DANR: ficha('Danieli', { verificada: '2026-11-13', anios: [2020, 2021, 2022, 2023, 2024], hist: { ventas: [1, 1, 1, 1, 1], deuda: [500, 500, 500, 500, 500] } }),
  CSU: ficha('Constellation Software', { divisa: 'USD', verificada: '2026-11-17', anios: [2021, 2022, 2023, 2024, 2025], hist: { ventas: [1, 1, 1, 1, 1], capex: [null, null, 40, null, null] } }),
  IDR: ficha('Indra Sistemas') };
d0.cribado = { NEURONES: { ticker: 'NEURONES', nombre: 'Neurones', veredicto: 'Pasa' }, 'SOL SPA': { nombre: 'SOL' }, 'BIT:SOL': { nombre: 'SOL' } };
const d = L.normalizar(clone(d0)), F = d.fichas, ya = d.ajustes.parches;
/* Duplicados */
assert(!F.NEURONES && F.NRO, 'NEURONES eliminada, NRO se queda'); assert(d.ajustes.copia_v79.fichas.NEURONES, 'copia para recuperarla');
assert(d.cribado.NRO && !d.cribado.NEURONES, 'el cribado pasa a NRO'); assert(!d.cribado['SOL SPA'] && d.cribado['BIT:SOL'], 'cribado duplicado de SOL'); assert(/duplicada/.test(F.NRO.notas.join(' ')));
{ const x = clone(d0); x.fichas.NEURONES.verificada = '2026-01-01'; assert(L.normalizar(x).fichas.NEURONES, 'una ficha verificada no se borra'); }
/* Mes de cierre y múltiplos */
assert.equal(F.AZO.mes_cierre, 8); assert.equal(F.AAPL.mes_cierre, 9);
assert.notEqual(F.AZO.mult_hist.per, 20, 'múltiplos recalculados'); assert(F.AZO.mult_hist_auto && /mes 8/.test(F.AZO.mult_hist_auto.fuente));
assert.equal(F.AAPL.mult_hist.per, 25, 'ficha verificada: sus múltiplos no se tocan');
/* Danieli: deuda oficial (corrige) y arrendamientos (rellena), aunque esté verificada */
assert.deepEqual(F.DANR.hist.deuda.slice(0, 4), [673.1, 718.3, 926.5, 682.1]); assert.equal(F.DANR.hist.deuda[4], 500, 'el año sin dato oficial no se toca');
assert.equal(F.DANR.hist.leases_deuda[0], 45.7); assert.equal(F.DANR.conf.deuda, 'A'); assert(d.ajustes.copia_v79b.DANR, 'copia de Danieli');
/* Constellation: solo rellena huecos */
assert.equal(F.CSU.hist.capex[2], 40, 'no pisa lo que había'); assert.equal(F.CSU.hist.capex[0], 29); assert.equal(F.CSU.hist.da[4], 1383);
/* Indra: registro de 12 meses */
const r = d.resultados.find(x => x.tk === 'IDR'); assert(r && r.doce && r.doce.fin === '2026-09-30' && r.doce.anio_base === 2025, 'TTM de Indra');
/* Una sola vez */
const d2 = L.normalizar(clone(d)); assert.deepEqual(d2.fichas, d.fichas); assert.equal(d2.resultados.length, d.resultados.length);
assert(['v79-duplicados', 'v79-danr-nfp', 'v79-csu-ifrs', 'v79-mes-azo', 'v79-mult-azo'].every(k => ya.includes(k)));
console.log('parches v79 ok');
/* v80: VICI y CTRE reciben múltiplos propios solo si no tenían ninguno */
{
  const x = L.normalizar(null); delete x.ajustes.parches; x.fichas = { VICI: ficha('VICI Properties', { divisa: 'USD' }), CTRE: ficha('CareTrust REIT', { divisa: 'USD', mult_hist: { per: 30 } }) };
  const y = L.normalizar(x); assert.equal(y.fichas.VICI.mult_hist.pfcf, 17.8); assert(/REIT/.test(y.fichas.VICI.notas.join(' ')) && /mes 12/.test(y.fichas.VICI.mult_hist_auto.fuente));
  assert.deepEqual(y.fichas.CTRE.mult_hist, { per: 30 }, 'si ya tenía múltiplos, no se tocan');
  console.log('parches v80 ok');
}
