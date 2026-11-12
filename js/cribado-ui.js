/* Pestaña Cribado: checklist de calidad por empresa. Datos en datos.json → cribado{TICKER:{…}} (se sincroniza con Drive).
   Sin Claude: los números salen de las cuentas de la ficha de valoración o se escriben a mano; lo cualitativo (B1–B7, C4) se rellena a mano
   o pegando el JSON que devuelva cualquier asistente de IA con el prompt de «Pedir a una IA». */
(function () {
  const L = Logic, C = Cribado, U = window.UI;
  const { esc, nf } = U;
  let sel = null, filtro = '', abiertos = { A: 1, B: 1, S: 1, D: 1, E: 1 };
  const D = () => Store.get(), hoy = () => L.today();
  const dias = f => { const t = Date.parse(f); return isFinite(t) ? Math.floor((Date.now() - t) / 864e5) : null; };
  const SYM = { g: '✓', y: '!', r: '✕', n: '–', i: 'i' }, TONO = { g: 'ok', y: 'warn', r: 'bad', n: '' };
  const TIER = { micro: 'Micro cap', small: 'Small cap', grande: 'Mediana o grande' };
  const clave = s => String(s || '').trim().toUpperCase();
  const crib = () => { const d = D(); if (!d.cribado) d.cribado = {}; return d.cribado; };

  /* Precio para el cribado, en la divisa de los datos: manual > ficha (misma divisa que sus cuentas) > precios automáticos */
  function precioDe(tk, c) {
    const d = D(), f = d.fichas[tk], pr = d.precios[tk];
    if (c.precio_manual && c.precio_manual.valor > 0) return { precio: c.precio_manual.valor, fecha: c.precio_manual.fecha, fuente: 'manual' };
    if (f && L.isN(f.precio)) { const p = L.precioFicha(d, tk); return { precio: p.precio, fecha: p.fecha, fuente: 'ficha/precios' }; }
    if (pr && L.isN(pr.precio)) return { precio: pr.precio, fecha: pr.fecha_precio, fuente: pr.fuente || 'precios' };
    return null;
  }
  function pfDeCartera(tk) {
    const d = D(), items = d.posiciones.map(p => {
      const t = L.tickerDe(d, p), pp = L.precioPos(d, p), cd = (d.cribado || {})[t || ''] || {};
      return { t: t || p.ticker || '', n: p.empresa, sec: (p.sector || '').toLowerCase(), pais: cd.pais_sede || '', div: p.moneda, q: p.cantidad, pm: p.precio_medio_compra, pa: pp ? pp.precio : null };
    });
    return { items, fx: d.ajustes.fx.USD || 1.15 };
  }
  function evaluar(tk) {
    const d = D(), c = d.cribado[tk], p = precioDe(tk, c), inp = { precio: p ? p.precio : null, Y: d.ajustes.bono10 || 4.4, fx: d.ajustes.fx.USD || 1.15 };
    const R = C.evaluate(c, inp, pfDeCartera(tk), tk); R.px = p; return R;
  }
  function capEur(f) { const d = D(); return f && L.isN(f.precio) && f.hist && L.isN((f.hist.acciones || []).slice(-1)[0]) ? L.aEur(d, f.precio * f.hist.acciones.slice(-1)[0], f.divisa) : null; }
  function desdeFicha(tk, quiet) {
    const d = D(), f = d.fichas[tk]; if (!f) return { ok: false, msg: 'No hay ficha de valoración de ' + tk };
    const x = C.desdeFicha(f, { capEur: capEur(f) }); if (!x) return { ok: false, msg: 'La ficha no tiene cuentas suficientes' };
    const c = crib()[tk] || (crib()[tk] = { ticker: tk, nombre: f.nombre, origen: 'ficha' });
    const r = C.rellenar(c, x); const nuevo = r.datos; if (!nuevo.origen || nuevo.origen === 'ficha') nuevo.origen = 'ficha';
    nuevo.fecha_datos = x.fecha_datos || nuevo.fecha_datos; d.cribado[tk] = nuevo;
    return { ok: true, n: r.n, msg: r.n ? 'Rellenados ' + r.n + ' datos desde las cuentas de la ficha' : 'La ficha no aporta datos nuevos' };
  }

  /* Fusiona cribados externos sin tocar posiciones ni fichas; no pisa los que ya tienes */
  U.fusionarCribado = function (obj) {
    const cr = crib(); let n = 0;
    Object.keys(obj || {}).forEach(k => { const t = clave(k); if (!cr[t]) { cr[t] = obj[k]; n++; } });
    if (n) Store.save(); return n;
  };
  async function cargarInicial() {
    try { const r = await fetch('cribado_inicial.json', { cache: 'no-cache' }); const j = await r.json(); const n = U.fusionarCribado(j.cribado); U.render(); U.toast(n ? n + ' cribados cargados' : 'Ya los tenías'); }
    catch (e) { U.toast('No se pudo cargar: ' + e.message); }
  }

  /* ───── Lista de precios de las candidatas ───── */
  function catVer(k) { let R; try { R = evaluar(k); } catch (e) { return 'otras'; } const v = (R && R.veredicto) || ''; return /^Pasa/.test(v) ? 'pasa' : /^Vigilar/.test(v) ? 'vigilar' : /^Descartar/.test(v) ? 'descartar' : 'otras'; }
  let SIMB = null, simbCarga = false;
  U.abrirCribado = tk => { if (!((D().cribado || {})[tk])) return; sel = tk; U.irA('cribado'); };
  U.simbolos = () => SIMB; U.cargarSimb = () => cargarSimb();
  function cargarSimb() { if (SIMB || simbCarga) return; simbCarga = true; DatosWeb.leerArchivo('simbolos.json').then(j => { SIMB = (j && j.simbolos) || {}; simbCarga = false; U.render(); }).catch(() => { simbCarga = false; }); }
  /* Descartadas fuera de cartera y fuera de watchlist → pausa; pasa/vigilar fuera de cartera → activas */
  function deseadosSimb() {
    const d = D(), out = {};
    Object.keys(d.cribado || {}).forEach(k => {
      if (d.posiciones.some(p => L.tickerDe(d, p) === k)) return;
      const c = catVer(k), wl = d.fichas[k] && d.fichas[k].estado === 'watchlist';
      out[k] = { pausa: c === 'descartar' && !wl };
    });
    return out;
  }
  function simbolosCard() {
    cargarSimb(); if (!SIMB) return '';
    const p = DatosWeb.planSimbolos(SIMB, deseadosSimb()); if (!p.cambios) return '<p class="small mut">Precios de las candidatas al día: las que pasan o vigilas se actualizan solas; las descartadas no.</p>';
    const l = (t, a) => a.length ? '<div class="small">' + t + ': <b>' + a.map(esc).join(', ') + '</b></div>' : '';
    return '<div class="card"><b>Lista de precios por actualizar</b><p class="small mut">Para que las candidatas tengan precio automático hay que añadirlas a la lista pública de símbolos (solo tickers). Para empresas fuera de EE. UU. revisa luego el símbolo en <code>simbolos.json</code>.</p>' +
      l('Añadir', p.anadir) + l('Reactivar', p.reactivar) + l('Pausar (descartadas)', p.pausar) + '<div class="tools" style="margin-top:8px"><button class="btn sm" data-c="simbolos">Aplicar y actualizar precios</button></div></div>';
  }
  async function aplicarSimb() {
    const p = DatosWeb.planSimbolos(SIMB, deseadosSimb()); if (!p.cambios) return U.toast('Nada que cambiar');
    const cfg = await DatosWeb.leerArchivo('simbolos.json'); cfg.simbolos = DatosWeb.planSimbolos(cfg.simbolos, deseadosSimb()).nuevo;
    U.toast('Guardando lista de precios…');
    const r = await DatosWeb.escribirArchivo('simbolos.json', JSON.stringify(cfg, null, 2) + '\n', 'Símbolos: candidatas del cribado (' + p.anadir.length + ' nuevas, ' + p.pausar.length + ' pausadas)');
    if (r.sinToken) return U.toast('Falta el token de GitHub (Cartera → Actualizar precios). Debe tener permisos Contents y Actions: Read and write.');
    if (!r.ok) return U.toast(r.msg);
    SIMB = null; DatosWeb.lanzarWorkflow('precios.yml', { forzar: 'true' }); U.toast('Lista guardada; los precios nuevos llegan en 1–2 min (Cartera → Actualizar precios → Traer lo último)'); U.render();
  }

  /* ───── Lista ───── */
  function vistaLista() {
    const d = D(), cr = d.cribado || {}, q = L.norm(filtro);
    const tks = Object.keys(cr).filter(k => !q || L.norm(k + ' ' + (cr[k].nombre || '')).includes(q)).sort();
    const sin = Object.keys(d.fichas).filter(k => !cr[k]).sort();
    let h = (U.lineaPrecios ? U.lineaPrecios() : '') + '<div class="tools"><input id="cr-new" placeholder="Ticker (p. ej. AZO) para analizar" autocapitalize="characters" style="flex:2 1 160px"><button class="btn" data-c="nuevo">Cribar</button></div><p class="small mut" style="margin:-4px 0 10px">Si no tiene ficha, se buscan sus cuentas en internet (SEC): <b>solo empresas de EE. UU.</b> Para otras bolsas usa «Pedir a una IA» o los informes anuales.</p>' +
      (tks.length > 4 || q ? '<div class="tools"><input id="cr-q" type="search" placeholder="Buscar" value="' + esc(filtro) + '"></div>' : '');
    const enC = k => d.posiciones.some(p => L.tickerDe(d, p) === k);
    const fila = k => {
      let R; try { R = evaluar(k); } catch (e) { R = null; }
      const c = cr[k], ed = c.origen === 'verificado' ? dias(c.fecha_verificacion) : null, px = R && R.px;
      return '<div class="row click" data-c="abrir" data-k="' + esc(k) + '"><div class="main"><div class="name">' + esc(c.nombre || k) + '</div><div class="meta">' + esc(k) + ' · ' + ({ verificado: 'verificado', ficha: 'cuentas de la ficha', manual: 'manual', ia: 'asistente de IA' }[c.origen] || c.origen || '') + (ed != null ? ' hace ' + ed + ' d' : '') + (px && px.fecha ? ' · precio ' + esc(px.fecha) : '') + '</div></div>' +
        '<div class="num">' + (R ? '<span class="pill ' + TONO[R.tono] + '">' + esc(R.veredicto.replace(' · ', ' · ')) + '</span><div class="meta">calidad ' + (R.calidad == null ? '—' : nf(R.calidad, 0) + '%') + (R.provisional ? ' · provisional' : '') + '</div>' : '<span class="pill">sin evaluar</span>') + '</div></div>';
    };
    const fuera = tks.filter(k => !enC(k)), dentro = tks.filter(enC);
    if (!tks.length) h += '<div class="card"><div class="empty">Aún no has cribado ninguna empresa. Escribe un ticker arriba.<br><br><button class="btn sec sm" data-c="inicial">Cargar mis 5 cribados verificados</button></div></div>';
    else {
      const G = { pasa: [], vigilar: [], descartar: [], otras: [] };
      fuera.forEach(k => { G[catVer(k)].push(k); });
      h += '<h3 style="margin:8px 2px 6px">Fuera de cartera <span class="mut small">' + fuera.length + '</span></h3>';
      [['pasa', 'Pasan el cribado', 'ok'], ['vigilar', 'Vigilar', 'warn'], ['descartar', 'Descartadas', 'bad'], ['otras', 'Sin evaluar del todo', '']].forEach(([g, t, tono]) => {
        if (!G[g].length) return;
        h += '<details class="card"' + (g === 'pasa' || g === 'vigilar' ? ' open' : '') + '><summary><span class="pill ' + tono + '">' + t + '</span> <span class="mut small">' + G[g].length + (g === 'descartar' ? ' · sin actualizar precio' : '') + '</span></summary>' + G[g].map(fila).join('') + '</details>';
      });
      if (!fuera.length) h += '<div class="card empty">Todo lo cribado está en cartera.</div>';
      h += simbolosCard();
      if (dentro.length) h += '<h3 style="margin:14px 2px 6px">En cartera <span class="mut small">' + dentro.length + '</span></h3><div class="card">' + dentro.map(fila).join('') + '</div>';
    }
    if (sin.length) {
      const enC = k => d.posiciones.some(p => L.tickerDe(d, p) === k), a = sin.filter(enC), b = sin.filter(k => !enC(k)), chips = ks => ks.map(k => '<button class="btn sec sm" data-c="nuevo" data-k="' + esc(k) + '">' + esc(k) + '</button>').join('');
      if (b.length) h += '<details class="card" open><summary>Candidatas por cribar (' + b.length + ')</summary><p class="small mut">Fichas de valoración fuera de tu cartera: aquí el cribado sí importa.</p><div class="chips" style="margin-top:8px">' + chips(b) + '</div><div class="tools" style="margin-top:8px"><button class="btn sm" data-c="cribartodas">Cribar todas con los datos de su ficha</button></div></details>';
      if (a.length) h += '<details class="card"><summary>En cartera · ya analizadas (' + a.length + ')</summary><p class="small mut">Ya las conoces a fondo, así que el cribado es opcional (útil para repasar la calidad).</p><div class="chips" style="margin-top:8px">' + chips(a) + '</div></details>';
    }
    return h;
  }

  /* ───── Informe ───── */
  const count = a => { const c = { g: 0, y: 0, r: 0, n: 0, i: 0 }; a.forEach(x => c[x.estado]++); return c; };
  const cntTxt = c => [c.g ? c.g + ' ✓' : '', c.y ? c.y + ' !' : '', c.r ? c.r + ' ✕' : '', c.n ? c.n + ' sin dato' : ''].filter(Boolean).join('  ');
  const rowH = x => '<li class="cr s-' + x.estado + '"><span class="bdg">' + SYM[x.estado] + '</span><div><div class="name"><span class="mut small">' + esc(x.id) + ' </span>' + esc(x.nombre) + '</div><div>' + esc(x.valor) + '</div>' +
    (x.nota ? '<div class="small mut">' + esc(x.nota) + '</div>' : '') + '<div class="small mut" style="opacity:.8">' + esc(x.regla) + ' — ' + esc(x.fuente) + '</div></div></li>';
  const secH = (id, t, desc, arr, extra) => '<details class="card sec2" data-sec="' + id + '"' + (abiertos[id] ? ' open' : '') + '><summary><b>' + esc(t) + '</b> <span class="mut small">' + esc(cntTxt(count(arr))) + '</span></summary>' +
    (desc ? '<p class="small mut">' + esc(desc) + '</p>' : '') + (extra || '') + '<ul class="crl">' + arr.map(rowH).join('') + '</ul></details>';
  const barH = (c, tot) => '<div class="bar3">' + ['g', 'y', 'r'].map(k => '<i class="' + k + '" style="width:' + (tot ? c[k] / tot * 100 : 0) + '%"></i>').join('') + '</div>';

  function alertas(R, c, tk) {
    const A = [], E = C.f;
    if (c.origen === 'verificado') {
      const dd = dias(c.fecha_verificacion);
      A.push(dd != null && dd > 90 ? ['bad', 'Datos verificados hace ' + dd + ' días (' + c.fecha_verificacion + '): pueden haber salido resultados nuevos. Vuelve a verificarlos antes de decidir.'] : ['ok', 'Datos verificados el ' + (c.fecha_verificacion || '—') + (dd != null ? ' (hace ' + dd + ' días)' : '') + (Array.isArray(c.fuentes) && c.fuentes.length ? ' · ' + c.fuentes.join(', ') : '') + '. Caducan a los 90 días.']);
    } else if (c.origen === 'ficha') A.push(['warn', 'Datos numéricos calculados con las cuentas de la ficha de valoración (' + (c.fecha_datos || 's/f') + '). Lo cualitativo (B1–B7, C4), la liquidez, los insiders y la remuneración en acciones no salen de ahí: complétalos en «Editar datos».']);
    else A.push(['warn', 'Datos ' + (c.origen === 'ia' ? 'de un asistente de IA (sin verificar)' : 'introducidos a mano') + (c.anio_dato ? ' · ejercicio ' + c.anio_dato : '') + '. Contrástalos con el informe anual y marca «Datos verificados» cuando lo hagas.']);
    (Array.isArray(c.notas_datos) ? c.notas_datos : []).slice(0, 6).forEach(n => A.push(['warn', String(n)]));
    if (R.provisional) A.push(['warn', 'Resultado provisional: solo se han evaluado ' + R.nEval + ' de ' + R.nCalif + ' criterios de calidad.']);
    if (R.perImp != null && c.origen !== 'verificado') A.push(['warn', 'Comprobación rápida: el BPA implica un PER de ' + E(R.perImp, 1) + 'x. Compáralo con el PER de tu broker; si no coincide, corrige el BPA (es el error que más distorsiona el bloque D).']);
    if (R.faltaPrecio) A.push(['warn', 'Falta el precio: el bloque D (múltiplo) no se puede calcular. Pon el precio actual en el botón «Precio».']);
    else if (R.faltaBPA) A.push(['warn', 'Hay precio pero no BPA de los últimos 12 meses: el bloque D queda sin calcular.']);
    if (R.evitar) A.push(['bad', 'Perfil típico de small cap a evitar (M12): dilución, incentivos excesivos o sin ventaja competitiva.']);
    if (R.tier === 'micro' || R.tier === 'small') A.push(['warn', 'Módulo small caps activo (menos de 3.000 M€): se añade el bloque S y el techo de valoración se recorta un ' + (R.tier === 'micro' ? '20' : '10') + ' %.']);
    if (R.enc && R.enc.enCartera && R.enc.room <= 0) A.push(['bad', 'Sin margen en cartera: ya estás en el límite de peso por empresa o por sector.']);
    if (R.px && R.px.fecha) { const dp = dias(R.px.fecha); if (dp != null && dp > D().ajustes.dias_precio_viejo) A.push(['warn', 'El precio usado es de hace ' + dp + ' días (' + R.px.fecha + ').']); }
    return A.map(([k, t]) => '<div class="alert ' + (k === 'ok' ? '' : k) + '"' + (k === 'ok' ? ' style="background:var(--ok-bg);color:var(--ok)"' : '') + '>' + esc(t) + '</div>').join('');
  }
  function encajeH(R) {
    const e = R.enc; if (!e) return '';
    const p = (v) => v == null ? '—' : nf(v, 1) + ' %', list = (t, a) => '<div><b class="small">' + t + '</b>' + a.slice(0, 6).map(([k, v]) => '<div class="small" style="display:flex;justify-content:space-between"><span>' + esc(k) + '</span><span>' + nf(v, 1) + ' %</span></div>').join('') + '</div>';
    return '<details class="card sec2" data-sec="E"' + (abiertos.E ? ' open' : '') + '><summary><b>Bloque E · Encaje en tu cartera</b></summary><div class="kpis" style="margin-top:8px"><div class="kpi"><span>Peso actual' + (e.nombrePos ? ' (' + esc(e.nombrePos) + ')' : '') + '</span><b>' + (e.enCartera ? p(e.wT) : 'No la tienes') + '</b><span>límite 10 %</span></div>' +
      '<div class="kpi"><span>Sector ' + esc(e.sector || '—') + '</span><b>' + p(e.wS) + '</b><span>límite 30 %</span></div>' +
      '<div class="kpi"><span>Margen para añadir</span><b>' + (e.room > 0 ? p(e.room) + ' · ' + nf((e.room / 100) * e.T, 0) + ' €' : 'Sin margen') + '</b><span>' + (e.room2 != null && e.room2 < e.room1 ? 'limita el sector' : 'limita la empresa') + '</span></div></div>' +
      '<div class="grid g2">' + list('Divisa', e.divisas) + list('Sector', e.sectores) + '</div></details>';
  }
  function techoKV(R) {
    const v = R.val; if (!v || !v.techo) return '';
    const cells = [['Techo PER aplicado', C.xx(v.techo.techoPER)], ['Techo EV/EBITDA aplicado', C.xx(v.techo.techoEV)]]; if (v.graham) cells.push(['PER máximo de Graham', C.xx(v.graham)]);
    return '<div class="kpis" style="margin-top:6px">' + cells.map(([a, b]) => '<div class="kpi"><span>' + esc(a) + '</span><b>' + esc(b) + '</b></div>').join('') + '</div>';
  }
  function vistaDetalle() {
    const d = D(), c = (d.cribado || {})[sel]; if (!c) { sel = null; return vistaLista(); }
    let R; try { R = evaluar(sel); } catch (e) { return '<button class="btn sec sm" data-c="volver">← Volver</button><div class="alert bad" style="margin-top:10px">No se pudo evaluar: ' + esc(e.message) + '</div>'; }
    const calif = [].concat(R.A, R.B, R.C.filter(x => x.id !== 'C4'), R.S.filter(x => x.id !== 'S7' && x.id !== 'S8'));
    const cc = count(calif.filter(x => x.estado !== 'n')), cd = count(R.D.filter(x => ['D1', 'D3'].includes(x.id)));
    const chips = [c.pais_sede, c.sector_cartera, R.tier ? TIER[R.tier] + (R.cap != null ? ' · ' + nf(R.cap, 0) + ' M€' : '') : null, c.divisa_cotizacion].filter(Boolean).map(x => '<span class="pill">' + esc(x) + '</span>').join(' ');
    const px = R.px ? nf(R.px.precio, 2) + ' ' + esc(c.divisa_cotizacion || d.fichas[sel] && d.fichas[sel].divisa || '') + ' · ' + esc(R.px.fuente) : 'sin precio';
    let h = '<button class="btn sec sm" data-c="volver">← Cribado</button>' +
      '<div class="card" style="margin-top:10px;border-left:6px solid var(--' + ({ g: 'ok', y: 'warn', r: 'bad', n: 'mut' }[R.tono]) + ')"><div class="meta">' + esc(sel) + (c.nombre ? ' — ' + esc(c.nombre) : '') + '</div>' + (U.enlaces ? U.enlaces(sel, 'cri') : '') +
      '<h2 style="font-size:22px;margin:4px 0">' + esc(R.veredicto) + (R.provisional ? ' (provisional)' : '') + '</h2><p style="margin:0 0 8px">' + esc(R.sub) + '</p><div class="chips">' + chips + '</div>' +
      '<div style="margin-top:10px"><div class="small" style="display:flex;justify-content:space-between"><span>Calidad (A, B, C' + (R.S.length ? ', S' : '') + ')</span><b>' + (R.calidad == null ? '—' : nf(R.calidad, 0) + ' %') + '</b></div>' + barH(cc, calif.filter(x => x.estado !== 'n').length) +
      '<div class="small" style="display:flex;justify-content:space-between;margin-top:8px"><span>Múltiplo (D1, D3)</span><b>' + (R.precioPct == null ? '—' : nf(R.precioPct, 0) + ' %') + '</b></div>' + barH(cd, cd.g + cd.y + cd.r) + '</div>' +
      '<p class="small mut" style="margin:8px 0 0">Precio: ' + px + '</p></div>' +
      '<div class="tools"><button class="btn sm" data-c="editar">Editar datos</button><button class="btn sec sm" data-c="ficha">Datos desde la ficha</button><button class="btn sec sm" data-c="web">Buscar en internet</button><button class="btn sec sm" data-c="precio">Precio</button><button class="btn sec sm" data-c="ia">Pedir a una IA</button><button class="btn sec sm" data-c="verif">Datos verificados hoy</button></div>' +
      alertas(R, c, sel) +
      secH('F', 'Filtro de tu proyecto', 'Si las ventas a 5 años son negativas, se descarta directamente.', [R.filtro]) +
      secH('A', 'Bloque A · Calidad numérica', 'Checklist de 8 puntos de M4.', R.A) +
      secH('B', 'Bloque B · Negocio, moat y sector', 'Método EVVA de M5 y tus reglas de sector. Lo cualitativo es un juicio: valídalo.', R.B) +
      secH('C', 'Bloque C · Administración', 'M5, «A». C4 no puntúa: lo decides tú.', R.C) +
      (R.S.length ? secH('S', 'Bloque S · Módulo small caps', 'M12. Capitalización menor de 3.000 M€.', R.S) : '') +
      secH('D', 'Bloque D · Múltiplo (filtro de M8)', 'Solo descarta: no es un precio objetivo (eso es la valoración, M14).', R.D, techoKV(R)) + encajeH(R) +
      '<div class="tools" style="margin-top:12px"><button class="btn sec sm" data-c="borrar">Eliminar este cribado</button></div>';
    return h;
  }
  U.vistas.cribado = () => sel ? vistaDetalle() : vistaLista();

  /* ───── Editor de datos ───── */
  function editor() {
    const c = D().cribado[sel], g = p => C.getPath(c, p);
    const num = (p, lab) => '<div><label>' + esc(lab) + '</label><input data-p="' + p + '" type="number" step="any" inputmode="decimal" value="' + (g(p) == null ? '' : g(p)) + '"></div>';
    const tri = (p, lab) => { const v = g(p); return '<div><label>' + esc(lab) + '</label><select data-p="' + p + '" data-t="bool"><option value="">—</option><option value="1"' + (v === true ? ' selected' : '') + '>Sí</option><option value="0"' + (v === false ? ' selected' : '') + '>No</option></select></div>'; };
    const sl = ([p, lab, ops]) => '<div><label>' + esc(lab) + '</label><select data-p="' + p + '"><option value="">—</option>' + ops.map(o => '<option' + (g(p) === o ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select></div>';
    const txt = (p, lab) => '<div style="grid-column:1/-1"><label>' + esc(lab) + '</label><input data-p="' + p + '" value="' + esc(g(p) || '') + '"></div>';
    U.dlg('<h2>Datos de ' + esc(sel) + '</h2><p class="small mut">Deja en blanco lo que no sepas. Los porcentajes, como número (12,5 = 12,5 %). Importes en la divisa de cotización.</p>' +
      '<div class="f2"><div><label>Nombre</label><input data-p="nombre" value="' + esc(c.nombre || '') + '"></div><div><label>País de la sede</label><input data-p="pais_sede" value="' + esc(c.pais_sede || '') + '"></div></div>' +
      C.CAMPOS.map(([t, cs]) => '<h3 style="margin-top:14px">' + esc(t) + '</h3><div class="f2">' + cs.map(([p, l]) => num(p, l)).join('') + '</div>').join('') +
      '<h3 style="margin-top:14px">Sí / no</h3><div class="f2">' + C.BOOLS.map(([p, l]) => tri(p, l)).join('') + '</div>' +
      '<h3 style="margin-top:14px">Cualitativo (tu juicio)</h3><div class="f2">' + C.SELECTS.map(sl).join('') + num('cualitativo.b4.score', 'B4 · Calidad del sector (1–10)') + C.BOOLS_Q.map(([p, l]) => tri(p, l)).join('') +
      txt('cualitativo.b1.motivo', 'B1 · Por qué') + txt('cualitativo.b3.motivo', 'B3 · Moat: por qué') + txt('cualitativo.b7.motivo', 'B7 · Ciclicidad: por qué') + txt('cualitativo.c4.borrador', 'C4 · ¿Cumple lo que promete la directiva?') + '</div>' +
      '<div class="acts"><button class="btn sec" data-a="cerrar">Cancelar</button><button class="btn" id="cr-save">Guardar</button></div>',
      dd => { dd.querySelector('#cr-save').onclick = () => {
        const n = JSON.parse(JSON.stringify(c)); let cambios = 0;
        dd.querySelectorAll('[data-p]').forEach(el => {
          const p = el.dataset.p, v = el.value.trim(); let nv;
          if (el.type === 'number') nv = v === '' ? undefined : parseFloat(v.replace(',', '.')); else if (el.dataset.t === 'bool') nv = v === '' ? undefined : v === '1'; else nv = v === '' ? undefined : v;
          if (typeof nv === 'number' && !isFinite(nv)) nv = undefined;
          if (JSON.stringify(C.getPath(n, p)) !== JSON.stringify(nv)) { C.setPath(n, p, nv); cambios++; }
        });
        if (cambios && n.origen !== 'verificado') n.origen = n.origen === 'ficha' ? 'ficha' : 'manual';
        if (cambios && n.origen === 'verificado') { n.origen = 'manual'; }
        D().cribado[sel] = n; U.guardar({ ok: true, msg: cambios ? cambios + ' dato(s) actualizados' : 'Sin cambios' });
      }; });
  }
  function precioDlg() {
    const c = D().cribado[sel], p = precioDe(sel, c);
    U.dlg('<h2>Precio · ' + esc(sel) + '</h2><p class="small mut">Ahora: ' + (p ? nf(p.precio, 2) + ' (' + esc(p.fuente) + (p.fecha ? ', ' + esc(p.fecha) : '') + ')' : 'sin precio') + '. Un precio manual manda sobre el automático hasta que lo quites.</p>' + U.campo('cr-px', 'Precio en la divisa de los datos (' + esc(c.divisa_cotizacion || '') + ')', '', 'number') +
      '<div class="acts"><button class="btn sec" data-a="cerrar">Cancelar</button><button class="btn sec" id="cr-px-q">Quitar manual</button><button class="btn" id="cr-px-ok">Guardar</button></div>',
      dd => { dd.querySelector('#cr-px-ok').onclick = () => { const v = parseFloat(U.val('cr-px').replace(',', '.')); if (!(v > 0)) return U.toast('Precio no válido'); c.precio_manual = { valor: v, fecha: hoy() }; U.guardar({ ok: true, msg: 'Precio guardado' }); };
        dd.querySelector('#cr-px-q').onclick = () => { delete c.precio_manual; U.guardar({ ok: true, msg: 'Se usa el precio automático' }); }; });
  }
  function iaDlg() {
    const c = D().cribado[sel];
    U.dlg('<h2>Pedir a una IA</h2><p class="small mut">Opcional. Copia el prompt, pégalo en un asistente <b>con búsqueda en internet</b> (ChatGPT, Gemini, Claude…): buscará las cifras en webs de datos financieros (Yahoo Finance, MarketScreener…) y no en tus informes. Pega aquí el JSON que te devuelva; se marca «sin verificar» y las fuentes quedan en las notas de datos.</p>' +
      '<div class="acts" style="justify-content:flex-start"><button class="btn sec" id="cr-cp">Copiar prompt</button></div>' +
      '<label>JSON de respuesta</label><textarea id="cr-json" rows="6" placeholder=\'{"ticker":"…"}\'></textarea><label style="display:flex;gap:8px;align-items:center"><input id="cr-ow" type="checkbox" style="width:auto;min-height:0"> Sobrescribir los datos que ya tengo</label>' +
      '<div class="acts"><button class="btn sec" data-a="cerrar">Cancelar</button><button class="btn" id="cr-imp">Importar</button></div>',
      dd => {
        dd.querySelector('#cr-cp').onclick = async () => { const t = C.prompt(sel, '', (precioDe(sel, c) || {}).precio); try { await navigator.clipboard.writeText(t); U.toast('Prompt copiado'); } catch (e) { dd.querySelector('#cr-json').value = t; U.toast('Copia el texto del recuadro'); } };
        dd.querySelector('#cr-imp').onclick = () => {
          let o; try { o = JSON.parse(dd.querySelector('#cr-json').value.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()); } catch (e) { return U.toast('JSON no válido: ' + e.message); }
          if (!o || typeof o !== 'object' || Array.isArray(o)) return U.toast('Debe ser un objeto JSON');
          const ow = dd.querySelector('#cr-ow').checked; let n = 0;
          const base = ow ? Object.assign({}, c, o) : C.rellenar(c, o).datos; if (!ow) n = 1;
          base.origen = c.origen === 'verificado' && !ow ? 'verificado' : 'ia'; base.ticker = c.ticker || sel; if (o.confianza) base.confianza = o.confianza;
          if (!ow && Array.isArray(o.notas_datos)) base.notas_datos = (c.notas_datos || []).concat(o.notas_datos.filter(x => !(c.notas_datos || []).includes(x)));
          D().cribado[sel] = base; U.guardar({ ok: true, msg: 'Datos importados (sin verificar)' });
        };
      });
  }

  /* ───── Acciones ───── */
  function nuevo(tk) {
    tk = clave(tk); if (!tk) return U.toast('Escribe un ticker');
    const d = D(), cr = crib();
    if (!cr[tk]) { const f = d.fichas[tk]; cr[tk] = { ticker: tk, nombre: f ? f.nombre : tk, origen: f ? 'ficha' : 'manual' }; if (f) desdeFicha(tk, true); Store.save(); }
    sel = tk; U.render(); window.scrollTo(0, 0);
    if (!d.fichas[tk]) web(tk);
  }
  /* Busca las cuentas en internet (SEC vía GitHub Actions) y construye ficha borrador + cribado */
  let buscando = null;
  function importarWeb(tk, o) {
    const d = D();
    if (!o || o.error) return U.toast((o && o.error) || 'Sin datos');
    if (!d.fichas[tk]) d.fichas[tk] = DatosWeb.aFicha(o, hoy());
    const r = desdeFicha(tk, true); if (!d.cribado[tk]) d.cribado[tk] = { ticker: tk, nombre: o.nombre || tk, origen: 'ficha' };
    U.guardar({ ok: true, msg: r.ok ? 'Datos de ' + tk + ' cargados de internet (SEC). Revisa lo cualitativo.' : 'Ficha creada, pero faltan cuentas para el cribado' });
  }
  U.avisoDlg = m => { const dd = document.querySelector('dialog[open]') || document; let a = dd.querySelector('#aviso-dlg'); if (!a) { a = document.createElement('div'); a.id = 'aviso-dlg'; a.className = 'alert warn'; const ac = dd.querySelector('.acts'); ac ? ac.parentNode.insertBefore(a, ac) : dd.appendChild(a); } a.textContent = m; };
  /* Completar con IA las cifras que faltan en el resumen del CSV: prompt para copiar y respuesta JSON para pegar */
  const METR_IA = ['Ventas', 'Beneficio operativo (EBIT)', 'Beneficio neto', 'BPA diluido', 'Deuda neta / EBITDA', 'FCF / acción'];
  /* ───── Completar con una IA las cifras que faltan en los informes ─────
     El mensaje dice EXPRESAMENTE qué métrica y qué años faltan, precarga lo que ya tienes y, si el ejercicio siguiente al último
     podría estar ya publicado, lo pide también (si no, null). Dos modos: «pegar» (sirve con cualquier IA) y «navegar». */
  const DEF_IA = {
    'Ventas': 'ventas / ingresos totales (revenue), millones',
    'Beneficio operativo (EBIT)': 'beneficio operativo (operating income / EBIT), millones',
    'Beneficio neto': 'beneficio neto atribuible a los accionistas (net income), millones',
    'BPA diluido': 'beneficio por acción diluido (diluted EPS), por acción',
    'Deuda neta / EBITDA': 'ratio = (deuda financiera bruta − caja e inversiones a corto) / EBITDA del año, SIN arrendamientos',
    'FCF / acción': 'flujo de caja libre por acción = (flujo de caja operativo − capex) / acciones diluidas'
  };
  const NUM_IA = v => typeof v === 'number' && isFinite(v);
  const NORM_IA = k => String(k).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
  const ALIAS_IA = { ventas: 'Ventas', ingresos: 'Ventas', revenue: 'Ventas', sales: 'Ventas', beneficiooperativoebit: 'Beneficio operativo (EBIT)', ebit: 'Beneficio operativo (EBIT)', operatingincome: 'Beneficio operativo (EBIT)', beneficiooperativo: 'Beneficio operativo (EBIT)', beneficioneto: 'Beneficio neto', netincome: 'Beneficio neto', bpadiluido: 'BPA diluido', bpa: 'BPA diluido', dilutedeps: 'BPA diluido', eps: 'BPA diluido', deudanetaebitda: 'Deuda neta / EBITDA', deudanetebitda: 'Deuda neta / EBITDA', netdebtebitda: 'Deuda neta / EBITDA', fcfaccion: 'FCF / acción', fcfporaccion: 'FCF / acción', fcfpershare: 'FCF / acción' };
  const CORE_IA = ['Ventas', 'Beneficio operativo (EBIT)', 'Beneficio neto', 'BPA diluido'];
  U.completarIA = function (e) {
    const dt = e.datos || {}, ult = Number(e.ultimo_anio) || (new Date().getFullYear() - 1), base = (dt.anios && dt.anios.length >= 2 ? dt.anios : [ult - 5, ult - 4, ult - 3, ult - 2, ult - 1, ult]).map(Number), div = dt.divisa || 'EUR';
    const sig = base[base.length - 1] + 1, hoyD = new Date(), publicable = sig <= hoyD.getFullYear() && (Number(e.ultimo_anio) >= sig || hoyD >= new Date(sig + 1, 2, 1)),   // el ejercicio siguiente solo puede existir si ya hay informe suyo o han pasado dos meses de su cierre (dic → marzo); si no, no se pide
      extra = publicable ? sig : null, anios = extra ? base.concat(extra) : base, n = anios.length;
    const M = dt.metricas || {}, serie = k => anios.map((_, i) => (i < base.length && NUM_IA((M[k] || [])[i]) ? M[k][i] : null));
    const falta = {}; METR_IA.forEach(k => { const ys = anios.filter((y, i) => serie(k)[i] == null && y !== extra); if (ys.length) falta[k] = ys; });
    const tpl = METR_IA.filter(k => falta[k] || extra), plantilla = '{' + tpl.map(k => '"' + k + '":' + JSON.stringify(serie(k))).join(',') + ',"fuentes":"nombre y enlace de cada métrica","discrepancias":"entre fuentes, si las hay"}';
    const pend = Object.keys(falta).map(k => '- ' + k + ' (' + DEF_IA[k] + '): faltan los años ' + falta[k].join(', ')).join('\n');
    if (!extra && !Object.keys(falta).length) {   // nada que pedir de las seis métricas: no se genera un mensaje vacío
      const f0 = D().fichas[e.tk], fl = f0 ? L.lineasFaltantes(f0) : [];
      return U.dlg('<h2>' + esc(e.nombre) + ': tus informes están al día</h2><p class="small">Las seis métricas de los ejercicios cerrados (' + base[0] + '–' + base[base.length - 1] + ') ya están en tus CSV, y el ejercicio ' + sig + ' aún no puede estar publicado (se pedirá a partir de marzo de ' + (sig + 1) + ', o antes si ya tienes su informe en la carpeta). No hay nada que preguntar a una IA aquí.</p>' +
        (fl.length ? '<div class="alert warn">Pero la <b>ficha de valoración</b> es un borrador y le faltan: <b>' + esc(fl.join(', ')) + '</b>. Eso no se pide aquí: en Valoración pulsa «↻ Releer informes» (si tu CSV ya las trae, se rellenan solas) o «Completar con una IA».</div><div class="acts"><button class="btn sec" data-a="cerrar">Cerrar</button><button class="btn" id="ia-ir">Ir a la ficha</button></div>' : '<div class="acts"><button class="btn" data-a="cerrar">Vale</button></div>'),
        dd => { const b = dd.querySelector('#ia-ir'); if (b) b.onclick = () => { U.cerrar(); U.abrirFicha(e.tk); }; });
    }
    const sym0 = (U.simboloYahoo ? U.simboloYahoo(e.tk) : e.tk) || e.tk || '';
    const prompt = modo => {
      const sym = ((document.querySelector('#ia-sym') || {}).value || sym0).trim(), E = U.enlacesDatos ? U.enlacesDatos(sym) : [];
      const cab = 'Eres un analista financiero. Necesito cifras anuales de ' + (e.nombre || e.tk) + ' (símbolo ' + sym + ', divisa ' + div + ') que NO aparecen en mis informes.\n\nLO QUE FALTA:\n' + (pend || '- (de los años cerrados no falta nada)') +
        (extra ? '\n\nEJERCICIO ' + extra + ': dime si la empresa YA HA PUBLICADO sus resultados anuales de ' + extra + ' (ejercicio completo, no trimestres sueltos). Si sí, rellena también las seis métricas de ' + extra + '; si no, deja ' + extra + ' en null en todas. IMPORTANTE: que ' + extra + ' no esté publicado NO es motivo para parar: rellena igualmente todo lo demás y responde siempre con el JSON.' : '') +
        '\n\nPRECARGO lo que ya tengo (ejercicios ' + anios.join(', ') + ', en ese orden). Rellena solo los null y NO cambies mis valores; si crees que alguno de los míos es incorrecto, no lo cambies: dilo en "discrepancias". Unidades: millones de ' + div + ' (BPA y FCF por acción en ' + div + ' por acción; deuda neta/EBITDA como ratio), ejercicio cerrado de cada año.\n\n';
      const formato = 'FORMATO (JSON, un valor por año y en ese orden; null si no lo encuentras):\n' + plantilla + '\n\nREGLAS: usa SOLO datos de las páginas, no tu memoria; no estimes ni inventes; contrasta con dos fuentes y si difieren más de un 3 % di cuál elegiste en "discrepancias". Responde SOLO con el JSON.';
      if (modo === 'pegar') return cab + 'Debajo te pego el TEXTO COPIADO de las páginas de StockAnalysis y/o Yahoo Finance (resultados, balance y flujos de caja). No necesitas navegar.\n\n' + formato + '\n\n=== TEXTO COPIADO (pégalo aquí debajo) ===\n';
      return cab + 'PASO 1. Abre estas páginas:\n' + E.map(x => '- ' + x.n + ': ' + x.u).join('\n') + '\nSi no puedes abrir páginas web, responde SOLO {"error":"sin_navegacion"} y nada más (no respondas de memoria). Si alguna no carga, usa MarketScreener o la web de relación con inversores de la empresa.\n\nPASO 2. Rellena los datos que faltan.\n\n' + formato;
    };
    const ayuda = (sym) => (U.enlacesDatos ? U.enlacesDatos(sym) : []).map(x => '<a href="' + esc(x.u) + '" target="_blank" rel="noopener">' + esc(x.n) + '</a>').join(' · ');
    U.dlg('<h2>Completar con IA · ' + esc(e.nombre) + '</h2><p class="small">Faltan: <b>' + (Object.keys(falta).length ? Object.keys(falta).map(k => esc(k) + ' (' + falta[k].join(', ') + ')').join('; ') : 'nada de los años cerrados') + '</b>' + (extra ? ' · y se pregunta si ya hay resultados de <b>' + extra + '</b>' : '') + '. El mensaje lo dice expresamente y precarga lo que ya tienes.</p>' +
      '<label for="ia-sym">Símbolo en Yahoo Finance</label><input id="ia-sym" value="' + esc(sym0) + '" autocapitalize="characters">' +
      '<label for="ia-modo">Tu IA…</label><select id="ia-modo"><option value="pegar">no navega: yo pego el texto de las páginas (vale con cualquier IA)</option><option value="nav">navega por internet</option></select>' +
      '<p class="small" id="ia-ayuda"></p><textarea id="ia-p" rows="6" readonly></textarea><div class="tools"><button class="btn sec sm" id="ia-copy">Copiar mensaje</button></div>' +
      '<label for="ia-r">Respuesta de la IA (con el JSON)</label><textarea id="ia-r" rows="6" placeholder="Pega aquí la respuesta"></textarea>' +
      '<p class="small mut">Solo se rellenan los huecos; tus cifras no se tocan (si la IA discrepa, queda anotado). Lo que entra queda como «de IA, sin verificar». El ejercicio nuevo solo se añade si trae ventas, EBIT, beneficio neto y BPA.</p>' +
      '<div class="acts"><button class="btn sec" data-a="cerrar">Cancelar</button><button class="btn" id="ia-ok">Usar y crear la ficha</button></div>', dd => {
      const pinta = () => { const m = dd.querySelector('#ia-modo').value; dd.querySelector('#ia-p').value = prompt(m); dd.querySelector('#ia-ayuda').innerHTML = m === 'pegar' ? '1) Abre y copia el texto de: ' + ayuda(dd.querySelector('#ia-sym').value.trim()) + '<br>2) Copia el mensaje, pégalo en tu IA y pega debajo el texto copiado.' : 'Copia el mensaje y pégalo en una IA con búsqueda en internet.'; };
      dd.querySelector('#ia-modo').onchange = pinta; dd.querySelector('#ia-sym').oninput = pinta; pinta();
      dd.querySelector('#ia-copy').onclick = () => { const t = dd.querySelector('#ia-p'); t.select(); try { navigator.clipboard.writeText(t.value); } catch (err) { document.execCommand && document.execCommand('copy'); } U.toast('Mensaje copiado'); };
      dd.querySelector('#ia-ok').onclick = () => {
        const txt = dd.querySelector('#ia-r').value, i = txt.indexOf('{'), j = txt.lastIndexOf('}'); let o0;
        try { o0 = JSON.parse(txt.slice(i, j + 1)); } catch (err) { return U.avisoDlg('No encuentro un JSON válido en la respuesta. Pide a la IA «solo el JSON» y vuelve a pegarlo.'); }
        if (o0.error === 'sin_navegacion') return U.avisoDlg('Tu IA dice que no puede abrir páginas. Cambia a «no navega», copia el texto de las páginas y pégalo con el mensaje.');
        const o = {}; Object.keys(o0).forEach(k => { const c = METR_IA.find(m => NORM_IA(m) === NORM_IA(k)) || ALIAS_IA[NORM_IA(k)]; if (c) o[c] = o0[k]; });
        const fills = {}, ia = [], cambios = [], hay = (k, p) => NUM_IA(serie(k)[p]);
        METR_IA.forEach(k => {
          const a0 = o[k]; if (!Array.isArray(a0)) return; const a = a0.length === n ? a0 : a0.length === base.length ? a0.concat(extra ? [null] : []) : null; if (!a) return;
          anios.forEach((y, p) => { if (!NUM_IA(a[p])) return; const cur = serie(k)[p]; if (NUM_IA(cur)) { if (cur !== 0 && Math.abs(a[p] - cur) / Math.abs(cur) > 0.05) cambios.push(k + ' ' + y + ': tú ' + cur + ' · IA ' + a[p]); } else (fills[k] = fills[k] || {})[y] = a[p]; });
        });
        if (extra && !CORE_IA.every(k => hay(k, n - 1) || NUM_IA((fills[k] || {})[extra]))) Object.keys(fills).forEach(k => { delete fills[k][extra]; });   // el ejercicio nuevo no está completo: se descarta
        Object.keys(fills).forEach(k => { if (Object.keys(fills[k]).length) ia.push(k); else delete fills[k]; });
        if (!ia.length) return U.avisoDlg('La respuesta no trae ninguna cifra nueva utilizable' + (extra ? ' (si traía solo ' + extra + ' incompleto, se descarta: hacen falta ventas, EBIT, beneficio neto y BPA).' : '.'));
        /* Las cifras de IA se guardan APARTE (informes_manual) y se superponen al CSV de la carpeta: sobreviven a releer el índice y, cuando el CSV traiga el dato oficial, este manda. */
        const dd0 = D(); dd0.informes_manual = dd0.informes_manual || {}; const man = dd0.informes_manual[e.carpeta] = dd0.informes_manual[e.carpeta] || { divisa: div, metricas: {} };
        Object.keys(fills).forEach(k => { man.metricas[k] = Object.assign(man.metricas[k] || {}, fills[k]); }); man.actualizado = hoy();
        Store.save(); const e2 = (L.informes(dd0).lista || []).find(x => x.carpeta === e.carpeta) || e;
        const f = DatosWeb.aFichaInformes(e2, hoy()); if (!f) return U.avisoDlg('Aún faltan: ' + DatosWeb.faltanInformes(e2).join(', ') + '. Se han guardado las cifras recibidas; pide el resto a la IA o complétalas a mano.');
        f.notas.push('Cifras completadas por IA desde webs de datos (sin verificar): ' + ia.join(', ') + '.'); if (cambios.length) f.notas.push('La IA discrepa de tus informes (no cambiado): ' + cambios.join('; ') + '.');
        const tras = [o0.fuentes, o0.discrepancias].filter(x => typeof x === 'string' && x).join(' · ') || txt.slice(j + 1).trim().replace(/```/g, '').slice(0, 800); if (tras) f.notas.push('Fuentes y discrepancias según la IA: ' + String(tras).slice(0, 800)); f.fuentes.push('IA (sin verificar)'); ia.forEach(k => { const m = { 'Ventas': 'ventas', 'Beneficio operativo (EBIT)': 'ebit', 'Beneficio neto': 'ni_reportado', 'BPA diluido': 'bpa' }[k]; if (m) f.conf[m] = 'E'; });
        const d = D(), tk = e.tk; if (!tk) return U.avisoDlg('Esta empresa no tiene ticker: vincúlala primero.');
        d.fichas[tk] = f; const r = desdeFicha(tk, true); if (!d.cribado[tk]) d.cribado[tk] = { ticker: tk, nombre: f.nombre, origen: 'ia' };
        U.guardar({ ok: true, msg: 'Ficha y cribado de ' + tk + ' creados con cifras de IA sin verificar' + (cambios.length ? ' · la IA discrepa en ' + cambios.length + ' cifra(s): mira las notas' : '') }); };
    });
  };
  U.fichaDeInformes = function (e) {
    const d = D(), tk = e && e.tk, dev = m => { U.avisoDlg(m); return false; };
    if (!tk) return dev('Esta empresa no tiene ticker: vincúlala primero (en Informes, «Sin informes descargados» o el desplegable de vincular).');
    if (d.fichas[tk] && !L.lineasFaltantes(d.fichas[tk]).length) return dev('Ya tienes una ficha completa de ' + tk + ' (con intereses, impuestos, amortización…). No la sustituyo por un borrador, que tiene menos datos y no se puede valorar. Si quieres actualizarla, hazlo desde Valoración.');
    if (d.fichas[tk] && !confirm('Ya existe ficha de ' + tk + '. ¿Sustituirla por este borrador?')) return false;
    const f = DatosWeb.aFichaInformes(e, hoy()); if (!f) return dev('No se puede crear: faltan en el CSV ' + DatosWeb.faltanInformes(e).join(', ') + '. Necesito Ventas, EBIT, Beneficio neto y BPA diluido con algún dato.');
    d.fichas[tk] = f; const r = desdeFicha(tk, true); if (!d.cribado[tk]) d.cribado[tk] = { ticker: tk, nombre: f.nombre, origen: 'ficha' };
    U.guardar({ ok: true, msg: r.ok ? 'Ficha borrador y cribado de ' + tk + ' creados desde tus informes' : 'Ficha creada; faltan cuentas para el cribado' }); return true;
  };
  function ayudaWeb(tk, motivo) {
    U.dlg('<h2>Buscar ' + esc(tk) + ' en internet</h2><p class="small">' + esc(motivo) + '</p>' +
      '<p class="small">La app no puede consultar la SEC directamente desde el navegador; lo hace un proceso de GitHub. Para lanzarlo desde aquí pega un token de GitHub (permiso <b>Actions: Read and write</b> sobre <code>wanlida02/mi-cartera</code>); se guarda solo en este dispositivo.</p>' +
      '<label for="gh-t">Token de GitHub</label><input id="gh-t" type="password" autocomplete="off" placeholder="github_pat_…">' +
      '<p class="small mut">Sin token: abre <a href="' + DatosWeb.urlActions() + '" target="_blank" rel="noopener">Actions → Datos de empresa</a>, pulsa «Run workflow», escribe <b>' + esc(tk) + '</b> y, al terminar (1–2 min), vuelve y pulsa «Buscar en internet».</p>' +
      '<div class="acts"><button class="btn sec" data-a="cerrar">Cerrar</button><button class="btn" id="gh-ok">Guardar y buscar</button></div>', dd => {
      dd.querySelector('#gh-ok').onclick = () => { const t = U.val('gh-t'); if (!t) return U.toast('Pega el token'); DatosWeb.setToken(t); U.cerrar(); web(tk); };
    });
  }
  async function web(tk) {
    if (buscando) return U.toast('Ya se está buscando ' + buscando);
    buscando = tk;
    try {
      U.toast('Buscando ' + tk + ' en internet…');
      let o = null; try { o = await DatosWeb.leer(tk); } catch (e) { return U.toast('No se pudo consultar GitHub: ' + e.message); }
      if (o && !o.error && (dias(o.generado) == null || dias(o.generado) <= 30)) return importarWeb(tk, o);
      const t0 = Date.now(), l = await DatosWeb.lanzar(tk);
      if (l.sinToken) return ayudaWeb(tk, o && o.error ? 'Último intento: ' + o.error : 'Aún no hay datos de ' + tk + ' descargados.');
      if (!l.ok) return ayudaWeb(tk, l.msg);
      U.toast('Descargando de la SEC… tarda 1–2 minutos');
      const r = await DatosWeb.esperar(tk, t0, s => { if (s % 28 === 0) U.toast('Sigo esperando (' + s + ' s)…'); });
      if (!r) return U.toast('Tarda más de lo normal: mira Actions y pulsa de nuevo «Buscar en internet»');
      if (r.error) return U.toast(r.error + ' Para empresas no estadounidenses usa «Pedir a una IA» o los informes anuales.');
      importarWeb(tk, r);
    } finally { buscando = null; }
  }
  U.clicks.push(e => {
    const t = e.target.closest('[data-c]'); if (!t) return false;
    const a = t.dataset.c;
    if (a === 'nuevo') nuevo(t.dataset.k || (document.getElementById('cr-new') || {}).value);
    else if (a === 'web') web(sel);
    else if (a === 'inicial') cargarInicial();
    else if (a === 'abrir') { sel = t.dataset.k; U.render(); window.scrollTo(0, 0); }
    else if (a === 'volver') { sel = null; U.render(); }
    else if (a === 'editar') editor();
    else if (a === 'precio') precioDlg();
    else if (a === 'ia') iaDlg();
    else if (a === 'simbolos') aplicarSimb();
    else if (a === 'cribartodas') { const d = D(); let n = 0; Object.keys(d.fichas).filter(k => !d.cribado[k] && !d.posiciones.some(p => L.tickerDe(d, p) === k)).forEach(k => { d.cribado[k] = { ticker: k, nombre: d.fichas[k].nombre, origen: 'ficha' }; if (desdeFicha(k, true).ok) n++; else delete d.cribado[k]; }); Store.save(); U.render(); U.toast(n + ' candidatas cribadas'); }
    else if (a === 'ficha') { const r = desdeFicha(sel); if (r.ok) { Store.save(); U.render(); } U.toast(r.msg); }
    else if (a === 'verif') { const c = D().cribado[sel]; if (confirm('¿Confirmas que has contrastado estos datos con el informe anual o una fuente fiable? Pasarán a «verificados» con fecha de hoy.')) { c.origen = 'verificado'; c.fecha_verificacion = hoy(); U.guardar({ ok: true, msg: 'Marcados como verificados hoy' }); } }
    else if (a === 'borrar') { if (confirm('¿Eliminar el cribado de ' + sel + '? (La ficha de valoración no se toca)')) { delete D().cribado[sel]; sel = null; U.guardar({ ok: true, msg: 'Cribado eliminado' }); } }
    else return false;
    return true;
  });
  U.changes.push(e => {
    if (e.type === 'input' && e.target.id === 'cr-q') { filtro = e.target.value; U.render(); const q = document.getElementById('cr-q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
    if (e.type === 'change') { const s = e.target.closest && e.target.closest('details[data-sec]'); }
  });
  document.addEventListener('toggle', e => { const s = e.target && e.target.dataset && e.target.dataset.sec; if (s) abiertos[s] = e.target.open ? 1 : 0; }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'cr-new') nuevo(e.target.value); });
})();
