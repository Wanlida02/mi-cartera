/* Pestaña Valoración: precio objetivo a 5 años, escenarios editables, control de realismo y fichas (crear, editar, importar).
   Usa el motor Val (M14) sin cambios. Las fichas viven en datos.json → fichas{TICKER} y se sincronizan con Drive. */
(function () {
  const L = Logic, V = Val, U = window.UI, { esc, nf } = U;
  const pc = v => (typeof v === 'number' && isFinite(v)) ? nf(v * 100, 1) + ' %' : '—';
  var isN = V.isN, ESC = ['conservador', 'pesimista', 'optimista'], ENAME = { conservador: 'Conservador', pesimista: 'Pesimista', optimista: 'Optimista' };
  const LINES = [['ventas', 'Ventas'], ['ebit', 'EBIT'], ['extra', 'Extraordinarios dentro del EBIT (+ ganancia, − cargo)'], ['da', 'D&A (del cash flow)'], ['intereses', 'Intereses (coste en positivo)'], ['impuestos', 'Impuestos'], ['minoritarios', 'Minoritarios'], ['otros', 'Otros: participadas y pensiones'],
    ['acciones', 'Acciones diluidas (M)'], ['capex', 'CAPEX'], ['leases', 'Pago de leases'], ['caja', 'Caja e inversiones CP'], ['deuda', 'Deuda financiera'], ['leases_deuda', 'Deuda por leases'], ['goodwill', 'Goodwill'], ['equity', 'Patrimonio (matriz)'], ['ni_reportado', 'Beneficio neto reportado (control)']];
  const LINES_FIN = [['ni', 'Beneficio neto (ordinarios)'], ['extra', 'Extraordinarios tras impuestos'], ['equity', 'Patrimonio (matriz)'], ['goodwill', 'Goodwill'], ['intangibles', 'Otros intangibles'], ['preferentes', 'Preferentes'],
    ['dividendos', 'Dividendos pagados'], ['recompras', 'Recompras'], ['acciones', 'Acciones diluidas (M)'], ['deuda', 'Deuda financiera (arrendadores)'], ['acciones_cierre', 'Acciones al cierre (opcional)'], ['emisiones', 'Emisiones de capital (opcional)']];
  const linesOf = f => (f.tipo && f.tipo !== 'industrial') ? LINES_FIN : LINES;
  const D = () => Store.get(), hoy = () => L.today(), clone = o => JSON.parse(JSON.stringify(o));
  let sel = null, filtro = '', abiertos = { esc: 1, res: 1, real: 1, dat: 0, fit: 1, proj: 0 };

  const enCartera = tk => D().posiciones.some(p => L.tickerDe(D(), p) === tk);
  const estadoDe = tk => enCartera(tk) ? 'cartera' : (D().fichas[tk].estado === 'candidata' ? 'candidata' : 'watchlist');
  const fichaCon = tk => { const d = D(), f = d.fichas[tk], p = L.precioFicha(d, tk); return Object.assign(clone(f), { precio: p.precio, fecha_precio: p.fecha }); };
  const escDe = (f, s) => Object.assign({}, V.defaults(f)[s], (f.escenarios || {})[s] || {});
  const tono = (v, a) => v == null ? '' : v >= a.umbral_barata / 100 ? 'ok' : v <= a.umbral_cara / 100 ? 'bad' : '';

  /* ───── Lista ───── */
  function vistaLista() {
    const d = D(), a = d.ajustes, q = L.norm(filtro), ks = Object.keys(d.fichas).filter(k => !q || L.norm(k + ' ' + (d.fichas[k].nombre || '')).includes(q));
    const filas = ks.map(k => ({ k, est: estadoDe(k), v: L.valoracion(d, k, hoy()) })).filter(x => x.v);
    const grupos = [['cartera', 'En cartera'], ['watchlist', 'Watchlist'], ['candidata', 'Candidatas']];
    let h = '<div class="tools"><button class="btn" data-v="nueva">+ Nueva ficha</button><input id="v-q" type="search" placeholder="Buscar" value="' + esc(filtro) + '"></div>';
    grupos.forEach(([g, t]) => {
      const rows = filas.filter(x => x.est === g).sort((x, y) => (y.v.ref == null ? -9 : y.v.ref) - (x.v.ref == null ? -9 : x.v.ref));
      if (!rows.length) return;
      h += '<h3 style="margin:14px 2px 6px">' + t + ' <span class="mut small">' + rows.length + '</span></h3><div class="card">' + rows.map(({ k, v }) => {
        if (v.noSoportado || v.error) return '<div class="row click" data-v="abrir" data-k="' + esc(k) + '"><div class="main"><div class="name">' + esc(v.nombre) + '</div><div class="meta">' + esc(k) + (v.error ? ' · error: ' + esc(v.error) : ' · tipo no soportado') + '</div></div></div>';
        return '<div class="row click" data-v="abrir" data-k="' + esc(k) + '"><div class="main"><div class="name">' + esc(v.nombre) + (v.graves ? ' <span class="pill warn">datos dudosos</span>' : '') + '</div>' +
          '<div class="meta">' + esc(k) + ' · ' + nf(v.precio, 2) + ' ' + esc(v.divisa) + (v.entrada ? ' · entrada ' + nf(v.entrada, 2) : '') + '</div></div>' +
          '<div class="num"><span class="pill ' + tono(v.ref, a) + '">' + (v.ref == null ? '—' : pc(v.ref)) + '</span><div class="meta">anual · 5 años</div></div></div>';
      }).join('') + '</div>';
    });
    if (!filas.length) h += '<div class="card empty">' + (ks.length ? 'Sin resultados.' : 'Aún no hay fichas. Importa tus datos o crea una nueva.') + '</div>';
    return h;
  }

  /* ───── Detalle ───── */
  const sec = (id, t, cnt, body) => '<details class="card sec2" data-v-sec="' + id + '"' + (abiertos[id] ? ' open' : '') + '><summary><b>' + t + '</b> <span class="mut small">' + (cnt || '') + '</span></summary>' + body + '</details>';
  function numIn(attrs, v, step) { return '<input type="number" step="' + (step || 'any') + '" inputmode="decimal" ' + attrs + ' value="' + (isN(v) ? +(+v).toFixed(3) : '') + '">'; }
  function vistaDetalle() {
    const d = D(), a = d.ajustes, f0 = d.fichas[sel]; if (!f0) { sel = null; return vistaLista(); }
    const f = fichaCon(sel), fin = V.isFin(f), mo = V.esMO(f), o = a.objetivo, m = a.minimo;
    let h = '<button class="btn sec sm" data-v="volver">← Valoración</button>';
    if (!V.soportado(f)) return h + '<div class="alert warn" style="margin-top:10px">Este tipo de empresa (REIT) no está soportado por el método de valoración.</div>' + acciones(f);
    if (!isN(f.precio)) return h + '<h2 style="margin:12px 0 4px">' + esc(sel) + ' — ' + esc(f.nombre || '') + '</h2><div class="alert warn" style="margin-top:10px">La ficha no tiene precio. Ponlo y revisa los datos para ver la valoración.</div><div class="tools"><button class="btn" data-v="precio">Poner precio</button></div>' + acciones(f);
    let R, fi, act; const sc = {};
    try { ESC.forEach(s => { sc[s] = escDe(f, s); R = R || {}; R[s] = V.proyectar(f, sc[s]); }); fi = V.fiabilidad(f, hoy()); act = V.actuales(f); }
    catch (e) { return h + '<div class="alert bad" style="margin-top:10px">No se pudo calcular: ' + esc(e.message) + '</div><div class="tools"><button class="btn sec sm" data-v="datos">Revisar datos</button></div>' + acciones(f); }
    const cons = R.conservador, ref5 = cons.cagr[5].ref, pe = V.precioEntrada(f, cons, o / 100), pt = V.precioEntrada(f, cons, m / 100);
    let t = 'r', title = 'Cara frente a su valor', sub;
    if (ref5 >= o / 100) { t = 'g'; title = 'Compra: supera tu objetivo'; sub = 'Rentabilidad anual esperada a 5 años: ' + pc(ref5) + ' (objetivo ' + nf(o, 0) + ' %).'; }
    else if (ref5 >= m / 100) { t = 'y'; title = 'Watchlist: buena empresa, precio justo'; sub = 'Rentabilidad esperada ' + pc(ref5) + ': sobre tu mínimo (' + nf(m, 0) + ' %) pero bajo el objetivo. Compra por debajo de ' + nf(pe, 2) + '.'; }
    else sub = 'Rentabilidad esperada ' + pc(ref5) + ', bajo tu mínimo del ' + nf(m, 0) + ' %. Si la tienes, candidata a vender por sobrevaloración.';
    if (fi.graves) sub += ' Provisional: hay avisos graves en los datos.';
    if (fi.nivel !== 'profunda') sub += ' Valoración rápida: ' + (fi.nP + fi.nE) + ' de ' + (fi.nA + fi.nP + fi.nE) + ' líneas críticas sin contrastar con el informe anual.';
    if (mo) sub += ' Depende de una hipótesis de margen futuro.';
    const dp = L.diasDesde(f.fecha_precio, hoy());
    h += '<div class="card" style="margin-top:10px;border-left:6px solid var(--' + { g: 'ok', y: 'warn', r: 'bad' }[t] + ')"><div class="meta">' + esc(sel) + ' — ' + esc(f.nombre || '') + ' · ' + estadoDe(sel) + '</div><h2 style="font-size:21px;margin:4px 0">' + title + '</h2><p style="margin:0 0 8px">' + sub + '</p>' +
      '<p class="small mut" style="margin:0 0 8px">En el pesimista: ' + pc(R.pesimista.cagr[5].ref) + ' anual · en el optimista: ' + pc(R.optimista.cagr[5].ref) + '</p>' +
      '<div class="kpis"><div class="kpi"><span>Precio actual</span><b>' + nf(f.precio, 2) + '</b><span>' + esc(f.divisa) + (dp != null ? ' · hace ' + dp + ' d' : '') + '</span></div><div class="kpi"><span>Objetivo a 5 años</span><b>' + nf(cons.po[5].ref, 2) + '</b></div>' +
      '<div class="kpi"><span>Entrada para ' + nf(o, 0) + ' %</span><b>' + (pe ? nf(pe, 2) : '—') + '</b></div><div class="kpi"><span>Máximo para ' + nf(m, 0) + ' %</span><b>' + (pt ? nf(pt, 2) : '—') + '</b></div></div></div>' +
      '<div class="tools"><button class="btn sm" data-v="precio">Precio</button><button class="btn sec sm" data-v="datos">Editar datos</button><button class="btn sec sm" data-v="reset">Restablecer supuestos</button></div>';
    // escenarios
    const P = fin ? [['rote', 'ROTE (%)', 100, .5], ['pdiv', 'Dividendos (% beneficio)', 100, 2.5], ['prec', 'Recompras (% beneficio)', 100, 2.5], ['per', 'PER', 1, .5], ['ptbv', 'P/TBV', 1, .1], ['ke', 'Coste del capital (%)', 100, .5], ['gt', 'Crecimiento largo plazo (%)', 100, .5]] :
      [['g', 'Crecimiento ventas (%/año)', 100, .5], ...(mo ? [['m0', 'Margen EBIT inicial (%)', 100, .5], ['m', 'Margen EBIT objetivo año 5 (%)', 100, .5]] : [['m', 'Margen EBIT (%)', 100, .5]]), ['t', 'Tipo impositivo (%)', 100, .5], ['acc', 'Variación acciones (%/año)', 100, .25], ['per', 'PER', 1, .5], ['pfcf', 'P/FCF', 1, .5], ['ev_ebitda', 'EV/EBITDA', 1, .5], ['ev_ebit', 'EV/EBIT', 1, .5]];
    h += sec('esc', 'Escenarios y supuestos', 'edita cualquier celda', (mo ? '' : '<p class="small"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-v-cic' + (f.ciclica ? ' checked' : '') + ' style="width:auto;min-height:0"> Tratar como cíclica (usa la media de todo el ciclo y restablece supuestos)</label></p>') +
      '<div class="tw"><table class="tbl"><thead><tr><th></th>' + ESC.map(s => '<th>' + ENAME[s] + '</th>').join('') + '</tr></thead><tbody>' +
      P.map(([k, n, mul, st]) => '<tr><td>' + esc(n) + '</td>' + ESC.map(s => '<td>' + numIn('data-sc="' + s + '" data-k="' + k + '" data-mul="' + mul + '" aria-label="' + ENAME[s] + ' ' + esc(n) + '"', isN(sc[s][k]) ? sc[s][k] * mul : null, st) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>');
    // resultados
    const rows = fin ? [['PER', r => r.po[5].per, 'po'], ['P/TBV (tope ROE)', r => r.po[5].ptbv, 'po'], ['Referencia', r => r.po[5].ref, 'po', 1], ['PER · 5 años', r => r.cagr[5].per, 'c'], ['P/TBV · 5 años', r => r.cagr[5].ptbv, 'c'], ['Referencia · 3 años', r => r.cagr[3].ref, 'c', 1], ['Referencia · 5 años', r => r.cagr[5].ref, 'c', 1]] :
      [['PER', r => r.po[5].per, 'po'], ['P/FCF', r => r.po[5].pfcf, 'po'], ['EV/EBITDA', r => r.po[5].ev_ebitda, 'po'], ['EV/EBIT', r => r.po[5].ev_ebit, 'po'], ['Referencia', r => r.po[5].ref, 'po', 1],
        ['PER o P/FCF · 5 años', r => r.cagr[5].perpfcf, 'c'], ['EV/EBITDA · 5 años', r => r.cagr[5].ev_ebitda, 'c'], ['EV/EBIT · 5 años', r => r.cagr[5].ev_ebit, 'c'], ['Referencia · 3 años', r => r.cagr[3].ref, 'c', 1], ['Referencia · 5 años', r => r.cagr[5].ref, 'c', 1]];
    h += sec('res', 'Precio objetivo y rentabilidad', 'objetivo ' + nf(o, 0) + ' % · mínimo ' + nf(m, 0) + ' %', '<div class="tw"><table class="tbl"><thead><tr><th></th>' + ESC.map(s => '<th>' + ENAME[s] + '</th>').join('') + '</tr></thead><tbody>' +
      rows.map(r => '<tr' + (r[3] ? ' style="font-weight:700"' : '') + '><td>' + r[0] + '</td>' + ESC.map(s => { const v = r[1](R[s]); return r[2] === 'po' ? '<td>' + nf(v, 2) + '</td>' : '<td class="c-' + (isN(v) ? (v >= o / 100 ? 'g' : v >= m / 100 ? 'y' : 'r') : '') + '">' + (isN(v) ? pc(v) : '—') + '</td>'; }).join('') + '</tr>').join('') + '</tbody></table></div><p class="small mut">Precios en ' + esc(f.divisa) + '. Las rentabilidades incluyen dividendo.</p>');
    // realismo
    const al = []; ESC.forEach(s => { V.realismo(f, sc[s], s, act).forEach(x => al.push({ n: s === 'optimista' && x.nivel === 'r' ? 'y' : x.nivel, txt: ENAME[s] + ': ' + x.txt })); });
    let extra = '';
    if (!fin) {
      const dcf = V.dcfInverso(f, 0.10, 0.03), gh = V.cagr(f.hist.ventas, 5);
      if (dcf) extra += '<li class="y"><b>DCF inverso</b>: con 10 % exigido y 3 % a perpetuidad, el precio descuenta un crecimiento del FCF de ' + (dcf.g == null ? 'más de un 60 %' : pc(dcf.g)) + ' anual 10 años. Ventas históricas a 5 años: ' + pc(gh) + '. Solo contraste.</li>';
      const mio = V.margenImplicito(f, sc.conservador, o / 100);
      extra += '<li class="y"><b>Margen implícito</b>: para ganar un ' + nf(o, 0) + ' % anual el margen EBIT tendría que ser ' + (mio == null ? 'imposible (>95 %)' : pc(mio)) + '. Solo contraste.</li>';
    }
    h += sec('real', 'Control de realismo', al.length ? al.length + ' aviso(s)' : 'sin avisos', '<ul class="al crl">' + (al.length ? al.map(x => '<li class="cr s-' + x.n + '"><span class="bdg">' + ({ g: '✓', y: '!', r: '✕' }[x.n] || '!') + '</span><div>' + esc(x.txt) + '</div></li>').join('') : '<li class="cr s-g"><span class="bdg">✓</span><div>Los supuestos están dentro de lo que la empresa ha hecho.</div></li>') + extra + '</ul>');
    // fiabilidad
    h += sec('dat', 'Fiabilidad de los datos', fi.puntuacion + ' % · ' + fi.nivel, '<ul class="crl">' + (fi.avisos.length ? fi.avisos.map(x => '<li class="cr s-' + x.nivel + '"><span class="bdg">' + ({ g: '✓', y: '!', r: '✕' }[x.nivel] || '!') + '</span><div>' + esc(x.txt) + '</div></li>').join('') : '<li class="cr s-g"><span class="bdg">✓</span><div>Sin avisos.</div></li>') + '</ul>' +
      (f.fecha_datos ? '<p class="small mut">Datos de ' + esc(f.fecha_datos) + (f.fuentes && f.fuentes.length ? ' · ' + esc(f.fuentes.join(', ')) : '') + '</p>' : '') + (Array.isArray(f.notas) && f.notas.length ? '<details><summary class="small">Notas de la ficha (' + f.notas.length + ')</summary><ul class="small">' + f.notas.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul></details>' : ''));
    return h + acciones(f);
  }
  const acciones = f => '<div class="tools" style="margin-top:12px"><button class="btn sec sm" data-v="estado">' + (estadoDe(sel) === 'cartera' ? 'Está en cartera' : estadoDe(sel) === 'candidata' ? 'Pasar a watchlist' : 'Marcar candidata') + '</button><button class="btn sec sm" data-v="copiar">Copiar ficha (JSON)</button><button class="btn sec sm" data-v="borrar">Eliminar ficha</button></div>';

  U.vistas.valoracion = () => sel ? vistaDetalle() : vistaLista();

  /* ───── Diálogos ───── */
  function precioDlg() {
    const d = D(), f = d.fichas[sel], p = L.precioFicha(d, sel);
    U.dlg('<h2>Precio · ' + esc(sel) + '</h2><p class="small mut">Ahora: ' + nf(p.precio, 2) + ' ' + esc(f.divisa) + (p.fecha ? ' (' + esc(p.fecha) + ')' : '') + '. El precio automático se actualiza solo; uno manual vale hasta que haya otro más reciente.</p>' + U.campo('v-px', 'Precio (' + esc(f.divisa) + ')', '', 'number') +
      '<div class="acts"><button class="btn sec" data-a="cerrar">Cancelar</button><button class="btn" id="v-px-ok">Guardar</button></div>', dd => {
      dd.querySelector('#v-px-ok').onclick = () => { const v = parseFloat(U.val('v-px').replace(',', '.')); if (!(v > 0)) return U.toast('Precio no válido');
        d.precios[sel + '@ficha'] = { ticker: sel, precio: v, divisa: f.divisa, fecha_precio: hoy(), fuente: 'manual', actualizado: new Date().toISOString() }; f.precio = v; f.fecha_precio = hoy(); U.guardar({ ok: true, msg: 'Precio guardado' }); }; });
  }
  function datosDlg() {
    const f = D().fichas[sel], h = f.hist, an = f.anios || [];
    const fin = V.isFin(f), CR = [['A', 'Informe anual'], ['P', 'Fuente pública'], ['E', 'Estimado']];
    U.dlg('<h2>Datos · ' + esc(sel) + '</h2><p class="small mut">Importes en millones. Marca «Informe anual» cuando lo hayas contrastado con el documento. Desliza la tabla para ver todos los años.</p>' +
      '<div class="f2">' + U.campo('v-nom', 'Nombre', f.nombre || '') + U.campo('v-div', 'Dividend yield (%)', isN(f.dividend_yield) ? +(f.dividend_yield * 100).toFixed(2) : '', 'number') + '</div>' +
      '<div class="tw"><table class="tbl"><thead><tr><th>Línea</th>' + an.map(a => '<th>' + a + '</th>').join('') + '<th>Origen</th></tr></thead><tbody>' +
      linesOf(f).map(([k, n]) => '<tr><td style="min-width:150px">' + esc(n) + '</td>' + an.map((a, j) => '<td>' + numIn('class="hc" data-k="' + k + '" data-j="' + j + '" style="min-width:78px"', h[k] && h[k][j]) + '</td>').join('') + '<td><select data-cf="' + k + '">' + CR.map(([c, t]) => '<option value="' + c + '"' + ((f.conf || {})[k] === c ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></td></tr>').join('') + '</tbody></table></div>' +
      '<div class="acts"><button class="btn sec" data-a="cerrar">Cancelar</button><button class="btn" id="v-ds">Guardar</button></div>', dd => {
      dd.querySelector('#v-ds').onclick = () => {
        const g = clone(f); g.nombre = U.val('v-nom') || g.nombre; const dy = parseFloat(U.val('v-div').replace(',', '.')); if (isFinite(dy)) g.dividend_yield = dy / 100; else delete g.dividend_yield;
        dd.querySelectorAll('.hc').forEach(el => { const k = el.dataset.k, j = +el.dataset.j, v = el.value.trim() === '' ? null : parseFloat(el.value.replace(',', '.')); if (!g.hist[k]) g.hist[k] = an.map(() => null); g.hist[k][j] = isFinite(v) ? v : null; });
        g.conf = g.conf || {}; dd.querySelectorAll('[data-cf]').forEach(el => { g.conf[el.dataset.cf] = el.value; });
        g.fecha_datos = hoy(); delete g._borrador; D().fichas[sel] = g; U.guardar({ ok: true, msg: 'Datos guardados' }); };
    });
  }
  const KEYS = f => linesOf(f).map(x => x[0]);
  function schemaTxt(fin) {
    return 'Responde SOLO con un JSON (sin texto fuera del JSON) con este formato:\n{"nombre":"...","divisa":"USD","leases_ok":true,"anios":[2021,2022,2023,2024,2025],"hist":{' + (fin ? LINES_FIN : LINES).map(x => '"' + x[0] + '":[n,n,n,n,n]').join(',') +
      '},"precio_actual":n,"dividend_yield":0.0,"notas":["avisos útiles: reexpresiones, partidas puntuales…"],"dudas":["cifras de las que no estés seguro"]}\nCada serie tiene EXACTAMENTE tantos valores como "anios" (orden ascendente, años de cierre del ejercicio) y null donde falte el dato. Importes en MILLONES de la divisa de reporte; acciones en millones; intereses, impuestos y capex en positivo. ' +
      'Usa solo datos de los informes anuales (10-K/20-F/memoria) y no inventes ninguno. Deja null lo que no encuentres.';
  }
  function nuevaDlg() {
    U.dlg('<h2>Nueva ficha</h2><div class="f2">' + U.campo('n-tk', 'Ticker', '', 'text', 'autocapitalize="characters"') + U.campo('n-nom', 'Nombre', '') + U.campo('n-div', 'Divisa de reporte', 'USD') +
      '<div><label for="n-tipo">Tipo</label><select id="n-tipo"><option value="industrial">Empresa normal</option><option value="banco">Banco</option><option value="seguro">Aseguradora</option><option value="arrendador">Arrendador</option></select></div></div>' +
      '<p class="small mut">Crea la ficha vacía y rellena las cuentas a mano, o pega el JSON de una IA (usa «Copiar prompt», pégalo en el asistente junto con el informe anual y vuelve con la respuesta).</p>' +
      '<div class="tools"><button class="btn sec sm" id="n-cp">Copiar prompt</button></div><label>JSON de la IA (opcional)</label><textarea id="n-json" rows="5" placeholder="{...}"></textarea>' +
      '<div class="acts"><button class="btn sec" data-a="cerrar">Cancelar</button><button class="btn" id="n-ok">Crear</button></div>', dd => {
      dd.querySelector('#n-cp').onclick = async () => { const t = schemaTxt(dd.querySelector('#n-tipo').value !== 'industrial'); try { await navigator.clipboard.writeText(t); U.toast('Prompt copiado'); } catch (e) { dd.querySelector('#n-json').value = t; U.toast('Copia el texto del recuadro'); } };
      dd.querySelector('#n-ok').onclick = () => {
        const tk = U.val('n-tk').toUpperCase().replace(/[^A-Z0-9_\-.~:@+]/g, ''); if (!tk) return U.toast('Escribe el ticker'); if (D().fichas[tk]) return U.toast('Ya existe una ficha de ' + tk);
        const tipo = dd.querySelector('#n-tipo').value, fin = tipo !== 'industrial'; let o = {};
        const raw = dd.querySelector('#n-json').value.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
        if (raw) { try { o = JSON.parse(raw); } catch (e) { return U.toast('JSON no válido: ' + e.message); } }
        const an = Array.isArray(o.anios) && o.anios.length ? o.anios.map(Number) : (() => { const y = new Date().getFullYear() - 1; return [y - 4, y - 3, y - 2, y - 1, y]; })(), n = an.length;
        const f = { ticker: tk, nombre: o.nombre || U.val('n-nom') || tk, divisa: (o.divisa || U.val('n-div') || 'USD').toUpperCase(), anio_base: an[n - 1], anios: an, leases_ok: fin ? true : o.leases_ok !== false, hist: {}, conf: {}, fuentes: [], notas: [].concat(o.notas || [], (o.dudas || []).map(x => 'Duda de la extracción: ' + x)), fecha_datos: hoy(), _borrador: true };
        if (fin) f.tipo = tipo;
        KEYS(f).forEach(k => { const s = o.hist && Array.isArray(o.hist[k]) ? o.hist[k] : null; if (s && s.length !== n) return U.toast('La serie ' + k + ' tiene ' + s.length + ' valores y hay ' + n + ' años'), (f._err = 1); f.hist[k] = s ? s.map(v => isN(v) ? v : null) : an.map(() => null); f.conf[k] = s && s.some(isN) ? 'P' : 'E'; });
        if (f._err) return;
        if (isN(o.precio_actual)) { f.precio = o.precio_actual; f.fecha_precio = hoy(); f.fuente_precio = 'asistente de IA'; } if (isN(o.dividend_yield)) f.dividend_yield = o.dividend_yield;
        D().fichas[tk] = f; sel = tk; U.guardar({ ok: true, msg: 'Ficha creada' + (raw ? '' : ': rellena las cuentas en «Editar datos»') });
      };
    });
  }

  /* ───── Eventos ───── */
  const restore = fn => { const y = window.scrollY; fn(); U.render(); window.scrollTo(0, y); };
  U.clicks.push(e => {
    const t = e.target.closest('[data-v]'); if (!t) return false; const a = t.dataset.v, d = D();
    if (a === 'nueva') nuevaDlg();
    else if (a === 'abrir') { sel = t.dataset.k; U.render(); window.scrollTo(0, 0); }
    else if (a === 'volver') { sel = null; U.render(); }
    else if (a === 'precio') precioDlg();
    else if (a === 'datos') datosDlg();
    else if (a === 'reset') { delete d.fichas[sel].escenarios; Store.save(); restore(() => {}); U.toast('Supuestos restablecidos'); }
    else if (a === 'estado') { const f = d.fichas[sel], e0 = estadoDe(sel); if (e0 === 'cartera') U.toast('Está en tu cartera: se gestiona en la pestaña Cartera'); else { if (e0 === 'candidata') delete f.estado; else f.estado = 'candidata'; Store.save(); restore(() => {}); } }
    else if (a === 'copiar') { const t2 = JSON.stringify(d.fichas[sel], null, 1); (navigator.clipboard ? navigator.clipboard.writeText(t2) : Promise.reject()).then(() => U.toast('Ficha copiada'), () => U.toast('No se pudo copiar')); }
    else if (a === 'borrar') { if (enCartera(sel)) return U.toast('Está en tu cartera: no se puede borrar su ficha'), true; if (confirm('¿Eliminar la ficha de ' + sel + '?')) { delete d.fichas[sel]; delete d.precios[sel + '@ficha']; sel = null; U.guardar({ ok: true, msg: 'Ficha eliminada' }); } }
    else return false;
    return true;
  });
  U.changes.push(e => {
    const t = e.target;
    if (e.type === 'input' && t.id === 'v-q') { filtro = t.value; U.render(); const q = document.getElementById('v-q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } return; }
    if (e.type !== 'change' || !sel || !D().fichas[sel]) return;
    const f = D().fichas[sel];
    if (t.dataset && t.dataset.sc) { const v = parseFloat(String(t.value).replace(',', '.')); if (!isFinite(v)) return;
      const fx = fichaCon(sel); f.escenarios = f.escenarios || {}; ESC.forEach(s => { if (!f.escenarios[s]) f.escenarios[s] = escDe(fx, s); }); f.escenarios[t.dataset.sc][t.dataset.k] = v / parseFloat(t.dataset.mul); Store.save(); restore(() => {}); }
    else if (t.hasAttribute && t.hasAttribute('data-v-cic')) { f.ciclica = t.checked; delete f.escenarios; Store.save(); restore(() => {}); }
  });
  document.addEventListener('toggle', e => { const s = e.target && e.target.dataset && e.target.dataset.vSec; if (s) abiertos[s] = e.target.open ? 1 : 0; }, true);
})();
