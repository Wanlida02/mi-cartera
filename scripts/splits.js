/* Splits (y contrasplits): detección automática y registro en datos/splits.json.
   Un split cambia el precio por acción de golpe (SNDK: 8 por 1 el 20-11-2026, de ~755 $ a ~94 $) mientras las fichas, las posiciones,
   los BPA del cribado y las cifras de la SEC siguen en acciones antiguas: sin ajustar, la empresa parece 8 veces más barata.
   Cada vez que se actualizan los precios:
     1. Candidato: el precio nuevo frente al anterior cuadra con un factor de split habitual (2, 3, 4, 5, 8, 10… o su inverso) con un ±6 %.
     2. Confirmación, con el histórico ajustado del proveedor: el cierre del día anterior ya viene dividido por el factor
        (Yahoo da además el evento de split; CNBC da los cierres ajustados). Sin confirmación se queda «pendiente» y se reintenta en la siguiente ejecución.
   La app lee el registro (va dentro de precios.json) y ajusta sola fichas, posiciones, movimientos, cribado, resultados y precios guardados. */
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..'), ARCHIVO = path.join(RAIZ, 'datos', 'splits.json');
const FACTORES = [2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30, 40, 50, 100, 1.5, 2.5];
const UA = { 'User-Agent': 'Mozilla/5.0 (mi-cartera)', Accept: 'application/json' };
const num = v => (typeof v === 'number' && isFinite(v) && v > 0 ? v : null);

/* Factor k = acciones nuevas por cada antigua (8 en un split 8:1; 0,1 en un contrasplit 1:10) que explica el salto de precio, o null */
function factorDe(precioAntes, precioAhora, tol) {
  const a = num(precioAntes), b = num(precioAhora); if (!a || !b) return null;
  const r = a / b;
  for (const F of FACTORES) {
    const t = tol != null ? tol : F < 3 && F !== 2 ? 0.03 : 0.06;   // 3:2 y 5:2: margen menor (si no, una caída del 30 % parecería un split 3:2)
    if (Math.abs(r / F - 1) <= t) return F;            // split: el precio se divide por F
    if (Math.abs(r * F - 1) <= t) return 1 / F;        // contrasplit: se multiplica por F
  }
  return null;
}
const leer = () => { try { return JSON.parse(fs.readFileSync(ARCHIVO, 'utf8')); } catch (e) { return { splits: {} }; } };
const guardar = reg => { fs.mkdirSync(path.dirname(ARCHIVO), { recursive: true }); fs.writeFileSync(ARCHIVO, JSON.stringify(Object.assign({}, reg, { generado: new Date().toISOString() }), null, 1) + '\n'); };
const yaRegistrado = (reg, tk, fecha, k) => ((reg.splits || {})[tk] || []).some(s => Math.abs(Math.log(s.k / k)) < 0.05 && Math.abs(Date.parse(s.fecha) - Date.parse(fecha)) < 20 * 864e5);

/* ── Confirmación con el histórico ajustado ── */
/* Yahoo: eventos de split del último trimestre */
async function splitsYahoo(sym) {
  for (const host of ['query1', 'query2']) {
    try {
      const r = await fetch('https://' + host + '.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?range=3mo&interval=1d&events=split', { headers: UA, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error('Yahoo HTTP ' + r.status);
      const j = await r.json(), ev = (((j.chart || {}).result || [])[0] || {}).events || {};
      return Object.values(ev.splits || {}).map(s => ({ fecha: new Date((s.date || 0) * 1000).toISOString().slice(0, 10), k: s.numerator / s.denominator })).filter(s => num(s.k));
    } catch (e) { if (host === 'query2') throw e; }
  }
  return [];
}
/* CNBC: cierres diarios ajustados del último mes {AAAA-MM-DD: cierre} */
const CPAIS = { MC: 'ES', PA: 'FR', AT: 'GR', TW: 'TW', HK: 'HK', L: 'GB', DE: 'DE', MI: 'IT', AS: 'NL', SW: 'CH', T: 'JP', SZ: 'CN', ST: 'SE', CO: 'DK', OL: 'NO', HE: 'FI' };
async function diariosCnbc(sym) {
  const m = sym.match(/^(.+)\.([A-Z]+)$/), c = m ? (CPAIS[m[2]] ? m[1] + '-' + CPAIS[m[2]] : null) : sym; if (!c) throw new Error('CNBC: bolsa desconocida');
  let ult; for (const rg of ['1M', '3M', '5D']) {
    try {
      const r = await fetch('https://ts-api.cnbc.com/harmony/app/charts/' + rg + '.json?symbol=' + encodeURIComponent(c), { headers: UA, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error('CNBC HTTP ' + r.status);
      const b = ((await r.json()).barData || {}).priceBars || [], out = {};
      b.forEach(x => { const t = String(x.tradeTime || ''), v = num(Number(x.close)); if (v && /^\d{8}/.test(t)) out[t.slice(0, 4) + '-' + t.slice(4, 6) + '-' + t.slice(6, 8)] = v; });
      if (Object.keys(out).length) return out;
      throw new Error('CNBC sin cierres');
    } catch (e) { ult = e; }
  }
  throw ult;
}
/* ¿El cierre ajustado de la fecha del precio anterior es el precio anterior dividido por k? (±4 %) */
function confirmaAjustado(diarios, fechaAntes, precioAntes, k) {
  const ds = Object.keys(diarios || {}).filter(f => f <= fechaAntes).sort(); if (!ds.length) return null;
  const f = ds[ds.length - 1]; if (Date.parse(fechaAntes) - Date.parse(f) > 5 * 864e5) return null;
  const aj = diarios[f]; return Math.abs((aj * k) / precioAntes - 1) <= 0.04 ? { fecha: f, ajustado: aj } : false;
}
/* Primer día con el precio ya en la escala nueva: el primero de los diarios tras la fecha anterior */
const primerDia = (diarios, fechaAntes, fechaAhora) => Object.keys(diarios || {}).filter(f => f > fechaAntes && f <= fechaAhora).sort()[0] || fechaAhora;

/* Revisa los precios nuevos frente a los anteriores; añade al registro los splits confirmados y deja los dudosos como pendientes.
   fuentes (para pruebas): { yahoo(sym) → [{fecha,k}], cnbc(sym) → {fecha: cierre} } */
async function revisar(previo, nuevos, opc) {
  opc = opc || {}; const reg = opc.registro || leer(); reg.splits = reg.splits || {}; reg.pendientes = reg.pendientes || {};
  const yahoo = opc.yahoo || splitsYahoo, cnbc = opc.cnbc || diariosCnbc, hechos = [];
  const candidatos = Object.keys(nuevos).map(clave => {
    const a = previo[clave], b = nuevos[clave]; if (!a || !b || a.divisa !== b.divisa || !(b.fecha_precio > a.fecha_precio)) return null;
    const k = factorDe(a.precio, b.precio); return k ? { clave, tk: clave.split('@')[0], sym: b.simbolo || clave, a, b, k } : null;
  }).filter(Boolean);
  Object.keys(reg.pendientes).forEach(clave => { if (!candidatos.some(c => c.clave === clave) && nuevos[clave]) { const p = reg.pendientes[clave]; candidatos.push({ clave, tk: clave.split('@')[0], sym: nuevos[clave].simbolo || clave, a: p.antes, b: nuevos[clave], k: p.k, reintento: true }); } });
  for (const c of candidatos) {
    if (yaRegistrado(reg, c.tk, c.b.fecha_precio, c.k)) { delete reg.pendientes[c.clave]; continue; }
    let conf = null, fecha = null, fuente = null;
    try { const ev = (await yahoo(c.sym)).find(s => Math.abs(Math.log(s.k / c.k)) < 0.05 && s.fecha > c.a.fecha_precio && s.fecha <= c.b.fecha_precio); if (ev) { conf = true; fecha = ev.fecha; fuente = 'Yahoo (evento de split)'; } } catch (e) { /* sin Yahoo */ }
    if (!conf) {
      try { const dd = await cnbc(c.sym), ok = confirmaAjustado(dd, c.a.fecha_precio, c.a.precio, c.k); if (ok) { conf = true; fecha = primerDia(dd, c.a.fecha_precio, c.b.fecha_precio); fuente = 'CNBC (cierre ajustado del ' + ok.fecha + ': ' + ok.ajustado + ' = ' + c.a.precio + ' / ' + c.k + ')'; } else if (ok === false) conf = false; }
      catch (e) { /* sin CNBC */ }
    }
    if (conf) {
      (reg.splits[c.tk] = reg.splits[c.tk] || []).push({ fecha, k: c.k, estado: 'confirmado', detectado: new Date().toISOString().slice(0, 10), fuente: 'automático: precio ' + c.a.precio + ' (' + c.a.fecha_precio + ') → ' + c.b.precio + ' (' + c.b.fecha_precio + '); ' + fuente });
      delete reg.pendientes[c.clave]; hechos.push(c.tk + ' ×' + c.k);
    } else if (conf === false) delete reg.pendientes[c.clave];   // el histórico ajustado NO se mueve: fue una caída/subida de verdad
    else if (!c.reintento) reg.pendientes[c.clave] = { k: c.k, antes: c.a, ahora: { precio: c.b.precio, fecha_precio: c.b.fecha_precio }, desde: new Date().toISOString().slice(0, 10) };
    else if (Date.parse(c.b.fecha_precio) - Date.parse(reg.pendientes[c.clave].desde) > 10 * 864e5) delete reg.pendientes[c.clave];   // sin confirmar en 10 días: se descarta
  }
  return { registro: reg, hechos };
}
module.exports = { FACTORES, factorDe, confirmaAjustado, revisar, leer, guardar, ARCHIVO };
/* Prueba desde GitHub Actions: node scripts/splits.js --probar SNDK → qué ven Yahoo y CNBC (no escribe nada) */
if (require.main === module && process.argv[2] === '--probar') (async () => {
  const sym = process.argv[3] || 'SNDK';
  try { console.log('Yahoo splits:', JSON.stringify(await splitsYahoo(sym))); } catch (e) { console.log('Yahoo: ' + e.message); }
  try { const d = await diariosCnbc(sym); console.log('CNBC diarios:', JSON.stringify(Object.fromEntries(Object.entries(d).slice(-12)))); } catch (e) { console.log('CNBC: ' + e.message); }
})();
