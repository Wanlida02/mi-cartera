/* Lógica de la app (sin DOM, probada en Node). Reglas de cartera heredadas de «Mi Cartera»:
   compra con precio medio ponderado, venta parcial/total, deshacer con instantánea «antes».
   La valoración usa el motor Val (M14) sin cambios. */
const Logic = (function () {
  const V = typeof Val !== 'undefined' ? Val : require('./val.js');
  const isN = v => typeof v === 'number' && isFinite(v);
  const today = () => new Date().toISOString().slice(0, 10);
  const round8 = x => Math.round(x * 1e8) / 1e8;
  const clone = o => (o == null ? o : JSON.parse(JSON.stringify(o)));

  const AJUSTES = () => ({
    umbral_barata: 15,   // % anual esperado a 5 años (escenario conservador) a partir del cual una posición es «barata»
    umbral_cara: 3,      // % anual por debajo del cual es «cara»
    objetivo: 15,        // rentabilidad objetivo (precio de entrada)
    minimo: 8,           // rentabilidad mínima (precio máximo)
    lim_empresa: 10,     // % máximo de la cartera en una empresa
    lim_sector: 30,      // % máximo en un sector
    dias_precio_viejo: 5,
    fx: { EUR: 1, USD: 1.1193, CNY: 7.466, TWD: 36.5, fecha: '2026-10-23' }  // unidades de divisa por 1 EUR
  });
  function nuevoDatos() {
    return { version: 1, posiciones: [], movimientos: [], otras: { accounts: [] }, ajustes: AJUSTES(), fichas: {}, precios: {}, resultados: [], updatedAt: 0 };
  }
  /* Rellena lo que falte sin pisar lo que existe (datos importados de versiones anteriores) */
  function normalizar(d) {
    const b = nuevoDatos(); d = d || {};
    const out = Object.assign({}, b, d);
    out.ajustes = Object.assign({}, b.ajustes, d.ajustes || {});
    out.ajustes.fx = Object.assign({}, b.ajustes.fx, (d.ajustes && d.ajustes.fx) || {});
    ['posiciones', 'movimientos', 'resultados'].forEach(k => { if (!Array.isArray(out[k])) out[k] = []; });
    ['fichas', 'precios'].forEach(k => { if (!out[k] || typeof out[k] !== 'object') out[k] = {}; });
    if (!out.otras || !Array.isArray(out.otras.accounts)) out.otras = { accounts: [] };
    return out;
  }

  /* ───── Nombres y coincidencia de empresas ───── */
  const norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const STOP = { inc: 1, corp: 1, corporation: 1, co: 1, ltd: 1, sa: 1, plc: 1, class: 1, a: 1, b: 1, the: 1, platforms: 1, holdings: 1, group: 1, company: 1, technologies: 1, technology: 1 };
  const coreName = s => norm(s).replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w && !STOP[w]).join(' ');
  function sameCompany(p, empresa, ticker) {
    const tk = (ticker || '').trim().toLowerCase(), ptk = (p.ticker || '').trim().toLowerCase();
    if (tk && ptk && tk === ptk) return true;
    const a = coreName(p.empresa), b = coreName(empresa);
    if (!a || !b) return false;
    if (a === b) return true;
    const sh = a.length < b.length ? a : b, lg = a.length < b.length ? b : a;
    return sh.length >= 3 && lg.indexOf(sh + ' ') === 0;
  }
  function findExisting(d, empresa, ticker, broker) {
    const cands = d.posiciones.filter(p => sameCompany(p, empresa, ticker));
    const b = norm(broker).trim();
    if (b) { const ex = cands.filter(p => norm(p.broker).trim() === b); return ex.length ? ex[0] : null; }
    return cands.length === 1 ? cands[0] : null;
  }
  function tickerDe(d, pos) {
    const t = (pos.ticker || '').trim().toUpperCase();
    if (t && d.fichas[t]) return t;
    const a = coreName(pos.empresa);
    for (const k of Object.keys(d.fichas)) { if (a && (coreName(d.fichas[k].nombre) === a || k.toLowerCase() === a)) return k; }
    return t || null;
  }

  /* ───── Divisas y precios ───── */
  function fxPorEur(d, div) { if (div === 'EUR') return 1; const k = d.ajustes.fx[div]; return isN(k) && k > 0 ? k : null; }
  function aEur(d, importe, div) { const k = fxPorEur(d, div); return k ? importe / k : null; }
  /* Precio de una posición en SU moneda. Gana el dato más reciente entre: precio manual de la posición, precios del día y ficha (misma moneda);
     si no hay ninguno en su moneda, convierte el de otra divisa. */
  function precioPos(d, pos) {
    const tk = tickerDe(d, pos), pr = tk && d.precios[tk], f = tk && d.fichas[tk], m = pos.moneda, c = [];
    if (pr && isN(pr.precio) && pr.divisa === m) c.push({ precio: pr.precio, fecha: pr.fecha_precio || '', fuente: pr.fuente || 'precios', rank: 2 });
    if (isN(pos.precio_actual) && pos.precio_actual > 0) c.push({ precio: pos.precio_actual, fecha: pos.fecha_precio || '', fuente: 'manual', rank: 3 });
    if (f && isN(f.precio) && f.divisa === m) c.push({ precio: f.precio, fecha: f.fecha_precio || '', fuente: 'ficha', rank: 1 });
    if (c.length) { c.sort((a, b) => (b.fecha > a.fecha ? 1 : b.fecha < a.fecha ? -1 : b.rank - a.rank)); return Object.assign({ divisa: m, convertido: false }, c[0]); }
    const o = [];
    if (pr && isN(pr.precio) && pr.divisa) o.push({ precio: pr.precio, div: pr.divisa, fecha: pr.fecha_precio || '', fuente: pr.fuente || 'precios' });
    if (f && isN(f.precio) && f.divisa) o.push({ precio: f.precio, div: f.divisa, fecha: f.fecha_precio || '', fuente: 'ficha' });
    o.sort((a, b) => (b.fecha > a.fecha ? 1 : b.fecha < a.fecha ? -1 : 0));
    for (const x of o) {
      const e = aEur(d, x.precio, x.div), k = fxPorEur(d, m);
      if (e != null && k) return { precio: e * k, divisa: m, fecha: x.fecha, fuente: x.fuente, convertido: true };
    }
    return null;
  }
  const costeEur = (d, p) => (isN(p.precio_medio_compra) ? aEur(d, p.cantidad * p.precio_medio_compra, p.moneda) : null);
  function mercadoEur(d, p) { const pp = precioPos(d, p); return pp ? aEur(d, p.cantidad * pp.precio, p.moneda) : null; }
  function valorEur(d, p) { const m = mercadoEur(d, p); return m != null ? m : costeEur(d, p); }
  function variacion(d, p) {
    const pp = precioPos(d, p);
    return pp && !pp.convertido && p.precio_medio_compra > 0 ? pp.precio / p.precio_medio_compra - 1 : null;
  }
  function diasDesde(iso, hoy) {
    if (!iso) return null; const a = Date.parse(iso), b = Date.parse(hoy || today());
    return isN(a) && isN(b) ? Math.round((b - a) / 864e5) : null;
  }

  /* ───── Operaciones de cartera ───── */
  function addMov(d, m) {
    m.id = 'm_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    m.fecha = m.fecha || today(); d.movimientos.push(m); return m;
  }
  function compra(d, x) {
    const empresa = (x.empresa || '').trim(), broker = (x.broker || '').trim(), ticker = (x.ticker || '').trim().toUpperCase();
    const cantidad = Number(x.cantidad), precio = x.precio === '' || x.precio == null ? null : Number(x.precio);
    const moneda = x.moneda || 'USD', fecha = x.fecha || null, sector = (x.sector || '').trim(), notas = (x.notas || '').trim();
    const actual = x.actual === '' || x.actual == null ? null : Number(x.actual);
    if (!empresa) return { ok: false, msg: 'Falta el nombre de la empresa' };
    if (!(cantidad > 0)) return { ok: false, msg: 'Cantidad no válida' };
    if (precio !== null && !(precio > 0)) return { ok: false, msg: 'Precio no válido' };
    const ex = findExisting(d, empresa, ticker, broker);
    if (ex) {
      if (ex.moneda && moneda !== ex.moneda) return { ok: false, msg: 'Esa posición cotiza en ' + ex.moneda + ': cambia la moneda a ' + ex.moneda };
      const antes = clone(ex), oq = ex.cantidad || 0, op = ex.precio_medio_compra, nq = round8(oq + cantidad);
      if (precio !== null && isN(op)) ex.precio_medio_compra = (oq * op + cantidad * precio) / nq;
      else if (precio !== null) ex.precio_medio_compra = precio;
      ex.cantidad = nq;
      if (ticker && !ex.ticker) ex.ticker = ticker;
      if (sector && !ex.sector) ex.sector = sector;
      if (!ex.moneda) ex.moneda = moneda;
      if (notas) ex.notas = (ex.notas ? ex.notas + ' | ' : '') + notas;
      if (actual > 0) { ex.precio_actual = actual; ex.fecha_precio = today(); }
      addMov(d, { tipo: 'compra', empresa: ex.empresa, broker: ex.broker || '', cantidad, precio, moneda: ex.moneda, fecha, antes });
      return { ok: true, msg: 'Sumadas ' + cantidad + ' acciones a ' + ex.empresa };
    }
    if (!broker) return { ok: false, msg: 'Falta el broker' };
    const np = { empresa, ticker, broker, cantidad, precio_medio_compra: precio, moneda, sector, fecha_compra: fecha, notas };
    if (actual > 0) { np.precio_actual = actual; np.fecha_precio = today(); }
    d.posiciones.push(np);
    addMov(d, { tipo: 'compra', empresa, broker, cantidad, precio, moneda, fecha, antes: null });
    return { ok: true, msg: 'Posición añadida: ' + empresa };
  }
  function venta(d, idx, x) {
    const p = d.posiciones[idx]; if (!p) return { ok: false, msg: 'La posición no existe' };
    const cantidad = Number(x.cantidad), pv = x.precio === '' || x.precio == null ? null : Number(x.precio);
    if (!(cantidad > 0)) return { ok: false, msg: 'Cantidad no válida' };
    if (cantidad > p.cantidad + 1e-9) return { ok: false, msg: 'No puedes vender más de lo que tienes' };
    const total = cantidad >= p.cantidad - 1e-9, antes = clone(p);
    addMov(d, { tipo: 'venta', empresa: p.empresa, broker: p.broker || '', cantidad: total ? p.cantidad : cantidad, precio: pv, moneda: p.moneda || null, fecha: x.fecha || null, total, antes });
    if (total) d.posiciones.splice(idx, 1); else p.cantidad = round8(p.cantidad - cantidad);
    return { ok: true, msg: total ? 'Posición cerrada: ' + p.empresa : 'Venta parcial registrada: ' + p.empresa };
  }
  function editar(d, idx, x) {
    const t = d.posiciones[idx]; if (!t) return { ok: false, msg: 'La posición no existe' };
    const cantidad = Number(x.cantidad);
    if (!(x.empresa || '').trim()) return { ok: false, msg: 'Falta el nombre de la empresa' };
    if (!(cantidad > 0)) return { ok: false, msg: 'Cantidad no válida' };
    t.empresa = x.empresa.trim(); t.ticker = (x.ticker || '').trim().toUpperCase(); t.broker = (x.broker || '').trim();
    t.cantidad = cantidad; t.precio_medio_compra = x.precio === '' || x.precio == null ? null : Number(x.precio);
    t.moneda = x.moneda || t.moneda; t.sector = (x.sector || '').trim(); t.fecha_compra = x.fecha || null; t.notas = (x.notas || '').trim();
    return { ok: true, msg: 'Posición actualizada: ' + t.empresa };
  }
  function eliminar(d, idx) { const p = d.posiciones[idx]; if (!p) return { ok: false, msg: 'La posición no existe' }; d.posiciones.splice(idx, 1); return { ok: true, msg: 'Ficha eliminada: ' + p.empresa }; }
  function reverseMov(d, m) {
    if (m.importado) return 'Se quita solo del historial (venta anterior al registro de movimientos).';
    let idx = -1;
    d.posiciones.forEach((p, i) => { if (idx === -1 && norm(p.empresa) === norm(m.empresa) && norm(p.broker) === norm(m.broker)) idx = i; });
    if (m.tipo === 'venta') {
      if (idx >= 0) { d.posiciones[idx].cantidad = round8(d.posiciones[idx].cantidad + m.cantidad); return ''; }
      if (m.antes) { const c = clone(m.antes); c.cantidad = m.cantidad; d.posiciones.push(c); return ''; }
      return 'No se pudo recuperar la posición; se quita solo del historial.';
    }
    if (m.tipo === 'compra') {
      if (idx < 0) return 'La posición ya no existe; se quita solo del historial.';
      const p = d.posiciones[idx], nq = p.cantidad - m.cantidad;
      if (nq <= 1e-9) { d.posiciones.splice(idx, 1); return ''; }
      if (m.antes && Math.abs(p.cantidad - (m.antes.cantidad + m.cantidad)) < 1e-9) p.precio_medio_compra = m.antes.precio_medio_compra;
      else if (m.precio != null && p.precio_medio_compra != null) {
        const avg = (p.cantidad * p.precio_medio_compra - m.cantidad * m.precio) / nq;
        if (isFinite(avg) && avg > 0) p.precio_medio_compra = avg;
      }
      p.cantidad = round8(nq); return '';
    }
    return '';
  }
  function borrarMov(d, id) {
    const i = d.movimientos.findIndex(m => m.id === id); if (i < 0) return { ok: false, msg: 'No existe esa operación' };
    const m = d.movimientos[i], aviso = reverseMov(d, m); d.movimientos.splice(i, 1);
    return { ok: true, msg: aviso || ((m.tipo === 'venta' ? 'Venta' : 'Compra') + ' deshecha: ' + m.empresa) };
  }
  /* Precio manual de un valor: se guarda por ticker (lo leen cartera y valoración) o, sin ticker, en la propia posición */
  function precioManual(d, pos, precio, hoy) {
    const p = Number(precio); if (!(p > 0)) return false;
    const tk = (pos.ticker || '').trim().toUpperCase();
    if (tk) d.precios[tk] = { ticker: tk, precio: p, divisa: pos.moneda, fecha_precio: hoy || today(), fuente: 'manual', actualizado: new Date().toISOString() };
    else { pos.precio_actual = p; pos.fecha_precio = hoy || today(); }
    return true;
  }

  /* ───── Valoración de una empresa (motor Val) ───── */
  function precioFicha(d, tk) {
    const f = d.fichas[tk], pr = d.precios[tk]; let precio = f.precio, fecha = f.fecha_precio || '';
    if (pr && isN(pr.precio) && (pr.fecha_precio || '') >= fecha) {
      if (pr.divisa === f.divisa) { precio = pr.precio; fecha = pr.fecha_precio || ''; }
      else if ((pr.divisa === 'EUR' && f.divisa === 'USD') || (pr.divisa === 'USD' && f.divisa === 'EUR')) {
        const e = aEur(d, pr.precio, pr.divisa), k = fxPorEur(d, f.divisa);
        if (e != null && k) { precio = e * k; fecha = pr.fecha_precio || ''; }
      }   // CNY/TWD (ADR de TSM, H-share de CATL): no se convierten; manda el precio de la ficha
    }
    return { precio, fecha };
  }
  const cache = new Map();
  function valoracion(d, tk, hoy) {
    const f0 = d.fichas[tk]; if (!f0) return null;
    hoy = hoy || today();
    if (!V.soportado(f0)) return { tk, nombre: f0.nombre, noSoportado: true };
    try {
      const pf = precioFicha(d, tk), f = Object.assign({}, f0, { precio: pf.precio });
      const esc = Object.assign({}, V.defaults(f).conservador, (f.escenarios || {}).conservador || {});
      const res = V.proyectar(f, esc), ref = res.cagr[5].ref;
      const ent = V.precioEntrada(f, res, d.ajustes.objetivo / 100), max = V.precioEntrada(f, res, d.ajustes.minimo / 100);
      const fi = V.fiabilidad(f, hoy) || {};
      return {
        tk, nombre: f0.nombre || tk, divisa: f0.divisa, precio: pf.precio, fechaPrecio: pf.fecha, diasPrecio: diasDesde(pf.fecha, hoy),
        ref: isN(ref) ? ref : null, entrada: isN(ent) ? ent : null, max: isN(max) ? max : null,
        distEntrada: isN(ent) && ent > 0 ? pf.precio / ent - 1 : null, distMax: isN(max) && max > 0 ? pf.precio / max - 1 : null,
        ciclica: !!f0.ciclica, tipo: f0.tipo || 'industrial', estado: f0.estado || null, fechaDatos: f0.fecha_datos || null,
        puntuacion: fi.puntuacion == null ? null : fi.puntuacion, nivelDatos: fi.nivel || null, graves: fi.graves || 0,
        avisos: (fi.avisos || []).filter(a => a.nivel === 'r').map(a => a.txt)
      };
    } catch (e) { return { tk, nombre: f0.nombre || tk, error: e.message }; }
  }

  /* ───── Pesos y límites ───── */
  function pesos(d) {
    const filas = d.posiciones.map(p => ({ p, tk: tickerDe(d, p), eur: valorEur(d, p), sector: p.sector || (d.fichas[tickerDe(d, p)] || {}).sector || 'Sin sector' }));
    const total = filas.reduce((s, r) => s + (r.eur || 0), 0);
    const emp = {}, sec = {}, div = {};
    filas.forEach(r => {
      if (r.eur == null) return;
      const k = r.tk || r.p.empresa; emp[k] = (emp[k] || 0) + r.eur; sec[r.sector] = (sec[r.sector] || 0) + r.eur;
      div[r.p.moneda || '?'] = (div[r.p.moneda || '?'] || 0) + r.eur;
    });
    return { filas, total, emp, sec, div };
  }

  /* ───── Dashboard (Inicio) ───── */
  function dashboard(d, hoy) {
    hoy = hoy || today();
    const A = d.ajustes, W = pesos(d), porTk = {};
    W.filas.forEach(r => { const k = r.tk || ('~' + r.p.empresa); (porTk[k] = porTk[k] || { tk: r.tk, nombre: r.p.empresa, eur: 0, filas: [] }); porTk[k].eur += r.eur || 0; porTk[k].filas.push(r); });
    const baratas = [], caras = [], sinFicha = [], sinCalcular = []; let ocultas = 0, refPond = 0, pesoVal = 0, viejos = 0;
    Object.values(porTk).forEach(g => {
      const v = g.tk && d.fichas[g.tk] ? valoracion(d, g.tk, hoy) : null;
      if (!v) { sinFicha.push({ nombre: g.nombre, tk: g.tk, peso: W.total ? g.eur / W.total : null }); return; }
      if (v.noSoportado || v.error || v.ref == null) { sinCalcular.push({ nombre: g.nombre, tk: g.tk, motivo: v.noSoportado ? 'tipo de empresa sin método' : (v.error || 'sin resultado') }); return; }
      const peso = W.total ? g.eur / W.total : null, pr = g.filas[0].p;
      const fila = Object.assign({}, v, { peso, eur: g.eur, brokers: g.filas.map(r => r.p.broker).filter(Boolean), var: variacion(d, pr) });
      refPond += g.eur * v.ref; pesoVal += g.eur;
      if (v.diasPrecio != null && v.diasPrecio > A.dias_precio_viejo) viejos++;
      if (v.ref * 100 >= A.umbral_barata) baratas.push(fila); else if (v.ref * 100 <= A.umbral_cara) caras.push(fila); else ocultas++;
    });
    baratas.sort((a, b) => b.ref - a.ref); caras.sort((a, b) => a.ref - b.ref);
    const watch = [], watchResto = [];
    Object.keys(d.fichas).filter(k => d.fichas[k].estado === 'watchlist').forEach(k => {
      const v = valoracion(d, k, hoy); if (!v || v.noSoportado || v.error) return;
      (v.distEntrada != null && v.distEntrada <= 0 ? watch : watchResto).push(v);
    });
    watch.sort((a, b) => a.distEntrada - b.distEntrada); watchResto.sort((a, b) => (a.distEntrada ?? 9) - (b.distEntrada ?? 9));
    const alertas = [];
    Object.keys(W.emp).forEach(k => { const p = W.emp[k] / W.total * 100; if (p > A.lim_empresa) alertas.push({ tipo: 'empresa', nombre: k, pct: p, lim: A.lim_empresa }); });
    Object.keys(W.sec).forEach(k => { const p = W.sec[k] / W.total * 100; if (p > A.lim_sector) alertas.push({ tipo: 'sector', nombre: k, pct: p, lim: A.lim_sector }); });
    return {
      resumen: { valorEur: W.total, nPos: Object.keys(porTk).length, refPond: pesoVal ? refPond / pesoVal : null, cubierto: W.total ? pesoVal / W.total : null, preciosViejos: viejos },
      baratas, caras, ocultas, watch, watchResto, sinFicha, sinCalcular, alertas, pesos: W
    };
  }

  return { isN, today, clone, nuevoDatos, normalizar, norm, coreName, sameCompany, findExisting, tickerDe, fxPorEur, aEur, precioPos, costeEur, mercadoEur, valorEur, variacion, diasDesde,
    compra, venta, editar, eliminar, borrarMov, reverseMov, precioManual, precioFicha, valoracion, pesos, dashboard, V };
})();
if (typeof module !== 'undefined') module.exports = Logic;
