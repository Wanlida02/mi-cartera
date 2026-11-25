/* Splits: detección automática en la actualización de precios (factor + confirmación con el histórico ajustado), ajuste automático y único
   de fichas, posiciones, movimientos, cribado, resultados y precios guardados; aviso si el precio salta sin split registrado; la SEC ajusta
   las acciones y el BPA presentados antes del split. Caso real: Sandisk (SNDK), 8 por 1 el 20-11-2026. Sin datos personales.
   Uso: node tests/splits.test.js */
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os');
global.window = global; global.Val = require('../js/val.js'); const L = require('../js/logic.js'), SP = require('../scripts/splits.js'), SEC = require('../scripts/datos_sec.js');
const clone = o => JSON.parse(JSON.stringify(o));
(async () => {
  /* 1 · Factor de split a partir del salto de precio */
  assert.equal(SP.factorDe(755.2, 94.4), 8); assert.equal(SP.factorDe(100, 52), 2); assert.equal(SP.factorDe(10, 100), 0.1, 'contrasplit 1:10');
  assert.equal(SP.factorDe(100, 70), null, 'una caída del 30 % no es un split'); assert.equal(SP.factorDe(100, 45), null, 'ni una del 55 %');
  /* 2 · Detección: candidato confirmado con el cierre ajustado de CNBC; caída real descartada; sin fuentes → pendiente y se reintenta */
  const prev = { SNDK: { precio: 755.2, divisa: 'USD', fecha_precio: '2026-11-19', simbolo: 'SNDK' }, XXX: { precio: 50, divisa: 'USD', fecha_precio: '2026-11-19', simbolo: 'XXX' }, YYY: { precio: 30, divisa: 'USD', fecha_precio: '2026-11-19', simbolo: 'YYY' } };
  const nuevos = { SNDK: { precio: 94.4, divisa: 'USD', fecha_precio: '2026-11-20', simbolo: 'SNDK' }, XXX: { precio: 25.3, divisa: 'USD', fecha_precio: '2026-11-20', simbolo: 'XXX' }, YYY: { precio: 14.9, divisa: 'USD', fecha_precio: '2026-11-20', simbolo: 'YYY' } };
  const sinYahoo = async () => { throw new Error('429'); };
  const cnbc = async sym => (sym === 'SNDK' ? { '2026-11-18': 92.1, '2026-11-19': 94.4, '2026-11-20': 94.4 } : sym === 'XXX' ? { '2026-11-19': 50, '2026-11-20': 25.3 } : (() => { throw new Error('sin CNBC'); })());
  let r = await SP.revisar(prev, nuevos, { registro: { splits: {} }, yahoo: sinYahoo, cnbc });
  assert.deepEqual(r.hechos, ['SNDK ×8']); assert.equal(r.registro.splits.SNDK[0].fecha, '2026-11-20'); assert.equal(r.registro.splits.SNDK[0].estado, 'confirmado');
  assert(!r.registro.splits.XXX && !r.registro.pendientes.XXX, 'XXX cayó un 49 % de verdad: el histórico ajustado no se movió'); assert(r.registro.pendientes.YYY, 'YYY sin confirmar: pendiente');
  /* reintento: Yahoo ya da el evento */
  const r2 = await SP.revisar(nuevos, Object.assign({}, nuevos, { YYY: Object.assign({}, nuevos.YYY, { fecha_precio: '2026-11-21' }) }), { registro: r.registro, yahoo: async s => (s === 'YYY' ? [{ fecha: '2026-11-20', k: 2 }] : []), cnbc });
  assert.equal(r2.registro.splits.YYY[0].k, 2); assert(!r2.registro.pendientes.YYY); assert.equal(r2.registro.splits.SNDK.length, 1, 'no se duplica');
  /* 3 · Ajuste en la app */
  const d = L.normalizar(null); d.ajustes.fx = Object.assign(d.ajustes.fx, { USD: 1.15 });
  d.fichas.SNDK = { nombre: 'Sandisk Corporation', divisa: 'USD', anios: [2025, 2026], anio_base: 2026, fecha_datos: '2026-10-23', precio: 1260.93, fecha_precio: '2026-10-22',
    hist: { ventas: [7355, 20248], ebit: [-1377, 12389], ni_reportado: [-1641, 11433], acciones: [145, 155], bpa: [-11.32, 73.76] }, extra_cribado: { fcf_por_accion: 40 } };
  d.precios.SNDK = { precio: 77.57, divisa: 'USD', fecha_precio: '2026-11-24', fuente: 'cnbc' };
  L.compra(d, { empresa: 'Sandisk', ticker: 'SNDK', broker: 'T212', cantidad: 0.2, precio: 963.18, moneda: 'EUR' });                                  // sin fecha, escala antigua
  L.compra(d, { empresa: 'Sandisk', ticker: 'SNDK', broker: 'XTB', cantidad: 3, precio: 70, moneda: 'EUR' });                                        // sin fecha, ya en la nueva
  d.movimientos.forEach(m => { m.fecha = m.antes && false ? null : (m.broker === 'T212' ? '2026-10-01' : '2026-11-22'); });
  d.cribado.SNDK = { ticker: 'SNDK', bpa_ttm: 120, fcf_por_accion: 90, acciones_diluidas_m: 155, fecha_datos: '2026-11-01' };
  d.resultados.push({ id: 'r1', tk: 'SNDK', precio_ref: 817.76, precio_fecha: '2026-11-17' });
  assert(/÷16/.test(L.sospechaSplit(d, 'SNDK')), 'sin registro: se avisa del salto');
  const antes = clone(d), hechos = L.aplicarSplits(d, { SNDK: [{ fecha: '2026-11-20', k: 8, estado: 'confirmado' }] }, '2026-11-25');
  assert.equal(hechos.length, 1); const f = d.fichas.SNDK;
  assert.deepEqual(f.hist.acciones, [1160, 1240]); assert.deepEqual(f.hist.bpa, [-1.415, 9.22]); assert.equal(f.precio, 157.61625); assert.equal(f.extra_cribado.fcf_por_accion, 5);
  const t212 = d.posiciones.find(p => p.broker === 'T212'), xtb = d.posiciones.find(p => p.broker === 'XTB');
  assert.equal(t212.cantidad, 1.6); assert.equal(t212.precio_medio_compra, 120.3975); assert(/split 8 por 1/.test(t212.notas));
  assert.equal(xtb.cantidad, 3, 'comprada ya en la escala nueva: no se toca'); assert.equal(xtb.precio_medio_compra, 70);
  const mT = d.movimientos.find(m => m.broker === 'T212'), mX = d.movimientos.find(m => m.broker === 'XTB'); assert.equal(mT.cantidad, 1.6); assert.equal(mT.precio, 120.3975); assert.equal(mX.cantidad, 3);
  assert.equal(d.cribado.SNDK.bpa_ttm, 15); assert.equal(d.cribado.SNDK.acciones_diluidas_m, 1240); assert.equal(d.resultados[0].precio_ref, 102.22);
  assert.equal(L.sospechaSplit(d, 'SNDK'), null, 'tras el ajuste ya no avisa'); assert(d.ajustes.copia_splits['SNDK|2026-11-20'].ficha.hist.acciones[1] === 155, 'copia para deshacer');
  /* valoración: PER coherente (antes ~1) */
  const per = x => { const g = clone(x.fichas.SNDK); g.precio = 77.57; return Val.actuales(g).per; }; assert(per(antes) < 2 && per(d) > 6, 'PER ' + per(antes).toFixed(1) + ' → ' + per(d).toFixed(1));
  /* una sola vez */
  const d2 = clone(d); assert.deepEqual(L.aplicarSplits(d2, { SNDK: [{ fecha: '2026-11-20', k: 8 }] }), []); assert.deepEqual(d2.fichas, d.fichas); assert.deepEqual(d2.posiciones, d.posiciones);
  /* ficha creada después del split (desde la SEC ya ajustada): no se toca */
  const d3 = L.normalizar(null); d3.fichas.SNDK = Object.assign(clone(antes.fichas.SNDK), { fecha_datos: '2026-11-26', hist: { ventas: [1, 2], ebit: [1, 1], acciones: [1160, 1240] } });
  L.aplicarSplits(d3, { SNDK: [{ fecha: '2026-11-20', k: 8 }] }); assert.deepEqual(d3.fichas.SNDK.hist.acciones, [1160, 1240]);
  /* pendiente → aviso */
  const d4 = clone(antes); d4.ajustes.splits_pendientes = ['SNDK']; assert(/Posible split/.test(L.sospechaSplit(d4, 'SNDK')));
  /* 4 · SEC: acciones y BPA presentados antes del split, ×8 y ÷8; los presentados después ya vienen reexpresados */
  const fy = (v, y, filed, unit) => ({ start: (y - 1) + '-07-01', end: y + '-06-30', val: v, form: '10-K', filed });
  const cf = { facts: { 'us-gaap': { Revenues: { units: { USD: [fy(7e9, 2025, '2025-08-20'), fy(2e10, 2026, '2026-08-17'), fy(3e10, 2027, '2027-08-17')] } },
    WeightedAverageNumberOfDilutedSharesOutstanding: { units: { shares: [fy(145e6, 2025, '2025-08-20'), fy(155e6, 2026, '2026-08-17'), fy(1250e6, 2027, '2027-08-17')] } },
    EarningsPerShareDiluted: { units: { 'USD/shares': [fy(-11.32, 2025, '2025-08-20'), fy(73.76, 2026, '2026-08-17'), fy(15, 2027, '2027-08-17')] } } } } };
  const c = SEC.construir(cf, [{ fecha: '2026-11-20', k: 8 }]); assert.deepEqual(c.hist.acciones, [1160, 1240, 1250]); assert.deepEqual(c.hist.bpa, [-1.415, 9.22, 15]); assert(c.notas.some(x => /split \(8 por 1/.test(x)));
  assert.deepEqual(SEC.construir(cf).hist.acciones, [null, null, 1250], 'sin registro: la protección anterior descarta las acciones de antes del salto (con el registro se conservan ajustadas)');
  /* 5 · El registro del repositorio tiene el caso de Sandisk */
  const R = JSON.parse(fs.readFileSync(path.join(__dirname, '../datos/splits.json'), 'utf8')); assert.equal(R.splits.SNDK[0].k, 8);
  console.log('splits ok');
})().catch(e => { console.error('FALLO', e.message); process.exitCode = 1; });
