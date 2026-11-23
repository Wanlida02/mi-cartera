/* v77: fichas de EE. UU. contrastadas con los 10-K de la SEC — verifica lo que coincide, rellena huecos, caja con inversiones a corto plazo,
   desfase de año (NVIDIA cierra en enero), EBIT de VICI con una sola definición; no toca fichas verificadas; se aplica una sola vez.
   Sin datos personales: fichas montadas con los datos de la SEC del repositorio. Uso: node tests/parches_v77.test.js */
const assert = require('assert'), fs = require('fs'), path = require('path');
global.window = global; const L = require('../js/logic.js'); global.Logic = L; global.Store = { get: () => null };
eval(fs.readFileSync(path.join(__dirname, '../js/datos-web.js'), 'utf8').replace('const DatosWeb', 'global.DatosWeb'));
const sec = tk => JSON.parse(fs.readFileSync(path.join(__dirname, '../datos/' + tk + '.json'), 'utf8'));
const clone = o => JSON.parse(JSON.stringify(o));
/* Ficha «como la del usuario»: desde la SEC, en borrador, con la caja solo de efectivo y sin intereses de los primeros años */
function fichaAAPL() { const f = DatosWeb.aFicha(sec('AAPL'), '2026-11-23'); const n = f.anios.length; f.anios = f.anios.slice(-6); Object.keys(f.hist).forEach(k => { if (Array.isArray(f.hist[k])) f.hist[k] = f.hist[k].slice(n - 6); });
  f._borrador = true; f.hist.caja = f.hist.caja.map(x => x * 0.55); f.hist.intereses = f.hist.intereses.map((x, i) => (i < 3 ? null : x)); return f; }
{
  const d0 = L.normalizar(null); d0.fichas.AAPL = fichaAAPL(); delete d0.ajustes.parches;
  const antes = clone(d0.fichas.AAPL), d = L.normalizar(clone(d0)), f = d.fichas.AAPL, j = sec('AAPL');
  assert(d.ajustes.parches.includes('v77-sec-aapl'), 'parche aplicado');
  assert.equal(f.hist.caja[5], j.hist.caja[j.anios.indexOf(f.anios[5])], 'caja = la de la SEC (efectivo + inversiones a corto plazo)');
  assert(f.hist.intereses.slice(0, 3).every(x => x > 0), 'intereses rellenados');
  assert.equal(f.conf.ventas, 'A'); assert.equal(f.conf.caja, 'A');
  assert(!f._borrador, 'deja de ser borrador'); assert(/Contrastada con los 10-K de la SEC/.test(f.notas.join(' '))); assert(/sec\.gov/.test(f.fuentes.join(' ')));
  assert(d.ajustes.copia_v77.AAPL && d.ajustes.copia_v77.AAPL.hist && d.ajustes.copia_v77.AAPL._borrador, 'copia para deshacer (estado anterior a este parche)');
  const d2 = L.normalizar(clone(d)); assert.deepEqual(d2.fichas.AAPL.hist, f.hist, 'una sola vez'); assert.equal(d2.fichas.AAPL.notas.length, f.notas.length);
  const v = clone(d0); v.fichas.AAPL.verificada = true; const dv = L.normalizar(v); assert.equal(dv.fichas.AAPL.hist.caja[5], v.fichas.AAPL.hist.caja[5], 'una ficha verificada a mano no se toca');
}
/* NVIDIA: la ficha nombra el ejercicio por su año fiscal (un año después que la SEC) */
{
  const j = sec('NVDA'), f = DatosWeb.aFicha(j, '2026-11-23'); f.anios = f.anios.map(a => a + 1); const n = f.anios.length; f.anios = f.anios.slice(-6); Object.keys(f.hist).forEach(k => { if (Array.isArray(f.hist[k])) f.hist[k] = f.hist[k].slice(n - 6); });
  assert.equal(L.desfaseSEC(f, j), 1, 'detecta el desfase'); assert.equal(L.desfaseSEC(fichaAAPL(), sec('AAPL')), 0);
  const solo = { 2021: 847, 2022: 1990, 2023: 3389, 2024: 7280, 2025: 8589, 2026: 10605 }; f.hist.caja = f.anios.map(a => solo[a]); f._borrador = true;
  const d0 = L.normalizar(null); d0.fichas.NVDA = f; delete d0.ajustes.parches; const g = L.normalizar(d0).fichas.NVDA;
  assert.equal(g.hist.caja[f.anios.indexOf(2025)], 43210, 'FY2025 (SEC 2024): efectivo + valores negociables');
  assert.equal(g.hist.caja[f.anios.indexOf(2026)], 10605, 'FY2026 no se toca (pendiente de constatar)'); assert(/PENDIENTE: caja de FY2026/.test(g.notas.join(' ')));
}
/* VICI: EBIT con una sola definición (beneficio antes de impuestos + intereses), amortización y capex del 10-K */
{
  const f = DatosWeb.aFicha(sec('VICI'), '2026-11-23'); f._borrador = true; f.hist.ebit = f.anios.map((a, i) => (a <= 2020 ? [144.196, 140.023, 52.299, 321.018][i] : null)); f.hist.da = f.anios.map(() => null); f.hist.capex = f.anios.map(() => null);
  const d0 = L.normalizar(null); d0.fichas.VICI = f; delete d0.ajustes.parches; const g = L.normalizar(d0).fichas.VICI, i = a => g.anios.indexOf(a);
  assert.equal(g.hist.ebit[i(2019)], 804.37, 'EBIT 2019 = 555,986 + 248,384'); assert.equal(g.hist.ebit[i(2025)], 3664.593);
  assert.equal(g.hist.da[i(2025)], 3.637); assert.equal(g.hist.capex[i(2025)], 1.335); assert.equal(g.conf.ebit, 'P', 'calculado: confianza P');
}
console.log('parches v77 ok');
