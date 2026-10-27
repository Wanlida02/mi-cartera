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

  /* ───── Lista ───── */
  function vistaLista() {
    const d = D(), cr = d.cribado || {}, q = L.norm(filtro);
    const tks = Object.keys(cr).filter(k => !q || L.norm(k + ' ' + (cr[k].nombre || '')).includes(q)).sort();
    const sin = Object.keys(d.fichas).filter(k => !cr[k]).sort();
    let h = '<div class="tools"><input id="cr-new" placeholder="Ticker (p. ej. AZO) para analizar" autocapitalize="characters" style="flex:2 1 160px"><button class="btn" data-c="nuevo">Cribar</button></div>' +
      (tks.length > 4 || q ? '<div class="tools"><input id="cr-q" type="search" placeholder="Buscar" value="' + esc(filtro) + '"></div>' : '');
    h += '<div class="card">' + (tks.length ? tks.map(k => {
      let R; try { R = evaluar(k); } catch (e) { R = null; }
      const c = cr[k], ed = c.origen === 'verificado' ? dias(c.fecha_verificacion) : null;
      return '<div class="row click" data-c="abrir" data-k="' + esc(k) + '"><div class="main"><div class="name">' + esc(c.nombre || k) + '</div><div class="meta">' + esc(k) + ' · ' + ({ verificado: 'verificado', ficha: 'cuentas de la ficha', manual: 'manual', ia: 'asistente de IA' }[c.origen] || c.origen || '') + (ed != null ? ' hace ' + ed + ' d' : '') + '</div></div>' +
        '<div class="num">' + (R ? '<span class="pill ' + TONO[R.tono] + '">' + esc(R.veredicto.replace(' · ', ' · ')) + '</span><div class="meta">calidad ' + (R.calidad == null ? '—' : nf(R.calidad, 0) + '%') + (R.provisional ? ' · provisional' : '') + '</div>' : '<span class="pill">sin evaluar</span>') + '</div></div>';
    }).join('') : '<div class="empty">Aún no has cribado ninguna empresa. Escribe un ticker arriba.<br><br><button class="btn sec sm" data-c="inicial">Cargar mis 5 cribados verificados</button></div>') + '</div>';
    if (sin.length) h += '<details class="card"><summary>Fichas de valoración sin cribar (' + sin.length + ')</summary><div class="chips" style="margin-top:8px">' + sin.map(k => '<button class="btn sec sm" data-c="nuevo" data-k="' + esc(k) + '">' + esc(k) + '</button>').join('') + '</div></details>';
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
      '<div class="card" style="margin-top:10px;border-left:6px solid var(--' + ({ g: 'ok', y: 'warn', r: 'bad', n: 'mut' }[R.tono]) + ')"><div class="meta">' + esc(sel) + (c.nombre ? ' — ' + esc(c.nombre) : '') + '</div>' +
      '<h2 style="font-size:22px;margin:4px 0">' + esc(R.veredicto) + (R.provisional ? ' (provisional)' : '') + '</h2><p style="margin:0 0 8px">' + esc(R.sub) + '</p><div class="chips">' + chips + '</div>' +
      '<div style="margin-top:10px"><div class="small" style="display:flex;justify-content:space-between"><span>Calidad (A, B, C' + (R.S.length ? ', S' : '') + ')</span><b>' + (R.calidad == null ? '—' : nf(R.calidad, 0) + ' %') + '</b></div>' + barH(cc, calif.filter(x => x.estado !== 'n').length) +
      '<div class="small" style="display:flex;justify-content:space-between;margin-top:8px"><span>Múltiplo (D1, D3)</span><b>' + (R.precioPct == null ? '—' : nf(R.precioPct, 0) + ' %') + '</b></div>' + barH(cd, cd.g + cd.y + cd.r) + '</div>' +
      '<p class="small mut" style="margin:8px 0 0">Precio: ' + px + '</p></div>' +
      '<div class="tools"><button class="btn sm" data-c="editar">Editar datos</button><button class="btn sec sm" data-c="ficha">Datos desde la ficha</button><button class="btn sec sm" data-c="precio">Precio</button><button class="btn sec sm" data-c="ia">Pedir a una IA</button><button class="btn sec sm" data-c="verif">Datos verificados hoy</button></div>' +
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
    U.dlg('<h2>Pedir a una IA</h2><p class="small mut">Opcional. Copia el prompt, pégalo en el asistente que quieras (ChatGPT, Gemini, Claude…) y pega aquí el JSON que te devuelva. Sus datos son estimaciones: se marcan «sin verificar».</p>' +
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
    if (!cr[tk]) { const f = d.fichas[tk]; cr[tk] = { ticker: tk, nombre: f ? f.nombre : tk, origen: f ? 'ficha' : 'manual' }; if (f) { const r = desdeFicha(tk); } Store.save(); }
    sel = tk; U.render(); window.scrollTo(0, 0);
    if (!d.fichas[tk]) U.toast('Sin ficha de valoración: rellena los datos a mano o con «Pedir a una IA»');
  }
  U.clicks.push(e => {
    const t = e.target.closest('[data-c]'); if (!t) return false;
    const a = t.dataset.c;
    if (a === 'nuevo') nuevo(t.dataset.k || (document.getElementById('cr-new') || {}).value);
    else if (a === 'inicial') cargarInicial();
    else if (a === 'abrir') { sel = t.dataset.k; U.render(); window.scrollTo(0, 0); }
    else if (a === 'volver') { sel = null; U.render(); }
    else if (a === 'editar') editor();
    else if (a === 'precio') precioDlg();
    else if (a === 'ia') iaDlg();
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
