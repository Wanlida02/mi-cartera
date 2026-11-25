#!/usr/bin/env node
/* Baja de la SEC (EDGAR, datos XBRL de los 10-K) las cuentas anuales de una empresa de EE. UU. y las guarda en datos/TICKER.json
   con el mismo formato que una ficha de valoración (anios + hist). Uso: node scripts/datos_sec.js TICKER
   Se ejecuta desde GitHub Actions (workflow «Datos de empresa»). La app lee datos/TICKER.json y crea con él el cribado y la ficha. */
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..');
/* La SEC pide identificar al cliente. El contacto va en la variable de entorno SEC_CONTACT (en GitHub: Settings → Secrets and variables → Actions → Variables); sin ella se usa un nombre genérico. */
const UA = { 'User-Agent': 'MiCartera-personal ' + (process.env.SEC_CONTACT || 'actions@users.noreply.github.com'), Accept: 'application/json' };
const isN = v => typeof v === 'number' && isFinite(v);
const esperar = ms => new Promise(r => setTimeout(r, ms));

/* Etiquetas XBRL (us-gaap) por línea, en orden de preferencia. tipo: 'flujo' (periodo ≈ 1 año) o 'saldo' (instante) */
const LINEAS = {
  ventas: { tipo: 'flujo', tags: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet', 'SalesRevenueGoodsNet'] },
  ebit: { tipo: 'flujo', tags: ['OperatingIncomeLoss'] },
  ni_reportado: { tipo: 'flujo', tags: ['NetIncomeLoss', 'ProfitLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic'] },
  da: { tipo: 'flujo', tags: ['DepreciationDepletionAndAmortization', 'DepreciationAndAmortization', 'DepreciationAmortizationAndAccretionNet', 'DepreciationAmortizationAndOther'] },
  impuestos: { tipo: 'flujo', tags: ['IncomeTaxExpenseBenefit'] },
  intereses: { tipo: 'flujo', tags: ['InterestExpense', 'InterestExpenseNonoperating', 'InterestExpenseDebt', 'InterestAndDebtExpense'] },
  acciones: { tipo: 'flujo', tags: ['WeightedAverageNumberOfDilutedSharesOutstanding'], escala: 1e6, unidad: 'shares' },
  capex: { tipo: 'flujo', tags: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets', 'PaymentsForCapitalImprovements'] },
  fco: { tipo: 'flujo', tags: ['NetCashProvidedByUsedInOperatingActivities'] },
  sbc: { tipo: 'flujo', tags: ['ShareBasedCompensation', 'AllocatedShareBasedCompensationExpense'] },
  dividendos: { tipo: 'flujo', tags: ['PaymentsOfDividendsCommonStock', 'PaymentsOfDividends'] },
  recompras: { tipo: 'flujo', tags: ['PaymentsForRepurchaseOfCommonStock'] },
  bpa: { tipo: 'flujo', tags: ['EarningsPerShareDiluted'], escala: 1, unidad: 'USD/shares' },
  caja: { tipo: 'saldo', tags: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'] },
  inv_cp: { tipo: 'saldo', tags: ['ShortTermInvestments', 'MarketableSecuritiesCurrent', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent'] },
  deuda_lp: { tipo: 'saldo', tags: ['LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligations', 'LongTermDebt'] },
  deuda_cp: { tipo: 'saldo', tags: ['LongTermDebtCurrent', 'DebtCurrent', 'LongTermDebtAndCapitalLeaseObligationsCurrent'] },
  goodwill: { tipo: 'saldo', tags: ['Goodwill'] },
  equity: { tipo: 'saldo', tags: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'] },
  /* Minoritarios: el dato directo o, si no está etiquetado, beneficio total (ProfitLoss) − beneficio de la dominante (NetIncomeLoss) */
  min_directo: { tipo: 'flujo', tags: ['NetIncomeLossAttributableToNoncontrollingInterest'] },
  ni_total: { tipo: 'flujo', tags: ['ProfitLoss'] },
  ni_dominante: { tipo: 'flujo', tags: ['NetIncomeLoss'] }
};
const dias = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
/* Año de ejercicio: año de la fecha de cierre; si cierra en enero o febrero (comercio minorista), cuenta como el año anterior */
const anioDe = fin => { const y = Number(fin.slice(0, 4)), m = Number(fin.slice(5, 7)); return m <= 2 ? y - 1 : y; };

/* Serie anual {año: valor} de una línea: hechos de 10-K, periodo de 350–380 días (flujo) o instante (saldo); gana el más reciente presentado */
function serie(gaap, def) {
  const res = {}, meta = {};   // las empresas cambian de etiqueta con los años (p. ej. Apple): se rellenan los huecos con las etiquetas siguientes
  for (const tag of def.tags) {
    const t = gaap[tag]; if (!t || !t.units) continue;
    const u = t.units[def.unidad || 'USD']; if (!u) continue;
    const por = {};
    for (const h of u) {
      if (!/^10-K/.test(h.form || '') || !isN(h.val) || !h.end) continue;
      if (def.tipo === 'flujo') { if (!h.start) continue; const d = dias(h.start, h.end); if (d < 350 || d > 380) continue; }
      const a = anioDe(h.end), p = por[a];
      if (!p || h.end > p.end || (h.end === p.end && (h.filed || '') > (p.filed || ''))) por[a] = h;
    }
    Object.keys(por).forEach(a => { if (res[a] == null) { res[a] = Math.round(por[a].val / (def.escala || 1e6) * 1000) / 1000; meta[a] = { filed: por[a].filed || '', end: por[a].end }; } });
  }
  if (!Object.keys(res).length) return null;
  Object.defineProperty(res, '_meta', { value: meta, enumerable: false });   // fecha de presentación de cada dato (para los splits)
  return res;
}
/* Últimos 12 meses (TTM) de una línea de flujo: suma de los 4 últimos trimestres consecutivos. Los trimestres que no se publican
   sueltos (el 4.º, o el 2.º/3.º cuando solo hay acumulados) se deducen restando periodos con el mismo inicio. Usa 10-K y 10-Q. */
function ttm(gaap, def) {
  let mejor = null;   // se prueba cada etiqueta por separado (no se mezclan definiciones) y gana la de trimestre más reciente
  for (const tag of def.tags) { const x = ttmTag(gaap[tag], def); if (x && (!mejor || x.fin > mejor.fin)) mejor = x; }
  return mejor;
}
const esTrim = d => d >= 80 && d <= 120;   // 13 semanas; algunos minoristas (AutoZone) tienen un trimestre de 16
function ttmTag(t, def) {
  const u = t && t.units && t.units[def.unidad || 'USD']; if (!u) return null;
  const P = {};
  for (const h of u) {
    if (!/^10-[KQ]/.test(h.form || '') || !isN(h.val) || !h.start || !h.end) continue;
    const k = h.start + '|' + h.end; if (!P[k] || (h.filed || '') > P[k].filed) P[k] = { val: h.val, filed: h.filed || '' };
  }
  const per = Object.keys(P).map(k => { const [a, b] = k.split('|'); return { a, b, d: dias(a, b), v: P[k].val }; });
  const q = {};   // fin del trimestre → {ini, v}
  per.filter(x => esTrim(x.d)).forEach(x => { q[x.b] = { ini: x.a, v: x.v }; });
  for (let vuelta = 0; vuelta < 3; vuelta++) per.filter(x => x.d > 120).forEach(x => {
    if (q[x.b]) return;
    const c = per.find(y => y.a === x.a && y.b < x.b && esTrim(dias(y.b, x.b)));
    if (c) q[x.b] = { ini: c.b, v: x.v - c.v };
  });
  const fines = Object.keys(q).sort(); if (!fines.length) return null;
  const fin = fines[fines.length - 1]; let cur = fin, tot = 0, n = 0;
  while (n < 4 && q[cur]) {
    tot += q[cur].v; n++;
    const ini = q[cur].ini; cur = Object.keys(q).find(f => Math.abs(dias(f, ini)) <= 7);
    if (!cur) break;
  }
  return n === 4 ? { fin, valor: Math.round(tot / (def.escala || 1e6) * 1000) / 1000 } : null;
}
/* Fecha de cierre del último ejercicio anual (10-K) publicado */
function ultimoEjercicio(gaap) {
  let fin = null;
  for (const tag of LINEAS.ventas.tags.concat(LINEAS.ebit.tags)) { const u = gaap[tag] && gaap[tag].units && gaap[tag].units.USD; if (!u) continue;
    u.forEach(h => { if (/^10-K/.test(h.form || '') && h.start && h.end && dias(h.start, h.end) >= 350 && dias(h.start, h.end) <= 380 && (!fin || h.end > fin)) fin = h.end; }); }
  return fin ? { anio: anioDe(fin), fin } : null;
}
/* Beneficio atribuido a minoritarios de un año: etiqueta directa; si no, ProfitLoss − NetIncomeLoss (diferencias de redondeo < 0,05 M → 0); sin datos, 0 */
function minoritariosDe(s, a) {
  const v = k => (s[k] && isN(s[k][a]) ? s[k][a] : null), dir = v('min_directo');
  if (dir != null) return dir;
  const t = v('ni_total'), d = v('ni_dominante'); if (t == null || d == null) return 0;
  const m = Math.round((t - d) * 1000) / 1000; return Math.abs(m) < 0.05 ? 0 : m;
}
/* Construye {anios, hist} a partir del JSON «companyfacts» de la SEC */
/* Splits (datos/splits.json): un dato por acción presentado antes del split está en la escala antigua (los 10-K posteriores ya lo reexpresan).
   acciones ×k y BPA ÷k solo en esos datos; así una ficha nueva desde la SEC no mezcla escalas. */
function ajustarSplits(s, splits) {
  const out = [];
  (splits || []).forEach(sp => { if (!(sp.k > 0) || sp.k === 1 || !sp.fecha) return;
    [['acciones', sp.k], ['bpa', 1 / sp.k]].forEach(([k, m]) => { const x = s[k]; if (!x || !x._meta) return;
      Object.keys(x).forEach(a => { const mt = x._meta[a]; if (mt && (mt.filed || '0') < sp.fecha && (mt.end || '') < sp.fecha) { x[a] = Math.round(x[a] * m * 1e6) / 1e6; if (!out.includes(a)) out.push(a); } }); }); });
  return out;
}
function construir(cf, splits) {
  const gaap = cf && cf.facts && cf.facts['us-gaap']; if (!gaap) throw new Error('Sin datos US-GAAP (¿empresa extranjera con 20-F/IFRS? Usa los informes anuales).');
  const s = {}; Object.keys(LINEAS).forEach(k => { s[k] = serie(gaap, LINEAS[k]); });
  const ajSplit = ajustarSplits(s, splits);
  if (!s.ventas) throw new Error('No se encontraron ventas anuales (10-K) en la SEC.');
  const todos = [...new Set(Object.values(s).filter(Boolean).flatMap(o => Object.keys(o).map(Number)))].sort((a, b) => a - b);
  const ult = Math.max(...Object.keys(s.ventas).map(Number));
  let anios = todos.filter(a => s.ventas[a] != null && a <= ult).slice(-10);
  if (anios.length < 3) throw new Error('Menos de 3 años de ventas en la SEC.');
  const col = k => anios.map(a => (s[k] && isN(s[k][a]) ? s[k][a] : null));
  const suma = (...ks) => anios.map(a => { const v = ks.map(k => (s[k] && isN(s[k][a]) ? s[k][a] : null)); return v.every(x => x == null) ? null : v.reduce((p, c) => p + (c || 0), 0); });
  const hist = {
    ventas: col('ventas'), ebit: col('ebit'), da: col('da'), intereses: col('intereses'), impuestos: col('impuestos'), minoritarios: anios.map(a => minoritariosDe(s, a)), otros: anios.map(() => 0),
    acciones: col('acciones'), capex: col('capex'), leases: anios.map(() => null), caja: suma('caja', 'inv_cp'), deuda: suma('deuda_lp', 'deuda_cp'), leases_deuda: anios.map(() => null),
    goodwill: col('goodwill'), equity: col('equity'), ni_reportado: col('ni_reportado'), fco: col('fco'), sbc: col('sbc'), dividendos: col('dividendos'), recompras: col('recompras'), bpa: col('bpa')
  };
  /* Empresa sin deuda financiera: la SEC no trae ninguna etiqueta de deuda y los intereses son insignificantes (<5 % del EBIT los 3 últimos años con datos) → deuda 0 (se avisa en las notas) */
  let sinDeuda = false;
  if (hist.deuda.every(x => x == null)) {
    const ult3 = anios.map((a, i) => i).slice(-3), peq = ult3.every(i => isN(hist.ebit[i]) && hist.ebit[i] > 0 && (hist.intereses[i] == null || hist.intereses[i] < 0.05 * hist.ebit[i]));
    if (peq) { hist.deuda = anios.map(() => 0); sinDeuda = true; }
  }
  /* Splits: las cifras antiguas por acción pueden no estar reexpresadas. Si las acciones saltan (>1,8x o <0,55x) entre dos años, se descartan acciones y BPA anteriores al salto */
  const avisosSplit = [];
  for (let i = anios.length - 1; i > 0; i--) {
    const x = hist.acciones[i], y = hist.acciones[i - 1];
    if (isN(x) && isN(y) && y > 0 && (x / y > 1.8 || x / y < 0.55)) {
      for (let j = 0; j < i; j++) { hist.acciones[j] = null; hist.bpa[j] = null; }
      avisosSplit.push('Acciones y BPA anteriores a ' + anios[i] + ' descartados: saltan de ' + Math.round(y) + ' a ' + Math.round(x) + ' millones (probable split sin reexpresar), así que no son comparables.');
      break;
    }
  }
  const faltan = Object.keys(hist).filter(k => !['minoritarios', 'otros', 'leases', 'leases_deuda'].includes(k) && hist[k].every(x => x == null));
  const notas = ['Datos automáticos de la SEC (XBRL de los 10-K). Revísalos contra el informe anual antes de decidir: pueden faltar líneas o haber reexpresiones.',
    'Caja = efectivo + inversiones a corto plazo; deuda = deuda financiera (sin arrendamientos). Intereses = gasto bruto (no netos de ingresos). Minoritarios de la SEC (atribuido a minoritarios, o beneficio total − el de la dominante); otros y arrendamientos van a 0 o sin dato: complétalos si importan.'];
  avisosSplit.forEach(x => notas.push(x));
  if (ajSplit.length) notas.push('Acciones y BPA ajustados por split (' + (splits || []).map(x => (x.k > 1 ? x.k + ' por 1' : '1 por ' + Math.round(1 / x.k)) + ' del ' + x.fecha).join(', ') + ') en los ejercicios presentados antes: ' + ajSplit.sort().join(', ') + '.');
  if (sinDeuda) notas.push('Deuda = 0: la SEC no registra deuda financiera y los intereses son menos del 5 % del EBIT. Confírmalo en el balance del informe anual.');
  if (faltan.length) notas.push('Líneas sin datos en la SEC: ' + faltan.join(', ') + '.');
  const t12 = {}; ['ventas', 'ebit', 'ni_reportado', 'da'].forEach(k => { const x = ttm(gaap, LINEAS[k]); if (x) t12[k] = x; });
  const finT = t12.ventas ? t12.ventas.fin : t12.ebit ? t12.ebit.fin : null;
  const doce = finT ? { fin: finT } : null;   // solo líneas cuyo trimestre final coincide con el de las ventas
  if (doce) Object.keys(t12).forEach(k => { if (t12[k].fin === finT) doce[k] = t12[k].valor; });
  return { anios, hist, notas, faltan, nombre: cf.entityName || null, ttm: doce, ultimo: ultimoEjercicio(gaap) };
}
async function pedir(url) {
  let ult; for (let i = 0; i < 3; i++) { try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) }); if (r.ok) return r; ult = new Error('HTTP ' + r.status + ' en ' + url); if (r.status === 404) break; } catch (e) { ult = e; } await esperar(1500 * (i + 1)); }
  throw ult;
}
/* Complemento con los estados del último 10-K (FilingSummary → R*.htm) para lo que no está en los datos estructurados (companyfacts):
   p. ej. NVIDIA etiqueta sus «Marketable securities» de FY2026 con una etiqueta propia y CareTrust no etiqueta sus mejoras de inmuebles.
   Solo toca el último ejercicio y anota de dónde sale cada cifra. */
function filasR(html) {
  const txt = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, "'").replace(/\s+/g, ' ').trim();
  const esc = /In Millions/i.test(html) ? 1 : /In Thousands/i.test(html) ? 1e-3 : /In Billions/i.test(html) ? 1e3 : 1e-6;
  const filas = [];
  (html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || []).forEach(tr => {
    const tds = (tr.match(/<td[^>]*>[\s\S]*?<\/td>/g) || []).map(txt); if (tds.length < 2) return;
    const nums = tds.slice(1).map(x => { const m = /^\$?\s*(\(?)\$?\s*([\d,]+(?:\.\d+)?)\s*\)?$/.exec(x); return m ? (m[1] ? -1 : 1) * Number(m[2].replace(/,/g, '')) * esc : null; });
    if (nums[0] != null) filas.push({ et: tds[0], v: nums[0] });
  });
  return filas;
}
async function complementoEstados(cik, r, notas) {
  const sub = await (await pedir('https://data.sec.gov/submissions/CIK' + cik + '.json')).json(), rec = sub.filings && sub.filings.recent; if (!rec) return;
  const i = rec.form.findIndex(f => f === '10-K'); if (i < 0) return;
  const acc = rec.accessionNumber[i].replace(/-/g, ''), base = 'https://www.sec.gov/Archives/edgar/data/' + Number(cik) + '/' + acc + '/', fin = rec.reportDate[i];
  const n = r.anios.length - 1; if (!r.ultimo || r.ultimo.fin !== fin || Number(r.anios[n]) !== Number(r.ultimo.anio)) return;   // el último 10-K tiene que ser el último ejercicio de la serie
  const fs0 = await (await pedir(base + 'FilingSummary.xml')).text();
  const reps = [...fs0.matchAll(/<Report[^>]*>([\s\S]*?)<\/Report>/g)].map(m => ({ nombre: (/<ShortName>([^<]*)<\/ShortName>/.exec(m[1]) || [])[1] || '', html: (/<HtmlFileName>([^<]*)<\/HtmlFileName>/.exec(m[1]) || [])[1] }));
  const busca = re => reps.find(x => x.html && re.test(x.nombre) && !/parenthetical|details|tables|policies/i.test(x.nombre));
  const bal = busca(/balance sheet|financial (position|condition)/i), flu = busca(/cash flows/i), r1 = x => Math.round(x * 1000) / 1000;
  if (bal) {
    const F = filasR(await (await pedir(base + bal.html)).text());
    const efe = F.find(x => /^cash and cash equivalents$/i.test(x.et)), inv = F.find(x => /^(marketable securities|short-term investments|investments, current|available-for-sale securities)$/i.test(x.et));
    if (efe && inv && r.hist.caja[n] != null && Math.abs(r.hist.caja[n] - efe.v) < 0.005 * efe.v + 0.5) { r.hist.caja[n] = r1(efe.v + inv.v); notas.push('Caja ' + r.anios[n] + ': efectivo ' + efe.v + ' + «' + inv.et + '» ' + inv.v + ', del balance del 10-K (' + base + bal.html + '); no estaba en los datos estructurados.'); }
  }
  if (flu && r.hist.capex[n] == null) {
    const F = filasR(await (await pedir(base + flu.html)).text());
    const c = F.find(x => /^(purchases? of property(, plant)? and equipment|capital expenditures|purchases? of equipment, furniture,? and fixtures and improvements to real estate|improvements to real estate|purchases? of property, equipment and intangible assets|purchases related to property and equipment)/i.test(x.et));
    if (c) { r.hist.capex[n] = r1(Math.abs(c.v)); notas.push('Capex ' + r.anios[n] + ': «' + c.et + '» ' + Math.abs(c.v) + ', del estado de flujos del 10-K (' + base + flu.html + ').'); }
  }
}
async function principal(tk, opc = {}) {
  tk = String(tk || '').trim().toUpperCase(); if (!/^[A-Z0-9.\-]{1,10}$/.test(tk)) throw new Error('Ticker no válido');
  const mapa = opc.mapa || await (await pedir('https://www.sec.gov/files/company_tickers.json')).json();
  const e = Object.values(mapa).find(x => x.ticker.toUpperCase() === tk.replace('.', '-')) || Object.values(mapa).find(x => x.ticker.toUpperCase() === tk);
  if (!e) throw new Error('«' + tk + '» no está en la lista de la SEC: solo cubre empresas de EE. UU. Para otras, usa los informes anuales.');
  const cik = String(e.cik_str).padStart(10, '0');
  let splits = []; try { splits = (JSON.parse(fs.readFileSync(path.join(RAIZ, 'datos', 'splits.json'), 'utf8')).splits || {})[tk] || []; } catch (x) { /* sin registro */ }
  const r = construir(await (await pedir('https://data.sec.gov/api/xbrl/companyfacts/CIK' + cik + '.json')).json(), splits);
  if (!opc.sinEstados) try { await complementoEstados(cik, r, r.notas); } catch (x) { r.notas.push('No se pudieron leer los estados del último 10-K (' + x.message + ').'); }
  let precio = null; if (!opc.sinPrecio) try { const P = require('./actualizar_precios.js'); let p; try { p = await P.cnbc(tk); } catch (x) { p = await P.nasdaq(tk); } precio = { precio: p.precio, divisa: p.divisa, fecha: p.fecha }; } catch (x) { r.notas.push('Sin precio automático (' + x.message + ').'); }
  const salida = { ticker: tk, nombre: r.nombre || e.title, cik, divisa: 'USD', generado: new Date().toISOString(), fuente: 'SEC EDGAR (XBRL, 10-K)', anios: r.anios, hist: r.hist, ttm: r.ttm, ultimo_ejercicio: r.ultimo, precio, notas: r.notas, faltan: r.faltan };
  fs.mkdirSync(path.join(RAIZ, 'datos'), { recursive: true }); fs.writeFileSync(path.join(RAIZ, 'datos', tk.replace(/[^A-Z0-9]/g, '_') + '.json'), JSON.stringify(salida, null, 1) + '\n');
  console.log(tk + ': ' + r.anios[0] + '–' + r.anios[r.anios.length - 1] + (r.ttm ? ' · 12 meses hasta ' + r.ttm.fin : '') + ' · sin datos: ' + (r.faltan.join(', ') || 'ninguna línea'));
  return salida;
}
/* Lote semanal: todas las empresas de simbolos.json que cotizan en EE. UU. (símbolo sin sufijo de bolsa) → datos/TICKER.json y datos/resumen.json */
async function lote() {
  const cfg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'simbolos.json'), 'utf8')).simbolos || {};
  const mapa = await (await pedir('https://www.sec.gov/files/company_tickers.json')).json();
  const tks = Object.keys(cfg).filter(k => !cfg[k].pausa && Array.isArray(cfg[k].y) && cfg[k].y[0] && !/[.=^]/.test(cfg[k].y[0]) && cfg[k].sec !== false);
  const resumen = { generado: new Date().toISOString(), nota: 'Últimos 12 meses (10-Q) y último ejercicio anual (10-K) de la SEC. Solo empresas de EE. UU. con cuentas US-GAAP.', empresas: {} };
  for (const tk of tks) {
    try { const s = await principal(tk, { mapa, sinPrecio: true }); resumen.empresas[tk] = { nombre: s.nombre, ultimo_ejercicio: s.ultimo_ejercicio, ttm: s.ttm, anual: { anios: s.anios, ventas: s.hist.ventas, ebit: s.hist.ebit } }; }
    catch (e) { resumen.empresas[tk] = { error: e.message.slice(0, 120) }; console.log(tk + ': ' + e.message); }
    await esperar(250);   // la SEC pide como mucho 10 peticiones por segundo
  }
  fs.writeFileSync(path.join(RAIZ, 'datos', 'resumen.json'), JSON.stringify(resumen, null, 1) + '\n');
}
/* «Tal como se publicó»: para cada línea y periodo, el PRIMER valor presentado (10-K o 10-Q) con su fecha de presentación (filed).
   Sirve para reconstruir qué se sabía en cada fecha (backtest sin sesgo de reexpresiones) y los últimos 12 meses de entonces.
   Formato por línea: [[inicio|null, fin, valor, filed, form], …] ordenado por fin. Los valores van en millones (acciones en millones, BPA en USD). */
function publicado(cf) {
  const gaap = cf && cf.facts && cf.facts['us-gaap']; if (!gaap) throw new Error('Sin datos US-GAAP');
  const out = {};
  for (const [k, def] of Object.entries(LINEAS)) {
    const por = {};   // clave periodo → {prio de etiqueta, hecho}
    def.tags.forEach((tag, prio) => {
      const t = gaap[tag], u = t && t.units && t.units[def.unidad || 'USD']; if (!u) return;
      for (const h of u) {
        if (!/^10-[KQ]/.test(h.form || '') || !isN(h.val) || !h.end || !h.filed) continue;
        if (def.tipo === 'flujo' && !h.start) continue;
        const clave = (def.tipo === 'flujo' ? h.start : '') + '|' + h.end, p = por[clave];
        // una etiqueta mejor (menor prio) manda; dentro de la misma etiqueta, gana la presentación más antigua
        if (!p || prio < p.prio || (prio === p.prio && h.filed < p.h.filed)) por[clave] = { prio, h };
      }
    });
    const esc = def.escala || 1e6;
    out[k] = Object.values(por).map(x => [def.tipo === 'flujo' ? x.h.start : null, x.h.end, Math.round(x.h.val / esc * 1000) / 1000, x.h.filed, x.h.form]).sort((a, b) => a[1].localeCompare(b[1]) || String(a[0]).localeCompare(String(b[0])));
  }
  return out;
}
async function lotePublicado(lista) {
  const cfg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'simbolos.json'), 'utf8')).simbolos || {};
  const mapa = await (await pedir('https://www.sec.gov/files/company_tickers.json')).json();
  const propios = Object.keys(cfg).filter(k => !cfg[k].pausa && Array.isArray(cfg[k].y) && cfg[k].y[0] && !/[.=^]/.test(cfg[k].y[0]) && cfg[k].sec !== false);
  const tks = [...new Set(propios.concat(lista || []))]; const dir = path.join(RAIZ, 'datos', 'publicado'); fs.mkdirSync(dir, { recursive: true });
  const resumen = { generado: new Date().toISOString(), empresas: {} };
  for (const tk of tks) {
    try {
      const e = Object.values(mapa).find(x => x.ticker.toUpperCase() === tk.replace('.', '-')) || Object.values(mapa).find(x => x.ticker.toUpperCase() === tk); if (!e) throw new Error('no está en la SEC');
      const cik = String(e.cik_str).padStart(10, '0'), cf = await (await pedir('https://data.sec.gov/api/xbrl/companyfacts/CIK' + cik + '.json')).json(), p = publicado(cf);
      fs.writeFileSync(path.join(dir, tk.replace(/[^A-Z0-9]/g, '_') + '.json'), JSON.stringify({ ticker: tk, nombre: cf.entityName || e.title, cik, generado: new Date().toISOString(), lineas: p }) + '\n');
      resumen.empresas[tk] = { filas: Object.values(p).reduce((s, a) => s + a.length, 0), desde: (p.ventas[0] || [])[1] || null }; console.log(tk + ': ' + resumen.empresas[tk].filas + ' hechos desde ' + resumen.empresas[tk].desde);
    } catch (x) { resumen.empresas[tk] = { error: x.message.slice(0, 100) }; console.log(tk + ': ' + x.message); }
    await esperar(250);
  }
  fs.writeFileSync(path.join(dir, '_resumen.json'), JSON.stringify(resumen, null, 1) + '\n');
}
if (require.main === module && process.argv[2] === '--publicado') lotePublicado((process.argv[3] || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean)).catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
else if (require.main === module && process.argv[2] === '--todos') lote().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
else if (require.main === module) principal(process.argv[2]).catch(e => { console.error('ERROR: ' + e.message); fs.mkdirSync(path.join(RAIZ, 'datos'), { recursive: true }); try { fs.writeFileSync(path.join(RAIZ, 'datos', String(process.argv[2] || 'x').toUpperCase().replace(/[^A-Z0-9]/g, '_') + '.json'), JSON.stringify({ ticker: String(process.argv[2] || '').toUpperCase(), error: e.message, generado: new Date().toISOString() }, null, 1) + '\n'); } catch (x) { } process.exit(0); });
module.exports = { ajustarSplits, construir, serie, anioDe, ttm, ultimoEjercicio, publicado, filasR, complementoEstados };
