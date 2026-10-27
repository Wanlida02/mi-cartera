#!/usr/bin/env node
/* Actualiza precios.json: precio de cada valor (Yahoo Finance, con Stooq de respaldo para EE. UU.) y divisas (por 1 €).
   Se ejecuta en GitHub Actions (L-V 9:35 y 15:35 hora de Madrid) o a mano: node scripts/actualizar_precios.js [--sin-red]
   Reglas: nunca borra un precio bueno si falla la descarga (lo conserva y lo marca como obsoleto); normaliza peniques (GBp);
   la fecha del precio es la de la última cotización en la hora local de la bolsa. */
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..'), OUT = path.join(RAIZ, 'precios.json');
const UA = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', Accept: 'application/json,text/csv,*/*' };
const esperar = ms => new Promise(r => setTimeout(r, ms));
const num = v => (typeof v === 'number' && isFinite(v) && v > 0 ? v : null);

async function pedir(url, intentos = 3) {
  let ult;
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
      if (r.ok) return r;
      ult = new Error('HTTP ' + r.status);
      if (r.status === 404) break;                       // no existe: no insistir
    } catch (e) { ult = e; }
    await esperar(800 * (i + 1) * (i + 1));
  }
  throw ult;
}
function fechaLocal(epoch, tz) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(epoch * 1000)); }
  catch (e) { return new Date(epoch * 1000).toISOString().slice(0, 10); }
}
/* Yahoo → {precio, divisa, fecha, hora} (función pura, probada con ejemplos en tests/precios.test.js) */
function leerYahoo(j) {
  const r = j && j.chart && j.chart.result && j.chart.result[0]; if (!r || !r.meta) throw new Error('respuesta sin datos');
  const m = r.meta; let precio = num(m.regularMarketPrice), div = m.currency;
  if (!precio) { const c = ((r.indicators || {}).quote || [{}])[0].close || []; precio = num([...c].reverse().find(x => num(x))); }
  if (!precio || !div) throw new Error('sin precio o divisa');
  if (div === 'GBp' || div === 'GBX') { precio /= 100; div = 'GBP'; }        // peniques → libras
  if (div === 'ILA') { precio /= 100; div = 'ILS'; }                         // agorot → shekels
  const t = m.regularMarketTime || (r.timestamp || []).slice(-1)[0];
  return { precio: Math.round(precio * 1e4) / 1e4, divisa: div, fecha: t ? fechaLocal(t, m.exchangeTimezoneName) : null, hora: t ? new Date(t * 1000).toISOString() : null };
}
async function yahoo(sym) {
  for (const host of ['query1', 'query2']) {
    try { const r = await pedir('https://' + host + '.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?range=5d&interval=1d', 2); return leerYahoo(await r.json()); }
    catch (e) { if (host === 'query2') throw e; }
  }
}
/* Respaldo solo para EE. UU. (Stooq): CSV «Symbol,Date,Time,Close» */
function leerStooq(csv) {
  const f = csv.trim().split(/\r?\n/)[1]; if (!f) throw new Error('csv vacío');
  const [, d, , c] = f.split(','); const p = Number(c); if (!(p > 0) || !/^\d{4}-\d\d-\d\d$/.test(d)) throw new Error('sin datos');
  return { precio: p, divisa: 'USD', fecha: d, hora: null };
}
async function stooq(sym) {
  if (sym.includes('.')) throw new Error('Stooq solo cubre EE. UU.');
  const r = await pedir('https://stooq.com/q/l/?s=' + sym.toLowerCase() + '.us&f=sd2t2c&h&e=csv', 2); return leerStooq(await r.text());
}
async function precioDe(candidatos) {
  const errores = [];
  for (const s of candidatos) {
    for (const [nombre, f] of [['yahoo', yahoo], ['stooq', stooq]]) {
      try { const p = await f(s); return Object.assign(p, { simbolo: s, fuente: nombre }); } catch (e) { errores.push(s + '/' + nombre + ': ' + e.message); }
    }
  }
  throw new Error(errores.join(' | '));
}
/* Divisas por 1 €: Yahoo (EURUSD=X…); respaldo Frankfurter (BCE) */
async function divisas(lista) {
  const fx = { EUR: 1 }, fallos = [];
  for (const d of lista) {
    try { const p = await yahoo('EUR' + d + '=X'); fx[d] = p.precio; fx['_f_' + d] = p.fecha; continue; } catch (e) { /* respaldo */ }
    try { const r = await pedir('https://api.frankfurter.app/latest?from=EUR&to=' + d, 2); const j = await r.json(); if (num(j.rates && j.rates[d])) { fx[d] = j.rates[d]; fx['_f_' + d] = j.date; continue; } } catch (e) { /* sin dato */ }
    fallos.push(d);
  }
  const fechas = Object.keys(fx).filter(k => k.startsWith('_f_')).map(k => fx[k]).sort(); lista.forEach(d => delete fx['_f_' + d]);
  fx.fecha = fechas.length ? fechas[fechas.length - 1] : null; return { fx, fallos };
}

async function principal() {
  const cfg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'simbolos.json'), 'utf8'));
  let previo = {}; try { previo = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { /* primera vez */ }
  const precios = Object.assign({}, previo.precios || {}), fallos = [], ahora = new Date().toISOString();
  const tareas = [];
  Object.keys(cfg.simbolos).forEach(tk => {
    const c = cfg.simbolos[tk]; tareas.push({ clave: tk, tk, cand: c.y });
    if (c.ficha) tareas.push({ clave: tk + '@ficha', tk, cand: [c.ficha] });
  });
  const cola = tareas.slice(); let hechos = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {                // 4 en paralelo: rápido sin saturar a Yahoo
    while (cola.length) {
      const t = cola.shift();
      try {
        const p = await precioDe(t.cand);
        precios[t.clave] = { ticker: t.tk, precio: p.precio, divisa: p.divisa, fecha_precio: p.fecha, hora: p.hora, simbolo: p.simbolo, fuente: p.fuente, actualizado: ahora };
        hechos++;
      } catch (e) {
        fallos.push({ ticker: t.clave, motivo: e.message.slice(0, 300) });
        if (precios[t.clave]) precios[t.clave].obsoleto = true;           // se conserva el último precio bueno
      }
      await esperar(150);
    }
  }));
  const { fx, fallos: fxFallos } = await divisas(cfg.divisas || ['USD']);
  const fxFinal = Object.assign({}, previo.fx || {}, fx);                  // si una divisa falla, queda la anterior
  const salida = { generado: ahora, estado: { ok: hechos, total: tareas.length, fallos, divisas_fallidas: fxFallos }, fx: fxFinal, precios };
  const ordenado = Object.assign({}, salida, { precios: Object.fromEntries(Object.keys(precios).sort().map(k => [k, precios[k]])) });
  if (hechos === 0 && tareas.length) {
    console.error('No se obtuvo ningún precio; no se sobrescribe precios.json (diagnóstico en precios_diag.json)'); fallos.slice(0, 3).forEach(f => console.error(f.ticker, f.motivo));
    fs.writeFileSync(path.join(RAIZ, 'precios_diag.json'), JSON.stringify({ generado: ahora, fallos, divisas_fallidas: fxFallos, fx }, null, 1) + '\n'); process.exit(1);
  }
  fs.writeFileSync(OUT, JSON.stringify(ordenado, null, 1) + '\n');
  console.log('Precios: ' + hechos + '/' + tareas.length + ' · fallos: ' + (fallos.map(f => f.ticker).join(', ') || 'ninguno') + ' · divisas: ' + Object.keys(fx).join(','));
  if (fallos.length > tareas.length / 2) process.exit(1);                    // casi todo falla: que el Action avise
}
if (require.main === module) principal().catch(e => { console.error(e); process.exit(1); });
module.exports = { leerYahoo, leerStooq, fechaLocal };
