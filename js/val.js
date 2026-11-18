/* Motor de valoración M14 (múltiplos). Puro: sin DOM. Importes en millones, por acción en divisa de cotización. */
const Val = (function () {
  const isN = v => typeof v === 'number' && isFinite(v);
  const last = a => (a && a.length ? a[a.length - 1] : undefined);
  const cagr = (a, n) => { // CAGR de los últimos n periodos de una serie
    const x = a.filter(isN); if (x.length < 2) return null;
    const k = Math.min(n, x.length - 1), s = x[x.length - 1 - k], e = last(x);
    return s > 0 && e > 0 ? Math.pow(e / s, 1 / k) - 1 : null;
  };
  const avg = a => { const x = a.filter(isN); return x.length ? x.reduce((p, c) => p + c, 0) / x.length : null; };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const z = v => (isN(v) ? v : 0);
  /* Extraordinarios †: partidas puntuales incluidas en el EBIT (positivo = ganancia, negativo = cargo). Se restan para trabajar con el EBIT recurrente;
     el impuesto se ajusta en proporción al beneficio antes de impuestos. El control contra el beneficio reportado sigue usando el EBIT tal cual. */
  const ebitR = (h, j) => (isN(h.ebit[j]) ? h.ebit[j] - z(h.extra && h.extra[j]) : h.ebit[j]);
  const taxR = (h, j) => { const e = z(h.extra && h.extra[j]); if (!e || !isN(h.impuestos[j])) return h.impuestos[j];
    const pt = z(h.ebit[j]) - z(h.intereses[j]), ptR = pt - e; return pt > 0 && ptR > 0 ? h.impuestos[j] * ptR / pt : ptR <= 0 ? 0 : h.impuestos[j]; };
  const esMO = f => !!f && f.metodo === 'margen_objetivo';
  /* Método FCFA2S †: compounders de software (Constellation) cuyo beneficio IFRS no sirve (amortización de intangibles de compras, revalorización de pasivos IRGA/TSS).
     Se valora SOLO por el flujo libre para el accionista tras minoritarios (ficha.hist.fcfa2s, ya neto de intereses, arrendamientos y minoritarios) × múltiplo de salida.
     No hay PER, EV/EBIT ni EV/EBITDA en la referencia. Precio y cifras, siempre en la misma divisa (la de la ficha). */
  const esFC = f => !!f && f.metodo === 'fcfa2s';
  const CFG = { crisis: 'ventas', ancho: true, gpre: false };
  /* EXP: variantes del motor probadas una a una en tests/backtest_mejoras.js (18-nov-2026, 99 empresas de EE. UU., 1.461 filas, cifras tal como se publicaron).
     ACTIVAS (el backtest las respalda): cicMed (empresas cíclicas: margen = mediana de la serie, 17 empresas mejoran / 12 empeoran) y capex (CapEx normalizado: 13 / 4).
     APAGADAS (el backtest las rechaza, se dejan como interruptor): cicG (g ≤ 4 % en cíclicas: 6 / 14), dyn (balance dinámico: 28 / 52), capPer (tope de PER de salida: 6 / 15). ventana: sin evidencia (solo 12 filas); AIR se resuelve con crec_desde_previo: false en su ficha.
     cicMed: margen de las cíclicas = mediana (no media) · cicG: tope al crecimiento de las cíclicas · ventana: 'sinPrevio' (ignora el año previo a la caída) | 'post2021' (crecimiento desde 2021)
     dyn: deuda neta y gasto financiero dinámicos · capPer: tope de PER/P·FCF de salida si g_5 < 10 % (EV/EBITDA y EV/EBIT escalados) · capex: {ratio, fin}: capex/ventas converge a 1,15×D&A/ventas si capex > ratio×D&A (no flotas) */
  const EXP = { cicMed: true, capex: { ratio: 1.5 } };   // gpre y el aviso de trampa de valor se probaron y NO mejoraron en la muestra de validación   // mejoras del backtest (21/10/2026): normalizar años de crisis y escenarios más anchos
  const median = a => { const x = a.filter(isN).sort((p, q) => p - q); return x.length ? (x.length % 2 ? x[(x.length - 1) / 2] : (x[x.length / 2 - 1] + x[x.length / 2]) / 2) : null; };
  /* Años de crisis †: ventas más de un 10 % por debajo del año anterior, o margen EBIT recurrente por debajo de la mitad de la mediana del resto de años */
  function crisisYears(h) {
    const n = h.ventas.length, m = h.ventas.map((v, i) => (isN(h.ebit[i]) && v > 0 ? ebitR(h, i) / v : null));
    return h.ventas.map((v, j) => { const med = median(m.filter((_, i) => i !== j));
      return (j > 0 && h.ventas[j - 1] > 0 && isN(v) && v < 0.9 * h.ventas[j - 1]) || (med != null && med > 0 && isN(m[j]) && m[j] < 0.5 * med); });
  }

  /* Año de arranque deprimido †: si el CAGR de 5 años empieza en un ejercicio con ventas >10 % por debajo del anterior (p. ej. COVID 2020), devuelve el índice del ejercicio previo */
  function inicioHundido(h) {
    const n = h.ventas.length, s0 = n - 1 - Math.min(5, n - 1);
    return s0 >= 1 && h.ventas[s0 - 1] > 0 && isN(h.ventas[s0]) && h.ventas[s0] < 0.9 * h.ventas[s0 - 1] ? s0 - 1 : -1;
  }
  /* ---- Supuestos por defecto a partir del histórico (M14: conservador, "como mucho lo de los últimos años") ---- */
  /* Una ficha puede venir sin algunas líneas (p. ej. borradores de informes): se rellenan con nulos para que nada falle */
  function asegurar(f) {
    const h = Object.assign({}, f.hist), n = (h.ventas || []).length;   // copia: no se toca la ficha (si no, lineasFaltantes dejaría de detectar las líneas ausentes)
    ['leases', 'leases_deuda', 'goodwill', 'equity', 'minoritarios', 'otros', 'impuestos', 'intereses', 'da', 'capex', 'caja', 'deuda', 'acciones', 'ebit', 'ebitda'].forEach(k => { if (!Array.isArray(h[k])) h[k] = Array(n).fill(null); });
    return h;
  }
  function defaults(f) {
    const h = asegurar(f), n = h.ventas.length;
    const margen = h.ventas.map((v, i) => (isN(h.ebit[i]) && v > 0 ? ebitR(h, i) / v : null));
    const tasa = h.ventas.map((v, i) => { const pt = z(h.ebit[i]) - z(h.intereses[i]); return pt > 0 && isN(h.impuestos[i]) ? h.impuestos[i] / pt : null; });
    const g5 = cagr(h.ventas, 5), a3r = cagr(h.acciones, 3);
    const recompro = n >= 2 && isN(h.acciones[n - 1]) && isN(h.acciones[n - 2]) && h.acciones[n - 1] < h.acciones[n - 2];
    const a3 = a3r == null ? null : recompro ? Math.min(a3r, 0) : a3r;   // v8: si el último ejercicio ya recompró, no se proyecta dilución
    const cr = CFG.crisis && !esMO(f) ? crisisYears(h) : h.ventas.map(() => false);
    const mOk = margen.filter((v, i) => !cr[i] && isN(v));            // márgenes de años normales
    const m3 = cr.slice(-3).some(Boolean) && mOk.length ? avg(mOk.slice(-3)) : avg(margen.slice(-3));
    const mUlt = cr[n - 1] && mOk.length ? last(mOk) : last(margen);
    let v0 = null; if (CFG.crisis === 'ventas' && cr[n - 1]) { for (let j = n - 2; j >= 0; j--) if (!cr[j]) { if (h.ventas[j] > h.ventas[n - 1]) v0 = h.ventas[j]; break; } }   // ventas de antes de la crisis
    const ih = f.crec_desde_previo === false ? -1 : inicioHundido(h), gAlt0 = ih >= 0 ? cagr(h.ventas.slice(ih), n) : null;
    const i21 = (f.anios || []).findIndex(a => a >= 2021), gPost = EXP.ventana === 'post2021' && ih >= 0 && i21 >= 0 && n - i21 >= 3 ? cagr(h.ventas.slice(i21), n) : null;
    const gAlt = EXP.ventana === 'sinPrevio' ? null : gPost != null ? gPost : gAlt0;   // por defecto: crecimiento desde el año previo a la caída (el año del COVID se deja aparte); se desactiva con ficha.crec_desde_previo = false
    const cic = !!f.ciclica && !esMO(f), gCic = cic ? cagr(h.ventas, n) : null;   // cíclica †: crecimiento de toda la serie y margen medio del ciclo
    let jPre = -1; if (CFG.crisis === 'ventas' && cr[n - 1]) for (let j = n - 2; j >= 0; j--) if (!cr[j]) { jPre = j; break; }
    const gPre = CFG.gpre && jPre > 0 ? cagr(h.ventas.slice(0, jPre + 1), 5) : null;   // año base en crisis: crecimiento histórico hasta el año previo a la crisis
    const gBase = gPre != null ? clamp(gPre, 0, 0.25) : cic ? (gCic == null ? 0.03 : Math.min(clamp(gCic, 0, 0.25), EXP.cicG != null ? EXP.cicG : 1)) : g5 == null ? 0.03 : clamp(gAlt != null ? Math.min(g5, gAlt) : g5, 0, 0.25);
    const mBase = cic ? ((EXP.cicMed ? median(margen) : avg(margen)) == null ? 0.1 : (EXP.cicMed ? median(margen) : avg(margen))) : m3 == null ? 0.1 : Math.min(m3, mUlt == null ? m3 : mUlt);
    const mo = esMO(f) ? (f.margen_objetivo || {}) : null, mc = mo ? (f.mult_comp || {}) : null;   // margen objetivo †: empresas sin beneficio
    const tBase = avg(tasa.slice(-3).filter(t => t != null && t > 0.05 && t < 0.4)); // media últimos 3 años, sin atípicos
    const mh = (mo ? mc : f.mult_hist) || {};
    const mk = (kg, km, kM, esc) => ({
      g: gBase * kg, fade: true, m: mo ? (isN(mo[esc]) ? mo[esc] : mBase * km) : mBase * km,
      ...(mo ? { m0: isN(last(margen)) ? last(margen) : 0 } : {}),
      ...(v0 ? { v0 } : {}),
      t: tBase == null ? 0.22 : clamp(tBase, 0.12, 0.30),
      acc: a3 == null ? 0 : clamp(a3, -0.04, 0.02),
      per: (mh.per || 15) * kM, pfcf: (mh.pfcf || mh.per || 15) * kM,
      ev_ebitda: (mh.ev_ebitda || 9) * kM, ev_ebit: (mh.ev_ebit || 11) * kM
    });
    if (esFC(f)) {   // FCFA2S: crecimiento = CAGR de la serie (conservador), la mitad (pesimista) y el de 3 años (optimista); múltiplos de salida de la propia ficha
      const fc = h.fcfa2s || [], g4 = cagr(fc, 5), g3 = cagr(fc, 3), gB = clamp(g4 == null ? 0.05 : g4, 0, 0.25), gO = clamp(g3 == null ? gB : Math.max(g3, gB), 0, 0.25);
      const mm = Object.assign({ pesimista: 20, conservador: 26, optimista: 30 }, f.mult_fcfa2s || {});
      const fix = (o, g, esc) => Object.assign(o, { g, pfcf: mm[esc], per: null, ev_ebitda: null, ev_ebit: null });
      const b = mk(1, 1, 1, 'conservador'), p = mk(0.5, 0.8, 0.7, 'pesimista'), op = mk(1.5, 1.15, 1.25, 'optimista');
      return { conservador: fix(b, gB, 'conservador'), pesimista: fix(p, gB * 0.5, 'pesimista'), optimista: fix(op, gO, 'optimista') };
    }
    return {
      conservador: mk(1, 1, 1, 'conservador'),            // "neutral/conservador": histórico
      pesimista: CFG.ancho ? mk(0.5, 0.8, 0.7, 'pesimista') : mk(0.5, 0.92, 0.8, 'pesimista'),   // menos crecimiento ⇒ menos múltiplo
      optimista: CFG.ancho ? mk(1.5, 1.15, 1.25, 'optimista') : mk(1.3, 1.05, 1.1, 'optimista')
    };
  }

  /* v8 †: crecimiento que se desvanece. El exceso sobre el 4 % se reduce linealmente hasta la mitad en el año 5
     (25 % → 14,5 %; 12 % → 8 %; ≤ 4 % no cambia). Se desactiva por escenario con fade: false. */
  const G_LARGO = 0.04;
  const gAnio = (sc, k) => (sc.fade !== false && sc.g > G_LARGO ? G_LARGO + (sc.g - G_LARGO) * (1 - 0.125 * (k - 1)) : sc.g);

  /* Valor hoy a su múltiplo histórico † (lectura a corto plazo, ¿chollo ahora?): el último ejercicio recurrente valorado a los múltiplos
     medios de la propia empresa (PER, P/FCF, EV/EBITDA, EV/EBIT; los mismos mult_hist del motor). Mediana de las métricas positivas.
     Supone que el último año se mantiene y que el múltiplo vuelve a su media; no proyecta crecimiento. Sin mult_hist no se calcula. */
  function valorMultiplo(f, aj) {
    const mh = f.mult_hist; if (!mh) return null;
    const a0 = actuales(f), acc = last(f.hist.acciones); if (!(acc > 0)) return null;
    let a = a0, doce = null;
    /* aj: últimos 12 meses (SEC). k = EBIT 12 meses / EBIT del mismo año base en la SEC; el beneficio y el FCF recurrentes de la ficha se escalan
       con él (el beneficio neto de 12 meses puede llevar extraordinarios: plusvalías de inversiones, efectos fiscales). */
    if (aj && isN(aj.k)) {
      if (!(aj.k > 0)) return { sinBeneficio: true, doce: aj };
      const da = isN(a0.ebitda) && isN(a0.ebit) ? a0.ebitda - a0.ebit : 0;
      a = Object.assign({}, a0, { ni: a0.ni * aj.k, fcf: a0.fcf * aj.k, ebit: a0.ebit * aj.k, ebitda: a0.ebit * aj.k + da }); doce = aj;
    }
    const caja = a.nd < 0 ? -a.nd : 0, v = {};
    if (a.ni > 0 && mh.per > 0) v.per = (a.ni * mh.per + caja) / acc;
    if (a.fcf > 0 && mh.pfcf > 0) v.pfcf = (a.fcf * mh.pfcf + caja) / acc;
    if (a.ebitda > 0 && mh.ev_ebitda > 0) v.ev_ebitda = (a.ebitda * mh.ev_ebitda - a.nd) / acc;
    if (a.ebit > 0 && mh.ev_ebit > 0) v.ev_ebit = (a.ebit * mh.ev_ebit - a.nd) / acc;
    const val = median(Object.values(v).filter(x => isN(x) && x > 0)); if (!isN(val)) return null;
    const desc = isN(f.precio) && f.precio > 0 ? 1 - f.precio / val : null;   // >0: cotiza por debajo de su valor a múltiplo histórico
    /* Múltiplos «de siempre» poco normales: el histórico se aleja mucho del de hoy (años de rampa, de crisis o historia corta) */
    const r1 = mh.per > 0 && a0.per > 0 ? mh.per / a0.per : mh.ev_ebitda > 0 && a0.ev_ebitda > 0 ? mh.ev_ebitda / a0.ev_ebitda : null;
    const raro = r1 == null ? null : r1 > 1.4 ? 'alto' : r1 < 0.7 ? 'bajo' : null;
    return { valor: val, porMetodo: v, descuento: desc, doce, raro, ratioHist: r1, nivel: desc == null ? null : desc >= 0.2 ? 'chollo' : desc >= 0 ? 'debajo' : desc > -0.2 ? 'encima' : 'cara' };
  }

  /* ---- Proyección de un escenario a 5 años (réplica de las 4 pestañas del Excel) ---- */
  function proyectar(f, sc, opts) {
    opts = opts || {};
    const h = asegurar(f), i = h.ventas.length - 1;
    const precio = f.precio, y = f.dividend_yield || 0;
    const nd0 = z(last(h.deuda)) + z(last(h.leases_deuda)) - z(last(h.caja));
    const ndPath = opts.ndPath || (f.deuda_neta_proy && f.deuda_neta_proy.length ? f.deuda_neta_proy : null);
    const rows = [];
    let p = { ventas: last(h.ventas), da: z(last(h.da)), interes: z(last(h.intereses)), min: z(last(h.minoritarios)),
      capex: z(last(h.capex)), leases: z(last(h.leases)), acc: last(h.acciones) };
    const otros = z(last(h.otros)); // resultado de participadas y pensiones (no escala con las ventas): se mantiene constante
    const fc = esFC(f); let fcb = fc ? last(h.fcfa2s) : null;
    const tt = fc && f.base_ttm && f.base_ttm.fcfa2s > 0 ? f.base_ttm : null, fr = tt ? (tt.fraccion == null ? 0.25 : tt.fraccion) : 1; let prod = 1;   // base TTM: arranca de los últimos 12 meses (cierre T3) y llega a dic-2030 con 4,25 años de crecimiento
    let fv0 = 1;   // factor acumulado de crecimiento (para la recuperación tras crisis)
    const cr0 = p.capex / p.ventas, dar0 = p.da / p.ventas, fadeCapex = EXP.capex && !f.flota && cr0 > EXP.capex.ratio * dar0;
    let debB = z(last(h.deuda)) + z(last(h.leases_deuda)), cajB = z(last(h.caja)), ndD = nd0;
    const kd = Math.min(0.08, Math.max(0.02, debB > 0 ? z(last(h.intereses)) / debB : 0.04)), kc = 0.03, rep0 = isN(f.reparto0) ? f.reparto0 : (f.dividend_yield || 0) * (precio || 0) * z(last(h.acciones));
    const capF = EXP.capPer && gAnio(sc, 5) < 0.10 && sc.per > EXP.capPer ? EXP.capPer / sc.per : 1, perE = sc.per * capF, pfcfE = Math.min(sc.pfcf, EXP.capPer && gAnio(sc, 5) < 0.10 ? EXP.capPer : 1e9), evdE = sc.ev_ebitda * capF, evtE = sc.ev_ebit * capF;
    for (let k = 1; k <= 5; k++) {
      const q = {}, gk = gAnio(sc, k); fv0 *= 1 + gk; q.g = gk;
      q.ventas = isN(sc.v0) && sc.v0 > last(h.ventas) ? (k >= 2 ? sc.v0 * fv0 : (last(h.ventas) + sc.v0 * (1 + gk)) / 2) : p.ventas * (1 + gk);   // tras un año de crisis, recupera las ventas de antes en 2 años
      q.da = p.da * (1 + gk);                       // Excel: D&A crece con las ventas
      q.margen = isN(sc.m0) ? sc.m0 + (sc.m - sc.m0) * k / 5 : sc.m;   // margen objetivo: rampa lineal desde el margen actual hasta el del año 5
      q.ebit = q.ventas * q.margen;
      q.ebitda = q.ebit + q.da;
      q.interes = EXP.dyn ? kd * debB - kc * cajB : p.interes * (1 + gk);
      const pretax = q.ebit - q.interes;
      q.impuestos = Math.max(0, pretax) * sc.t;
      q.min = p.min * (1 + gk);
      q.ni = pretax - q.impuestos - q.min + otros;
      q.capex = fadeCapex ? q.ventas * (cr0 + (1.15 * dar0 - cr0) * k / 5) : p.capex * (1 + gk);                 // Excel: capex crece con las ventas
      q.leases = p.leases * (1 + gk);
      q.fcf = q.ebitda - q.capex - q.interes - q.impuestos - q.min - q.leases;
      if (fc) { if (tt) { q.fcf = tt.fcfa2s * prod * Math.pow(1 + gk, fr); prod *= 1 + gk; } else { fcb = fcb * (1 + gk); q.fcf = fcb; } }   // FCFA2S: crece a g (ya es neto de minoritarios, intereses y arrendamientos)
      q.acc = opts.accPath ? opts.accPath[k - 1] : p.acc * (1 + sc.acc);
      if (EXP.dyn) { cajB += q.fcf - rep0 * Math.pow(1 + Math.max(0, gk), k); if (cajB < 0) { debB -= cajB; cajB = 0; } ndD = debB - cajB; }
      q.nd = ndPath ? ndPath[k - 1] : EXP.dyn ? ndD : nd0;            // Excel: deuda neta introducida a mano; por defecto constante
      const cash = (x, m) => (q.nd < 0 ? x * m - q.nd : x * m) / q.acc;   // caja neta se suma; deuda no se resta en PER/P·FCF
      const ev = (x, m) => (x * m - q.nd) / q.acc;
      q.po = fc ? { per: null, pfcf: cash(q.fcf, sc.pfcf), ev_ebitda: null, ev_ebit: null } : { per: cash(q.ni, perE), pfcf: cash(q.fcf, pfcfE), ev_ebitda: ev(q.ebitda, evdE), ev_ebit: ev(q.ebit, evtE) };
      q.anio = f.anio_base + k;
      rows.push(q); p = q;
    }
    const c = (po, n) => (po > 0 && precio > 0 ? Math.pow(po / precio, 1 / n) - 1 + y : null);   // valor ≤ 0 (pérdidas) o sin precio: no hay rentabilidad calculable, no «−100 %»
    const res = { rows, cagr: {}, po: {}, nd0, hor: {}, ttm: !!tt };
    [3, 5].forEach(n0 => {
      const n = n0, ne = tt ? n0 - (tt.ajuste == null ? 0.85 : tt.ajuste) : n0; res.hor[n0] = ne;
      const q = rows[n - 1];
      const sf = !fc && !!f.solo_fcf && q.po.pfcf > 0;               // método alternativo (contabilidad distorsionada): solo el flujo de caja, sin PER ni EV/EBITDA
      const pp = fc || sf ? q.po.pfcf : Math.max(q.po.per, q.po.pfcf);   // M14: el más alto entre PER y P/FCF (FCFA2S: solo P/FCFA2S)
      const ref = fc || sf ? pp : (pp + q.po.ev_ebitda) / 2;               // referencia: PER/P·FCF elegido + EV/EBITDA (EV/EBIT aporta poco); FCFA2S: solo el flujo
      const bajo = fc || sf ? pp : Math.min(pp, q.po.ev_ebitda);
      res.po[n] = { per: q.po.per, pfcf: q.po.pfcf, perpfcf: pp, ev_ebitda: q.po.ev_ebitda, ev_ebit: q.po.ev_ebit, ref, bajo,
        eligio: fc ? 'FCFA2S' : sf ? 'P/FCF (solo flujo)' : q.po.per >= q.po.pfcf ? 'PER' : 'P/FCF' };
      res.cagr[n] = { per: fc ? null : c(q.po.per, ne), pfcf: c(q.po.pfcf, ne), perpfcf: c(pp, ne), ev_ebitda: fc ? null : c(q.po.ev_ebitda, ne), ev_ebit: fc ? null : c(q.po.ev_ebit, ne), ref: c(ref, ne), bajo: c(bajo, ne) };
    });
    return res;
  }

  /* Matriz inversa †: precio máximo de compra para ganar r anual si en el horizonte se sale a cada múltiplo (crecimiento del escenario base). Devuelve {r:{m:precio}} en la divisa de la ficha. */
  function matrizEntrada(f, rs, mults) {
    const D = defaults(f).conservador, out = {};
    rs.forEach(r => { out[r] = {}; mults.forEach(m => { const sc = Object.assign({}, D, { pfcf: m }), res = proyectar(f, sc); out[r][m] = precioEntrada(f, res, r); }); });
    return out;
  }
  /* Señales de trampa de valor †: deterioro sostenido del negocio en los últimos años */
  function trampa(f) {
    const h = asegurar(f), n = h.ventas.length, out = [];
    const m = h.ventas.map((v, i) => (isN(h.ebit[i]) && v > 0 ? ebitR(h, i) / v : null));
    if (n >= 4 && [1, 2, 3].every(k => isN(m[n - k]) && isN(m[n - k - 1]) && m[n - k] < m[n - k - 1]) && m[n - 1] < 0.85 * m[n - 4]) out.push(`margen EBIT a la baja tres años seguidos (${(m[n - 4] * 100).toFixed(1)} % → ${(m[n - 1] * 100).toFixed(1)} %)`);
    if (n >= 3 && h.ventas[n - 1] < h.ventas[n - 2] && h.ventas[n - 2] < h.ventas[n - 3]) out.push('ventas a la baja dos años seguidos');
    const roic = j => { const ic = z(h.equity[j]) + z(h.deuda[j]) - z(h.caja[j]); return ic > 0 && isN(h.ebit[j]) ? ebitR(h, j) / ic : null; };
    if (n >= 4) { const r = [n - 4, n - 1].map(roic); if (isN(r[0]) && isN(r[1]) && r[0] > 0 && r[1] < 0.7 * r[0]) out.push(`rentabilidad sobre el capital empleado de ${(r[0] * 100).toFixed(0)} % a ${(r[1] * 100).toFixed(0)} % en tres años`); }
    return out;
  }
  /* Margen implícito †: margen EBIT (del año 5 si hay rampa) con el que la referencia a 5 años da exactamente la rentabilidad r */
  function margenImplicito(f, sc, r) {
    const val = m => proyectar(f, Object.assign({}, sc, { m })).cagr[5].ref - r;
    let lo = -0.5, hi = 0.95; if (val(hi) < 0) return null; if (val(lo) > 0) return lo;
    for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; (val(mid) < 0 ? lo = mid : hi = mid); }
    return (lo + hi) / 2;
  }
  /* Precio al que la referencia a 5 años da la rentabilidad exigida r */
  function precioEntrada(f, res, r) {
    const y = f.dividend_yield || 0, po = res.po[5].ref;
    return po > 0 ? po / Math.pow(1 + r - y, res.hor && res.hor[5] ? res.hor[5] : 5) : null;
  }

  /* ---- DCF inverso: qué crecimiento anual del FCF (10 años) descuenta el precio actual ---- */
  function dcfInverso(f, tasa, gTerm) {
    const h = asegurar(f), i = h.ventas.length - 1;
    const ni = z(ebitR(h, i)) - z(h.intereses[i]) - z(taxR(h, i)) - z(h.minoritarios[i]) + z(h.otros && h.otros[i]);
    const fcf0 = z(ebitR(h, i)) + z(h.da[i]) - z(h.capex[i]) - z(h.intereses[i]) - z(taxR(h, i)) - z(h.minoritarios[i]) - z(h.leases[i]);
    const base = esFC(f) && last(h.fcfa2s) > 0 ? (f.base_ttm && f.base_ttm.fcfa2s > 0 ? f.base_ttm.fcfa2s : last(h.fcfa2s)) : fcf0 > 0 ? fcf0 : ni;
    if (!(base > 0) || !(f.precio > 0)) return null;
    const cap = f.precio * last(h.acciones);
    const nd = z(last(h.deuda)) + z(last(h.leases_deuda)) - z(last(h.caja));
    const objetivo = cap; // el FCF ya es posterior a intereses: se compara con la capitalización
    const val = g => { let s = 0, c = base; for (let t = 1; t <= 10; t++) { c *= 1 + g; s += c / Math.pow(1 + tasa, t); }
      return s + (c * (1 + gTerm) / (tasa - gTerm)) / Math.pow(1 + tasa, 10); };
    let lo = -0.3, hi = 0.6;
    if (val(hi) < objetivo) return { g: null, base, texto: 'ni con +60 % anual', cap };
    if (val(lo) > objetivo) return { g: lo, base, cap };
    for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; (val(mid) < objetivo ? lo = mid : hi = mid); }
    return { g: (lo + hi) / 2, base, cap, tasa, gTerm };
  }

  /* ---- Múltiplos actuales (a precio de mercado, sobre el último ejercicio) ---- */
  function actuales(f) {
    const h = asegurar(f), i = h.ventas.length - 1, acc = last(h.acciones), cap = f.precio * acc;
    const nd = z(last(h.deuda)) + z(last(h.leases_deuda)) - z(last(h.caja));
    const eb = z(ebitR(h, i)), tx = z(taxR(h, i));   // recurrente (sin extraordinarios †)
    const ni = eb - z(h.intereses[i]) - tx - z(h.minoritarios[i]) + z(h.otros && h.otros[i]);
    const ebitda = eb + z(h.da[i]);
    const fcf = ebitda - z(h.capex[i]) - z(h.intereses[i]) - tx - z(h.minoritarios[i]) - z(h.leases[i]);
    if (esFC(f)) { const ff = f.base_ttm && f.base_ttm.fcfa2s > 0 ? f.base_ttm.fcfa2s : last(h.fcfa2s); return { cap, nd, ev: cap + nd, ni: null, fcf: ff, ebitda: null, ebit: null, extra: 0, per: null, pfcf: ff > 0 ? cap / ff : null, ev_ebitda: null, ev_ebit: null,
      ps: h.ventas[i] > 0 ? cap / h.ventas[i] : null, ev_ventas: h.ventas[i] > 0 ? (cap + nd) / h.ventas[i] : null, nd_ebitda: null, fcfa2s: true }; }
    return { cap, nd, ev: cap + nd, ni, fcf, ebitda, ebit: eb, extra: z(h.extra && h.extra[i]),
      per: ni > 0 ? cap / ni : null, pfcf: fcf > 0 ? cap / fcf : null,
      ev_ebitda: ebitda > 0 ? (cap + nd) / ebitda : null, ev_ebit: eb > 0 ? (cap + nd) / eb : null,
      ps: h.ventas[i] > 0 ? cap / h.ventas[i] : null, ev_ventas: h.ventas[i] > 0 ? (cap + nd) / h.ventas[i] : null,
      nd_ebitda: ebitda > 0 ? nd / ebitda : null };
  }

  /* ---- Múltiplos propios †: lo que el mercado ha pagado de verdad por la empresa (cierre de cada ejercicio) ----
     Para cada ejercicio j con precio de cierre P_j: capitalización = P_j × acciones_j; PER, P/FCF, EV/EBITDA y EV/EBIT sobre las cifras recurrentes de ESE año
     (mismas fórmulas que «actuales»). Solo cuenta lo que se puede calcular con datos reales (sin rellenar líneas vacías con ceros). Mediana de los últimos 10 años: robusta
     frente a un año de euforia o de crisis. Las acciones se contrastan con las más recientes por si la serie no está ajustada a un split (cierres de Yahoo sí lo están). */
  const MULT_MIN_AÑOS = 5, MULT_RANGO = { per: [4, 80], pfcf: [4, 90], ev_ebitda: [3, 60], ev_ebit: [3, 70] };
  function accAjustadas(h, splits, anios, mes) {
    const n = h.acciones.length, ult = last(h.acciones.filter(isN)); const out = h.acciones.slice();
    if (!splits || !splits.length || !(ult > 0)) return { acc: out, ajustes: [] };
    const aj = [];
    for (let j = 0; j < n; j++) { const a = h.acciones[j]; if (!isN(a) || !(a > 0)) continue;
      const fin = anios[j] + '-' + String(mes).padStart(2, '0') + '-28';
      const k = splits.filter(sp => sp.fecha > fin).reduce((p, sp) => p * (sp.num / sp.den), 1);
      if (k !== 1 && Math.abs(Math.log(a * k / ult)) < Math.abs(Math.log(a / ult))) { out[j] = a * k; aj.push(anios[j]); } }   // se ajusta solo si así casa mejor con las acciones actuales
    return { acc: out, ajustes: aj };
  }
  /* Si el proveedor no da splits (Stooq), se infieren de saltos enteros en las acciones de la ficha (≥ 1,9x casi entero o 3/2, o su inverso): la serie no está ajustada y los precios sí */
  function inferirSplits(acc, anios, mes) {
    const out = [], mm = String(mes).padStart(2, '0');
    for (let j = 1; j < acc.length; j++) { const a = acc[j - 1], b = acc[j]; if (!(a > 0) || !(b > 0)) continue; let r = b / a, inv = false; if (r < 1) { r = 1 / r; inv = true; }
      const cand = [1.5, 2, 3, 4, 5, 6, 7, 8, 10, 15, 20, 25, 30, 50].find(c => Math.abs(r / c - 1) < 0.05);
      if (r >= 1.45 && cand) out.push({ fecha: anios[j - 1] + '-' + mm + '-29', num: inv ? 1 : cand, den: inv ? cand : 1, inferido: true }); }
    return out;
  }
  function multiplosHistoricos(f, cierres, splits, opts) {
    const MINA = (opts && opts.min) || MULT_MIN_AÑOS;   // solo el backtest baja el mínimo de años; la app usa siempre 5
    if (!f || !cierres || !f.hist || isFin(f) || esMO(f) || esFC(f) || (f.tipo && f.tipo !== 'industrial')) return null;
    const h = asegurar(f), an = f.anios || [], mes = f.mes_cierre || 12, { acc, ajustes } = accAjustadas(h, splits && splits.length ? splits : inferirSplits(h.acciones, an, mes), an, mes), det = [], v = { per: [], pfcf: [], ev_ebitda: [], ev_ebit: [] };
    for (let j = Math.max(0, h.ventas.length - 10); j < h.ventas.length; j++) {
      const P = cierres[an[j] + '-' + String(mes).padStart(2, '0')], a = acc[j]; if (!(P > 0) || !(a > 0)) continue;
      const cap = P * a, ok = k => isN(h[k][j]), eb = ok('ebit') ? ebitR(h, j) : null, tx = ok('impuestos') ? taxR(h, j) : null;
      const nd = ok('deuda') && ok('caja') ? z(h.deuda[j]) + z(h.leases_deuda[j]) - h.caja[j] : null;
      const hh = f.hist, nrep = hh.ni_reportado && isN(hh.ni_reportado[j]) ? hh.ni_reportado[j] : null;   // beneficio reportado (lo que divide el mercado en el PER); si falta, se reconstruye desde el EBIT
      const ni = nrep != null ? nrep : eb != null && tx != null && ok('intereses') ? eb - h.intereses[j] - tx - z(h.minoritarios[j]) + z(h.otros && h.otros[j]) : null;
      const ebitda = eb != null && ok('da') ? eb + h.da[j] : null;
      const fco = hh.fco && isN(hh.fco[j]) ? hh.fco[j] : null;   // flujo de caja operativo reportado menos capex y arrendamientos; si no hay, se reconstruye
      const fcf = fco != null && ok('capex') ? fco - h.capex[j] - z(h.leases[j]) : ebitda != null && tx != null && ok('capex') && ok('intereses') ? ebitda - h.capex[j] - h.intereses[j] - tx - z(h.minoritarios[j]) - z(h.leases[j]) : null;
      const row = { anio: an[j], precio: P, per: ni > 0 ? cap / ni : null, pfcf: fcf > 0 ? cap / fcf : null, ev_ebitda: ebitda > 0 && nd != null ? (cap + nd) / ebitda : null, ev_ebit: eb > 0 && nd != null ? (cap + nd) / eb : null };
      det.push(row); Object.keys(v).forEach(k => { if (isN(row[k]) && row[k] >= MULT_RANGO[k][0] && row[k] <= MULT_RANGO[k][1]) v[k].push(row[k]); });
    }
    const res = {}, n = {}, descartado = {}; Object.keys(v).forEach(k => { n[k] = v[k].length; if (v[k].length >= MINA) res[k] = Math.round(median(v[k]) * 10) / 10; });
    const disp = k => { const x = v[k].slice().sort((p, q) => p - q), q1 = x[Math.floor((x.length - 1) * 0.25)], q3 = x[Math.ceil((x.length - 1) * 0.75)], m = median(x); return m > 0 ? (q3 - q1) / m : null; };
    const dispersion = {}; Object.keys(res).forEach(k => { dispersion[k] = disp(k); if (dispersion[k] > 0.8) { descartado[k] = dispersion[k]; delete res[k]; } });   // múltiplo demasiado inestable (rango intercuartílico > 80 % de la mediana): no es «el de siempre»
    const valido = isN(res.per) || isN(res.pfcf);   // sin PER ni P/FCF no hay base: se queda provisional
    return { mult: res, n, dispersion, descartado, detalle: det, ajustes, valido, anios: det.map(x => x.anio), mes };
  }

  /* ---- Control de realismo: avisos sobre los supuestos ---- */
  function realismoFC(f, sc, nombre, act) {
    const h = asegurar(f), fc = h.fcfa2s || [], out = [], add = (nivel, txt) => out.push({ nivel, txt }), g = cagr(fc, 5);
    if (nombre === 'conservador') add('y', 'Método FCFA2S †: solo cuenta el flujo libre para el accionista tras intereses, arrendamientos, minoritarios y la revalorización de pasivos IRGA/TSS. PER, EV/EBIT y EV/EBITDA no entran (el beneficio IFRS está distorsionado por la amortización de intangibles de compras y por el pasivo IRGA/TSS).');
    if (g != null && sc.g > g + 0.005) add('r', `Crecimiento del FCFA2S ${(sc.g * 100).toFixed(1)} % por encima del de la serie (${(g * 100).toFixed(1)} %).`);
    if (act && isN(act.pfcf) && sc.pfcf < act.pfcf * 0.85) add('y', `Múltiplo de salida ${sc.pfcf.toFixed(1)}x frente a ${act.pfcf.toFixed(1)}x hoy: la rentabilidad ya descuenta que el múltiplo baje.`);
    if (act && isN(act.pfcf) && sc.pfcf > act.pfcf * 1.2) add('y', `P/FCFA2S objetivo ${sc.pfcf.toFixed(1)}x frente a ${act.pfcf.toFixed(1)}x hoy: la rentabilidad depende de que el múltiplo suba.`);
    if (nombre === 'conservador' && sc.fade !== false && sc.g > G_LARGO) add('y', `Crecimiento que se desvanece †: ${(sc.g * 100).toFixed(1)} % el año 1 y ${(gAnio(sc, 5) * 100).toFixed(1)} % el año 5.`);
    if (sc.acc < -0.04) add('y', `Recompra de acciones del ${(-sc.acc * 100).toFixed(1)} % anual: muy agresiva.`);
    return out;
  }
  function realismo(f, sc, nombre, act) {
    if (esFC(f)) return realismoFC(f, sc, nombre, act);
    const h = asegurar(f), out = [], mh = f.mult_hist || {};
    const margen = h.ventas.map((v, i) => (isN(h.ebit[i]) && v > 0 ? ebitR(h, i) / v : null)).filter(isN);
    const g5 = cagr(h.ventas, 5), mMax = Math.max.apply(null, margen), mMed = avg(margen);
    const add = (nivel, txt) => out.push({ nivel, txt });
    const mo = esMO(f), y = f.dividend_yield || 0;
    if (mo && nombre === 'conservador') {
      add('y', `Método de margen objetivo †: la empresa no tiene beneficio estable y se valora con un margen EBIT supuesto para el año 5 (${(sc.m * 100).toFixed(1)} %, frente a ${margen.length ? (last(margen) * 100).toFixed(1) : '—'} % hoy y un máximo histórico de ${margen.length ? (mMax * 100).toFixed(1) : '—'} %) y múltiplos de empresas maduras comparables. Es una hipótesis, no un histórico: mira sobre todo el margen implícito.`);
      if (!f.mult_comp) add('r', 'Faltan los múltiplos de comparables (mult_comp): el motor usa genéricos.');
    }
    if (f.ciclica && !mo && nombre === 'conservador') add('y', `Empresa cíclica †: el crecimiento por defecto es el de toda la serie (${f.anios[0]}-${last(f.anios)}) y el margen, la media del ciclo (${(avg(margen) * 100).toFixed(1)} %), no el de los últimos años${margen.length ? ` (último ${(last(margen) * 100).toFixed(1)} %)` : ''}.`);
    if (nombre === 'conservador' && h.extra && h.extra.some(v => isN(v) && v !== 0)) add('y', `Extraordinarios †: se han quitado del EBIT ${h.extra.map((v, j) => (isN(v) && v ? `${f.anios[j]} ${v > 0 ? '+' : ''}${Math.round(v)}` : null)).filter(Boolean).join(', ')} M. Márgenes, múltiplos de hoy y beneficio de partida son recurrentes.`);
    if (sc.per > 0) { const gg = sc.g + y; if (gg <= 0.03 ? sc.per > 18 : sc.per / (gg * 100) > 2.5) add('y', `Múltiplo de salida exigente para el crecimiento †: PER ${sc.per.toFixed(1)}x con ventas creciendo ${(sc.g * 100).toFixed(1)} % (+${(y * 100).toFixed(1)} % de dividendo). Si el crecimiento se frena, el mercado suele pagar menos; con PER ${Math.max(10, Math.min(sc.per, 2.5 * gg * 100)).toFixed(0)}x la rentabilidad sería menor.`); }
    if (nombre === 'conservador' && !mo && CFG.crisis) { const cr = crisisYears(h), ys = f.anios.filter((_, j) => cr[j] && j >= h.ventas.length - 3);
      if (ys.length) add('y', `Año(s) de crisis † en la base (${ys.join(', ')}): el margen por defecto usa los años normales${isN(sc.v0) ? ` y las ventas vuelven en 2 años a su nivel de antes de la crisis (${Math.round(sc.v0)} M) y crecen desde ahí` : ''}. Comprobado en el backtest: sin esto el modelo infravalora las empresas que salen de una crisis.`); }
    if (nombre === 'conservador' && !mo) {
      const ih = inicioHundido(h);
      if (ih >= 0 && f.crec_desde_previo !== false) add('y', `El CAGR de ventas a 5 años arrancaba en ${f.anios[ih + 1]}, un año hundido (caída de más del 10 % sobre ${f.anios[ih]}): el crecimiento por defecto se calcula desde ${f.anios[ih]}.`);
      else if (ih >= 0) add('y', `El CAGR de ventas a 5 años (${(g5 * 100).toFixed(1)} %) arranca en ${f.anios[ih + 1]}, un año hundido (ventas más de un 10 % por debajo de ${f.anios[ih]}): puede inflar el crecimiento por defecto. Desde ${f.anios[ih]} sería ${(cagr(h.ventas.slice(ih), h.ventas.length) * 100).toFixed(1)} %.`);
      else if (g5 != null && g5 > 0.15) add('y', `Las ventas crecieron ${(g5 * 100).toFixed(0)} % anual de media en 5 años: puede ser un rebote (p. ej. tras el COVID) y no un ritmo sostenible. Revisa el crecimiento antes de fiarte.`);
    }
    if (g5 != null && sc.g > g5 + 0.005) add('r', `Crecimiento de ventas ${(sc.g * 100).toFixed(1)} % por encima del que tuvo en 5 años (${(g5 * 100).toFixed(1)} %).`);
    if (mo) { /* margen supuesto: avisado arriba */ }
    else if (sc.m > mMax + 0.002) add('r', `Margen EBIT ${(sc.m * 100).toFixed(1)} % supera su máximo histórico (${(mMax * 100).toFixed(1)} %).`);
    else if (margen.length && sc.m > last(margen) + 0.005) add('y', `Margen EBIT ${(sc.m * 100).toFixed(1)} % por encima del último ejercicio (${(last(margen) * 100).toFixed(1)} %).`);
    [['per', 'PER'], ['pfcf', 'P/FCF'], ['ev_ebitda', 'EV/EBITDA'], ['ev_ebit', 'EV/EBIT']].forEach(([k, n]) => {
      if (mh[k] && sc[k] > mh[k] * 1.02) add('r', `Múltiplo ${n} ${sc[k].toFixed(1)}x por encima de su media histórica (${mh[k].toFixed(1)}x). El curso pide usar el histórico.`);
      if (act && isN(act[k]) && sc[k] > act[k] * 1.2 && !(mh[k] && sc[k] <= mh[k])) add('y', `${n} objetivo ${sc[k].toFixed(1)}x frente a ${act[k].toFixed(1)}x hoy: la rentabilidad depende de que el múltiplo suba.`);
    });
    if (nombre === 'conservador' && sc.fade !== false && sc.g > G_LARGO) add('y', `Crecimiento que se desvanece †: ${(sc.g * 100).toFixed(1)} % el año 1 y ${(gAnio(sc, 5) * 100).toFixed(1)} % el año 5 (media ${(((Math.pow([1, 2, 3, 4, 5].reduce((p, k) => p * (1 + gAnio(sc, k)), 1), 0.2)) - 1) * 100).toFixed(1)} %).`);
    /* Avisos añadidos tras la auditoría del 18-nov-2026 (solo informativos) */
    [['per', 'PER'], ['pfcf', 'P/FCF'], ['ev_ebitda', 'EV/EBITDA'], ['ev_ebit', 'EV/EBIT']].forEach(([k, n]) => { if (mh[k] && sc[k] > 0 && sc[k] < mh[k] * 0.5) add('r', `Múltiplo ${n} ${sc[k].toFixed(1)}x muy por debajo de su media histórica (${mh[k].toFixed(1)}x): ¿escenario guardado antiguo o error de unidad?`); });
    if (nombre === 'conservador' && !mo) { try {
      const q = proyectar(f, sc).rows[4], pp = Math.max(q.po.per, q.po.pfcf);
      if (pp > 0 && q.po.ev_ebitda > 0 && Math.abs(q.po.ev_ebitda / pp - 1) > 0.35) add('y', `El valor del año 5 por EV/EBITDA (${q.po.ev_ebitda.toFixed(0)}) difiere un ${Math.round(Math.abs(q.po.ev_ebitda / pp - 1) * 100)} % del de PER/P·FCF (${pp.toFixed(0)}): los múltiplos de salida no son coherentes entre sí (la referencia promedia ambos).`);
      else if (pp > 0 && q.po.ev_ebitda <= 0) add('y', 'El valor del año 5 por EV/EBITDA sale negativo: la deuda neta supera al valor de la empresa con esos múltiplos.');
    } catch (e) { /* sin proyección */ } }
    if (nombre === 'conservador' && !mo && g5 != null && g5 > 0.04 && sc.g < g5 * 0.5) add('y', `Crecimiento de ventas ${(sc.g * 100).toFixed(1)} % muy por debajo del de los últimos 5 años (${(g5 * 100).toFixed(1)} %): comprueba que el año de partida y la cartera de pedidos lo justifican.`);
    if (EXP.capex && !f.flota && !mo && nombre === 'conservador') { const n0 = h.ventas.length - 1; if (h.ventas[n0] > 0 && z(last(h.da)) > 0 && z(last(h.capex)) / h.ventas[n0] > EXP.capex.ratio * z(last(h.da)) / h.ventas[n0]) add('y', 'CapEx normalizado †: el último año invierte más de 1,5 veces su amortización; se proyecta que la inversión sobre ventas converja a 1,15 veces la amortización en el año 5 (backtest 13-11-2026: 13 empresas mejoran, 4 empeoran). No aplica a flotas (ficha.flota).'); }
    if (sc.t < 0.12 || sc.t > 0.32) add('y', `Tipo impositivo ${(sc.t * 100).toFixed(0)} % fuera de lo normal (12–32 %).`);
    if (sc.acc < -0.04) add('y', `Recompra de acciones del ${(-sc.acc * 100).toFixed(1)} % anual: muy agresiva.`);
    return out;
  }

  /* ---- Control de fiabilidad de los datos ---- */
  const CRIT = ['ventas', 'ebit', 'da', 'impuestos', 'acciones', 'capex', 'caja', 'deuda'];
  const OPC = ['intereses', 'minoritarios'];
  function fiabilidadFC(f, hoy) {
    const h = asegurar(f), conf = f.conf || {}, av = [], add = (nivel, campo, txt) => av.push({ nivel, campo, txt }), K = ['fcfa2s', 'acciones', 'ventas'];
    K.forEach(k => { if (!isN(last(h[k]))) add('r', k, `Falta el dato de ${k} del último ejercicio.`); });
    if (f.fecha_precio && hoy) { const dd = Math.floor((Date.parse(hoy) - Date.parse(f.fecha_precio)) / 864e5); if (dd > 2) add('y', 'precio', `Precio de hace ${dd} días: actualízalo, el CAGR depende de él.`); }
    const peso = { A: 1, P: 0.7, E: 0.4 }; let tot = 0, nE = 0, nP = 0, nA = 0;
    K.forEach(k => { const c = conf[k] || 'E'; tot += peso[c] || 0.4; if (c === 'E') nE++; else if (c === 'P') nP++; else nA++; });
    return { avisos: av, puntuacion: Math.round((tot / K.length) * 100), nivel: nE === 0 && nP === 0 ? 'profunda' : nE === 0 ? 'rapida' : 'rapida-estimada', nA, nP, nE, graves: av.filter(a => a.nivel === 'r').length };
  }
  function fiabilidad(f, hoy) {
    if (esFC(f)) return fiabilidadFC(f, hoy);
    const n = f.hist.ventas.length, h = Object.assign({}, f.hist), av = [], conf = f.conf || {};
    ['leases', 'leases_deuda', 'goodwill', 'equity', 'minoritarios', 'otros', 'impuestos', 'intereses', 'da', 'capex', 'caja', 'deuda', 'acciones'].forEach(k => { if (!Array.isArray(h[k])) h[k] = Array(n).fill(null); });   // ficha borrador sin alguna línea: avisa, no revienta
    const add = (nivel, campo, txt) => av.push({ nivel, campo, txt });
    const i = n - 1;
    CRIT.forEach(k => { if (!isN(last(h[k]))) add('r', k, `Falta el dato de ${k} del último ejercicio.`); });
    // signo de los intereses (M14: positivo = coste; negativo solo con caja neta)
    const nd = z(last(h.deuda)) + z(last(h.leases_deuda)) - z(last(h.caja));
    if (isN(last(h.intereses)) && last(h.intereses) < 0 && nd > 0) add('y', 'intereses', `Intereses negativos con deuda neta positiva (${Math.round(nd)} M): correcto si la empresa ingresa más por su tesorería e inversiones (que no cuentan como caja) de lo que paga por su deuda; si no, signo cambiado. Según M14, el coste financiero va en positivo y solo se introduce en negativo con caja neta. Con el signo mal, el beneficio y el FCF salen inflados.`);
    // beneficio neto calculado: continuidad
    const ni = h.ventas.map((v, j) => z(h.ebit[j]) - z(h.intereses[j]) - z(h.impuestos[j]) - z(h.minoritarios[j]) + z(h.otros && h.otros[j]));
    if (h.ni_reportado) ni.forEach((v, j) => { const r = h.ni_reportado[j]; if (j >= n - 4 && isN(r) && r > 0 && Math.abs(v / r - 1) > 0.04) add('y', 'ni', `Beneficio neto calculado ${Math.round(v)} M frente a ${Math.round(r)} M reportado en ${f.anios[j]} (${((v / r - 1) * 100).toFixed(0)} %): faltan líneas (participadas, pensiones) o alguna cifra está mal.`); });
    ni.forEach((v, j) => { if (j >= n - 4 && v < 0 && h.ebit[j] > 0) add('r', 'minoritarios', `Beneficio neto calculado negativo en ${f.anios[j]} (${Math.round(v)} M) con EBIT positivo (${Math.round(h.ebit[j])} M): revisa minoritarios, impuestos o intereses.`); });
    const j = n - 1;
    if (z(h.minoritarios[j]) > 0.15 * Math.max(1, z(h.ebit[j]) - z(h.intereses[j]) - z(h.impuestos[j]))) add('y', 'minoritarios', `Minoritarios = ${(100 * z(h.minoritarios[j]) / Math.max(1, z(h.ebit[j]) - z(h.intereses[j]) - z(h.impuestos[j]))).toFixed(0)} % del beneficio consolidado en ${f.anios[j]}: comprueba que es la línea de minoritarios y no otra.`);
    // tasa impositiva
    h.ventas.forEach((v, jj) => { if (jj < n - 3) return; const pt = z(h.ebit[jj]) - z(h.intereses[jj]); if (pt > 0 && isN(h.impuestos[jj])) { const t = h.impuestos[jj] / pt; if (t < 0.05 || t > 0.45) add('y', 'impuestos', `Tipo efectivo ${(t * 100).toFixed(0)} % en ${f.anios[jj]}: atípico.`); } });
    // saltos
    ['ventas', 'ebit', 'acciones'].forEach(k => { for (let jj = Math.max(1, n - 4); jj < n; jj++) { const a = h[k][jj - 1], b = h[k][jj]; if (a > 0 && isN(b)) { const d = b / a - 1; const lim = k === 'acciones' ? 0.12 : k === 'ebit' ? 0.6 : 0.35; if (Math.abs(d) > lim) add('y', k, `${k} cambia ${(d * 100).toFixed(0)} % en ${f.anios[jj]}: confirma que no es un error de transcripción (o una operación corporativa).`); } } });
    // caja y arrendamientos
    if (!isN(h.leases[i]) && !isN(h.leases_deuda[i]) && !f.leases_ok) add('i', 'leases', 'Sin datos de arrendamientos (IFRS 16): si la empresa tiene muchos, el EBITDA y la deuda neta no son comparables.');
    if (z(h.goodwill[i]) > z(h.equity[i])) add('y', 'goodwill', 'El goodwill supera el patrimonio: el ROCE sin goodwill será negativo (no es malo en sí).');
    // frescura
    if (f.fecha_datos && hoy) { const dd = Math.floor((Date.parse(hoy) - Date.parse(f.fecha_datos)) / 864e5); if (dd > 90) add('y', 'fecha', `Datos de hace ${dd} días (más de 90): actualiza antes de decidir.`); }
    if (f.fecha_precio && hoy) { const dd = Math.floor((Date.parse(hoy) - Date.parse(f.fecha_precio)) / 864e5); if (dd > 2) add('y', 'precio', `Precio de hace ${dd} días: actualízalo, el CAGR depende de él.`); }
    // nivel y puntuación
    const peso = { A: 1, P: 0.7, E: 0.4 };
    let tot = 0, cnt = 0, nE = 0, nP = 0, nA = 0;
    CRIT.forEach(k => { const c = conf[k] || 'E'; tot += peso[c] || 0.4; cnt++; if (c === 'E') nE++; else if (c === 'P') nP++; else nA++; });
    const nivel = nE === 0 && nP === 0 ? 'profunda' : nE === 0 ? 'rapida' : 'rapida-estimada';
    const graves = av.filter(a => a.nivel === 'r').length;
    return { avisos: av, puntuacion: Math.round((tot / cnt) * 100), nivel, nA, nP, nE, graves };
  }


  /* ================= MÉTODO FINANCIERO †: bancos, arrendadores y aseguradoras =================
     Una financiera es un negocio de spread con mucho apalancamiento: no hay EBITDA ni FCF útiles. Se valora por lo que gana
     sobre su capital (ROTE) y por lo que vale ese capital (valor en libros tangible, TBV). Dos vías, como en el método M14:
     PER y P/TBV; la referencia es la media. El P/TBV no puede superar el que justifica su ROTE: (ROTE − g) / (Ke − g). */
  const Fin = (function () {
    const KE = 0.10, GT = 0.03;
    const CRITF = ['ni', 'equity', 'goodwill', 'dividendos', 'recompras', 'acciones'];
    const lastN = a => { const x = a.filter(isN); return x.length ? x[x.length - 1] : null; };
    const tbvAt = (h, j) => (isN(h.equity[j]) && isN(h.goodwill[j]) ? h.equity[j] - h.goodwill[j] - z(h.intangibles && h.intangibles[j]) - z(h.preferentes && h.preferentes[j]) : null);
    function series(f) {
      const h = f.hist;
      const tbv = h.ni.map((_, j) => tbvAt(h, j));
      const niR = h.ni.map((v, j) => (isN(v) ? v - z(h.extra && h.extra[j]) : v));   // extraordinarios † (después de impuestos)
      const rote = niR.map((v, j) => { if (j === 0 || !isN(v) || !isN(tbv[j]) || !isN(tbv[j - 1])) return null; const b = (tbv[j] + tbv[j - 1]) / 2; return b > 0 ? v / b : null; });
      const payout = h.ni.map((v, j) => (isN(v) && v > 0 && (isN(h.dividendos[j]) || isN(h.recompras[j])) ? (z(h.dividendos[j]) + z(h.recompras[j])) / v : null));
      return { tbv, rote, payout, niR };
    }
    const accCap = h => (isN(last(h.acciones_cierre)) ? last(h.acciones_cierre) : last(h.acciones));   // acciones al cierre si se aportan (OPV, emisiones); si no, la media diluida
    const justo = (r, ke, gt) => Math.max(0.3, (r - gt) / (ke - gt));   // suelo de 0,3x para no dar valores absurdos con ROTE bajo
    function defaults(f) {
      const h = f.hist, s = series(f), mh = f.mult_hist || {};
      const rv = s.rote.filter(isN), r3 = avg(rv.slice(-3)), rU = last(rv);
      const rMed = median(rv), rOk = CFG.crisis ? rv.filter(r => !(rMed > 0 && r < 0.5 * rMed)) : rv;
      const r3n = avg(rOk.slice(-3)), rUn = last(rOk);
      const rBase = f.ciclica ? (avg(rv) == null ? 0.10 : avg(rv)) : CFG.crisis && rOk.length ? Math.min(r3n, rUn) : f.ciclica ? (avg(rv) == null ? 0.10 : avg(rv)) : r3 == null ? 0.10 : Math.min(r3, rU);   // cíclica †: ROTE medio de toda la serie
      // reparto = dividendos + recompras sobre beneficio (media de 3 años); puede superar el 100 % (el patrimonio baja), con tope del 120 %
      const ratio = k => avg(h.ni.map((v, j) => (isN(v) && v > 0 && isN(h[k][j]) ? h[k][j] / v : null)).filter(isN).slice(-3));
      let pd = ratio('dividendos'), pr = ratio('recompras'); pd = pd == null ? 0 : Math.max(0, pd); pr = pr == null ? 0 : Math.max(0, pr);
      if (pd + pr > 1.2) { const k = 1.2 / (pd + pr); pd *= k; pr *= k; }
      const mk = (kr, kM) => ({ rote: rBase * kr, pdiv: pd, prec: pr, per: (mh.per || 12) * kM, ptbv: (mh.ptbv || 1.2) * kM, ke: KE, gt: GT });
      return CFG.ancho ? { conservador: mk(1, 1), pesimista: mk(0.75, 0.7), optimista: mk(1.15, 1.25) } : { conservador: mk(1, 1), pesimista: mk(0.85, 0.8), optimista: mk(1.05, 1.1) };
    }
    function proyectar(f, sc) {
      const h = f.hist, s = series(f), precio = f.precio, y = f.dividend_yield || 0;
      let tbv = lastN(s.tbv), acc = accCap(h);
      const mHoy = precio > 0 && tbv > 0 ? precio / (tbv / acc) : 0;   // P/TBV de mercado hoy
      const rows = [];
      for (let k = 1; k <= 5; k++) {
        const r = sc.rote, p = sc.pdiv + sc.prec;
        const ni = r * tbv / (1 - r * (1 - p) / 2);          // ROTE sobre el TBV medio del año
        const tbvN = tbv + ni * (1 - p);                     // el patrimonio crece con lo retenido y baja con lo repartido
        const just = justo(r, sc.ke, sc.gt), mEf = Math.min(sc.ptbv, just);
        const pbuy = Math.max(mEf, mHoy) * tbv / acc;        // las recompras se hacen al mayor entre el P/TBV de salida y el de mercado de hoy, sobre el TBV por acción de inicio de año (prudente)
        const accN = pbuy > 0 ? Math.max(acc * 0.5, acc - sc.prec * ni / pbuy) : acc;
        rows.push({ anio: f.anio_base + k, ni, tbv: tbvN, reparto: ni * p, acc: accN, rote: r, ptbv_just: just, ptbv_ef: mEf,
          po: { per: ni * sc.per / accN, ptbv: tbvN * mEf / accN } });
        tbv = tbvN; acc = accN;
      }
      const c = (po, n) => (po > 0 && precio > 0 ? Math.pow(po / precio, 1 / n) - 1 + y : null);   // valor ≤ 0 (pérdidas) o sin precio: no hay rentabilidad calculable, no «−100 %»
      const res = { rows, cagr: {}, po: {} };
      [3, 5].forEach(n => {
        const q = rows[n - 1], ref = (q.po.per + q.po.ptbv) / 2, bajo = Math.min(q.po.per, q.po.ptbv);
        res.po[n] = { per: q.po.per, ptbv: q.po.ptbv, ref, bajo };
        res.cagr[n] = { per: c(q.po.per, n), ptbv: c(q.po.ptbv, n), ref: c(ref, n), bajo: c(bajo, n) };
      });
      return res;
    }
    function actuales(f) {
      const h = f.hist, s = series(f), acc = accCap(h), cap = f.precio * acc, ni = last(s.niR), tbv = lastN(s.tbv);
      const rote = lastN(s.rote), pay = lastN(s.payout), ptbv = tbv > 0 ? cap / tbv : null;
      return { cap, ni, tbv, tbv_acc: tbv / acc, per: ni > 0 ? cap / ni : null, ptbv, rote, payout: pay,
        roe: isN(last(h.equity)) && last(h.equity) > 0 ? ni / last(h.equity) : null,
        ptbv_just: rote != null ? justo(rote, KE, GT) : null,
        rote_impl: ptbv != null ? ptbv * (KE - GT) + GT : null,
        deuda_equity: isN(last(h.deuda)) && last(h.equity) > 0 ? last(h.deuda) / last(h.equity) : null };
    }
    function realismo(f, sc, nombre, act) {
      const h = f.hist, s = series(f), rv = s.rote.filter(isN), mh = f.mult_hist || {}, out = [];
      const add = (nivel, txt) => out.push({ nivel, txt });
      if (nombre === 'conservador' && f.ciclica) add('y', `Cíclica †: el ROTE por defecto es la media de toda la serie (${(avg(rv) * 100).toFixed(1)} %), no el de los últimos años.`);
      if (nombre === 'conservador' && h.extra && h.extra.some(v => isN(v) && v !== 0)) add('y', `Extraordinarios †: se han quitado del beneficio ${h.extra.map((v, j) => (isN(v) && v ? `${f.anios[j]} ${v > 0 ? '+' : ''}${Math.round(v)}` : null)).filter(Boolean).join(', ')} M (después de impuestos). El ROTE y el PER de hoy son recurrentes.`);
      if (rv.length) { const mx = Math.max.apply(null, rv);
        if (sc.rote > mx + 0.002) add('r', `ROTE ${(sc.rote * 100).toFixed(1)} % supera su máximo histórico (${(mx * 100).toFixed(1)} %).`);
        else if (sc.rote > last(rv) + 0.005) add('y', `ROTE ${(sc.rote * 100).toFixed(1)} % por encima del último ejercicio (${(last(rv) * 100).toFixed(1)} %).`); }
      if (sc.rote > 0.25) add('y', `ROTE ${(sc.rote * 100).toFixed(1)} %: muy alto para una financiera, comprueba que el patrimonio tangible no está inflado a la baja por recompras.`);
      [['per', 'PER'], ['ptbv', 'P/TBV']].forEach(([k, n]) => {
        if (mh[k] && sc[k] > mh[k] * 1.02) add('r', `Múltiplo ${n} ${sc[k].toFixed(1)}x por encima de su media histórica (${mh[k].toFixed(1)}x). El curso pide usar el histórico.`);
        if (act && isN(act[k]) && sc[k] > act[k] * 1.2 && !(mh[k] && sc[k] <= mh[k])) add('y', `${n} objetivo ${sc[k].toFixed(1)}x frente a ${act[k].toFixed(1)}x hoy: la rentabilidad depende de que el múltiplo suba.`);
      });
      const j = justo(sc.rote, sc.ke, sc.gt);
      if (sc.ptbv > j + 0.01) add('y', `Tope por ROE †: el P/TBV de partida (${sc.ptbv.toFixed(1)}x) es mayor que el que justifica su ROTE (${j.toFixed(1)}x con coste del capital ${(sc.ke * 100).toFixed(0)} % y crecimiento ${(sc.gt * 100).toFixed(0)} %). La proyección usa ${j.toFixed(1)}x.`);
      if (!mh.per || !mh.ptbv) add('r', 'Faltan múltiplos históricos (PER o P/TBV): el motor usa genéricos (PER 12, P/TBV 1,2x) que no son de esta empresa.');
      if (sc.pdiv + sc.prec > 1) add('y', `Reparto del ${((sc.pdiv + sc.prec) * 100).toFixed(0)} % del beneficio (dividendos ${(sc.pdiv * 100).toFixed(0)} % + recompras ${(sc.prec * 100).toFixed(0)} %): el patrimonio tangible baja cada año. Sostenible solo mientras haya exceso de capital.`);
      return out;
    }
    function fiabilidad(f, hoy) {
      const h = f.hist, n = h.ni.length, av = [], conf = f.conf || {}, s = series(f);
      const add = (nivel, campo, txt) => av.push({ nivel, campo, txt });
      CRITF.forEach(k => { if (!isN(last(h[k]))) add('r', k, `Falta el dato de ${k} del último ejercicio.`); });
      // el patrimonio debe cuadrar con beneficio − reparto (salvo valoración de bonos/OCI, adquisiciones, preferentes)
      for (let j = Math.max(1, n - 3); j < n; j++) {
        const a = h.equity[j - 1], b = h.equity[j];
        if (isN(a) && isN(b) && isN(h.ni[j]) && a > 0) { const res = b - a - h.ni[j] + z(h.dividendos[j]) + z(h.recompras[j]) - z(h.emisiones && h.emisiones[j]);
          if (Math.abs(res) > 0.15 * a) add('y', 'equity', `El patrimonio de ${f.anios[j]} no cuadra con beneficio menos reparto: diferencia de ${Math.round(res)} M (${(res / a * 100).toFixed(0)} % del patrimonio previo). Suele ser la valoración de bonos (OCI), emisiones, adquisiciones o preferentes: revisa que el TBV no esté mal.`); } }
      ['ni', 'acciones'].forEach(k => { for (let jj = Math.max(1, n - 4); jj < n; jj++) { const a = h[k][jj - 1], b = h[k][jj]; if (a > 0 && isN(b)) { const d = b / a - 1, lim = k === 'acciones' ? 0.12 : 0.6; if (Math.abs(d) > lim) add('y', k, `${k} cambia ${(d * 100).toFixed(0)} % en ${f.anios[jj]}: confirma que no es un error de transcripción (o una operación corporativa).`); } } });
      if (isN(last(h.ni)) && last(h.ni) < 0) add('r', 'ni', 'Beneficio neto negativo en el último ejercicio: el método de ROTE no encaja.');
      if (isN(last(h.goodwill)) && isN(last(h.equity)) && last(h.goodwill) + z(h.intangibles && last(h.intangibles)) > 0.25 * last(h.equity)) add('y', 'goodwill', 'Goodwill e intangibles superan el 25 % del patrimonio: el TBV es bastante menor que el valor en libros.');
      // solvencia: solo avisos, no cambia el cálculo
      const sv = f.solvencia || {};
      if (f.tipo === 'banco' && !isN(sv.cet1)) add('i', 'solvencia', 'Sin datos de solvencia (capital CET1, préstamos/depósitos, morosidad): añádelos desde el informe anual; no cambian el precio objetivo pero sí la prudencia.');
      if (isN(sv.cet1)) { if (sv.cet1 < 8) add('r', 'solvencia', `CET1 ${sv.cet1} %: por debajo del 8 %, solvencia débil.`); else if (sv.cet1 < 10) add('y', 'solvencia', `CET1 ${sv.cet1} %: por debajo del 10 %, poco colchón de capital.`); }
      if (isN(sv.prestamos_depositos) && sv.prestamos_depositos > 100) add('y', 'solvencia', `Préstamos/depósitos ${sv.prestamos_depositos} %: más de 100 % indica dependencia de financiación mayorista.`);
      if (isN(sv.morosidad) && sv.morosidad > 3) add('y', 'solvencia', `Morosidad ${sv.morosidad} %: alta.`);
      if (f.tipo === 'arrendador' && isN(last(h.deuda)) && last(h.equity) > 0 && last(h.deuda) / last(h.equity) > 3) add('y', 'solvencia', `Deuda/patrimonio ${(last(h.deuda) / last(h.equity)).toFixed(1)}x: por encima de 3x (el curso cita ~2,5x en AerCap).`);
      if (f.tipo === 'seguro' && !isN(sv.combined_ratio)) add('i', 'solvencia', 'Sin combined ratio: en una aseguradora, por encima de 100 % significa pérdidas técnicas.');
      if (isN(sv.combined_ratio) && sv.combined_ratio > 100) add('y', 'solvencia', `Combined ratio ${sv.combined_ratio} %: pérdidas técnicas.`);
      if (f.fecha_datos && hoy) { const dd = Math.floor((Date.parse(hoy) - Date.parse(f.fecha_datos)) / 864e5); if (dd > 90) add('y', 'fecha', `Datos de hace ${dd} días (más de 90): actualiza antes de decidir.`); }
      if (f.fecha_precio && hoy) { const dd = Math.floor((Date.parse(hoy) - Date.parse(f.fecha_precio)) / 864e5); if (dd > 2) add('y', 'precio', `Precio de hace ${dd} días: actualízalo, el CAGR depende de él.`); }
      const peso = { A: 1, P: 0.7, E: 0.4 };
      let tot = 0, cnt = 0, nE = 0, nP = 0, nA = 0;
      CRITF.forEach(k => { const c = conf[k] || 'E'; tot += peso[c] || 0.4; cnt++; if (c === 'E') nE++; else if (c === 'P') nP++; else nA++; });
      const nivel = nE === 0 && nP === 0 ? 'profunda' : nE === 0 ? 'rapida' : 'rapida-estimada';
      return { avisos: av, puntuacion: Math.round((tot / cnt) * 100), nivel, nA, nP, nE, graves: av.filter(a => a.nivel === 'r').length };
    }
    return { defaults, proyectar, actuales, realismo, fiabilidad, series, dcfInverso: () => null, margenImplicito: () => null, KE, GT, CRITF };
  })();

  /* ---- Despacho: cada ficha usa su método según f.tipo (sin tipo = industrial, método M14) ---- */
  const isFin = f => !!f && (f.tipo === 'banco' || f.tipo === 'arrendador' || f.tipo === 'seguro');
  const M14 = { defaults, proyectar, dcfInverso, actuales, realismo, fiabilidad, margenImplicito, trampa, valorMultiplo };
  const pick = nombre => function (f) { return (isFin(f) ? Fin : M14)[nombre].apply(null, arguments); };

  return { CFG, EXP, crisisYears, gAnio, valorMultiplo: (f, aj) => (isFin(f) || esMO(f) || esFC(f) ? null : valorMultiplo(f, aj)), defaults: pick('defaults'), proyectar: pick('proyectar'), precioEntrada, dcfInverso: pick('dcfInverso'), actuales: pick('actuales'), realismo: pick('realismo'), margenImplicito: pick('margenImplicito'), trampa: f => (isFin(f) ? [] : trampa(f)), esMO, esFC, matrizEntrada, multiplosHistoricos, accAjustadas, inferirSplits, fiabilidad: pick('fiabilidad'), cagr, avg, isN, isFin, Fin,
    soportado: f => !(f && f.tipo === 'reit') };
})();
if (typeof module !== 'undefined') module.exports = Val;
