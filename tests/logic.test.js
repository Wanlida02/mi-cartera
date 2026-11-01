const assert = require('assert'), L = require('../js/logic.js');
const d = L.normalizar(null); let r;
r = L.compra(d, { empresa: 'Alphabet Inc.', ticker: 'GOOGL', broker: 'XTB', cantidad: 2, precio: 100, moneda: 'USD' }); assert(r.ok);
r = L.compra(d, { empresa: 'Alphabet (Class A)', broker: 'XTB', cantidad: 2, precio: 200, moneda: 'USD' }); assert(r.ok); assert.equal(d.posiciones.length, 1, 'se fusiona');
assert.equal(d.posiciones[0].cantidad, 4); assert.equal(d.posiciones[0].precio_medio_compra, 150);
assert(!L.compra(d, { empresa: 'Alphabet', broker: 'XTB', cantidad: 1, precio: 1, moneda: 'EUR' }).ok, 'moneda distinta rechazada');
assert(!L.venta(d, 0, { cantidad: 5 }).ok, 'no vender de más');
assert(L.venta(d, 0, { cantidad: 1, precio: 210 }).ok); assert.equal(d.posiciones[0].cantidad, 3);
L.borrarMov(d, d.movimientos[2].id); assert.equal(d.posiciones[0].cantidad, 4);
L.borrarMov(d, d.movimientos[1].id); assert.equal(d.posiciones[0].cantidad, 2); assert.equal(d.posiciones[0].precio_medio_compra, 100, 'deshacer compra restaura el medio');
L.venta(d, 0, { cantidad: 2 }); assert.equal(d.posiciones.length, 0); L.borrarMov(d, d.movimientos[d.movimientos.length - 1].id); assert.equal(d.posiciones[0].cantidad, 2, 'deshacer cierre repone');
assert(L.precioManual(d, d.posiciones[0], 123)); assert.equal(L.precioPos(d, d.posiciones[0]).precio, 123);
assert.equal(Math.round(L.aEur(d, 111.93, 'USD')), 100);
const dash = L.dashboard(d); assert.equal(dash.resumen.nPos, 1); assert(dash.sinFicha.length === 1);
console.log('logic ok');

/* Informes: nombres con apóstrofo, carpeta con el ticker y vínculo manual */
{
  const L2 = require('../js/logic.js'), d = L2.normalizar(null);
  d.posiciones.push({ empresa: "McDonald's", ticker: 'MCD', broker: 'X', cantidad: 1, moneda: 'USD', precio_medio_compra: 1 }, { empresa: 'Raytheon Technologies (RTX)', ticker: 'RTX', broker: 'X', cantidad: 1, moneda: 'USD', precio_medio_compra: 1 }, { empresa: 'TSMC', ticker: 'TSM', broker: 'X', cantidad: 1, moneda: 'USD', precio_medio_compra: 1 });
  d.informes = { empresas: [{ nombre: 'Mcdonalds', carpeta: 'Mcdonalds annual report', ticker: null, documentos: [], ultimo_anio: 2025 }, { nombre: 'Rtx', carpeta: 'Rtx annual report', ticker: null, documentos: [], ultimo_anio: 2025 }, { nombre: 'Taiwan', carpeta: 'Taiwan annual report', ticker: null, documentos: [], ultimo_anio: 2025 }] };
  let r = L2.informes(d, '2026-11-01');
  require('assert').deepEqual(r.sin.map(o => o.tk), ['TSM'], 'apóstrofo y carpeta con ticker emparejan');
  d.ajustes.alias_informes = { TSM: 'Taiwan annual report' }; r = L2.informes(d, '2026-11-01');
  require('assert').equal(r.sin.length, 0); console.log('informes alias ok');
}
{
  const L3 = require('../js/logic.js'), d3 = L3.normalizar(null);
  d3.informes = { empresas: [], avisos: ['X: «a.pdf» sin año'] };
  require('assert').deepEqual(L3.informes(d3, '2026-11-01').avisos, ['X: «a.pdf» sin año']); console.log('informes avisos ok');
}
