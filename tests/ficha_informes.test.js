const assert = require('assert'), DW = require('../js/datos-web.js'), fs = require('fs');
global.window = {}; const C = (() => { const src = fs.readFileSync(__dirname + '/../js/cribado.js', 'utf8'); const m = { exports: {} }; new Function('module', 'exports', src + '\nif(typeof Cribado!=="undefined")module.exports=Cribado;')(m, m.exports); return m.exports; })();
const e = { tk: 'AENA', nombre: 'Aena', csv: 'Aena_datos.csv', generado: '2026-10-30T10:00:00', datos: { divisa: 'EUR', anios: [2020, 2021, 2022, 2023, 2024, 2025], metricas: {
  'Ventas': [1700, 2500, 4200, 4800, 5100, 5400], 'Beneficio operativo (EBIT)': [-400, 500, 1500, 2000, 2200, 2400], 'Beneficio neto': [-300, 300, 1100, 1500, 1700, 2100],
  'BPA diluido': [-0.02, 0.02, 0.07, 0.10, 0.11, 0.14], 'Deuda neta / EBITDA': [9, 5, 3, 2.5, 2, 1.7], 'FCF / acción': [0, 0.01, 0.06, 0.08, 0.09, 0.1], 'ROE %': [null, 5, 15, 18, 19, 20] } } };
const f = DW.aFichaInformes(e, '2026-11-04');
assert.equal(f.ticker, 'AENA'); assert.equal(f.divisa, 'EUR'); assert.equal(f.anios.length, 6); assert.equal(f.hist.acciones[5], 15000); assert.equal(f.hist.acciones[0], null);
assert.equal(f.extra_cribado.deuda_neta_ebitda, 1.7);
const x = C.desdeFicha(f, {}); assert(x && x.margen_ebit === 44.4 && x.deuda_neta_ebitda === 1.7 && x.fcf_por_accion === 0.1 && x.ventas_cagr_5y > 20, JSON.stringify(x));
assert.equal(DW.aFichaInformes({ tk: 'X', datos: { anios: [2024, 2025], metricas: { Ventas: [1, 2] } } }), null);
assert.equal(DW.aFichaInformes({ tk: 'X' }), null);
console.log('ficha_informes ok');
