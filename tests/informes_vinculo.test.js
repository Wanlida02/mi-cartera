/* Una empresa con dos nombres (ficha NRO + watchlist NEURONES) comparte su carpeta de informes en vez de quedar «sin informes». Empresas distintas con nombre parecido NO se mezclan. */
global.Val = require('../js/val.js'); const L = require('../js/logic.js'), assert = require('assert');
const emp = (carpeta, nombre, ticker) => ({ carpeta, nombre, ticker, ident: null, ultimo_anio: 2025, documentos: [{ anio: 2025, tipo: 'AR' }], trimestrales: [], datos: null, csv: null, modificado: '2026-11-16' });
const base = (alias, idxEmp) => L.normalizar({ fichas: { NRO: { ticker: 'NRO', nombre: 'Neurones', _borrador: true, anios: [2024, 2025], anio_base: 2025, hist: { ventas: [1, 1] }, conf: {} } },
  cribado: { NEURONES: { nombre: 'NEURONES' }, 'ROYAL CARIBBEAN': { nombre: 'Royal Caribbean Cruises' }, 'ROYAL GOLD': { nombre: 'Royal Gold' } }, precios: {}, posiciones: [], ajustes: Object.assign({ parches: ['v60-x', 'v61-nro-ia'] }, alias ? { alias_informes: alias } : {}),
  informes: { version: 1, generado: '2026-11-16T15:09:30', avisos: [], empresas: idxEmp || [emp('Neurones annual report', 'Neurones', 'NRO.PA')] } });
/* con el vínculo manual que ya tiene el usuario */
let r = L.informes(base({ NEURONES: 'Neurones annual report' }));
assert.ok(!r.sin.some(o => o.tk === 'NEURONES'), 'NEURONES ya no queda sin informes'); const n = r.lista.filter(e => e.carpeta === 'Neurones annual report'); assert.strictEqual(n.length, 1, 'una sola fila'); assert.strictEqual(n[0].estado, 'watchlist', 'estado más relevante'); assert.deepStrictEqual(n[0].alt, ['NEURONES']);
/* sin vínculo: mismo nombre completo → también se unen */
r = L.informes(base(null)); assert.ok(!r.sin.some(o => o.tk === 'NEURONES')); assert.strictEqual(r.lista.find(e => e.carpeta === 'Neurones annual report').estado, 'watchlist');
/* nombres parecidos pero empresas distintas: la carpeta es de una y la otra sigue sin informes */
r = L.informes(base(null, [emp('Royal annual report', 'Royal', null)])); const roy = r.lista.filter(e => e.carpeta === 'Royal annual report'); assert.strictEqual(roy.length, 1);
assert.ok(r.sin.some(o => /ROYAL/.test(o.tk)), 'la otra Royal sigue sin carpeta (no se mezclan)');
/* sin duplicados cuando todo está limpio */
assert.strictEqual(L.informes(base({ NEURONES: 'Neurones annual report' })).lista.length, 1);
console.log('informes_vinculo ok');
