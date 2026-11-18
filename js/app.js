/* Interfaz. Fase 1: Inicio + Cartera (editable). Cribado / Valoración / Resultados llegan en fases siguientes. */
(function () {
  const L = Logic, $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SYM = { EUR: '€', USD: '$', GBP: '£', CNY: '¥', TWD: 'NT$' };
  const nf = (n, d) => n == null || !isFinite(n) ? '—' : n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
  const eur = n => nf(n, 0) + ' €';
  const money = (n, div) => n == null ? '—' : (div === 'EUR' ? nf(n, 2) + ' €' : nf(n, 2) + ' ' + (SYM[div] || div || ''));
  const pct = (x, d) => x == null || !isFinite(x) ? '—' : (x > 0 ? '+' : '') + nf(x * 100, d == null ? 1 : d) + '%';
  const cls = x => x == null ? '' : x >= 0 ? 'up' : 'down';
  const urlSegura = u => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : null);   // solo http(s): un «javascript:…» en un archivo importado no se convierte en enlace
  let tab = 'inicio', filtro = '', orden = 'peso', toastT;

  /* Aviso flotante; con «acc» lleva un botón (p. ej. Deshacer) y dura más */
  function toast(m, acc) {
    const t = $('#toast'); t.textContent = ''; const sp = document.createElement('span'); sp.textContent = m; t.appendChild(sp);
    if (acc) { const b = document.createElement('button'); b.type = 'button'; b.className = 'toast-b'; b.textContent = acc.txt; b.onclick = () => { t.classList.remove('on', 'acc'); clearTimeout(toastT); acc.fn(); }; t.appendChild(b); }
    t.classList.toggle('acc', !!acc); t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on', 'acc'), acc ? 7000 : 3200);
  }
  /* Borra (o cambia) al momento y ofrece «Deshacer» unos segundos, en vez de preguntar antes. fn() hace el cambio y devuelve {ok, msg}.
     Si mientras tanto llegan datos de Drive o se importa un archivo, ya no se deshace (no se pisa lo nuevo). */
  function conDeshacer(fn) {
    const copia = Store.exportar(), g = Store.generacion(), res = fn();
    if (!guardar(res)) return false;
    toast(Store.aviso() || res.msg, { txt: 'Deshacer', fn: () => {
      if (Store.generacion() !== g) return toast('Ya no se puede deshacer: los datos han cambiado desde Drive');
      Store.restaurar(copia); cerrar(); render(); toast('Deshecho');
    } });
    return true;
  }
  function dlg(html, onReady) {
    const d = $('#dlg'); d.innerHTML = '<div class="dlg-in">' + html + '</div>';
    if (!d.open) d.showModal();
    if (onReady) onReady(d);
    return d;
  }
  const cerrar = () => { const d = $('#dlg'); if (d.open) d.close(); };
  const UI = window.UI = { vistas: {}, clicks: [], changes: [], pies: {} };   // enganches para módulos que añaden pestañas (cribado, valoración…)
  function guardar(res, ok) {
    if (!res.ok) { toast(res.msg); return false; }
    Store.save(); const av = Store.aviso(); cerrar(); render(); toast(av || res.msg); if (ok) ok(); return true;
  }

  /* ───── Inicio ───── */
  /* Medidor de la watchlist: dónde está el precio frente al de entrada (rentab. objetivo) y al máximo (rentab. mínima) */
  function medidor(v) {
    if (!(v.precio > 0) || !(v.entrada > 0) || !(v.max > v.entrada)) return '';
    const lo = Math.min(v.precio, v.entrada) * 0.85, hi = Math.max(v.precio, v.max) * 1.1, x = n => ((n - lo) / (hi - lo) * 100).toFixed(2) + '%';
    const zona = v.precio <= v.entrada ? 'en precio de entrada' : v.precio <= v.max ? 'entre entrada y máximo' : 'por encima del máximo';
    return '<div class="med" role="img" aria-label="Precio ' + esc(money(v.precio, v.divisa)) + ', ' + zona + '" title="Precio ' + esc(money(v.precio, v.divisa)) + ' · entrada ' + esc(money(v.entrada, v.divisa)) + ' · máximo ' + esc(money(v.max, v.divisa)) + '">' +
      '<i class="z1" style="width:' + x(v.entrada) + '"></i><i class="z2" style="left:' + x(v.entrada) + ';width:calc(' + x(v.max) + ' - ' + x(v.entrada) + ')"></i><b style="left:' + x(v.precio) + '"></b></div>';
  }
  function filaVal(v, extra) {
    const peso = v.peso != null ? ' · ' + nf(v.peso * 100, 1) + '% cartera' : '';
    const aviso = v.graves ? ' <span class="pill warn" title="' + esc((v.avisos || []).join(' | ')) + '">datos dudosos</span>' : '';
    const viejo = v.diasPrecio != null && v.diasPrecio > Store.get().ajustes.dias_precio_viejo ? ' <span class="pill">precio de hace ' + v.diasPrecio + ' d</span>' : '';
    return '<div class="row click" data-go="val" data-tk="' + esc(v.tk) + '"><div class="main"><div class="name">' + esc(v.nombre) + '</div><div class="meta">' + esc(v.tk) + peso + '</div>' +
      '<div class="meta">Precio ' + money(v.precio, v.divisa) + ' · entrada ' + money(v.entrada, v.divisa) + (v.estado === 'watchlist' && v.max != null ? ' · máx. ' + money(v.max, v.divisa) : '') + '</div>' + (v.estado === 'watchlist' ? medidor(v) : '') + (aviso || viejo ? '<div class="chips">' + aviso + viejo + '</div>' : '') + '</div>' +
      '<div class="num">' + extra + '</div></div>';
  }
  function vistaInicio() {
    const d = Store.get(), D = L.dashboard(d), R = D.resumen;
    if (!d.posiciones.length && !Object.keys(d.fichas).length)
      return '<div class="card empty"><p><b>Aún no hay datos en este dispositivo.</b></p><p>Abre ⚙ Ajustes e importa tu archivo <code>datos.json</code> (o empieza añadiendo una compra en Cartera).</p><button class="btn" data-a="ajustes">Abrir ajustes</button></div>';
    const eurS = n => n == null || !isFinite(n) ? '—' : (n > 0 ? '+' : n < 0 ? '-' : '') + nf(Math.abs(n), 0) + ' €';
    let h = '<div class="kpis">' +
      '<div class="kpi"><span>Valor de la cartera</span><b>' + eur(R.valorEur) + '</b><small>' + R.nPos + ' empresas</small></div>' +
      '<div class="kpi" title="Valor de mercado menos coste, ambos en € al cambio actual (no incluye el efecto divisa)"><span>Plusvalía latente</span><b class="' + cls(R.plusEur) + '">' + eurS(R.plusEur) + '</b><small>' +
        (R.plusPct == null ? 'sin coste o precio' : '<span class="' + cls(R.plusPct) + '">' + pct(R.plusPct) + '</span> sobre coste' + (R.nPlus < R.nTotal ? ' · ' + R.nPlus + ' de ' + R.nTotal + ' pos.' : '')) + '</small></div>' +
      '<div class="kpi"><span>Rentab. esperada (pond.)</span><b>' + (R.refPond == null ? '—' : nf(R.refPond * 100, 1) + '%') + '</b></div>' +
      '<div class="kpi"><span>Cartera valorada</span><b>' + (R.cubierto == null ? '—' : nf(R.cubierto * 100, 0) + '%') + '</b></div></div>';
    h += lineaPrecios();
    D.alertas.forEach(a => h += '<div class="alert bad">⚠ ' + esc(a.nombre) + ' pesa ' + nf(a.pct, 1) + '% (límite ' + (a.tipo === 'empresa' ? 'por empresa' : 'por sector') + ' ' + a.lim + '%)</div>');
    const sinFx = [...new Set(d.posiciones.filter(p => p.moneda && L.fxPorEur(d, p.moneda) == null).map(p => p.moneda))];
    if (sinFx.length) h += '<div class="alert warn">Sin tipo de cambio para ' + esc(sinFx.join(', ')) + ': esas posiciones no cuentan en el valor ni en los pesos. Añádelo en ⚙ Ajustes o pulsa «Actualizar precios».</div>';
    if (R.preciosViejos) h += '<div class="alert warn">' + R.preciosViejos + ' posición(es) con precio de hace más de ' + d.ajustes.dias_precio_viejo + ' días.</div>';
    h += vistaEvolucion(d);
    h += vistaReparto(D);
    if (UI.cargarSEC) UI.cargarSEC();
    if (UI.avisosResultados) h += UI.avisosResultados();
    if (UI.calidadDatos) h += UI.calidadDatos();
    const A = d.ajustes;
    h += '<div class="sec-t"><h2>Muy baratas <span class="mut small">≥ ' + A.umbral_barata + '% anual</span></h2></div><div class="card">' +
      (D.baratas.length ? D.baratas.map(v => filaVal(v, '<span class="pill ok">' + nf(v.ref * 100, 1) + '%</span>')).join('') : '<div class="empty">Ninguna posición supera el umbral.</div>') + '</div>';
    h += '<div class="sec-t"><h2>Caras <span class="mut small">≤ ' + A.umbral_cara + '% anual</span></h2></div><div class="card">' +
      (D.caras.length ? D.caras.map(v => filaVal(v, '<span class="pill bad">' + nf(v.ref * 100, 1) + '%</span>')).join('') : '<div class="empty">Ninguna posición está cara.</div>') + '</div>';
    const leyMed = '<p class="med-ley mut small"><span><i class="z1"></i>hasta el precio de entrada</span><span><i class="z2"></i>hasta el máximo</span><span><b></b>precio actual</span></p>';
    h += '<div class="sec-t"><h2>Watchlist en precio de entrada</h2></div><div class="card">' + (D.watch.length ? leyMed : '') +
      (D.watch.length ? D.watch.map(v => filaVal(v, '<span class="pill ok">' + pct(v.distEntrada, 0) + '</span><div class="meta">vs entrada</div>')).join('') : '<div class="empty">Ninguna llega aún a su precio de entrada.</div>') + '</div>';
    if (D.watchResto.length) h += '<details class="card"><summary>Watchlist: el resto (' + D.watchResto.length + ')</summary>' + leyMed +
      D.watchResto.map(v => filaVal(v, '<span class="pill">' + pct(v.distEntrada, 0) + '</span><div class="meta">vs entrada</div>')).join('') + '</details>';
    const aparte = D.sinFicha.concat(D.sinCalcular);
    h += '<p class="mut small">' + D.ocultas + ' posiciones en zona intermedia (ocultas).' + (aparte.length ? ' Sin valorar: ' + aparte.map(x => esc(x.nombre)).join(', ') + '.' : '') + '</p>';
    const pi = Store.preciosInfo();
    if (pi && pi.generado) {
      const fall = ((pi.estado || {}).fallos || []).map(f => f.ticker.replace('@ficha', ' (ficha)'));
      h += '<p class="mut small">Precios automáticos: ' + new Date(pi.generado).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) + ' · ' + ((pi.estado || {}).ok || 0) + '/' + ((pi.estado || {}).total || 0) + ' valores' +
        (fall.length ? ' · sin actualizar: ' + esc(fall.join(', ')) : '') + '.</p>';
    }
    return h;
  }

  /* Evolución del valor de la cartera (fotos diarias) frente a lo invertido; la distancia entre las dos líneas es la plusvalía */
  const EVO_K = 'mi-cartera:evolucion', EVO_T = { m1: ['1 M', 31], m3: ['3 M', 92], a1: ['1 A', 366], todo: ['Todo', 0] };
  let evo = (() => { try { return EVO_T[localStorage.getItem(EVO_K)] ? localStorage.getItem(EVO_K) : 'm3'; } catch (e) { return 'm3'; } })(), evoPts = [], evoXY = [];
  const fLarga = f => { const [a, m, dd] = f.split('-'); return +dd + ' ' + ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][+m - 1] + ' ' + a.slice(2); };
  function escala(lo, hi) {   // 3–5 marcas «redondas»
    const paso0 = (hi - lo) / 4 || Math.abs(hi) / 4 || 1, p10 = Math.pow(10, Math.floor(Math.log10(paso0))), paso = [1, 2, 2.5, 5, 10].map(k => k * p10).find(k => k >= paso0);
    const a = Math.floor(lo / paso) * paso, b = Math.ceil(hi / paso) * paso, t = []; for (let x = a; x <= b + paso / 2; x += paso) t.push(x); return { a, b, t };
  }
  function vistaEvolucion(d) {
    const H = d.historico || []; if (!H.length) return '';
    const dias = EVO_T[evo][1], desde = dias ? new Date(Date.parse(L.today()) - dias * 864e5).toISOString().slice(0, 10) : '';
    const P = evoPts = H.filter(x => x.f >= desde);
    let h = '<div class="sec-t"><h2>Evolución</h2><div class="seg" role="group" aria-label="Periodo">' + Object.keys(EVO_T).map(k => '<button type="button" data-evo="' + k + '" aria-pressed="' + (k === evo) + '">' + EVO_T[k][0] + '</button>').join('') + '</div></div><div class="card evo">';
    if (P.length < 2) { evoXY = []; return h + '<p class="mut small" style="margin:0">La app guarda una foto del valor de tu cartera cada día que la abres (' + H.length + ' hasta ahora, desde el ' + fLarga(H[0].f) + '). El gráfico aparece en cuanto haya dos días' + (dias && H.length >= 2 ? ' en este periodo' : '') + '.</p></div>'; }
    const u = P[P.length - 1], p0 = P[0], plus = u.v - u.c, dPlus = plus - (p0.v - p0.c);
    const vals = P.flatMap(x => [x.v, x.c]), E = escala(Math.min.apply(null, vals), Math.max.apply(null, vals));
    const t0 = Date.parse(p0.f), t1 = Date.parse(u.f), X = f => (Date.parse(f) - t0) / (t1 - t0 || 1) * 100, Y = n => (1 - (n - E.a) / (E.b - E.a || 1)) * 100;
    evoXY = P.map(x => ({ x: X(x.f), v: Y(x.v), c: Y(x.c) }));
    const linea = k => evoXY.map((q, i) => (i ? 'L' : 'M') + q.x.toFixed(2) + ' ' + q[k].toFixed(2)).join(' ');
    const sg = n => (n > 0 ? '+' : '') + eur(n);
    h += '<div class="evo-top"><div><b>' + eur(u.v) + '</b> <span class="mut small">valor el ' + fLarga(u.f) + '</span></div><div class="small">Plusvalía <b class="' + cls(plus) + '">' + sg(plus) + '</b> · <span class="' + cls(dPlus) + '">' + sg(dPlus) + '</span> <span class="mut">en el periodo</span></div></div>';
    h += '<div class="evo-ley small"><span><i class="sw v"></i>Valor</span><span><i class="sw c"></i>Invertido (coste)</span></div>';
    h += '<div class="evo-g"><div class="evo-y">' + E.t.map(x => '<span style="top:' + Y(x).toFixed(2) + '%">' + (Math.abs(E.b) >= 1e4 ? nf(x / 1000, x % 1000 ? 1 : 0) + ' k' : nf(x, 0)) + '</span>').join('') + '</div>' +
      '<div class="evo-plot" tabindex="0" aria-label="Gráfico de evolución: usa las flechas para recorrer los días">' + E.t.map(x => '<i class="gl" style="top:' + Y(x).toFixed(2) + '%"></i>').join('') +
      '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="lc" d="' + linea('c') + '"/><path class="lv" d="' + linea('v') + '"/></svg>' +
      '<i class="evo-x" hidden></i><b class="evo-p v" hidden></b><b class="evo-p c" hidden></b><div class="evo-tip" hidden></div></div></div>' +
      '<div class="evo-f mut small"><span>' + fLarga(p0.f) + '</span><span>' + fLarga(u.f) + '</span></div>';
    h += '<details class="small evo-tabla"><summary>Ver datos (' + P.length + ' días)</summary><div class="tw"><table class="tbl"><tr><th>Día</th><th>Valor</th><th>Invertido</th><th>Plusvalía</th></tr>' +
      P.slice().reverse().map(x => '<tr><td>' + fLarga(x.f) + '</td><td>' + eur(x.v) + '</td><td>' + eur(x.c) + '</td><td class="' + cls(x.v - x.c) + '">' + sg(x.v - x.c) + '</td></tr>').join('') + '</table></div></details>';
    return h + '</div>';
  }
  let evoI = -1;
  function evoMarca(plot, i) {
    const P = evoPts; if (!plot || P.length < 2 || evoXY.length !== P.length) return; i = Math.max(0, Math.min(P.length - 1, i)); evoI = i;
    const q = evoXY[i], p = P[i], x = plot.querySelector('.evo-x'), pv = plot.querySelector('.evo-p.v'), pc = plot.querySelector('.evo-p.c'), tip = plot.querySelector('.evo-tip');
    [x, pv, pc, tip].forEach(n => { n.hidden = false; }); x.style.left = pv.style.left = pc.style.left = q.x + '%'; pv.style.top = q.v + '%'; pc.style.top = q.c + '%';
    tip.innerHTML = '<b>' + fLarga(p.f) + '</b><br>Valor ' + eur(p.v) + '<br>Invertido ' + eur(p.c) + '<br>Plusvalía <span class="' + cls(p.v - p.c) + '">' + (p.v - p.c > 0 ? '+' : '') + eur(p.v - p.c) + '</span>';
    const izq = q.x > 55; tip.style.left = izq ? '' : 'calc(' + q.x + '% + 10px)'; tip.style.right = izq ? 'calc(' + (100 - q.x) + '% + 10px)' : '';
  }
  function evoOculta(plot) { if (plot) plot.querySelectorAll('.evo-x,.evo-p,.evo-tip').forEach(n => { n.hidden = true; }); evoI = -1; }
  document.addEventListener('pointermove', e => {
    const plot = e.target.closest && e.target.closest('.evo-plot'); if (!plot || evoXY.length < 2) return;
    const r = plot.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width * 100;
    let best = 0; evoXY.forEach((q, i) => { if (Math.abs(q.x - fx) < Math.abs(evoXY[best].x - fx)) best = i; }); evoMarca(plot, best);
  });
  document.addEventListener('pointerout', e => { const plot = e.target.closest && e.target.closest('.evo-plot'); if (plot && !plot.contains(e.relatedTarget)) evoOculta(plot); });
  document.addEventListener('keydown', e => {
    const plot = e.target.closest && e.target.closest('.evo-plot'); if (!plot) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); evoMarca(plot, (evoI < 0 ? evoPts.length - 1 : evoI) + (evoI < 0 ? 0 : e.key === 'ArrowLeft' ? -1 : 1)); }
    else if (e.key === 'Escape') evoOculta(plot);
  });
  document.addEventListener('focusout', e => { if (e.target.classList && e.target.classList.contains('evo-plot')) evoOculta(e.target); });

  /* Reparto por empresa / sector / divisa: barras horizontales con la línea del límite */
  const REP_K = 'mi-cartera:reparto', REP_T = { empresa: 'Empresa', sector: 'Sector', divisa: 'Divisa' };
  let rep = (() => { try { return REP_T[localStorage.getItem(REP_K)] ? localStorage.getItem(REP_K) : 'empresa'; } catch (e) { return 'empresa'; } })();
  function vistaReparto(D) {
    const todos = D.reparto[rep] || [], lim = D.lim[rep], N = 8;
    if (!todos.length) return '';
    const filas = todos.length > N + 1 ? todos.slice(0, N).concat([{ nombre: 'Otras (' + (todos.length - N) + ')', otras: true, eur: todos.slice(N).reduce((a, x) => a + x.eur, 0), pct: todos.slice(N).reduce((a, x) => a + x.pct, 0) }]) : todos;
    const tope = Math.max.apply(null, filas.map(x => x.pct).concat(lim ? [lim / 100 * 1.15] : [])) || 1;
    const nExc = lim ? todos.filter(x => x.pct * 100 > lim).length : 0;
    let h = '<div class="sec-t"><h2>Reparto</h2><div class="seg" role="group" aria-label="Reparto por">' + Object.keys(REP_T).map(k => '<button type="button" data-rep="' + k + '" aria-pressed="' + (k === rep) + '">' + REP_T[k] + '</button>').join('') + '</div></div>';
    h += '<div class="card rep">' + (lim ? '<p class="mut small rep-lim"><i></i>Límite ' + nf(lim, 0) + '% por ' + rep + (nExc ? ' · <b class="down">' + nExc + ' lo supera' + (nExc > 1 ? 'n' : '') + '</b>' : ' · ninguna lo supera') + '</p>' : '');
    h += filas.map(x => {
      const over = lim && !x.otras && x.pct * 100 > lim;
      return '<div class="rb' + (over ? ' over' : '') + '" title="' + esc(x.nombre) + ': ' + nf(x.pct * 100, 1) + '% · ' + eur(x.eur) + (over ? ' · supera el límite del ' + lim + '%' : '') + '">' +
        '<div class="rb-l"><span class="rb-n">' + esc(x.nombre) + (over ? ' <span class="pill bad">⚠ supera</span>' : '') + '</span><span class="rb-v"><b>' + nf(x.pct * 100, 1) + '%</b> · ' + eur(x.eur) + '</span></div>' +
        '<div class="rb-t"><i style="width:' + (x.pct / tope * 100).toFixed(2) + '%"></i>' + (lim ? '<b style="left:' + (lim / 100 / tope * 100).toFixed(2) + '%"></b>' : '') + '</div></div>';
    }).join('') + '</div>';
    return h;
  }

  /* ───── Cartera ───── */
  const fcorta = f => (f && /^\d{4}-\d\d-\d\d/.test(f) ? f.slice(8, 10) + '/' + f.slice(5, 7) : '');
  function fechaPrecio(pp) {
    if (!pp) return '';   // sin precio: lo dice un único aviso encima de la lista
    if (!pp.fecha) return ' · <span class="mut" title="Precio sin fecha (fuente: ' + esc(pp.fuente || '') + ')">s/f</span>';
    const dd = L.diasDesde(pp.fecha), viejo = dd != null && dd > Store.get().ajustes.dias_precio_viejo;
    return ' · <span class="' + (viejo ? 'pill warn' : 'mut') + '" title="Fuente: ' + esc(pp.fuente || '') + '">' + (dd === 0 ? 'hoy' : fcorta(pp.fecha) || esc(pp.fecha)) + '</span>';
  }
  function lineaPrecios() {
    const pi = Store.preciosInfo() || {}, est = pi.estado || {};
    return '<div class="tools" style="align-items:center;gap:8px"><span class="mut small" style="flex:1">Precios automáticos: ' + (pi.generado ? new Date(pi.generado).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) + ' · ' + (est.ok || 0) + '/' + (est.total || 0) + ' valores' : 'sin datos aún') +
      '</span><button class="btn sec sm" data-a="precios">Actualizar precios</button></div>';
  }
  function preciosDlg() {
    const pi = Store.preciosInfo() || {}, est = pi.estado || {}, fall = (est.fallos || []).map(f => f.ticker.replace('@ficha', ' (ficha)'));
    dlg('<h2>Actualizar precios</h2><p class="small">Últimos precios automáticos: <b>' + (pi.generado ? new Date(pi.generado).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : 'sin datos') + '</b> · ' + (est.ok || 0) + '/' + (est.total || 0) + ' valores' + (fall.length ? ' · sin actualizar: ' + esc(fall.join(', ')) : '') + '.</p>' +
      '<p class="small mut">«Traer lo último» lee lo publicado hasta ahora (inmediato). «Forzar descarga» lanza una descarga nueva en GitHub, sin esperar al horario automático, y tarda 1–2 minutos; necesita el token de GitHub de este dispositivo.</p>' +
      '<div class="acts" style="justify-content:flex-start"><button class="btn sec" id="pr-ult">Traer lo último</button><button class="btn" id="pr-forzar">Forzar descarga nueva</button></div>' +
      '<div id="pr-tok" hidden><label for="pr-t">Token de GitHub (Actions: Read and write)</label><input id="pr-t" type="password" autocomplete="off" placeholder="github_pat_…"><div class="acts" style="justify-content:flex-start"><button class="btn sm" id="pr-tok-ok">Guardar y forzar</button></div></div>' +
      '<p class="small" id="pr-msg"></p><div class="acts"><button class="btn sec" data-a="cerrar">Cerrar</button></div>', dd => {
      const msg = t => { dd.querySelector('#pr-msg').textContent = t; };
      let ocupado = false;
      const aplicar = async j => { const n = await Store.cargarPreciosAuto(j); render(); return n; };
      dd.querySelector('#pr-ult').onclick = async () => {
        if (ocupado) return; ocupado = true; msg('Leyendo…');
        try { const j = await DatosWeb.leerArchivo('precios.json'); if (!j) msg('No hay precios publicados.'); else { const n = await aplicar(j); msg('Hecho: ' + new Date(j.generado).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) + ' · ' + n + ' cambio(s).'); } } catch (e) { msg('No se pudo leer: ' + e.message); }
        ocupado = false;
      };
      const forzar = async () => {
        if (ocupado) return; ocupado = true; const t0 = Date.now(); msg('Lanzando la descarga…');
        try {
          const l = await DatosWeb.lanzarWorkflow('precios.yml', { forzar: 'true' });
          if (l.sinToken) { dd.querySelector('#pr-tok').hidden = false; msg('Pega el token para poder lanzarla desde la app.'); ocupado = false; return; }
          if (!l.ok) { msg(l.msg); ocupado = false; return; }
          for (let i = 0; i < 40; i++) {
            msg('Descargando precios… ' + Math.round((Date.now() - t0) / 1000) + ' s');
            await new Promise(r => setTimeout(r, DatosWeb.pausa));
            let j = null; try { j = await DatosWeb.leerArchivo('precios.json'); } catch (e) { }
            if (j && Date.parse(j.generado) >= t0 - 5000) { const n = await aplicar(j), e2 = j.estado || {}; msg('Listo: ' + (e2.ok || 0) + '/' + (e2.total || 0) + ' valores · ' + n + ' cambio(s).'); ocupado = false; return; }
          }
          msg('Tarda más de lo normal: mira Actions en GitHub y pulsa «Traer lo último» después.');
        } catch (e) { msg('Error: ' + e.message); }
        ocupado = false;
      };
      dd.querySelector('#pr-forzar').onclick = forzar;
      dd.querySelector('#pr-tok-ok').onclick = () => { const t = dd.querySelector('#pr-t').value.trim(); if (!t) return toast('Pega el token'); DatosWeb.setToken(t); dd.querySelector('#pr-tok').hidden = true; forzar(); };
    });
  }
  function vistaCartera() {
    const d = Store.get(), W = L.pesos(d), q = L.norm(filtro);
    let filas = W.filas.map((r, i) => Object.assign({ i }, r)).filter(r => !q || L.norm(r.p.empresa + ' ' + (r.p.ticker || '') + ' ' + (r.p.broker || '')).includes(q));
    const refDe = {}; if (orden === 'ref') filas.forEach(r => { if (r.tk && d.fichas[r.tk] && !(r.tk in refDe)) { const v = L.valoracion(d, r.tk); refDe[r.tk] = v && v.ref != null ? v.ref : null; } });
    const key = { peso: r => -(r.eur || 0), nombre: r => L.norm(r.p.empresa), var: r => -(L.variacion(d, r.p) ?? -9), ref: r => -(refDe[r.tk] ?? -9), broker: r => L.norm(r.p.broker || '~') }[orden];
    filas.sort((a, b) => { const x = key(a), y = key(b); return x < y ? -1 : x > y ? 1 : orden === 'broker' ? (b.eur || 0) - (a.eur || 0) : 0; });
    const sinPrecio = filas.filter(r => !L.precioPos(d, r.p)).length;
    let h = '<div class="tools"><input id="q" type="search" placeholder="Buscar empresa, ticker o broker" value="' + esc(filtro) + '">' +
      '<select id="ord"><option value="peso"' + (orden === 'peso' ? ' selected' : '') + '>Mayor peso</option><option value="nombre"' + (orden === 'nombre' ? ' selected' : '') + '>Nombre</option><option value="var"' + (orden === 'var' ? ' selected' : '') + '>Mejor rentab.</option><option value="ref"' + (orden === 'ref' ? ' selected' : '') + '>Rentab. esperada</option><option value="broker"' + (orden === 'broker' ? ' selected' : '') + '>Por broker</option></select></div>';
    h += lineaPrecios();
    if (sinPrecio) h += '<div class="alert warn">' + sinPrecio + (sinPrecio > 1 ? ' posiciones sin precio: cuentan' : ' posición sin precio: cuenta') + ' a su precio de compra. Pulsa «Actualizar precios» o abre la posición y usa «Precio».</div>';
    const subt = {}; if (orden === 'broker') filas.forEach(r => { const k = r.p.broker || 'Sin broker'; subt[k] = (subt[k] || 0) + (r.eur || 0); });
    let brAnt = null;
    h += '<div class="card">' + (filas.length ? filas.map(r => {
      const brk = r.p.broker || 'Sin broker', cab = orden === 'broker' && brk !== brAnt ? '<div class="grp"><b>' + esc(brk) + '</b><span>' + eur(subt[brk]) + ' · ' + (W.total ? nf(subt[brk] / W.total * 100, 1) + '%' : '—') + '</span></div>' : ''; brAnt = brk;
      const ref = orden === 'ref' ? refDe[r.tk] : undefined;
      const p = r.p, pp = L.precioPos(d, p), v = L.variacion(d, p), w = W.total && r.eur != null ? r.eur / W.total : null;
      return cab + '<div class="row click" data-pos="' + r.i + '"><div class="main"><div class="name">' + esc(p.empresa) + (UI.etiquetasResultados ? UI.etiquetasResultados(L.tickerDe(d, p)) : '') + '</div><div class="meta">' + esc(p.broker || '') + ' · ' + nf(p.cantidad, 4).replace(/,?0+$/, '') + ' acc. · ' + money(pp && pp.precio, p.moneda) +
        (pp && pp.convertido ? ' (conv.)' : '') + fechaPrecio(pp) + '</div></div><div class="num"><b>' + eur(r.eur) + '</b><div class="meta"><span class="' + cls(v) + '">' + pct(v) + '</span> · ' + (w == null ? '—' : nf(w * 100, 1) + '%') + '</div>' + (ref !== undefined ? '<div class="meta">esperada ' + (ref == null ? '—' : nf(ref * 100, 1) + '%') + '</div>' : '') + '</div></div>';
    }).join('') : '<div class="empty">Sin posiciones' + (q ? ' que coincidan' : '') + '.</div>') + '</div>';
    h += '<button class="btn fab" data-a="compra">+ Compra</button>';
    const mv = d.movimientos.slice().reverse().slice(0, 30);
    h += '<div class="sec-t"><h2>Últimas operaciones</h2></div><div class="card">' + (mv.length ? mv.map(m =>
      '<div class="row"><div class="main"><div class="name">' + (m.tipo === 'venta' ? '🔴 Venta' : '🟢 Compra') + ' · ' + esc(m.empresa) + '</div><div class="meta">' + esc(m.fecha || '') + ' · ' + nf(m.cantidad, 4).replace(/,?0+$/, '') + (m.precio != null ? ' a ' + money(m.precio, m.moneda) : '') + ' · ' + esc(m.broker || '') + '</div></div>' +
      '<button class="btn sec sm" data-undo="' + esc(m.id) + '">Deshacer</button></div>').join('') : '<div class="empty">Sin operaciones registradas.</div>') + '</div>';
    return h;
  }

  function campo(id, lab, val, tipo, extra) { return '<div><label for="' + id + '">' + lab + '</label><input id="' + id + '" type="' + (tipo || 'text') + '" ' + (tipo === 'number' ? 'step="any" inputmode="decimal" ' : '') + (extra || '') + ' value="' + esc(val == null ? '' : val) + '"></div>'; }
  const val = id => document.getElementById(id).value;
  const monedas = sel => ['USD', 'EUR', 'GBP', 'CNY', 'TWD'].map(m => '<option' + (m === sel ? ' selected' : '') + '>' + m + '</option>').join('');

  function formCompra(x) {
    x = x || {}; const d = Store.get();
    dlg('<h2>Nueva compra</h2><p class="mut small">Si ya tienes la empresa en ese broker, se suma y se recalcula el precio medio.</p>' +
      campo('c-emp', 'Empresa', x.empresa, 'text', 'list="dl-emp" autocomplete="off"') + '<datalist id="dl-emp">' + Object.keys(d.fichas).map(k => '<option value="' + esc(d.fichas[k].nombre || k) + '">').join('') + '</datalist>' +
      '<div class="f2">' + campo('c-tk', 'Ticker', x.ticker, 'text', 'autocapitalize="characters"') + campo('c-br', 'Broker', x.broker || '', 'text', 'list="dl-br"') + '</div>' +
      '<datalist id="dl-br">' + [...new Set(d.posiciones.map(p => p.broker).filter(Boolean))].map(b => '<option value="' + esc(b) + '">').join('') + '</datalist>' +
      '<div class="f2">' + campo('c-q', 'Nº de acciones', '', 'number') + campo('c-p', 'Precio de compra', '', 'number') + '</div>' +
      '<div class="f2"><div><label for="c-m">Moneda</label><select id="c-m">' + monedas(x.moneda || 'USD') + '</select></div>' + campo('c-f', 'Fecha', L.today(), 'date') + '</div>' +
      campo('c-s', 'Sector (solo si es nueva)', x.sector) + campo('c-n', 'Notas', '') +
      '<div class="acts"><button class="btn sec" data-a="cerrar">Cancelar</button><button class="btn" id="ok">Guardar compra</button></div>',
      dd => {
        dd.querySelector('#c-emp').addEventListener('change', () => {   // rellena ticker/moneda/sector desde la ficha o posición
          const n = val('c-emp'), ex = d.posiciones.find(p => L.sameCompany(p, n, '')), tk = Object.keys(d.fichas).find(k => L.coreName(d.fichas[k].nombre) === L.coreName(n));
          const f = tk && d.fichas[tk];
          if (ex) { if (!val('c-tk')) $('#c-tk').value = ex.ticker || ''; if (!val('c-br')) $('#c-br').value = ex.broker || ''; $('#c-m').value = ex.moneda || 'USD'; }
          else if (f) { if (!val('c-tk')) $('#c-tk').value = tk; $('#c-m').value = f.divisa || 'USD'; if (!val('c-s')) $('#c-s').value = f.sector || ''; }
        });
        dd.querySelector('#ok').onclick = () => guardar(L.compra(d, { empresa: val('c-emp'), ticker: val('c-tk'), broker: val('c-br'), cantidad: val('c-q'), precio: val('c-p'), moneda: val('c-m'), fecha: val('c-f'), sector: val('c-s'), notas: val('c-n') }));
      });
  }
  function formVenta(i) {
    const d = Store.get(), p = d.posiciones[i];
    dlg('<h2>Vender · ' + esc(p.empresa) + '</h2><p class="mut small">Tienes ' + nf(p.cantidad, 4) + ' acciones en ' + esc(p.broker || '') + '. Si vendes todas se cierra la posición.</p>' +
      '<div class="f2">' + campo('v-q', 'Acciones a vender', p.cantidad, 'number') + campo('v-p', 'Precio de venta (' + p.moneda + ')', '', 'number') + '</div>' + campo('v-f', 'Fecha', L.today(), 'date') +
      '<div class="acts"><button class="btn sec" data-a="cerrar">Cancelar</button><button class="btn bad" id="ok">Registrar venta</button></div>',
      dd => { dd.querySelector('#ok').onclick = () => guardar(L.venta(d, i, { cantidad: val('v-q'), precio: val('v-p'), fecha: val('v-f') })); });
  }
  function formEditar(i) {
    const d = Store.get(), p = d.posiciones[i];
    dlg('<h2>Editar posición</h2>' + campo('e-emp', 'Empresa', p.empresa) + '<div class="f2">' + campo('e-tk', 'Ticker', p.ticker) + campo('e-br', 'Broker', p.broker) + '</div>' +
      '<div class="f2">' + campo('e-q', 'Acciones', p.cantidad, 'number') + campo('e-p', 'Precio medio de compra', p.precio_medio_compra, 'number') + '</div>' +
      '<div class="f2"><div><label for="e-m">Moneda</label><select id="e-m">' + monedas(p.moneda) + '</select></div>' + campo('e-f', 'Fecha de compra', p.fecha_compra, 'date') + '</div>' +
      campo('e-s', 'Sector', p.sector) + campo('e-n', 'Notas', p.notas) +
      '<div class="acts"><button class="btn sec" data-a="cerrar">Cancelar</button><button class="btn" id="ok">Guardar</button></div>',
      dd => { dd.querySelector('#ok').onclick = () => guardar(L.editar(d, i, { empresa: val('e-emp'), ticker: val('e-tk'), broker: val('e-br'), cantidad: val('e-q'), precio: val('e-p'), moneda: val('e-m'), fecha: val('e-f'), sector: val('e-s'), notas: val('e-n') })); });
  }
  function formPrecio(i) {
    const d = Store.get(), p = d.posiciones[i], pp = L.precioPos(d, p);
    dlg('<h2>Precio actual · ' + esc(p.empresa) + '</h2><p class="mut small">Ahora: ' + money(pp && pp.precio, p.moneda) + (pp ? ' (' + esc(pp.fuente) + ', ' + esc(pp.fecha || 's/f') + ')' : '') + '. Un precio manual prevalece hasta que llegue uno automático más reciente.</p>' +
      campo('pr-p', 'Precio (' + p.moneda + ')', '', 'number') + '<div class="acts"><button class="btn sec" data-a="cerrar">Cancelar</button><button class="btn" id="ok">Guardar</button></div>',
      dd => { dd.querySelector('#ok').onclick = () => { if (!L.precioManual(d, p, val('pr-p'))) return toast('Precio no válido'); guardar({ ok: true, msg: 'Precio actualizado' }); }; });
  }
  function detalle(i) {
    const d = Store.get(), p = d.posiciones[i], pp = L.precioPos(d, p), tk = L.tickerDe(d, p), v = tk && d.fichas[tk] ? L.valoracion(d, tk) : null;
    dlg('<h2>' + esc(p.empresa) + '</h2><p class="mut small">' + esc(p.ticker || tk || 'sin ticker') + ' · ' + esc(p.broker || '') + ' · ' + esc(p.sector || '') + '</p>' + (UI.enlaces ? UI.enlaces(tk, 'pos') : '') +
      '<div class="kpis" style="grid-template-columns:1fr 1fr"><div class="kpi"><span>Acciones</span><b>' + nf(p.cantidad, 4) + '</b></div><div class="kpi"><span>Precio medio</span><b>' + money(p.precio_medio_compra, p.moneda) + '</b></div>' +
      '<div class="kpi"><span>Precio actual</span><b>' + money(pp && pp.precio, p.moneda) + '</b></div><div class="kpi"><span>Rentab. esperada</span><b>' + (v && v.ref != null ? nf(v.ref * 100, 1) + '%' : '—') + '</b></div></div>' +
      (v && v.entrada != null ? '<p class="small">Precio de entrada ' + money(v.entrada, v.divisa) + ' · máximo ' + money(v.max, v.divisa) + '</p>' : '') +
      (p.notas ? '<p class="small mut">' + esc(p.notas) + '</p>' : '') +
      '<div class="acts" style="justify-content:flex-start"><button class="btn" data-a="mas" data-i="' + i + '">Comprar más</button><button class="btn bad" data-a="vender" data-i="' + i + '">Vender</button>' +
      '<button class="btn sec" data-a="precio" data-i="' + i + '">Precio</button><button class="btn sec" data-a="editar" data-i="' + i + '">Editar</button></div>' +
      '<div class="acts"><button class="btn sec sm" data-a="eliminar" data-i="' + i + '">Eliminar ficha</button><button class="btn sec" data-a="cerrar">Cerrar</button></div>');
  }

  /* ───── Ajustes ───── */
  const APP_VERSION = '72 · Respuestas de IA: fuentes agrupadas por bloques de años o por documento, JSON con texto alrededor o comas de más · 71 · Múltiplos de salida: pega la respuesta de la IA y rellena las medianas · 70 · La IA puede citar documentos con página (URD2025.pdf#p79) como fuente · 69 · Ajustes más claros en el móvil · 68 · Borrar con «Deshacer», filas usables con teclado · 67 · Inicio más rápido, evolución del valor, medidor de la watchlist, cartera por broker y por rentab. esperada · 66 · Inicio con plusvalía y reparto, pestañas abajo en el móvil · 65 · Arreglos: precio manual, precios al importar, fecha local, divisas en Ajustes, caché · 64 · Cifras de 12 meses: la IA busca sola y da fuentes · 63 · Caja de calidad: cada botón hace algo (avisos, verificar, guía de múltiplos, precio del feed) · 62 · Informes: una empresa con dos nombres comparte carpeta · 61 · Completar fichas con una IA que busca sola en los informes (con fuentes, fase 2 y deshacer)';
  function ajustes() {
    const d = Store.get(), A = d.ajustes, cp = Store.ultimaCopia();
    const DIVS = [...new Set(Object.keys(A.fx).concat(d.posiciones.map(p => p.moneda)).filter(k => k && /^[A-Z]{3}$/.test(k) && k !== 'EUR'))].sort();   // todas las divisas del feed y de tus posiciones (antes solo USD, CNY y TWD)
    const fCorta = f => (f && /^\d{4}-\d\d-\d\d/.test(f) ? f.slice(8, 10) + '/' + f.slice(5, 7) + '/' + f.slice(2, 4) : '—');
    const conectado = Drive.estado().conectado, ver = APP_VERSION.split(/ · (?=\d+ · )/);
    dlg('<div class="aj-cab"><div><h2>Ajustes</h2><span class="mut small">Versión ' + esc(ver[0].split(' · ')[0]) + '</span></div><button type="button" class="icon-x" data-a="cerrar" aria-label="Cerrar">✕</button></div>' +
      '<section class="aj"><h3>Umbrales del Inicio</h3><p class="aj-ayuda">Rentabilidad anual esperada a 5 años.</p><div class="f2">' + campo('a-b', 'Barata desde (%)', A.umbral_barata, 'number') + campo('a-c', 'Cara hasta (%)', A.umbral_cara, 'number') + '</div></section>' +
      '<section class="aj"><h3>Límites de cartera</h3><div class="f2">' + campo('a-le', 'Máx. por empresa (%)', A.lim_empresa, 'number') + campo('a-ls', 'Máx. por sector (%)', A.lim_sector, 'number') + '</div></section>' +
      '<section class="aj"><details id="a-fx"' + (A.fx.manual ? ' open' : '') + '><summary><span>Divisas</span><span class="mut small">' + (A.fx.manual ? 'ajuste manual' : 'automáticas') + ' · ' + fCorta(A.fx.fecha) + '</span></summary>' +
        '<p class="aj-ayuda">Unidades de cada divisa por 1 €. Se actualizan solas con los precios; si cambias alguna, se mantiene hasta el día siguiente.</p><div class="f2 f3">' + DIVS.map(k => campo('a-fx-' + k, k, A.fx[k], 'number')).join('') + '</div></details></section>' +
      '<section class="aj"><h3>Google Drive</h3><p class="aj-ayuda" id="dr-t">' + textoDrive() + '</p><div class="aj-bt">' +
        (conectado ? '<button class="btn sec" id="dr-now">Sincronizar ahora</button><button class="btn sec" id="dr-off">Desconectar</button>' : '<button class="btn sec" id="dr-on">Conectar con Drive</button>') + '</div></section>' +
      '<section class="aj"><h3>Copia de tus datos</h3><p class="aj-ayuda">Se guardan en este dispositivo' + (conectado ? ' y en tu Drive' : '') + '. Última copia exportada: ' + (cp ? new Date(cp).toLocaleDateString('es-ES') : 'nunca') + '.</p>' +
        '<div class="aj-bt"><button class="btn sec" id="a-exp">Exportar copia</button><label class="btn sec">Importar archivo<input id="a-imp" type="file" accept=".json,application/json" hidden></label></div></section>' +
      '<section class="aj"><h3>Informes anuales</h3><p class="aj-ayuda">El <code>indice_informes.json</code> que genera <code>herramientas/indice_informes.py</code> en tu PC.</p><div class="aj-bt"><label class="btn sec">Cargar índice de informes<input id="a-inf" type="file" accept=".json,application/json" hidden></label></div></section>' +
      '<details class="aj-ver small"><summary>Novedades de cada versión</summary><ul>' + ver.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></details>' +
      '<div class="aj-pie"><button class="btn sec" data-a="cerrar">Cancelar</button><button class="btn" id="a-ok">Guardar</button></div>',
      dd => {
        dd.querySelector('#a-ok').onclick = () => {
          const n = id => Number(val(id));
          const v = { b: n('a-b'), c: n('a-c'), e: n('a-le'), s: n('a-ls') };
          if (Object.values(v).some(x => !(x > 0)) || v.c >= v.b) return toast('Revisa los valores (la barata debe ser mayor que la cara)');
          const fx = {}; for (const k of DIVS) { const t = val('a-fx-' + k).trim(); if (t === '') continue; const x = Number(t); if (!(x > 0)) return toast('Tipo de cambio no válido: ' + k); fx[k] = x; }
          Object.assign(A, { umbral_barata: v.b, umbral_cara: v.c, lim_empresa: v.e, lim_sector: v.s });
          if (Object.keys(fx).some(k => fx[k] !== A.fx[k])) Object.assign(A.fx, fx, { fecha: L.today(), manual: true });   // solo cuenta como ajuste manual si tocas una divisa (antes cambiar un umbral congelaba las divisas del día)
          guardar({ ok: true, msg: 'Ajustes guardados' });
        };
        const bo = (id, f) => { const b = dd.querySelector(id); if (b) b.onclick = f; };
        bo('#dr-on', () => { Drive.conectar(); cerrar(); }); bo('#dr-now', () => { Drive.ahora(); cerrar(); }); bo('#dr-off', () => { if (confirm('¿Desconectar de Drive? Los datos se quedan en este dispositivo y en tu Drive.')) { Drive.desconectar(); cerrar(); } });
        dd.querySelector('#a-inf').onchange = e => { if (e.target.files[0]) cargarIndiceInformes(e.target.files[0]); };
        dd.querySelector('#a-exp').onclick = () => {
          const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([Store.exportar()], { type: 'application/json' }));
          a.download = 'datos-' + L.today() + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); Store.marcarCopia(); toast('Copia exportada');
        };
        dd.querySelector('#a-imp').onchange = e => {
          const f = e.target.files[0]; if (!f) return;
          f.text().then(t => {
            let j = null; try { j = JSON.parse(t); } catch (er) {}
            if (j && j.tipo === 'cribado' && j.cribado) { const n = UI.fusionarCribado(j.cribado); cerrar(); render(); return toast(n + ' cribado(s) añadidos; el resto de tus datos no se ha tocado'); }
            if (Store.get().posiciones.length && !confirm('Esto reemplaza los datos de este dispositivo (se guarda una copia previa). ¿Continuar?')) return;
            try { Store.importar(t); cerrar(); render(); toast('Datos importados'); } catch (err) { return toast('No se pudo importar: ' + err.message); }
            Store.cargarPreciosAuto().then(n => { if (n) render(); });   // el archivo trae precios y divisas de cuando se exportó: se ponen al día ya, no al recargar
          });
        };
      });
  }

  /* ───── Informes anuales (índice generado en tu PC por herramientas/indice_informes.py) ───── */
  let filtroInf = '', infLista = [];
  const ESTADO_TXT = { cartera: 'En cartera', watchlist: 'Watchlist', otra: 'Otra' };
  function vistaInformes() {
    const d = Store.get(), I = L.informes(d);
    if (!I) return '<div class="card empty"><h2>Informes anuales</h2><p>Aquí verás los informes que ya has descargado con <code>informes_anuales.py</code>: años disponibles, enlaces y cifras clave.</p>' +
      '<p class="small">1) En tu PC ejecuta <code>python herramientas/indice_informes.py</code> (genera <code>indice_informes.json</code>).<br>2) En ⚙ Ajustes pulsa «Cargar índice de informes» y elige ese archivo.</p><button class="btn" data-a="ajustes">Abrir ajustes</button></div>';
    const q = L.norm(filtroInf); infLista = I.lista;
    const filas = I.lista.map((e, i) => ({ e, i })).filter(x => !q || L.norm(x.e.nombre + ' ' + (x.e.tk || '')).includes(q));
    let h = '<div class="tools"><input id="qi" type="search" placeholder="Buscar empresa o ticker" value="' + esc(filtroInf) + '"></div>' +
      '<p class="mut small">Índice del ' + esc((I.generado || '').slice(0, 10)) + ' · ' + I.lista.length + ' empresas con informes. Para actualizarlo, vuelve a ejecutar el script en tu PC y cárgalo en ⚙.</p>';
    if (I.avisos.length) h += '<div class="alert warn"><b>Avisos del índice (' + I.avisos.length + ')</b><br>' + I.avisos.map(x => esc(x)).join('<br>') + '</div>';
    h += '<div class="card">' + (filas.length ? filas.map(({ e, i }) => {
      const pill = e.estado === 'cartera' ? 'ok' : e.estado === 'watchlist' ? 'warn' : '';
      return '<div class="row click" data-inf="' + i + '"><div class="main"><div class="name">' + esc(e.nombre) + '</div><div class="meta">' + esc(e.tk || '') + ' · ' + e.documentos.length + ' informes · último ' + esc(e.ultimo_anio || '—') + ((e.trimestrales || []).length ? ' · trimestral ' + esc(e.trimestrales[e.trimestrales.length - 1].periodo) : '') + (e.datos && e.datos.anios ? ' · con cifras' : '') + '</div></div>' +
        '<div class="num"><span class="pill ' + pill + '">' + ESTADO_TXT[e.estado] + '</span>' + (e.desactualizado ? '<div class="meta down">falta el último</div>' : '') + '</div></div>';
    }).join('') : '<div class="empty">Sin coincidencias.</div>') + '</div>';
    const libres = I.lista.filter(e => e.estado === 'otra');
    if (I.sin.length) h += '<div class="sec-t"><h2>Sin informes descargados</h2></div><div class="card">' + I.sin.map(o =>
      '<div class="row"><div class="main"><div class="name">' + esc(o.nombre) + '</div><div class="meta">Ejecuta: <code>python informes_anuales.py ' + esc(o.tk || o.nombre) + '</code></div>' +
      (libres.length && o.tk ? '<select data-vinc="' + esc(o.tk) + '" style="margin-top:6px;max-width:100%"><option value="">Ya tengo la carpeta: vincular a…</option>' + libres.map(e => '<option value="' + esc(e.carpeta) + '">' + esc(e.nombre) + '</option>').join('') + '</select>' : '') +
      '</div><span class="pill ' + (o.estado === 'cartera' ? 'ok' : 'warn') + '">' + ESTADO_TXT[o.estado] + '</span></div>').join('') + '</div>' +
      '<p class="small mut">Si una empresa tiene carpeta pero aparece aquí, vincúlala con el desplegable (el nombre de la carpeta no coincide con el de la posición).</p>';
    return h;
  }
  function detalleInforme(i) {
    const e = infLista[i]; if (!e) return;
    const dt = e.datos && e.datos.metricas && e.datos.anios ? e.datos : null;
    const f = (v, m) => v == null ? '—' : nf(v, /%|\/|BPA/.test(m) ? 2 : 0), tr = (e.trimestrales || []).slice().reverse();
    dlg('<h2>' + esc(e.nombre) + '</h2><p class="mut small">' + esc(e.tk || '') + (e.ident ? ' · ' + esc(e.ident) : '') + '</p>' + (UI.enlaces ? UI.enlaces(e.tk, 'inf') : '') +
      '<h3>Informes anuales</h3><div>' + e.documentos.slice().reverse().map(x =>
        '<div class="row"><div class="main"><div class="name">' + esc(x.anio) + ' · ' + esc(x.tipo || '') + (x.idioma ? ' (' + esc(x.idioma) + ')' : '') + '</div><div class="meta">' + esc(x.archivo || 'solo enlace') + (x.kb ? ' · ' + nf(x.kb / 1024, 1) + ' MB' : '') + '</div></div>' +
        (urlSegura(x.url) ? '<a class="btn sec sm" href="' + esc(urlSegura(x.url)) + '" target="_blank" rel="noopener">Abrir original</a>' : '') + '</div>').join('') + '</div>' +
      '<p class="small mut">Los PDF están en tu PC: carpeta «' + esc(e.carpeta) + '».</p>' +
      (tr.length ? '<h3 style="margin-top:12px">Resultados trimestrales</h3><div>' + tr.map((x, n) => '<div class="row"><div class="main"><div class="name">' + esc(x.periodo) + '</div><div class="meta">' + esc(x.archivo) + (x.kb ? ' · ' + nf(x.kb / 1024, 1) + ' MB' : '') + '</div></div>' + (e.tk ? '<button class="btn sm" data-trim="' + esc(x.periodo) + '">Revisar vs. valoración</button>' : '') + '</div>').join('') + '</div><p class="small mut">«Revisar» abre la revisión de ese trimestre (pestaña Resultados): compara el ritmo de los últimos 12 meses con lo que esperaba tu valoración.</p>' : (e.tk ? '<p class="small mut">Sin resultados trimestrales en la carpeta. Si dejas uno (p. ej. <code>presentation-3Q-2026.pdf</code>) y vuelves a ejecutar indice_informes.py, aparecerá aquí.</p>' : '')) +
      (dt ? '<h3 style="margin-top:12px">Cifras clave (' + esc(dt.divisa || '') + ' millones)</h3><div style="overflow:auto"><table style="border-collapse:collapse;font-size:13px;width:100%"><tr><th></th>' + dt.anios.map(a => '<th style="text-align:right;padding:3px 6px">' + a + '</th>').join('') + '</tr>' +
        Object.keys(dt.metricas).map(m => '<tr><td style="padding:3px 6px 3px 0;white-space:nowrap">' + esc(m) + '</td>' + dt.metricas[m].map(v => '<td style="text-align:right;padding:3px 6px">' + f(v, m) + '</td>').join('') + '</tr>').join('') + '</table></div>' +
        '<p class="small mut">Detalle completo en ' + esc(e.csv || 'el CSV') + '.</p>' : '') +
      '<div class="acts"><button class="btn sec" data-a="cerrar">Cerrar</button>' + (e.tk ? '<button class="btn sec" id="inf-ia">Completar con IA</button>' : '') + (dt && e.tk ? '<button class="btn" id="inf-ficha">Crear ficha y cribado con estas cifras</button>' : '') + '</div>', dd => {
        const b = dd.querySelector('#inf-ficha'); if (b) b.onclick = () => { if (UI.fichaDeInformes(e)) cerrar(); };
        const c = dd.querySelector('#inf-ia'); if (c) c.onclick = () => { cerrar(); UI.completarIA(e); };
        dd.querySelectorAll('[data-trim]').forEach(b => { b.onclick = () => { const p = b.dataset.trim; cerrar(); UI.revisarTrimestre(e.tk, p); }; });
      });
  }
  function cargarIndiceInformes(file) {
    file.text().then(t => {
      try {
        const o = JSON.parse(t); if (!o || !Array.isArray(o.empresas)) throw new Error('no parece un indice_informes.json');
        Store.get().informes = o; Store.save(); cerrar(); render(); toast('Índice cargado: ' + o.empresas.length + ' empresas');
      } catch (err) { toast('No se pudo cargar: ' + err.message); }
    });
  }

  /* ───── Drive ───── */
  const TXT = { off: 'Sin conectar. Conecta para tener los mismos datos en el móvil y en el PC.', on: 'Conectado', sync: 'Sincronizando…', reconectar: 'Hay que volver a dar permiso (toca el icono ☁).', error: 'Error', conflicto: 'Hay cambios distintos en Drive y aquí.' };
  function textoDrive() { const e = Drive.estado(); return esc((TXT[e.estado] || '') + (e.detalle && e.estado !== 'off' ? ' · ' + e.detalle : '')); }
  /* Cabecera: cuántas posiciones, de cuándo son los precios y cómo está Drive */
  function hace(t) {
    const m = Math.round((Date.now() - Date.parse(t)) / 60000); if (!isFinite(m)) return '';
    return m < 2 ? 'ahora' : m < 60 ? 'hace ' + m + ' min' : m < 24 * 60 ? 'hace ' + Math.round(m / 60) + ' h' : 'del ' + new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'numeric' });
  }
  const DRV = { on: 'Drive al día', sync: 'sincronizando…', reconectar: 'Drive: reconectar', error: 'Drive: error', conflicto: 'Drive: elegir versión' };
  function pintaSub() {
    const d = Store.get(); if (!d) return;
    const pi = Store.preciosInfo(), e = Drive.estado(), partes = [d.posiciones.length ? d.posiciones.length + ' posiciones' : 'sin datos'];
    if (pi && pi.generado) partes.push('precios ' + hace(pi.generado));
    if (e.conectado && DRV[e.estado]) partes.push(DRV[e.estado]);
    $('#sub').textContent = partes.join(' · '); $('#sub').title = 'Divisas del ' + (d.ajustes.fx.fecha || '—') + (pi && pi.generado ? ' · precios automáticos del ' + new Date(pi.generado).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '');
  }
  function pintaSync(est) {
    pintaSub();
    const b = $('#btn-sync'); b.className = 'icon-btn ' + est; b.title = 'Drive: ' + textoDrive();
    const t = document.getElementById('dr-t'); if (t) t.innerHTML = textoDrive();
  }
  function preguntarConflicto(lU, rU) {
    const f = t => t ? new Date(t).toLocaleString('es-ES') : 'nunca';
    return new Promise(res => {
      const d = dlg('<h2>Datos distintos</h2><p>Has cambiado datos aquí y también en Drive desde la última sincronización. No se mezclan: elige cuál conservar (el otro se pierde).</p>' +
        '<p class="small mut">Este dispositivo: ' + f(lU) + '<br>Drive: ' + f(rU) + '</p><div class="acts"><button class="btn sec" id="k-c">Decidir luego</button><button class="btn sec" id="k-d">Usar Drive</button><button class="btn" id="k-l">Usar este dispositivo</button></div>');
      d.addEventListener('close', () => res('cancelar'), { once: true });
      d.querySelector('#k-d').onclick = () => { res('drive'); cerrar(); }; d.querySelector('#k-l').onclick = () => { res('local'); cerrar(); }; d.querySelector('#k-c').onclick = () => { res('cancelar'); cerrar(); };
    });
  }

  /* ───── Pestañas pendientes ───── */
  const PEND = {
    cribado: ['Cribado', 'Checklist pass / no-pass para decidir qué empresas merecen un análisis profundo. Llega en la fase 4.'],
    valoracion: ['Valoración', 'Fichas, escenarios y precio objetivo a 5 años (el motor ya funciona: alimenta el Inicio). La edición de fichas llega en la fase 4.'],
    resultados: ['Resultados trimestrales', 'Calendario y revisión de resultados de posiciones y watchlist. Llega en la fase 4.']
  };

  function render() {
    const d = Store.get(); if (!d) return;
    Store.foto();   // foto del día del valor (solo guarda si cambia); antes de dibujar, para que el gráfico la incluya
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    const v = $('#vista'), keep = document.activeElement && document.activeElement.id === 'q';
    const keepI = document.activeElement && document.activeElement.id === 'qi';
    try {
      v.innerHTML = tab === 'inicio' ? vistaInicio() : tab === 'cartera' ? vistaCartera() : tab === 'informes' ? vistaInformes() : UI.vistas[tab] ? UI.vistas[tab]() :
        '<div class="card empty"><h2>' + PEND[tab][0] + '</h2><p>' + PEND[tab][1] + '</p></div>';
    } catch (err) {   // un fallo al dibujar una pestaña no debe dejarla en blanco sin explicación
      console.error(err); v.innerHTML = '<div class="alert bad"><b>Error al mostrar esta pestaña:</b> ' + esc(err && err.message || String(err)) + '<br><small>Tus datos están intactos. Cuéntame este mensaje y la pestaña (versión ' + esc(APP_VERSION) + ').</small></div>';
    }
    (UI.pies[tab] || []).forEach(fn => { v.insertAdjacentHTML('beforeend', fn()); });
    pintaSub();
    if (keep) { const q = $('#q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    if (keepI) { const q = $('#qi'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }

  document.addEventListener('click', e => {
    for (const f of UI.clicks) if (f(e)) return;
    const t = e.target.closest('[data-tab],[data-a],[data-pos],[data-undo],[data-inf],[data-rep],[data-evo]'); if (!t) return;
    if (t.dataset.evo) { evo = t.dataset.evo; try { localStorage.setItem(EVO_K, evo); } catch (er) { } return render(); }
    if (t.dataset.rep) { rep = t.dataset.rep; try { localStorage.setItem(REP_K, rep); } catch (er) { } return render(); }
    if (t.dataset.inf != null) return detalleInforme(+t.dataset.inf);
    if (t.dataset.tab) { tab = t.dataset.tab; render(); window.scrollTo(0, 0); return; }
    if (t.dataset.pos) return detalle(+t.dataset.pos);
    if (t.dataset.undo) {
      return conDeshacer(() => L.borrarMov(Store.get(), t.dataset.undo));
    }
    const i = +t.dataset.i;
    switch (t.dataset.a) {
      case 'cerrar': cerrar(); break;
      case 'ajustes': ajustes(); break;
      case 'precios': preciosDlg(); break;
      case 'compra': formCompra(); break;
      case 'mas': { const p = Store.get().posiciones[i]; formCompra({ empresa: p.empresa, ticker: p.ticker, broker: p.broker, moneda: p.moneda, sector: p.sector }); break; }
      case 'vender': formVenta(i); break;
      case 'editar': formEditar(i); break;
      case 'precio': formPrecio(i); break;
      case 'eliminar': conDeshacer(() => L.eliminar(Store.get(), i)); break;   // sin registrar venta (para vender, «Vender»)
    }
  });
  /* Filas clicables también con teclado y lector de pantalla: foco con Tab, se abren con Intro o Espacio */
  const pulsables = () => document.querySelectorAll('.row.click:not([tabindex])').forEach(el => { el.tabIndex = 0; el.setAttribute('role', 'button'); });
  new MutationObserver(pulsables).observe(document.body, { childList: true, subtree: true }); pulsables();
  document.addEventListener('keydown', e => {
    const t = e.target; if ((e.key !== 'Enter' && e.key !== ' ') || !t.matches || !t.matches('.row.click[role="button"]')) return;
    e.preventDefault(); t.click();
  });
  document.addEventListener('input', e => { if (e.target.id === 'q') { filtro = e.target.value; render(); } if (e.target.id === 'qi') { filtroInf = e.target.value; render(); } });
  document.addEventListener('change', e => {
    const t = e.target; if (!t || !t.dataset || !t.dataset.vinc || !t.value) return;
    const A = Store.get().ajustes; A.alias_informes = A.alias_informes || {}; A.alias_informes[t.dataset.vinc] = t.value; Store.save(); render(); toast('Vinculada la carpeta a ' + t.dataset.vinc);
  });
  document.addEventListener('change', e => { if (e.target.id === 'ord') { orden = e.target.value; render(); } });
  document.addEventListener('input', e => UI.changes.forEach(f => f(e)));
  document.addEventListener('change', e => UI.changes.forEach(f => f(e)));
  $('#btn-ajustes').onclick = ajustes;
  $('#btn-sync').onclick = () => { const e = Drive.estado(); if (!e.conectado) ajustes(); else if (e.estado === 'conflicto' || e.estado === 'reconectar' || e.estado === 'error') Drive.ahora(); else toast(textoDrive()); };

  Object.assign(UI, { conDeshacer, urlSegura, lineaPrecios: () => lineaPrecios(), dlg, cerrar, toast, esc, nf, pct, money, eur, guardar, render, campo, val, cls, irA: t => { tab = t; render(); window.scrollTo(0, 0); },
    abrirPosicion: tk => { const d = Store.get(), i = d.posiciones.findIndex(p => L.tickerDe(d, p) === tk); if (i < 0) return; tab = 'cartera'; render(); window.scrollTo(0, 0); detalle(i); },
    abrirInforme: tk => { const I = L.informes(Store.get()), i = I ? I.lista.findIndex(e => (e.tk || '').toUpperCase() === String(tk).toUpperCase()) : -1; tab = 'informes'; render(); window.scrollTo(0, 0); if (i >= 0) detalleInforme(i); } });
  Store.load(); render();
  Drive.init({ onEstado: pintaSync, onDatos: () => { render(); toast('Datos actualizados desde Drive'); Store.cargarPreciosAuto().then(n => n && render()); }, preguntar: preguntarConflicto });
  if (Store.aviso()) toast(Store.aviso());
  let ultPrecios = Date.now();
  Store.cargarPreciosAuto().then(n => { if (n) { render(); toast('Precios actualizados'); } });
  document.addEventListener('visibilitychange', () => {   // si la app se queda abierta (PWA en el móvil), al volver se traen los precios si han pasado 15 min
    if (document.hidden || Date.now() - ultPrecios < 15 * 60000) return; ultPrecios = Date.now();
    Store.cargarPreciosAuto().then(n => { if (n) { render(); toast('Precios actualizados'); } else pintaSub(); });
  });
  setInterval(pintaSub, 60000);   // «precios hace X min» al día
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => { });
  // Si el servidor ya tiene una versión más nueva que la cargada, recarga una vez (evita quedarse con código viejo por cachés)
  try {
    const actual = (document.querySelector('script[src*="js/app.js"]').getAttribute('src').match(/v=(\d+)/) || [])[1];
    fetch('index.html?_=' + Date.now(), { cache: 'no-store' }).then(r => r.text()).then(t => {
      const nueva = (t.match(/js\/app\.js\?v=(\d+)/) || [])[1];
      if (actual && nueva && nueva !== actual && !sessionStorage.getItem('recarga-' + nueva)) { sessionStorage.setItem('recarga-' + nueva, '1'); (navigator.serviceWorker ? caches.keys().then(k => Promise.all(k.map(x => caches.delete(x)))) : Promise.resolve()).then(() => location.reload()); }
    }).catch(() => { });
  } catch (e) { }
})();
