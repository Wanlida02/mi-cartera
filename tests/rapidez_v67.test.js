/* v67: tickerDe con índice de nombres. Da lo mismo que el recorrido anterior y se rehace al cambiar las fichas. Uso: node tests/rapidez_v67.test.js */
const assert = require('assert'), L = require('../js/logic.js');
const viejo = (d, pos) => {   // implementación anterior, como referencia
  const t = (pos.ticker || '').trim().toUpperCase(); if (t && d.fichas[t]) return t;
  const a = L.coreName(pos.empresa);
  for (const k of Object.keys(d.fichas)) { if (a && (L.coreName(d.fichas[k].nombre) === a || k.toLowerCase() === a)) return k; }
  return t || null;
};
const d = L.normalizar(null);
const nombres = ['Apple Inc.', 'Alphabet Inc. (Class A)', 'Alphabet Class C', 'Meta Platforms', 'Neurones', 'NRO', 'Sol S.p.A.', 'SOL', 'Vidrala S.A.', 'Café Ñandú', '', null, 'The Coca-Cola Company', 'Coca Cola'];
nombres.forEach((n, i) => { d.fichas[['AAPL', 'GOOGL', 'GOOG', 'META', 'NRO.PA', 'NRO', 'BIT:SOL', 'SOL', 'VID', 'CAF', 'VACIA', 'NULA', 'KO', 'KO2'][i]] = { nombre: n }; });
const posiciones = [];
['Apple', 'apple inc', 'Alphabet', 'Alphabet Class C', 'Meta Platforms Inc', 'Neurones', 'nro', 'Sol', 'Sol SpA', 'Vidrala', 'Cafe Nandu', 'Coca-Cola', 'Coca Cola Co', 'Desconocida', 'sol', 'bit:sol', '', 'KO']
  .forEach(e => ['', 'XX', 'aapl', 'NRO', 'KO2'].forEach(t => posiciones.push({ empresa: e, ticker: t })));
const igual = () => posiciones.forEach(p => assert.equal(L.tickerDe(d, p), viejo(d, p), JSON.stringify(p)));
igual();
d.fichas.AAPL.nombre = 'Manzana Corp'; igual();                       // renombrar una ficha
d.fichas.ZZZ = { nombre: 'Apple' }; igual();                           // añadir
delete d.fichas.GOOGL; igual();                                        // borrar
const otra = L.normalizar(JSON.parse(JSON.stringify(d))); posiciones.forEach(p => assert.equal(L.tickerDe(otra, p), viejo(otra, p)));   // datos adoptados (otro objeto)
console.log('rapidez v67 ok (' + posiciones.length * 5 + ' comprobaciones)');
