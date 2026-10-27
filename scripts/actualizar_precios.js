#!/usr/bin/env node
/* Actualiza precios.json: precio de cada valor (Yahoo Finance; respaldo Google Finance y Stooq) y divisas (por 1 €).
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
let n429 = 0, yahooBloqueado = false;            // si Yahoo responde 429 (limitado) varias veces seguidas, se deja de insistir en esta ejecución
async function yahoo(sym) {
  if (yahooBloqueado) throw new Error('Yahoo limitado (429): se omite');
  try { const p = await yahoo1(sym); n429 = 0; return p; }
  catch (e) { if (/429/.test(e.message) && ++n429 >= 6) yahooBloqueado = true; throw e; }
}
async function yahoo1(sym) {
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
/* Google Finance (HTML): data-last-price, data-currency-code y marca de tiempo de la cotización principal */
function leerGoogle(html) {
  const p = html.match(/data-last-price="([\d.,]+)"/), c = html.match(/data-currency-code="([A-Z]{3})"/), t = html.match(/data-last-normal-market-timestamp="(\d+)"/);
  const precio = p && num(Number(p[1].replace(/,/g, ''))); if (!precio || !c) throw new Error('Google sin precio');
  const ts = t ? Number(t[1]) : null;
  return { precio: Math.round(precio * 1e4) / 1e4, divisa: c[1], fecha: ts ? new Date(ts * 1000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10), hora: ts ? new Date(ts * 1000).toISOString() : null };
}
const GEX = { MC: 'BME', PA: 'EPA', AT: 'ATH', TW: 'TPE', SZ: 'SHE', HK: 'HKG', L: 'LON', DE: 'ETR', MI: 'BIT', AS: 'AMS', SW: 'SWX', T: 'TYO', LS: 'ELI', BR: 'EBR', ST: 'STO', CO: 'CPH', HE: 'HEL', OL: 'OSL', VI: 'VIE', SS: 'SHA', F: 'FRA' };
async function google(sym) {
  const m = sym.match(/^(.+)\.([A-Z]+)$/);
  const cand = m ? (GEX[m[2]] ? [m[1].replace(/^0+(?=\d)/, '') + ':' + GEX[m[2]]] : []) : [sym + ':NASDAQ', sym + ':NYSE', sym + ':NYSEARCA', sym + ':NYSEAMERICAN'];
  if (!cand.length) throw new Error('Google: bolsa desconocida');
  let ult; for (const c of cand) { try { const r = await pedir('https://www.google.com/finance/quote/' + encodeURIComponent(c).replace('%3A', ':') + '?hl=en', 2); return leerGoogle(await r.text()); } catch (e) { ult = e; } }
  throw ult;
}
/* Tencent (texto «v_sz300750="51~nombre~300750~precio~…"»): bolsas chinas y Hong Kong, más fiable que CNBC para acciones A */
function leerTencent(txt, divisa) {
  const m = txt.match(/="([^"]*)"/); if (!m) throw new Error('Tencent sin datos'); const c = m[1].split('~');
  const precio = num(Number(c[3])); if (!precio) throw new Error('Tencent sin precio');
  const t = String(c[30] || ''); let fecha = null, x;
  if ((x = t.match(/^(\d{4})(\d\d)(\d\d)/))) fecha = x[1] + '-' + x[2] + '-' + x[3]; else if ((x = t.match(/^(\d{4})\/(\d\d)\/(\d\d)/))) fecha = x[1] + '-' + x[2] + '-' + x[3];
  return { precio, divisa, fecha: fecha || new Date().toISOString().slice(0, 10), hora: null };
}
async function tencent(sym) {
  const m = sym.match(/^(\d+)\.(SZ|SS|HK)$/); if (!m) throw new Error('Tencent solo bolsas chinas y HK');
  const q = m[2] === 'SZ' ? 'sz' + m[1] : m[2] === 'SS' ? 'sh' + m[1] : 'hk' + m[1].padStart(5, '0');
  const r = await pedir('https://qt.gtimg.cn/q=' + q, 2); return leerTencent(Buffer.from(await r.arrayBuffer()).toString('latin1'), m[2] === 'SZ' || m[2] === 'SS' ? 'CNY' : 'HKD');
}
/* CNBC (JSON, sin clave; funciona desde GitHub). US: símbolo tal cual; resto: SIMBOLO-PAÍS */
const CPAIS = { MC: ['ES', 'EUR'], PA: ['FR', 'EUR'], AT: ['GR', 'EUR'], TW: ['TW', 'TWD'], HK: ['HK', 'HKD'], L: ['GB', 'GBP'], DE: ['DE', 'EUR'], MI: ['IT', 'EUR'], AS: ['NL', 'EUR'], SW: ['CH', 'CHF'], T: ['JP', 'JPY'], SZ: ['CN', 'CNY'] };
function leerCnbc(j, divDef) {
  const q = j && j.FormattedQuoteResult && j.FormattedQuoteResult.FormattedQuote && j.FormattedQuoteResult.FormattedQuote[0];
  if (!q || (q.code && q.code !== 0)) throw new Error('CNBC sin datos');
  const precio = num(Number(String(q.last || '').replace(/,/g, ''))); const div = q.currencyCode || divDef; if (!precio || !div) throw new Error('CNBC sin precio o divisa');
  const lt = q.last_time || ''; return { precio, divisa: div, fecha: /^\d{4}-\d\d-\d\d/.test(lt) ? lt.slice(0, 10) : new Date().toISOString().slice(0, 10), hora: lt ? new Date(lt).toISOString() : null };
}
async function cnbc(sym) {
  const m = sym.match(/^(.+)\.([A-Z]+)$/); let c = sym, div = 'USD';
  if (m) { const x = CPAIS[m[2]]; if (!x) throw new Error('CNBC: bolsa desconocida'); c = m[1] + '-' + x[0]; div = x[1]; }
  const r = await pedir('https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=' + encodeURIComponent(c) + '&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json&events=1', 2);
  return leerCnbc(await r.json(), div);
}
/* Nasdaq (JSON): solo EE. UU. */
function leerNasdaq(j) {
  const d = j && j.data && j.data.primaryData; const precio = d && num(Number(String(d.lastSalePrice || '').replace(/[$,]/g, ''))); if (!precio) throw new Error('Nasdaq sin precio');
  const t = Date.parse(String(d.lastTradeTimestamp || '').replace(/ ET.*$/, ''));
  return { precio, divisa: 'USD', fecha: isFinite(t) ? new Date(t).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10), hora: null };
}
async function nasdaq(sym) {
  if (sym.includes('.')) throw new Error('Nasdaq solo EE. UU.');
  const r = await pedir('https://api.nasdaq.com/api/quote/' + encodeURIComponent(sym) + '/info?assetclass=stocks', 2); return leerNasdaq(await r.json());
}
async function precioDe(candidatos) {
  const errores = [];
  for (const s of candidatos) {
    for (const [nombre, f] of [['yahoo', yahoo], ['tencent', tencent], ['cnbc', cnbc], ['nasdaq', nasdaq]]) {
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
    try { const r = await pedir('https://open.er-api.com/v6/latest/EUR', 2); const j = await r.json(); if (num(j.rates && j.rates[d])) { fx[d] = j.rates[d]; fx['_f_' + d] = new Date((j.time_last_update_unix || Date.now() / 1000) * 1000).toISOString().slice(0, 10); continue; } } catch (e) { /* sin dato */ }
    fallos.push(d);
  }
  const fechas = Object.keys(fx).filter(k => k.startsWith('_f_')).map(k => fx[k]).sort(); lista.forEach(d => delete fx['_f_' + d]);
  fx.fecha = fechas.length ? fechas[fechas.length - 1] : null; return { fx, fallos };
}

/* Diagnóstico: guarda el principio de lo que devuelve cada fuente para una acción de prueba (solo cuando no se obtiene ningún precio) */
async function sondear() {
  const urls = { google: 'https://www.google.com/finance/quote/AAPL:NASDAQ?hl=en', stooq: 'https://stooq.com/q/l/?s=aapl.us&f=sd2t2c&h&e=csv', stooq2: 'https://stooq.com/q/d/l/?s=aapl.us&i=d',
    yahoo: 'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=5d&interval=1d', cnbc: 'https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=AAPL&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json&events=1',
    nasdaq: 'https://api.nasdaq.com/api/quote/AAPL/info?assetclass=stocks', stockanalysis: 'https://stockanalysis.com/stocks/aapl/', marketwatch: 'https://www.marketwatch.com/investing/stock/aapl' };
  const cn = x => 'https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=' + x + '&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json&events=1';
  for (const x of ['AIR-FR', 'AENA-ES', 'KRI-GR', '2330-TW', '3750-HK', '300750-CN', 'IDR-ES', 'SAF-FR']) urls['cnbc_' + x] = cn(x);
  for (const x of ['epa/AIR', 'bme/AENA', 'ath/KRI', 'tpe/2330']) urls['sa_' + x] = 'https://stockanalysis.com/quote/' + x + '/';
  const out = {};
  for (const [k, u] of Object.entries(urls)) {
    try { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000), redirect: 'follow' }); const t = await r.text();
      out[k] = { status: r.status, url: r.url, largo: t.length, inicio: t.slice(0, k.startsWith('cnbc') ? 700 : 300), contexto: /^sa_|^stockanalysis/.test(k) ? (t.match(/.{0,60}(?:data-price|"price"|text-4xl).{0,160}/g) || []).slice(0, 4) : undefined, atributos: (t.match(/data-[a-z-]*(?:price|currency)[a-z-]*="[^"]*"/g) || []).slice(0, 8), tiene_consent: /consent/i.test(t) };
    } catch (e) { out[k] = { error: e.message }; }
  }
  return out;
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
        const ant = (previo.precios || {})[t.clave]; if (ant && ant.divisa === p.divisa && num(ant.precio) && Math.abs(p.precio / ant.precio - 1) > 0.15) precios[t.clave].salto = Math.round((p.precio / ant.precio - 1) * 1000) / 10;   // % frente al precio anterior: revisar
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
    fs.writeFileSync(path.join(RAIZ, 'precios_diag.json'), JSON.stringify({ generado: ahora, sonda: await sondear(), fallos: fallos.slice(0, 5), divisas_fallidas: fxFallos, fx }, null, 1) + '\n'); process.exit(1);
  }
  fs.writeFileSync(OUT, JSON.stringify(ordenado, null, 1) + '\n');
  if (fallos.length) fs.writeFileSync(path.join(RAIZ, 'precios_diag.json'), JSON.stringify({ generado: ahora, sonda: await sondear(), fallos: fallos.slice(0, 12), divisas_fallidas: fxFallos }, null, 1) + '\n');
  console.log('Precios: ' + hechos + '/' + tareas.length + ' · fallos: ' + (fallos.map(f => f.ticker).join(', ') || 'ninguno') + ' · divisas: ' + Object.keys(fx).join(','));
  if (fallos.length > tareas.length / 2) process.exit(1);                    // casi todo falla: que el Action avise
}
if (require.main === module) principal().catch(e => { console.error(e); process.exit(1); });
module.exports = { leerYahoo, leerStooq, leerGoogle, leerTencent, leerCnbc, leerNasdaq, fechaLocal };
