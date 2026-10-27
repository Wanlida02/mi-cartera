const assert = require('assert'), P = require('../scripts/actualizar_precios.js'), L = require('../js/logic.js');
// Yahoo: acción de EE. UU. (la fecha debe ser la local de Nueva York, no la UTC)
const ny = { chart: { result: [{ meta: { currency: 'USD', regularMarketPrice: 418.512, regularMarketTime: 1792800000, exchangeTimezoneName: 'America/New_York' }, timestamp: [1792800000], indicators: { quote: [{ close: [418.5] }] } }] } };
let r = P.leerYahoo(ny); assert.equal(r.divisa, 'USD'); assert.equal(r.precio, 418.512); assert.equal(r.fecha, P.fechaLocal(1792800000, 'America/New_York'));
assert.equal(P.fechaLocal(Date.UTC(2026, 9, 23, 2, 0) / 1000, 'America/New_York'), '2026-10-22', 'a las 2:00 UTC aún es el día anterior en Nueva York');
// Peniques de Londres → libras
r = P.leerYahoo({ chart: { result: [{ meta: { currency: 'GBp', regularMarketPrice: 12345, regularMarketTime: 1792800000, exchangeTimezoneName: 'Europe/London' } }] } }); assert.equal(r.divisa, 'GBP'); assert.equal(r.precio, 123.45);
// Sin precio de mercado: usa el último cierre
r = P.leerYahoo({ chart: { result: [{ meta: { currency: 'EUR', regularMarketTime: 1792800000, exchangeTimezoneName: 'Europe/Paris' }, indicators: { quote: [{ close: [190, 192.5, null] }] } }] } }); assert.equal(r.precio, 192.5);
assert.throws(() => P.leerYahoo({ chart: { result: null } })); assert.throws(() => P.leerYahoo({ chart: { result: [{ meta: { currency: 'USD' } }] } }));
// Stooq
r = P.leerGoogle('<div class="x" data-source="AIR" data-currency-code="EUR" data-last-price="1,234.56" data-last-normal-market-timestamp="1793000000"></div>'); assert.equal(r.precio, 1234.56); assert.equal(r.divisa, 'EUR');
assert.throws(() => P.leerGoogle('<html>nada</html>'));
r = P.leerStooq('Symbol,Date,Time,Close\r\nTSM.US,2026-10-23,22:00:09,418.51\r\n'); assert.equal(r.precio, 418.51); assert.equal(r.fecha, '2026-10-23');
assert.throws(() => P.leerStooq('Symbol,Date,Time,Close\r\nXXX.US,N/D,N/D,N/D\r\n'));

// Lógica: la ficha de TSM está en TWD; el ADR cotiza en USD. Con la cotización «@ficha» (2330.TW) se valora con precio fresco.
const d = L.normalizar(null);
d.ajustes.fx = Object.assign(d.ajustes.fx, { USD: 1.1, TWD: 36 });
d.fichas.TSM = { nombre: 'TSMC', divisa: 'TWD', precio: 2000, fecha_precio: '2026-10-01', tipo: 'industrial' };
d.precios.TSM = { precio: 400, divisa: 'USD', fecha_precio: '2026-10-26' };
assert.equal(L.precioFicha(d, 'TSM').precio, 2000, 'sin cotización en TWD no se convierte el ADR');
d.precios['TSM@ficha'] = { precio: 2700, divisa: 'TWD', fecha_precio: '2026-10-26' };
assert.equal(L.precioFicha(d, 'TSM').precio, 2700); assert.equal(L.precioFicha(d, 'TSM').fecha, '2026-10-26');
// SNDK: precio en EUR, ficha en USD → se convierte con el cambio
d.fichas.SNDK = { nombre: 'Sandisk', divisa: 'USD', precio: 1000, fecha_precio: '2026-10-01' }; d.precios.SNDK = { precio: 1000, divisa: 'EUR', fecha_precio: '2026-10-26' };
assert.equal(Math.round(L.precioFicha(d, 'SNDK').precio), 1100);
// Posición en EUR de un valor cotizado en HKD: se convierte con el tipo de HKD
d.ajustes.fx.HKD = 8.6; d.precios.CATL = { precio: 430, divisa: 'HKD', fecha_precio: '2026-10-26' };
d.posiciones.push({ empresa: 'CATL', ticker: 'CATL', broker: 'T212', cantidad: 2, precio_medio_compra: 40, moneda: 'EUR' });
assert.equal(Math.round(L.precioPos(d, d.posiciones[0]).precio), 50);
console.log('precios ok');
