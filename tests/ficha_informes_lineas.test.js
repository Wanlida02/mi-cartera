const assert = require('assert'), DW = require('../js/datos-web.js'), L = require('../js/logic.js');
const e = { tk: 'FTDR', nombre: 'Frontdoor', datos: { divisa: 'USD', anios: [2021, 2022, 2023, 2024, 2025], metricas: {
  'Ventas': [1600, 1700, 1800, 1850, 1900], 'Beneficio operativo (EBIT)': [200, 210, 230, 250, 280], 'Beneficio neto': [120, 130, 140, 150, 170],
  'BPA diluido': [1.4, 1.6, 1.7, 1.9, 2.2], 'Gastos financieros (brutos)': [30, 30, 30, 30, 30], 'Amortizaciones (D&A)': [40, 41, 42, 43, 44],
  'Capex': [20, 21, 22, 23, 24], 'Caja y equivalentes': [300, 310, 320, 330, 340], 'Deuda financiera total': [600, 590, 580, 570, 560] } } };
const f = DW.aFichaInformes(e, '2026-11-12');
assert(f, 'ficha');
for (const k of ['intereses', 'da', 'capex', 'caja', 'deuda']) assert(f.hist[k] && f.hist[k][4] != null, 'falta ' + k);
assert.equal(f.hist.intereses[4], 30); assert.equal(f.hist.deuda[4], 560);
assert.equal(f.hist.impuestos[4], 280 - 30 - 170);
assert(!(L.lineasFaltantes(f) || []).length, 'incompleta: ' + JSON.stringify(L.lineasFaltantes(f)));
console.log('ficha_informes_lineas ok');
