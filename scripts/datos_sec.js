#!/usr/bin/env node
/* Baja de la SEC (EDGAR, datos XBRL de los 10-K) las cuentas anuales de una empresa de EE. UU. y las guarda en datos/TICKER.json
   con el mismo formato que una ficha de valoración (anios + hist). Uso: node scripts/datos_sec.js TICKER
   Se ejecuta desde GitHub Actions (workflow «Datos de empresa»). La app lee datos/TICKER.json y crea con él el cribado y la ficha. */
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..');
const UA = { 'User-Agent': 'MiCartera/1.0 proyecto personal (github.com/wanlida02/mi-cartera)', Accept: 'application/json' };
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
  equity: { tipo: 'saldo', tags: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'] }
};
const dias = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
/* Año de ejercicio: año de la fecha de cierre; si cierra en enero o febrero (comercio minorista), cuenta como el año anterior */
const anioDe = fin => { const y = Number(fin.slice(0, 4)), m = Number(fin.slice(5, 7)); return m <= 2 ? y - 1 : y; };

/* Serie anual {año: valor} de una línea: hechos de 10-K, periodo de 350–380 días (flujo) o instante (saldo); gana el más reciente presentado */
function serie(gaap, def) {
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
    const anios = Object.keys(por); if (anios.length) return Object.fromEntries(anios.map(a => [a, por[a].val / (def.escala || 1e6)]).map(([a, v]) => [a, Math.round(v * 1000) / 1000]));
  }
  return null;
}
/* Construye {anios, hist} a partir del JSON «companyfacts» de la SEC */
function construir(cf) {
  const gaap = cf && cf.facts && cf.facts['us-gaap']; if (!gaap) throw new Error('Sin datos US-GAAP (¿empresa extranjera con 20-F/IFRS? Usa los informes anuales).');
  const s = {}; Object.keys(LINEAS).forEach(k => { s[k] = serie(gaap, LINEAS[k]); });
  if (!s.ventas) throw new Error('No se encontraron ventas anuales (10-K) en la SEC.');
  const todos = [...new Set(Object.values(s).filter(Boolean).flatMap(o => Object.keys(o).map(Number)))].sort((a, b) => a - b);
  const ult = Math.max(...Object.keys(s.ventas).map(Number));
  let anios = todos.filter(a => s.ventas[a] != null && a <= ult).slice(-10);
  if (anios.length < 3) throw new Error('Menos de 3 años de ventas en la SEC.');
  const col = k => anios.map(a => (s[k] && isN(s[k][a]) ? s[k][a] : null));
  const suma = (...ks) => anios.map(a => { const v = ks.map(k => (s[k] && isN(s[k][a]) ? s[k][a] : null)); return v.every(x => x == null) ? null : v.reduce((p, c) => p + (c || 0), 0); });
  const hist = {
    ventas: col('ventas'), ebit: col('ebit'), da: col('da'), intereses: col('intereses'), impuestos: col('impuestos'), minoritarios: anios.map(() => 0), otros: anios.map(() => 0),
    acciones: col('acciones'), capex: col('capex'), leases: anios.map(() => null), caja: suma('caja', 'inv_cp'), deuda: suma('deuda_lp', 'deuda_cp'), leases_deuda: anios.map(() => null),
    goodwill: col('goodwill'), equity: col('equity'), ni_reportado: col('ni_reportado'), fco: col('fco'), sbc: col('sbc'), dividendos: col('dividendos'), recompras: col('recompras'), bpa: col('bpa')
  };
  const faltan = Object.keys(hist).filter(k => !['minoritarios', 'otros', 'leases', 'leases_deuda'].includes(k) && hist[k].every(x => x == null));
  const notas = ['Datos automáticos de la SEC (XBRL de los 10-K). Revísalos contra el informe anual antes de decidir: pueden faltar líneas o haber reexpresiones.',
    'Caja = efectivo + inversiones a corto plazo; deuda = deuda financiera (sin arrendamientos). Intereses = gasto bruto (no netos de ingresos). Minoritarios, otros y arrendamientos van a 0 o sin dato: complétalos si importan.'];
  if (faltan.length) notas.push('Líneas sin datos en la SEC: ' + faltan.join(', ') + '.');
  return { anios, hist, notas, faltan, nombre: cf.entityName || null };
}
async function pedir(url) {
  let ult; for (let i = 0; i < 3; i++) { try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) }); if (r.ok) return r; ult = new Error('HTTP ' + r.status + ' en ' + url); if (r.status === 404) break; } catch (e) { ult = e; } await esperar(1500 * (i + 1)); }
  throw ult;
}
async function principal(tk) {
  tk = String(tk || '').trim().toUpperCase(); if (!/^[A-Z0-9.\-]{1,10}$/.test(tk)) throw new Error('Ticker no válido');
  const mapa = await (await pedir('https://www.sec.gov/files/company_tickers.json')).json();
  const e = Object.values(mapa).find(x => x.ticker.toUpperCase() === tk.replace('.', '-')) || Object.values(mapa).find(x => x.ticker.toUpperCase() === tk);
  if (!e) throw new Error('«' + tk + '» no está en la lista de la SEC: solo cubre empresas de EE. UU. Para otras, usa los informes anuales.');
  const cik = String(e.cik_str).padStart(10, '0');
  const r = construir(await (await pedir('https://data.sec.gov/api/xbrl/companyfacts/CIK' + cik + '.json')).json());
  let precio = null; try { const P = require('./actualizar_precios.js'); let p; try { p = await P.cnbc(tk); } catch (x) { p = await P.nasdaq(tk); } precio = { precio: p.precio, divisa: p.divisa, fecha: p.fecha }; } catch (x) { r.notas.push('Sin precio automático (' + x.message + ').'); }
  const salida = { ticker: tk, nombre: r.nombre || e.title, cik, divisa: 'USD', generado: new Date().toISOString(), fuente: 'SEC EDGAR (XBRL, 10-K)', anios: r.anios, hist: r.hist, precio, notas: r.notas, faltan: r.faltan };
  fs.mkdirSync(path.join(RAIZ, 'datos'), { recursive: true }); fs.writeFileSync(path.join(RAIZ, 'datos', tk.replace(/[^A-Z0-9]/g, '_') + '.json'), JSON.stringify(salida, null, 1) + '\n');
  console.log(tk + ': ' + r.anios[0] + '–' + r.anios[r.anios.length - 1] + ' · sin datos: ' + (r.faltan.join(', ') || 'ninguna línea'));
}
if (require.main === module) principal(process.argv[2]).catch(e => { console.error('ERROR: ' + e.message); fs.mkdirSync(path.join(RAIZ, 'datos'), { recursive: true }); try { fs.writeFileSync(path.join(RAIZ, 'datos', String(process.argv[2] || 'x').toUpperCase().replace(/[^A-Z0-9]/g, '_') + '.json'), JSON.stringify({ ticker: String(process.argv[2] || '').toUpperCase(), error: e.message, generado: new Date().toISOString() }, null, 1) + '\n'); } catch (x) { } process.exit(0); });
module.exports = { construir, serie, anioDe };
