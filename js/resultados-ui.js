/* Pestaña Resultados trimestrales: calendario de presentaciones y revisión de cada una frente a la valoración.
   Registro en datos.json → resultados[{id,tk,periodo,fecha,estado:'pendiente'|'revisado',decision,nota,revisado,
     precio_ref,precio_fecha,ref_fin,            // precio y último trimestre de la SEC al anotarlo (para detectar «ya publicó» y la alerta de ±25 %)
     doce:{fin,dv,de,ventas,ebit,ni,deuda_neta,acciones,anio_base,fuente:'IA'|'manual'}, ia:{resumen,guidance,fuentes,fiabilidad},   // cifras de 12 meses de empresas sin SEC (o la SEC no las tiene aún)
     snap:{antes,despues,conMargen,desvVentas,desvEbit,veredicto,precio,fin,fuente}}]   // «foto» de la revisión: rentabilidad esperada antes y después
   Las fechas se introducen a mano o se importan de calendario_resultados.json (público). */
(function () {
  const L = Logic, U = window.UI, { esc, nf } = U, D = () => Store.get(), hoy = () => L.today();
  const DEC = { mantener: 'Mantener', vigilar: 'Vigilar de cerca', comprar: 'Comprar más', vender: 'Vender / reducir' };
  const VER = { linea: ['ok', 'En línea'], mejor: ['ok', 'Mejor de lo esperado'], peor: ['bad', 'Peor de lo esperado'], mixto: ['warn', 'Mixto: revisa'] };
  const isN = v => typeof v === 'number' && isFinite(v);
  const pc = v => (v == null ? '—' : (v > 0 ? '+' : '') + nf(v * 100, 1) + ' %'), pc0 = v => (v == null ? '—' : nf(v * 100, 1) + ' %');
  const enCartera = tk => D().posiciones.some(p => L.tickerDe(D(), p) === tk);
  const nombre = tk => (D().fichas[tk] || {}).nombre || tk;
  const trimestre = f => { const t = new Date(f || hoy()); let q = Math.floor(t.getUTCMonth() / 3), y = t.getUTCFullYear(); if (--q < 0) { q = 3; y--; } return 'T' + (q + 1) + ' ' + y; };   // se publica el trimestre anterior
  const finTrim = p => { const m = /T([1-4]) (\d{4})/.exec(p || ''); return m ? new Date(Date.UTC(+m[2], +m[1] * 3, 0)).toISOString().slice(0, 10) : null; };
  const dif = f => Math.round((Date.parse(f) - Date.parse(hoy())) / 864e5);
  const seguidas = () => Object.keys(D().fichas).filter(k => enCartera(k) || D().fichas[k].estado !== 'candidata').sort((a, b) => (enCartera(b) - enCartera(a)) || a.localeCompare(b));
  const precioDe = tk => { try { const p = L.precioFicha(D(), tk); return isN(p.precio) ? p : null; } catch (e) { return null; } };

  let CAL = null, calCargando = false;
  async function cargarCal() { if (CAL || calCargando) return; calCargando = true; try { const r = await fetch('calendario_resultados.json', { cache: 'no-store' }); if (r.ok) { CAL = await r.json(); U.render && U.render(); } } catch (e) { /* sin calendario */ } calCargando = false; }
  const sugeridas = (sin, conFecha) => CAL && CAL.fechas ? sin.filter(k => CAL.fechas[k] && !conFecha.has(k) && CAL.fechas[k].fecha >= hoy()).map(k => [k, CAL.fechas[k]]) : [];

  /* Último trimestre que la SEC ya tiene de la empresa (solo EE. UU.) */
  const secFin = tk => { const R = U.secRaw && U.secRaw(), e = R && R[tk]; return e && !e.error && e.ttm && e.ttm.fin ? e.ttm.fin : null; };
  const nuevoReg = (tk, c, extra) => { const p = precioDe(tk); return Object.assign({ id: 'r' + Date.now().toString(36) + tk, tk, periodo: (c && c.periodo) || trimestre(c && c.fecha), fecha: c && c.fecha || null, estado: 'pendiente', estimada: c && c.confirmada === false ? true : undefined,
    precio_ref: p ? p.precio : undefined, precio_fecha: p ? hoy() : undefined, ref_fin: secFin(tk) || undefined }, extra || {}); };
  const anotar = (tk, c) => D().resultados.push(nuevoReg(tk, c));

  /* ¿Ya ha publicado? Solo con la SEC: su último trimestre es posterior al que había al anotar la fecha (o, sin ese dato, ya cubre el periodo) */
  function publico(r) {
    const f = secFin(r.tk); if (!f || r.estado === 'revisado') return false;
    if (r.ref_fin) return f > r.ref_fin;
    const fp = finTrim(r.periodo); return !!fp && f >= new Date(Date.parse(fp) - 20 * 864e5).toISOString().slice(0, 10);
  }
  /* Cifras de 12 meses de una revisión: las suyas (IA/manual) o las de la SEC */
  function doceDe(r) {
    const f = D().fichas[r.tk]; if (!f) return null;
    if (r.doce && r.doce.anio_base === f.anio_base && isN(r.doce.dv)) return Object.assign({ fuente: r.doce.fuente || 'IA' }, r.doce);
    const sd = U.secDe && U.secDe(r.tk, f); return sd && sd.doce && isN(sd.doce.dv) ? Object.assign({ fuente: 'SEC' }, sd.doce) : null;
  }
  const revDe = r => { const dc = doceDe(r); return dc ? L.revision(D(), r.tk, dc, hoy()) : null; };
  const pillVer = v => (v && !v.error && VER[v.veredicto] ? '<span class="pill ' + VER[v.veredicto][0] + '">' + VER[v.veredicto][1] + '</span>' : '');

  /* ───── Avisos para otras pestañas ───── */
  const pendientes = () => (D().resultados || []).filter(r => r.estado !== 'revisado');
  U.etiquetasResultados = tk => {
    let h = ''; const P = pendientes().filter(r => r.tk === tk).sort((a, b) => (a.fecha || '9').localeCompare(b.fecha || '9'));
    const pub = P.find(publico), prox = P.find(r => r.fecha && dif(r.fecha) >= 0 && dif(r.fecha) <= 14);
    if (pub) h += ' <span class="pill warn" title="Resultados publicados: revisa si la valoración sigue en línea">resultados sin revisar</span>';
    else if (prox) h += ' <span class="pill" title="Próxima presentación de resultados">publica ' + (dif(prox.fecha) === 0 ? 'hoy' : 'en ' + dif(prox.fecha) + ' d') + '</span>';
    else if (P.some(r => r.fecha && dif(r.fecha) < 0)) h += ' <span class="pill warn" title="Pasó la fecha: ¿ya publicó?">¿publicó?</span>';
    const pr = L.precioRef(D(), tk, hoy());
    if (pr && pr.alerta) h += ' <span class="pill ' + (pr.cambio > 0 ? 'ok' : 'bad') + '" title="Precio frente al de la última revisión (' + nf(pr.ref, 2) + '): revisa por si ha cambiado el motivo">' + pc(pr.cambio) + ' desde la revisión</span>';
    return h;
  };
  U.avisosResultados = () => {
    const P = pendientes(), pub = P.filter(publico), prox = P.filter(r => !publico(r) && r.fecha && dif(r.fecha) >= 0 && dif(r.fecha) <= 7).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const vencidas = P.filter(r => !publico(r) && r.fecha && dif(r.fecha) < 0 && dif(r.fecha) >= -30);
    const precio = Object.keys(D().fichas).filter(k => (enCartera(k) || D().fichas[k].estado === 'watchlist') && (L.precioRef(D(), k, hoy()) || {}).alerta);
    if (!pub.length && !prox.length && !vencidas.length && !precio.length) return '';
    const fila = (r, tag, cls) => '<div class="row click" data-r="rev" data-id="' + esc(r.id) + '"><div class="main"><div class="name">' + esc(nombre(r.tk)) + '</div><div class="meta">' + esc(r.tk) + ' · ' + esc(r.periodo || '') + ' · ' + (enCartera(r.tk) ? 'cartera' : 'watchlist') + '</div></div><div class="num"><span class="pill ' + cls + '">' + tag + '</span></div></div>';
    let h = '<div class="sec-t"><h2>Resultados <span class="mut small">esta semana</span></h2></div><div class="card">';
    pub.forEach(r => { const v = revDe(r); h += fila(r, v && !v.error && VER[v.veredicto] ? VER[v.veredicto][1] : 'publicó: revisa', v && !v.error && VER[v.veredicto] ? VER[v.veredicto][0] : 'warn'); });
    prox.forEach(r => h += fila(r, dif(r.fecha) === 0 ? 'hoy' : 'en ' + dif(r.fecha) + ' d', 'ok'));
    vencidas.forEach(r => h += fila(r, 'hace ' + (-dif(r.fecha)) + ' d: ¿publicó?', 'warn'));
    precio.forEach(k => { const pr = L.precioRef(D(), k, hoy()); h += '<div class="row click" data-v="abrir-tk" data-k="' + esc(k) + '"><div class="main"><div class="name">' + esc(nombre(k)) + '</div><div class="meta">' + esc(k) + ' · precio ' + nf(pr.precio, 2) + ' vs ' + nf(pr.ref, 2) + ' en la última revisión: ¿hay motivo?</div></div><div class="num"><span class="pill ' + (pr.cambio > 0 ? 'ok' : 'bad') + '">' + pc(pr.cambio) + '</span></div></div>'; });
    return h + '</div>';
  };
  /* Historial de revisiones de una empresa (para la ficha) */
  U.historialResultados = tk => {
    const H = (D().resultados || []).filter(r => r.tk === tk && r.estado === 'revisado').sort((a, b) => (b.revisado || '').localeCompare(a.revisado || ''));
    if (!H.length) return '';
    return '<h3 style="margin:14px 2px 6px">Revisiones de resultados</h3><div class="card">' + H.map(r => {
      const s = r.snap || {}; return '<div class="row click" data-r="rev" data-id="' + esc(r.id) + '"><div class="main"><div class="name">' + esc(r.periodo || '') + ' · ' + esc(DEC[r.decision] || 'sin decisión') + '</div><div class="meta">' + esc(r.revisado || '') + (isN(s.antes) && isN(s.despues) ? ' · rentab. esperada ' + pc0(s.antes) + ' → ' + pc0(s.despues) : '') + (r.nota ? ' · ' + esc(r.nota).slice(0, 70) : '') + '</div></div><div class="num">' + pillVer(s) + '</div></div>';
    }).join('') + '</div>';
  };

  /* ───── Lista ───── */
  U.vistas.resultados = () => {
    cargarCal(); U.cargarSEC && U.cargarSEC();
    const d = D(), R = d.resultados || [], hechas = R.filter(r => r.estado === 'revisado').sort((a, b) => (b.revisado || '').localeCompare(a.revisado || ''));
    const pend = R.filter(r => r.estado !== 'revisado').sort((a, b) => (publico(b) - publico(a)) || (a.fecha || '9').localeCompare(b.fecha || '9'));
    const conFecha = new Set(pend.map(r => r.tk)), sin = seguidas().filter(k => !conFecha.has(k));
    let h = '<div class="tools"><button class="btn" data-r="nuevo">+ Añadir fecha</button></div>';
    h += '<p class="small mut" style="margin:0 2px 8px">Lo importante de cada resultado: ¿la empresa va como suponía tu valoración? Abre una fila para ver las cifras de los últimos 12 meses frente a lo esperado y cómo cambia la rentabilidad a 5 años. EE. UU. se rellena solo con la SEC; en el resto, una IA te saca las cifras.</p>';
    h += '<h3 style="margin:8px 2px 6px">Próximos resultados <span class="mut small">' + pend.length + '</span></h3><div class="card">' + (pend.length ? pend.map(r => {
      const n = r.fecha ? dif(r.fecha) : null, pub = publico(r), v = pub || r.doce ? revDe(r) : null;
      const tag = pub ? 'ya publicó' : n == null ? 'sin fecha' : n < 0 ? 'hace ' + (-n) + ' d: ¿ya publicó?' : n === 0 ? 'hoy' : 'en ' + n + ' d';
      return '<div class="row click" data-r="rev" data-id="' + esc(r.id) + '"><div class="main"><div class="name">' + esc(nombre(r.tk)) + '</div><div class="meta">' + (v ? pillVer(v) + ' ' : '') + esc(r.tk) + ' · ' + esc(r.periodo || '') + ' · ' + (enCartera(r.tk) ? 'cartera' : 'watchlist') + (v && !v.error && isN(v.antes) && isN(v.despues) ? ' · rentab. ' + pc0(v.antes) + ' → ' + pc0(v.despues) : '') + '</div></div><div class="num"><span class="pill ' + (pub ? 'warn' : n != null && n < 0 ? 'warn' : n != null && n <= 7 ? 'ok' : '') + '">' + esc(r.fecha || '—') + '</span><div class="meta">' + tag + (r.estimada ? ' · estimada' : '') + '</div></div></div>';
    }).join('') : '<div class="empty">Ninguna fecha anotada. Añade la de las empresas que quieras seguir.</div>') + '</div>';
    const sug = sugeridas(sin, conFecha);
    if (sug.length) h += '<div class="card"><div class="row"><div class="main"><div class="name">Calendario público</div><div class="meta">' + sug.length + ' fechas para tus empresas · «estimada» = según el año anterior</div></div><button class="btn sm" data-r="calall">Añadir todas</button></div>' + sug.map(([k, c]) => '<div class="row"><div class="main"><div class="name">' + esc(nombre(k)) + '</div><div class="meta">' + esc(k) + ' · ' + esc(c.fecha) + (c.confirmada ? ' · confirmada' : ' · estimada') + '</div></div><button class="btn sec sm" data-r="cal" data-k="' + esc(k) + '">Añadir</button></div>').join('') + '</div>';
    if (sin.length) h += '<details class="card"><summary>Sin fecha anotada (' + sin.length + ')</summary><div class="chips" style="margin-top:8px">' + sin.map(k => '<button class="btn sec sm" data-r="nuevo" data-k="' + esc(k) + '">' + esc(k) + '</button>').join('') + '</div></details>';
    if (hechas.length) h += '<h3 style="margin:14px 2px 6px">Revisados <span class="mut small">' + hechas.length + '</span></h3><div class="card">' + hechas.slice(0, 40).map(r => { const s = r.snap || {};
      return '<div class="row click" data-r="rev" data-id="' + esc(r.id) + '"><div class="main"><div class="name">' + esc(nombre(r.tk)) + ' · ' + esc(r.periodo || '') + '</div><div class="meta">' + pillVer(s) + ' ' + (isN(s.antes) && isN(s.despues) ? 'rentab. ' + pc0(s.antes) + ' → ' + pc0(s.despues) + ' · ' : '') + esc(r.nota || '').slice(0, 80) + '</div></div><div class="num"><span class="pill">' + esc(DEC[r.decision] || '—') + '</span><div class="meta">' + esc(r.revisado || '') + '</div></div></div>'; }).join('') + '</div>';
    return h;
  };

  function nuevo(tk) {
    const ks = seguidas();
    U.dlg('<h2>Fecha de resultados</h2><label for="r-tk">Empresa</label><select id="r-tk">' + ks.map(k => '<option value="' + esc(k) + '"' + (k === tk ? ' selected' : '') + '>' + esc(nombre(k)) + ' (' + esc(k) + ')</option>').join('') + '</select>' +
      '<div class="f2">' + U.campo('r-f', 'Fecha de presentación', '', 'date') + U.campo('r-p', 'Periodo (ej. T3 2026)', '') + '</div><p class="small mut">La fecha la ves en la web de relación con inversores o en tu broker. Puedes dejarla en blanco y ponerla luego.</p>' +
      '<div class="acts"><button class="btn sec" data-a="cerrar">Cancelar</button><button class="btn" id="r-ok">Guardar</button></div>', dd => {
      dd.querySelector('#r-ok').onclick = () => { const t = U.val('r-tk'), f = U.val('r-f'); D().resultados.push(nuevoReg(t, { fecha: f || null, periodo: U.val('r-p') || trimestre(f), confirmada: true })); U.guardar({ ok: true, msg: 'Fecha anotada' }); }; });
  }

  /* ───── Prompt para una IA (empresas sin SEC, o cuando la SEC aún no tiene el trimestre) ───── */
  function promptIA(r) {
    const f = D().fichas[r.tk] || {}, h = f.hist || {}, n = (h.ventas || []).length - 1, g = k => (h[k] || [])[n];
    const esc1 = Object.assign({}, L.V.defaults(f).conservador, (f.escenarios || {}).conservador || {});
    const ebit = isN(g('ebit')) ? g('ebit') - (isN((h.extra || [])[n]) ? h.extra[n] : 0) : null, nd = (isN(g('deuda')) ? g('deuda') : 0) + (isN(g('leases_deuda')) ? g('leases_deuda') : 0) - (isN(g('caja')) ? g('caja') : 0);
    const r1 = x => (isN(x) ? Math.round(x * 10) / 10 : 'n/d');
    return 'Necesito las cifras de los ÚLTIMOS 12 MESES (suma de los 4 últimos trimestres publicados) de ' + (f.nombre || r.tk) + ' (ticker ' + (f.ticker || r.tk) + '), para comprobar si va en línea con mi valoración. Busca en internet los resultados trimestrales más recientes (' + (r.periodo || 'último trimestre') + ' o el último que exista).\n\n' +
      'CÓMO BUSCAR: usa la nota de prensa/presentación de resultados de la web de relación con inversores y contrástala con páginas financieras de prestigio (Yahoo Finance, MarketScreener, Investing.com, Morningstar, Reuters, TIKR, StockAnalysis…). Si un dato no está publicado todavía o las fuentes no coinciden, pon null y dilo en "resumen"; NO inventes ni estimes.\n\n' +
      'MIS CIFRAS DEL AÑO BASE (' + f.anio_base + ', en millones de ' + (f.divisa || '') + ', para que uses las mismas unidades y el mismo criterio): ventas ' + r1(g('ventas')) + ' · EBIT recurrente ' + r1(ebit) + ' · deuda neta ' + r1(nd) + ' · acciones (millones) ' + r1(g('acciones')) + '.\n' +
      'LO QUE SUPONÍA MI VALORACIÓN: crecimiento de ventas ' + r1(esc1.g * 100) + ' % anual (se va moderando) y margen EBIT ' + r1(esc1.m * 100) + ' %.\n\n' +
      'DEVUELVE SOLO ESTE JSON (sin texto antes ni después), importes en millones de ' + (f.divisa || 'la divisa de mis cifras') + ':\n' +
      '{"periodo":"T3 2026","fin":"AAAA-MM-DD (cierre del último trimestre publicado)","ventas_12m":0,"ebit_12m":0,"ni_12m":0,"deuda_neta":0,"acciones":0,"guidance":"previsión de la dirección para el año, si la dio","resumen":"2-4 frases: qué ha pasado frente a lo esperado (ventas, margen, deuda, recompras o dilución, hechos extraordinarios)","fiabilidad":"alta|media|baja","fuentes":["url o nombre de cada fuente usada"]}\n' +
      'EBIT = resultado de explotación (excluye extraordinarios y deterioros si puedes). deuda_neta = deuda financiera − caja del último balance. acciones = diluidas, en millones.';
  }
  function parseIA(txt, r) {
    const m = /\{[\s\S]*\}/.exec(txt || ''); if (!m) throw new Error('No encuentro el JSON en lo que has pegado.');
    let j; try { j = JSON.parse(m[0]); } catch (e) { throw new Error('El JSON no es válido (' + e.message + ').'); }
    const f = D().fichas[r.tk], h = f.hist, n = h.ventas.length - 1, v0 = h.ventas[n], eb0 = h.ebit[n] - (isN((h.extra || [])[n]) ? h.extra[n] : 0), num = x => (isN(x) ? x : typeof x === 'string' && x.trim() !== '' && isFinite(Number(x.replace(',', '.'))) ? Number(x.replace(',', '.')) : null);
    const ventas = num(j.ventas_12m), ebit = num(j.ebit_12m);
    if (ventas == null) throw new Error('Falta ventas_12m: la IA no ha encontrado la cifra. Prueba con otra fuente o introdúcela tú.');
    if (!/^\d{4}-\d\d-\d\d$/.test(j.fin || '')) throw new Error('Falta la fecha de cierre del trimestre ("fin": AAAA-MM-DD).');
    const dv = ventas / v0 - 1, de = ebit != null && eb0 > 0 ? ebit / eb0 - 1 : null;
    const avisos = []; if (ventas / v0 > 3 || ventas / v0 < 0.33) avisos.push('Las ventas de 12 meses son ' + nf(ventas / v0, 1) + ' veces las de tu año base: revisa unidades (millones) y divisa.');
    if (ebit == null) avisos.push('Sin EBIT de 12 meses: solo se compara con las ventas.');
    return { doce: { fin: j.fin, dv, de, ventas, ebit, ni: num(j.ni_12m), deuda_neta: num(j.deuda_neta) == null ? undefined : num(j.deuda_neta), acciones: num(j.acciones) == null ? undefined : num(j.acciones), anio_base: f.anio_base, fuente: 'IA' },
      ia: { resumen: String(j.resumen || ''), guidance: String(j.guidance || ''), fuentes: Array.isArray(j.fuentes) ? j.fuentes.map(String) : [], fiabilidad: String(j.fiabilidad || ''), periodo: String(j.periodo || ''), fecha: hoy() }, avisos };
  }

  function dialogoIA(r, vuelta) {
    U.dlg('<h2>Cifras de 12 meses con una IA</h2><p class="small mut">1) Copia el texto y pégalo en una IA con búsqueda web (Claude, ChatGPT, Gemini…). 2) Pega aquí su respuesta (el JSON). Las cifras quedan marcadas «IA, sin verificar»: si la fiabilidad es baja, contrasta con la presentación de resultados.</p>' +
      '<textarea id="ia-p" rows="7" readonly>' + esc(promptIA(r)) + '</textarea><div class="acts"><button class="btn sec" id="ia-copy">Copiar texto</button></div>' +
      '<label for="ia-r">Respuesta de la IA</label><textarea id="ia-r" rows="6" placeholder="Pega aquí el JSON"></textarea><div id="ia-err" class="alert bad" style="display:none"></div>' +
      '<div class="acts"><button class="btn sec" id="ia-vuelve">Volver</button><button class="btn" id="ia-ok">Usar estas cifras</button></div>', dd => {
      dd.querySelector('#ia-copy').onclick = () => { const t = dd.querySelector('#ia-p'); t.select(); try { navigator.clipboard.writeText(t.value); } catch (err) { document.execCommand && document.execCommand('copy'); } U.toast('Texto copiado'); };
      dd.querySelector('#ia-vuelve').onclick = () => vuelta();
      dd.querySelector('#ia-ok').onclick = () => {
        try { const o = parseIA(dd.querySelector('#ia-r').value, r); r.doce = o.doce; r.ia = o.ia; if (o.ia.periodo && /T[1-4] \d{4}/.test(o.ia.periodo)) r.periodo = o.ia.periodo; Store.save(); U.render(); vuelta(o.avisos); }
        catch (e) { const b = dd.querySelector('#ia-err'); b.style.display = ''; b.textContent = e.message; }
      };
    });
  }

  /* ───── Revisión ───── */
  const fila3 = (t, a, b, c) => '<tr><td>' + t + '</td><td>' + a + '</td><td>' + b + '</td><td>' + c + '</td></tr>';
  function revisar(id, avisosExtra) {
    const d = D(), r = d.resultados.find(x => x.id === id); if (!r) return;
    const f = d.fichas[r.tk], v = L.valoracion(d, r.tk, hoy()), ok = v && v.ref != null, dc = doceDe(r), rv = dc ? L.revision(d, r.tk, dc, hoy()) : null, tieneRv = rv && !rv.error, pub = publico(r);
    const cartera = enCartera(r.tk), esp = tieneRv && rv.ebitEsp != null;
    let cuerpo = '';
    if (tieneRv) {
      const cls = VER[rv.veredicto][0] === 'ok' ? '' : VER[rv.veredicto][0] === 'bad' ? ' bad' : ' warn', dRef = isN(rv.despues) && isN(rv.antes) ? rv.despues - rv.antes : null;
      cuerpo += '<div class="alert' + cls + '" style="margin-top:8px"><b>' + VER[rv.veredicto][1] + '.</b> ' + (rv.veredicto === 'linea' ? 'Las cifras de 12 meses están dentro de lo que suponía tu valoración.' : rv.veredicto === 'mejor' ? 'La empresa va por encima de lo que suponía tu valoración.' : rv.veredicto === 'peor' ? 'La empresa va por debajo de lo que suponía tu valoración: revisa si la tesis sigue en pie antes de decidir.' : 'Una señal sube y otra baja: mira el detalle.') + '</div>' +
        '<p class="small mut" style="margin:6px 0">Últimos 12 meses hasta ' + esc(rv.fin) + ' (' + esc(dc.fuente) + ') frente al año base ' + f.anio_base + '. «Esperado» = lo que proyectaba tu escenario conservador para ese mismo periodo.</p>' +
        '<table class="small" style="width:100%;border-collapse:collapse"><tr class="mut"><td></td><td>Real</td><td>Esperado</td><td>Desviación</td></tr>' +
        fila3('Ventas', pc(rv.dv), pc(rv.ventasEsp), '<b class="' + (Math.abs(rv.desvVentas) >= 0.1 ? (rv.desvVentas > 0 ? 'c-g' : 'c-r') : '') + '">' + pc(rv.desvVentas) + '</b>') +
        (esp ? fila3('EBIT', pc(rv.de), pc(rv.ebitEsp), '<b class="' + (Math.abs(rv.desvEbit) >= 0.1 ? (rv.desvEbit > 0 ? 'c-g' : 'c-r') : '') + '">' + pc(rv.desvEbit) + '</b>') : fila3('EBIT', rv.de == null ? 'n/d' : pc(rv.de), '—', '—')) +
        (rv.margenBase != null && rv.margen12 != null ? fila3('Margen EBIT', pc0(rv.margen12), pc0(rv.margenBase) + ' (año base)', '') : '') + '</table>' +
        '<div class="kpis" style="margin-top:8px"><div class="kpi"><span>Rentab. esperada antes</span><b>' + pc0(rv.antes) + '</b><span>con las cifras del año ' + f.anio_base + '</span></div><div class="kpi"><span>Después (mismos supuestos)</span><b class="' + (dRef != null && Math.abs(dRef) >= 0.015 ? (dRef > 0 ? 'c-g' : 'c-r') : '') + '">' + pc0(rv.despues) + '</b><span>partiendo de los 12 meses · ' + (dRef == null ? '' : (dRef > 0 ? '+' : '') + nf(dRef * 100, 1) + ' pp') + '</span></div></div>' +
        (rv.conMargen != null ? '<p class="small mut" style="margin:6px 0 0">Si el margen de 12 meses (' + pc0(rv.margen12) + ') se mantuviera en vez de volver al histórico (' + pc0(rv.margenBase) + '): rentabilidad esperada <b>' + pc0(rv.conMargen) + '</b>. La verdad suele estar entre las dos cifras.</p>' : '') +
        ((Math.abs(rv.desvVentas) > 0.3 || (rv.desvEbit != null && Math.abs(rv.desvEbit) > 0.5)) ? '<div class="alert warn" style="margin-top:8px">Desviación muy grande: antes de fiarte, comprueba si hay una adquisición, una venta de negocio o una ampliación de capital (cambian ventas y acciones), o un extraordinario en el EBIT.</div>' : '') +
        '<p class="small mut" style="margin:6px 0 0">Precio hoy ' + nf(rv.precio, 2) + (v && v.entrada ? ' · entrada ' + nf(v.entrada, 2) : '') + '. Esto compara con el año base de la ficha: no sustituye a actualizar las cuentas.</p>';
      if (r.ia && (r.ia.resumen || r.ia.guidance)) cuerpo += '<details class="card" style="margin-top:8px"><summary>Resumen de la IA' + (r.ia.fiabilidad ? ' · fiabilidad ' + esc(r.ia.fiabilidad) : '') + '</summary><p class="small">' + esc(r.ia.resumen) + '</p>' + (r.ia.guidance ? '<p class="small"><b>Guidance:</b> ' + esc(r.ia.guidance) + '</p>' : '') + (r.ia.fuentes && r.ia.fuentes.length ? '<p class="small mut">Fuentes: ' + r.ia.fuentes.map(esc).join(' · ') + '</p>' : '') + '</details>';
    } else {
      cuerpo += (ok ? '<div class="kpis"><div class="kpi"><span>Rentab. esperada</span><b>' + nf(v.ref * 100, 1) + ' %</b><span>5 años, antes de los resultados</span></div><div class="kpi"><span>Precio de entrada</span><b>' + nf(v.entrada, 2) + '</b><span>precio ' + nf(v.precio, 2) + '</span></div></div>' : '') +
        '<div class="alert" style="background:var(--chip)">' + (f && f.divisa === 'USD' && secFin(r.tk) ? 'Aún no hay un trimestre nuevo en la SEC (último: ' + esc(secFin(r.tk)) + '). Se actualiza solo cada domingo, o pide las cifras a una IA ahora.' : 'Para ver si va en línea con tu valoración necesito las cifras de 12 meses. Pídeselas a una IA con búsqueda web (te preparo el texto) o espera a actualizar las cuentas.') + '</div>';
    }
    if (avisosExtra && avisosExtra.length) cuerpo += avisosExtra.map(a => '<div class="alert warn">' + esc(a) + '</div>').join('');
    const nuevoEj = U.secDe && (U.secDe(r.tk, f) || {}).nuevo;
    U.dlg('<h2>' + esc(nombre(r.tk)) + ' · ' + esc(r.periodo || '') + '</h2><p class="small mut" style="margin:0">' + (cartera ? 'En cartera' : 'Watchlist') + (pub ? ' · <b>ya ha publicado</b> (SEC)' : '') + '</p>' + cuerpo +
      (nuevoEj ? '<div class="alert warn" style="margin-top:8px">La SEC ya tiene el ejercicio ' + nuevoEj + ' completo y la ficha llega a ' + f.anio_base + ': actualízala en Valoración («Añadir ' + nuevoEj + ' desde la SEC»).</div>' : '') +
      '<div class="acts" style="margin-top:8px"><button class="btn sec" id="r-ia">' + (r.doce ? 'Cambiar cifras (IA)' : 'Cifras con una IA') + '</button><button class="btn sec" id="r-val">Abrir valoración</button></div>' +
      '<div class="f2">' + U.campo('r-fe', 'Fecha', r.fecha || '', 'date') + U.campo('r-pe', 'Periodo', r.periodo || '') + '</div>' +
      '<label for="r-d">Decisión</label><select id="r-d"><option value="">—</option>' + Object.keys(DEC).map(k => '<option value="' + k + '"' + (r.decision === k ? ' selected' : '') + '>' + DEC[k] + '</option>').join('') + '</select>' +
      '<label for="r-n">Notas de la revisión</label><textarea id="r-n" rows="3">' + esc(r.nota || '') + '</textarea>' +
      '<p class="small mut">Criterio de venta: solo si hay sobrevaloración clara (precio sobre valor), no por ruido. Si la desviación es mala, mira antes si es pasajera o cambia la tesis.</p>' +
      '<div class="acts"><button class="btn sec" id="r-del">Eliminar</button><button class="btn sec" id="r-sv">Guardar</button><button class="btn" id="r-ok">' + (r.estado === 'revisado' ? 'Reabrir' : 'Marcar revisado') + '</button></div>', dd => {
      const set = (fin) => {
        r.fecha = U.val('r-fe') || null; r.periodo = U.val('r-pe') || r.periodo; r.decision = U.val('r-d') || null; r.nota = dd.querySelector('#r-n').value.trim();
        if (fin === 'rev') {
          r.estado = 'revisado'; r.revisado = hoy(); const p = precioDe(r.tk);
          r.snap = Object.assign({ precio: p ? p.precio : undefined, fecha: hoy(), fuente: dc ? dc.fuente : undefined }, tieneRv ? { antes: rv.antes, despues: rv.despues, conMargen: rv.conMargen, desvVentas: rv.desvVentas, desvEbit: rv.desvEbit, veredicto: rv.veredicto, fin: rv.fin } : (ok ? { antes: v.ref } : {}));
          if (!isN(r.snap.precio)) delete r.snap.precio;
        }
        if (fin === 'reabrir') { r.estado = 'pendiente'; delete r.revisado; }
        U.guardar({ ok: true, msg: fin === 'rev' ? 'Revisión guardada' : 'Guardado' });
      };
      dd.querySelector('#r-sv').onclick = () => set(); dd.querySelector('#r-ok').onclick = () => set(r.estado === 'revisado' ? 'reabrir' : 'rev');
      dd.querySelector('#r-ia').onclick = () => dialogoIA(r, av => revisar(id, av));
      dd.querySelector('#r-val').onclick = () => { U.cerrar(); U.abrirFicha ? U.abrirFicha(r.tk) : null; };
      dd.querySelector('#r-del').onclick = () => { if (confirm('¿Eliminar este registro?')) { d.resultados.splice(d.resultados.indexOf(r), 1); U.guardar({ ok: true, msg: 'Eliminado' }); } };
    });
  }
  U.clicks.push(e => { const t = e.target.closest('[data-r]'); if (!t) return false; if (t.dataset.r === 'nuevo') nuevo(t.dataset.k);
    else if (t.dataset.r === 'cal' && CAL) { const c = CAL.fechas[t.dataset.k]; if (c) { anotar(t.dataset.k, c); U.guardar({ ok: true, msg: 'Fecha anotada' }); } }
    else if (t.dataset.r === 'calall' && CAL) { const cf = new Set(D().resultados.filter(r => r.estado !== 'revisado').map(r => r.tk)); sugeridas(seguidas(), cf).forEach(([k, c]) => anotar(k, c)); U.guardar({ ok: true, msg: 'Fechas anotadas' }); } else if (t.dataset.r === 'rev') revisar(t.dataset.id); else return false; return true; });
  U._resultados = { publico, doceDe, promptIA, parseIA, revDe };
})();
