/* Entorno de tipos de interés (FRED, sin clave): GS10 (bono EE. UU. a 10 años) y BAA10YM (diferencial de crédito).
   Escribe datos/macro.json. Si la descarga falla, deja el fichero como estaba (la app lo trata como opcional). */
const fs = require('fs'), path = require('path');
const SAL = path.join(__dirname, '..', 'datos', 'macro.json');
async function serie(id) {
  const r = await fetch('https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + id, { headers: { 'User-Agent': 'mi-cartera' } });
  if (!r.ok) throw new Error(id + ' HTTP ' + r.status);
  const out = [];
  (await r.text()).split(/\r?\n/).slice(1).forEach(l => { const [f, v] = l.split(','); const x = parseFloat(v); if (f && isFinite(x)) out.push([f.slice(0, 7), x]); });
  if (out.length < 100) throw new Error(id + ' serie corta');
  return out;
}
(async () => {
  try {
    const gs = await serie('GS10'), baa = await serie('BAA10YM');
    const anual = {}; gs.forEach(([m, v]) => { const y = m.slice(0, 4), a = anual[y] || (anual[y] = []); a.push(v); });
    const med = a => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
    const gs10_anual = {}; Object.keys(anual).filter(y => +y >= 1990).forEach(y => { gs10_anual[y] = +(anual[y].reduce((p, c) => p + c, 0) / anual[y].length).toFixed(2); });
    const o = { actualizado: new Date().toISOString().slice(0, 10), gs10: { fecha: gs[gs.length - 1][0], valor: gs[gs.length - 1][1] }, gs10_anual,
      baa10y: { fecha: baa[baa.length - 1][0], valor: baa[baa.length - 1][1], mediana: +med(baa.map(x => x[1])).toFixed(2) } };
    fs.writeFileSync(SAL, JSON.stringify(o, null, 1)); console.log('macro.json', o.gs10, o.baa10y);
  } catch (e) { console.error('Sin cambios en macro.json:', e.message); }
})();
