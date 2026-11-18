/* Backtest con cifras TAL COMO SE PUBLICARON (datos/publicado/*.json: primer valor presentado y su fecha) para las fichas de EE. UU.
   Cortes: 31-mar (ejercicio recién publicado) y 15-nov (con el 10-Q del 3.er trimestre → compara base ejercicio vs últimos 12 meses).
   Uso: node tests/backtest_publicado.js datos_usuario.json [--salida fichero.json] */
global.Val = require('../js/val.js'); const V = global.Val, L = require('../js/logic.js'), fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..'), d = L.normalizar(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
const HP = Object.assign({}, JSON.parse(fs.readFileSync(path.join(RAIZ, 'datos', 'precios_anuales.json'), 'utf8')).simbolos, (() => { try { return JSON.parse(fs.readFileSync(path.join(RAIZ, 'datos', 'precios_backtest.json'), 'utf8')).simbolos; } catch (e) { return {}; } })()), TIPOS = JSON.parse(fs.readFileSync(path.join(__dirname, 'macro_tipos.json'), 'utf8'));
const NOW = '2026-11-17', clone = o => JSON.parse(JSON.stringify(o)), DAY = 864e5, dias = (a, b) => (Date.parse(b) - Date.parse(a)) / DAY;
const med = a => { a = a.filter(x => x != null && isFinite(x)).sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null; };
const rank = a => { const o = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = []; o.forEach((x, k) => r[x[1]] = k); return r; };
const spear = (a, b) => { if (a.length < 5) return null; const x = rank(a), y = rank(b), n = a.length, m = (n - 1) / 2; let c = 0, sx = 0, sy = 0; for (let i = 0; i < n; i++) { c += (x[i] - m) * (y[i] - m); sx += (x[i] - m) ** 2; sy += (y[i] - m) ** 2; } return c / Math.sqrt(sx * sy); };
const LIN = ['ventas', 'ebit', 'ni_reportado', 'da', 'impuestos', 'intereses', 'acciones', 'capex', 'fco', 'caja', 'inv_cp', 'deuda_lp', 'deuda_cp', 'dividendos', 'recompras'];
/* ── Reconstrucción de lo que se sabía en la fecha T ── */
function anuales(pub, T) {   // ejercicios completos presentados (10-K propio) antes de T
  const res = {};
  for (const k of LIN) {
    const flujo = !['caja', 'inv_cp', 'deuda_lp', 'deuda_cp'].includes(k);
    for (const [s, e, v, filed, form] of pub.lineas[k] || []) {
      if (filed > T || !/^10-K/.test(form) || dias(e, filed) > 150) continue;       // presentado con su propio ejercicio (no comparativas de años posteriores)
      if (flujo) { const n = dias(s, e); if (n < 340 || n > 380) continue; }
      (res[e] = res[e] || {})[k] = v;
    }
  }
  return Object.keys(res).sort().map(e => Object.assign({ fin: e }, res[e]));
}
function ttmDe(pub, T, ultimoFY) {   // últimos 12 meses con el último 10-Q presentado: FY + YTD actual − YTD del año anterior
  const q = {}; let finQ = null;
  (pub.lineas.ventas || []).forEach(([s, e, v, filed, form]) => { if (filed <= T && /^10-Q/.test(form) && e > ultimoFY.fin && s >= addDias(ultimoFY.fin, -5) && dias(s, e) > 60 && (!finQ || e > finQ.e || (e === finQ.e && dias(s, e) > dias(finQ.s, finQ.e)))) finQ = { s, e }; });
  if (!finQ) return null; const t = { fin: finQ.e }, ant = { s: addDias(finQ.s, -365), e: addDias(finQ.e, -365) };
  const cerca = (x, y) => Math.abs(dias(x, y)) <= 8;
  for (const k of ['ventas', 'ebit', 'ni_reportado', 'da', 'impuestos', 'intereses', 'capex', 'fco']) {
    const hs = pub.lineas[k] || [], cur = hs.find(h => cerca(h[0], finQ.s) && cerca(h[1], finQ.e) && h[3] <= T), pre = hs.find(h => cerca(h[0], ant.s) && cerca(h[1], ant.e));
    if (!cur || !pre || ultimoFY[k] == null) { if (['ventas', 'ebit'].includes(k)) return null; continue; }
    t[k] = ultimoFY[k] + cur[2] - pre[2];
  }
  ['caja', 'inv_cp', 'deuda_lp', 'deuda_cp'].forEach(k => { const h = (pub.lineas[k] || []).filter(h => cerca(h[1], finQ.e) && h[3] <= T).sort((a, b) => a[3].localeCompare(b[3]))[0]; if (h) t[k] = h[2]; });
  const sh = (pub.lineas.acciones || []).filter(h => h[3] <= T && h[1] === finQ.e && dias(h[0], h[1]) < 120).sort((a, b) => b[3].localeCompare(a[3]))[0] || (pub.lineas.acciones || []).filter(h => h[3] <= T && h[1] === finQ.e)[0];
  t.acciones = sh ? sh[2] : ultimoFY.acciones; return t;
}
function addDias(f, n) { return new Date(Date.parse(f) + n * DAY).toISOString().slice(0, 10); }
function aFicha(base, filas, ttm) {   // → ficha para el motor
  const f = clone(base); const an = filas.map(x => +x.fin.slice(0, 4) - (+x.fin.slice(5, 7) <= 2 ? 1 : 0));
  const g = k => filas.map(x => (x[k] == null ? 0 : x[k])), cj = filas.map(x => (x.caja || 0) + (x.inv_cp || 0)), dd = filas.map(x => (x.deuda_lp || 0) + (x.deuda_cp || 0));
  f.anios = an; f.hist = { ventas: g('ventas'), ebit: g('ebit'), ni_reportado: filas.map(x => x.ni_reportado), da: g('da'), impuestos: g('impuestos'), intereses: g('intereses'), acciones: g('acciones'), capex: g('capex').map(Math.abs), fco: filas.map(x => x.fco), caja: cj, deuda: dd, leases: g('ventas').map(() => 0), minoritarios: g('ventas').map(() => 0), leases_deuda: g('ventas').map(() => 0) };
  f.mes_cierre = +filas[filas.length - 1].fin.slice(5, 7); f.anio_base = an[an.length - 1]; f.conf = {}; ['ventas', 'ebit', 'da', 'impuestos', 'acciones', 'capex', 'caja', 'deuda'].forEach(k => f.conf[k] = 'A');
  ['escenarios', 'base_ttm', 'deuda_neta_proy', 'mult_hist', 'mult_hist_auto', 'solo_fcf', '_borrador'].forEach(k => delete f[k]); const lf = filas[filas.length - 1]; f.reparto0 = Math.abs(lf.dividendos || 0) + Math.abs(lf.recompras || 0); return f;
}
/* ── Universo ── */
const ES = f => (!f.tipo || f.tipo === 'industrial') && f.metodo !== 'margen_objetivo' && f.metodo !== 'fcfa2s';
const filas = [], pubs = {};
const rutaPub = tk => path.join(RAIZ, 'datos', 'publicado', tk.replace(/[^A-Z0-9]/g, '_') + '.json');
const CIC = new Set('DE PCAR CMI EMR ETN HON GE F GM DAL UAL LUV DHI LEN AMAT LRCX KLAC MCHP ADI NUE STLD DOW LYB CF MOS WHR TXT ITT DOV PH ROK SWK CAT MMM TXN FSLR MU SNDK'.split(' ')), FLOTA = new Set(['DAL', 'UAL', 'LUV', 'ESEA']);   // cíclicas (según mi criterio, solo para el backtest) y flotas
const FIC = tk => { const F = d.fichas[tk] || { divisa: 'USD', nombre: tk, ciclica: CIC.has(tk) }; if (FLOTA.has(tk)) F.flota = true; return F; };
const TODOS = new Set(Object.keys(d.fichas)); fs.readdirSync(path.join(RAIZ, 'datos', 'publicado')).filter(x => !x.startsWith('_')).forEach(x => TODOS.add(x.replace('.json', '')));
TODOS.forEach(tk => { const F = FIC(tk); if (!ES(F) || !fs.existsSync(rutaPub(tk))) return; const p = JSON.parse(fs.readFileSync(rutaPub(tk), 'utf8')); if (p.lineas && p.lineas.ventas && p.lineas.ventas.length) pubs[tk] = p; });
const CORTES = []; for (let y = 2018; y <= 2025; y++) CORTES.push({ T: y + '-03-31', mes: y + '-03', fam: 'M', rt: TIPOS[y + '-03'] }); for (let y = 2018; y <= 2025; y++) CORTES.push({ T: y + '-11-15', mes: y + '-11', fam: 'N', rt: TIPOS[y + '-12'] });
Object.keys(pubs).forEach(tk => {
  const F = FIC(tk), e = HP[tk], pub = pubs[tk]; if (!e || e.divisa !== F.divisa) return; let pNow; try { pNow = d.fichas[tk] ? L.precioFicha(d, tk).precio : e.cierres[Object.keys(e.cierres).sort().pop()]; } catch (x) { return; } if (!(pNow > 0)) return;
  const todas = anuales(pub, NOW); if (todas.length < 5) return;
  const sp = (e.splits && e.splits.length) ? e.splits : V.inferirSplits(todas.map(x => x.acciones || 0), todas.map(x => +x.fin.slice(0, 4)), 12);
  const fullF = aFicha(F, todas), adj = V.accAjustadas(fullF.hist, sp, fullF.anios, fullF.mes_cierre); const factor = todas.map((x, i) => (x.acciones ? adj.acc[i] / x.acciones : 1));
  CORTES.forEach(c => {
    const P0 = e.cierres[c.mes]; if (!(P0 > 0)) return; const an = anuales(pub, c.T); if (an.length < 3) return; const ult = an[an.length - 1]; if (dias(ult.fin, c.T) > 400) return;
    const idx = todas.findIndex(x => x.fin === ult.fin); if (idx < 0) return; const fac = factor[idx], filasAdj = an.map((x, i) => Object.assign({}, x, { acciones: x.acciones * factor[todas.findIndex(y => y.fin === x.fin)] }));
    const ttm = c.fam === 'N' ? ttmDe(pub, c.T, ult) : null; if (ttm && ttm.acciones) ttm.acciones *= fac;
    const yrs = dias(c.T, NOW) / 365.25, cierres = {}; Object.keys(e.cierres).forEach(m => { if (m <= c.mes) cierres[m] = e.cierres[m]; });
    const fBase = aFicha(F, filasAdj); fBase.precio = P0;
    const fTtm = ttm ? aFicha(F, filasAdj.concat([ttm])) : null; if (fTtm) { fTtm.precio = P0; fTtm.anios[fTtm.anios.length - 1] = fTtm.anios[fTtm.anios.length - 2] + 1; fTtm.mes_cierre = fBase.mes_cierre; }
    filas.push({ tk, e, c, P0, pNow, yrs, fBase, fTtm, cierres, ult: ult.fin, ttmFin: ttm && ttm.fin });
  });
});
/* ── Valoración de una variante ── */
function valor(f, c, r, mult, factorMacro) {
  try {
    const g = clone(f); const mh = mult ? clone(mult) : null; if (mh && factorMacro) Object.keys(mh).forEach(k => mh[k] *= factorMacro); if (mh) g.mult_hist = mh;
    const dfl = V.defaults(g), p = V.proyectar(g, dfl.conservador); const baseFin = g.hist ? (r.ttmFin && g === r.fTtmUsado ? r.ttmFin : r.ult) : r.ult;
    const base = (g === r.fTtmUsado && r.ttmFin) ? r.ttmFin : r.ult; const k = Math.max(1, Math.min(5, Math.round(r.yrs + dias(base, r.c.T) / 365.25))); const q = p.rows[k - 1]; if (!q) return null;
    const pp = Math.max(q.po.per, q.po.pfcf), ref = (pp + q.po.ev_ebitda) / 2; if (!(ref > 0)) return null;
    const tref = k - dias(base, r.c.T) / 365.25;      // años entre el corte y la fecha del valor proyectado (cierre del ejercicio k)
    const t1 = Math.min(tref, r.yrs), P1 = t1 >= tref - 0.03 ? precioEn(r, addDias(r.c.T, Math.round(tref * 365.25))) : r.pNow;   // precio real en esa fecha (o el de hoy si aún no ha llegado)
    if (!(P1 > 0) || t1 < 0.9) return null;
    return { mper: dfl.conservador.per, gC: dfl.conservador.g, ref, tref, t1, P1, v: r.P0 * Math.pow(ref / r.P0, t1 / tref), pred: Math.pow(ref / r.P0, 1 / tref) - 1, real: Math.pow(P1 / r.P0, 1 / t1) - 1 };
  } catch (x) { return null; }
}
function precioEn(r, fecha) {
  if (fecha >= NOW) return r.pNow; const m0 = fecha.slice(0, 7); const ks = Object.keys(r.e.cierres).sort(); let mejor = null, dm = 9e9;
  ks.forEach(k => { const x = Math.abs(dias(k + '-15', fecha)); if (x < dm) { dm = x; mejor = k; } }); return dm <= 45 ? r.e.cierres[mejor] : null;
}
function propios(f, r) { const mh = V.multiplosHistoricos(f, r.cierres, [], { min: 3 }); return mh && mh.valido && !['per', 'pfcf'].some(k => mh.mult[k] > 40) ? { mult: mh.mult, rmed: med((mh.anios || []).map(a => TIPOS[a + '-12'])) } : null; }
let res = [];
function correr(exp) {
  Object.keys(V.EXP).forEach(k => delete V.EXP[k]); Object.assign(V.EXP, exp || {}); res = [];
filas.forEach(r => {
  const o = { tk: r.tk, T: r.c.T, fam: r.c.fam, P0: r.P0, pNow: r.pNow, yrs: r.yrs, real: Math.pow(r.pNow / r.P0, 1 / r.yrs) - 1 };
  o.A = valor(r.fBase, r.c, r, null);
  const pb = propios(r.fBase, r); o.B = pb ? valor(r.fBase, r.c, r, pb.mult) : null;
  const fm = pb && pb.rmed != null && r.c.rt != null ? Math.min(1.15, Math.max(0.85, (pb.rmed + 4) / (r.c.rt + 4))) : null; o.M = pb && fm ? valor(r.fBase, r.c, r, pb.mult, fm) : null; o.fm = fm;
  if (r.fTtm) { r.fTtmUsado = r.fTtm; const pt = propios(r.fTtm, r); o.TA = valor(r.fTtm, r.c, r, null); o.TB = pt ? valor(r.fTtm, r.c, r, pt.mult) : null; o.BB = pb ? valor(r.fBase, r.c, r, pb.mult) : null; }
  o.cic = !!(r.fBase && r.fBase.ciclica); { const hh = r.fBase.hist, n = hh.ventas.length - 1; o.capHi = hh.capex[n] > 1.5 * hh.da[n]; o.y = +r.c.T.slice(0, 4); }
  res.push(o);
});
  return res;
}

/* ── Análisis: cada mejora aislada sobre el escenario conservador, emparejada con la base (mismas filas) ── */
const err = (o, k) => (o[k] ? o[k].v / o[k].P1 - 1 : null);
const base = correr({}).map(o => o);
const MALLA = [
  ['1a Cíclicas: margen = mediana', { cicMed: true }], ['1b Cíclicas: g ≤ 4 %', { cicG: 0.04 }], ['1c Cíclicas: mediana + g ≤ 4 %', { cicMed: true, cicG: 0.04 }],
  ['2a Ventana: ignora año previo a la caída', { ventana: 'sinPrevio' }], ['2b Ventana: crecimiento desde 2021', { ventana: 'post2021' }],
  ['3 Balance dinámico (deuda neta e intereses)', { dyn: true }],
  ['4a Tope PER/P·FCF 28x si g5<10 %', { capPer: 28 }], ['4b Tope PER/P·FCF 30x si g5<10 %', { capPer: 30 }],
  ['5 CapEx normalizado (capex>1,5×D&A, sin flotas)', { capex: { ratio: 1.5 } }]
];
const SUB = {
  todas: () => true, 'cíclicas': o => o.cic, 'cortes ≥2022': o => o.y >= 2022, 'capex>1,5×D&A': o => o.capHi,
  'PER salida>28x': o => (o.B || o.A) && (o.B || o.A).mper > 28
};
const spearEnv = (R, k) => spear(R.map(o => o[k].pred), R.map(o => o[k].real));
function comp(nombre, v, k, sub) {
  const idx = []; base.forEach((b, i) => { if (SUB[sub](b) && b[k] && v[i][k]) idx.push(i); });
  if (idx.length < 3) return { n: idx.length };
  const e0 = idx.map(i => err(base[i], k)), e1 = idx.map(i => err(v[i], k)), d = idx.map((_, j) => Math.abs(e1[j]) - Math.abs(e0[j]));
  return { n: idx.length, sesgo0: med(e0), sesgo1: med(e1), abs0: med(e0.map(Math.abs)), abs1: med(e1.map(Math.abs)), dAbs: med(d), mejora: d.filter(x => x < -1e-9).length, empeora: d.filter(x => x > 1e-9).length, rho0: spearEnv(idx.map(i => base[i]), k), rho1: spearEnv(idx.map(i => v[i]), k) };
}
const f1 = x => (x == null ? '—' : (x * 100).toFixed(1) + '%'), f2 = x => (x == null ? '—' : x.toFixed(2));
const salida = { empresas: Object.keys(pubs).length, filas: base.length, variantes: [] };
console.log('empresas', Object.keys(pubs).length, '· filas', base.length, '· cíclicas', new Set(base.filter(o => o.cic).map(o => o.tk)).size, 'empresas /', base.filter(o => o.cic).length, 'filas');
MALLA.forEach(([nombre, exp]) => {
  const v = correr(exp); const fila = { nombre, exp, kinds: {} };
  console.log('\n' + nombre);
  ['B', 'A'].forEach(k => Object.keys(SUB).forEach(sub => {
    const c = comp(nombre, v, k, sub); fila.kinds[k + ' · ' + sub] = c; if (c.n < 3) return;
    if (sub !== 'todas' && Math.abs((c.abs1 || 0) - (c.abs0 || 0)) < 1e-6 && c.mejora === 0 && c.empeora === 0) return;
    console.log(('  ' + (k === 'B' ? 'propios' : 'genérico') + ' · ' + sub).padEnd(36), 'n=' + String(c.n).padStart(3), '| sesgo', f1(c.sesgo0), '→', f1(c.sesgo1), '| |err| mediano', f1(c.abs0), '→', f1(c.abs1), '| Δ', f1(c.dAbs), '| mejoran', c.mejora, 'empeoran', c.empeora, '| spearman', f2(c.rho0), '→', f2(c.rho1));
  }));
  salida.variantes.push(fila);
});
const io = process.argv.indexOf('--salida'); if (io > 0) fs.writeFileSync(process.argv[io + 1], JSON.stringify(salida, null, 1));
