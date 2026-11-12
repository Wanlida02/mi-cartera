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
  U.abrirResultados = tk => { U.irA('resultados'); };
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
  U.etiquetasResultados = tk => { try { return etiquetas(tk); } catch (e) { return ''; } };
  const etiquetas = tk => {
    let h = ''; const P = pendientes().filter(r => r.tk === tk).sort((a, b) => (a.fecha || '9').localeCompare(b.fecha || '9'));
    const pub = P.find(publico), prox = P.find(r => r.fecha && dif(r.fecha) >= 0 && dif(r.fecha) <= 14);
    if (pub) h += ' <span class="pill warn" title="Resultados publicados: revisa si la valoración sigue en línea">resultados sin revisar</span>';
    else if (prox) h += ' <span class="pill" title="Próxima presentación de resultados">publica ' + (dif(prox.fecha) === 0 ? 'hoy' : 'en ' + dif(prox.fecha) + ' d') + '</span>';
    else if (P.some(r => r.fecha && dif(r.fecha) < 0)) h += ' <span class="pill warn" title="Pasó la fecha: ¿ya publicó?">¿publicó?</span>';
    const pr = L.precioRef(D(), tk, hoy());
    if (pr && pr.alerta) h += ' <span class="pill ' + (pr.cambio > 0 ? 'ok' : 'bad') + '" title="Precio frente al de la última revisión (' + nf(pr.ref, 2) + '): revisa por si ha cambiado el motivo">' + pc(pr.cambio) + ' desde la revisión</span>';
    return h;
  };
  U.avisosResultados = () => { try { return avisos(); } catch (e) { console.error(e); return ''; } };
  const avisos = () => {
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
  U.historialResultados = tk => { try { return historial(tk); } catch (e) { return ''; } };
  const historial = tk => {
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
    let h = (U.lineaPrecios ? U.lineaPrecios() : '') + '<div class="tools"><button class="btn" data-r="nuevo">+ Añadir fecha</button></div>';
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

  /* ───── Prompt para una IA (empresas sin SEC, o cuando la SEC aún no tiene el trimestre) ─────
     La IA solo copia los últimos trimestres; la SUMA de 12 meses la hace la app (los modelos fallan sumando). Dos modos: «navegar» y «pegar» (vale con cualquier IA). */
  function promptIA(r, modo, sym) {
    const f = D().fichas[r.tk] || {}, h = f.hist || {}, n = (h.ventas || []).length - 1, g = k => (h[k] || [])[n], div = f.divisa || 'EUR', s0 = sym || (U.simboloYahoo ? U.simboloYahoo(r.tk) : r.tk);
    let esc1 = null; try { esc1 = Object.assign({}, L.V.defaults(f).conservador, (f.escenarios || {}).conservador || {}); } catch (e) { /* ficha borrador sin todas las líneas */ }
    const ebit = isN(g('ebit')) ? g('ebit') - (isN((h.extra || [])[n]) ? h.extra[n] : 0) : null, r1 = x => (isN(x) ? Math.round(x * 10) / 10 : 'n/d');
    const cab = 'Eres un analista financiero. Tarea: copiar los ÚLTIMOS 5 TRIMESTRES publicados de ' + (f.nombre || r.tk) + ' (símbolo ' + s0 + ', divisa ' + div + ') para que yo compruebe si va en línea con mi valoración (' + (r.periodo || 'último trimestre') + ' o el último que exista). NO sumes ni calcules nada: solo copia trimestre a trimestre.\n' +
      'Para que uses la empresa y las unidades correctas, mi año base (' + f.anio_base + ', millones de ' + div + '): ventas ' + r1(g('ventas')) + ' · EBIT ' + r1(ebit) + ' · deuda neta ' + r1(g('deuda') != null ? (g('deuda') || 0) + (g('leases_deuda') || 0) - (g('caja') || 0) : null) + '.\n';
    const datos = 'POR CADA TRIMESTRE (del más reciente al más antiguo, 5 trimestres, millones de ' + div + ', números):\n- fin: fecha de cierre del trimestre (AAAA-MM-DD)\n- ventas (revenue)\n- ebit (operating income / resultado de explotación)\n- ebitda (opcional, si lo ves)\n' +
      'Aparte, del último balance: deuda_neta (deuda financiera − caja) y acciones (diluidas, millones), si los ves.\n';
    const formato = 'FORMATO:\n{"trimestres":[{"fin":"2026-09-30","ventas":0,"ebit":0,"ebitda":0},{"fin":"2026-06-30","ventas":0,"ebit":0,"ebitda":0}],"por_fuente":{"StockAnalysis":[{"fin":"2026-09-30","ventas":0,"ebit":0}],"Yahoo":[{"fin":"2026-09-30","ventas":0,"ebit":0}]},"deuda_neta":0,"acciones":0,"guidance":"previsión de la dirección, si la dan","resumen":"2-4 frases: qué ha pasado y diferencias entre fuentes","fiabilidad":"alta|media|baja"}\n("trimestres" = el dato que consideres bueno; "por_fuente" = lo que da cada fuente por separado, para poder contrastarlas. Si difieren más de un 3 %, en "trimestres" pon el de la nota de resultados de la empresa o el de StockAnalysis y explícalo en "resumen".)\n';
    const reglas = 'REGLAS: usa SOLO datos de las páginas indicadas (no tu memoria, no estimes, no inventes). Si un dato no aparece pon null. Números sin texto ni símbolos, con punto decimal. Responde SOLO con el JSON, sin texto antes ni después.';
    const sup = (esc1 ? 'Mi valoración suponía: ventas +' + r1(esc1.g * 100) + ' % anual y margen EBIT ' + r1(esc1.m * 100) + ' % (solo para tu contexto).\n' : '');
    if (modo === 'pegar') return cab + sup + '\nDebajo de este mensaje te pego el TEXTO COPIADO de las páginas de resultados trimestrales de StockAnalysis y/o Yahoo Finance. No necesitas navegar ni buscar nada.\n\n' + datos + '\n' + formato + '\n' + reglas + '\n\n=== TEXTO COPIADO DE LAS PÁGINAS (pégalo aquí debajo) ===\n';
    const E = (U.enlacesDatos ? U.enlacesDatos(s0, true) : []);
    return cab + sup + '\nPASO 1. Abre estas páginas (resultados trimestrales):\n' + E.map(x => '- ' + x.n + ': ' + x.u).join('\n') + '\nSi no puedes abrir páginas web, responde SOLO {"error":"sin_navegacion"} y nada más (no respondas de memoria). Si alguna no carga, usa las demás o la nota de resultados de la web de relación con inversores.\n\nPASO 2. Copia los trimestres.\n\n' + datos + '\n' + formato + '\n' + reglas;
  }
  /* Suma de los 4 últimos trimestres consecutivos (la hace la app) */
  function sumar4(trims, num) {
    const T = (trims || []).map(t => ({ fin: t && t.fin, ventas: num(t && t.ventas), ebit: num(t && t.ebit), ebitda: num(t && t.ebitda) })).filter(t => /^\d{4}-\d\d-\d\d$/.test(t.fin || '') && t.ventas != null).sort((a, b) => b.fin.localeCompare(a.fin));
    if (T.length < 4) return null; const q = T.slice(0, 4);
    for (let i = 0; i < 3; i++) { const d = (Date.parse(q[i].fin) - Date.parse(q[i + 1].fin)) / 864e5; if (d < 60 || d > 125) return { error: 'Los trimestres no son consecutivos (' + q[i + 1].fin + ' → ' + q[i].fin + '): pide a la IA los 4 últimos seguidos.' }; }
    const sum = k => (q.every(t => t[k] != null) ? q.reduce((a, t) => a + t[k], 0) : null);
    return { fin: q[0].fin, ventas: sum('ventas'), ebit: sum('ebit'), ebitda: sum('ebitda'), trimestres: q };
  }
  const NORM = k => String(k).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_]/g, '');
  function parseIA(txt, r) {
    const m = /\{[\s\S]*\}/.exec(txt || ''); if (!m) throw new Error('No encuentro el JSON en lo que has pegado.');
    let j0; try { j0 = JSON.parse(m[0]); } catch (e) { throw new Error('El JSON no es válido (' + e.message + '). Pídele a la IA que lo repita «solo con el JSON, sin texto».'); }
    if (/sin_navegacion/.test(String(j0.error || ''))) throw new Error('Esa IA no puede abrir páginas web. Cambia a «Mi IA no puede abrir páginas»: abre los enlaces, copia el texto de las páginas y pégaselo a la IA debajo del texto.');
    const j = {}; Object.keys(j0).forEach(k => { const n = NORM(k); j[{ trimestres: 'trimestres', quarters: 'trimestres', porfuente: 'por_fuente', por_fuente: 'por_fuente', deudaneta: 'deuda_neta', deuda_neta: 'deuda_neta' }[n] || k] = j0[k]; });
    const f = D().fichas[r.tk], h = f.hist, n = h.ventas.length - 1, v0 = h.ventas[n], eb0 = h.ebit[n] - (isN((h.extra || [])[n]) ? h.extra[n] : 0), num = x => (isN(x) ? x : typeof x === 'string' && x.trim() !== '' && isFinite(Number(x.replace(/\s/g, '').replace(',', '.'))) ? Number(x.replace(/\s/g, '').replace(',', '.')) : null);
    const avisos = []; let ventas, ebit, fin, ebitda = null, tri = null;
    if (Array.isArray(j.trimestres)) {   // formato nuevo: la app suma
      tri = sumar4(j.trimestres, num); if (!tri) throw new Error('Necesito al menos 4 trimestres con fecha de cierre y ventas' + (j.resumen ? ' (la IA dice: «' + String(j.resumen).slice(0, 140) + '»)' : '') + '. Si esa IA no navega, usa «Mi IA no puede abrir páginas».'); if (tri.error) throw new Error(tri.error);
      ventas = tri.ventas; ebit = tri.ebit; ebitda = tri.ebitda; fin = tri.fin;
    } else { ventas = num(j.ventas_12m); ebit = num(j.ebit_12m); ebitda = num(j.ebitda_12m); fin = j.fin; }   // formato antiguo: la IA ya suma
    if (ventas == null) throw new Error('La IA no ha encontrado las cifras' + (j.resumen ? ' (dice: «' + String(j.resumen).slice(0, 160) + '»)' : '') + '. Si esa IA no navega, usa «Mi IA no puede abrir páginas» y pega tú el texto.');
    if (!/^\d{4}-\d\d-\d\d$/.test(fin || '')) throw new Error('Falta la fecha de cierre del trimestre ("fin": AAAA-MM-DD).');
    const da0 = (h.da || [])[n];
    if (ebit == null && ebitda != null && isN(da0)) { ebit = ebitda - da0; avisos.push('La fuente no da el EBIT: lo estimo como EBITDA de 12 meses − la amortización del año base (' + nf(da0, 0) + ' M). Es una aproximación.'); }
    const dv = ventas / v0 - 1, de = ebit != null && eb0 > 0 ? ebit / eb0 - 1 : null;
    if (ventas / v0 > 3 || ventas / v0 < 0.33) avisos.push('Las ventas de 12 meses son ' + nf(ventas / v0, 1) + ' veces las de tu año base: revisa unidades (millones) y divisa.');
    if (ebit == null) avisos.push('Sin EBIT de 12 meses: solo se compara con las ventas.');
    if (tri) avisos.push('Trimestres sumados por la app: ' + tri.trimestres.map(t => t.fin).reverse().join(', ') + '.');
    // contraste entre fuentes
    const pf = j.por_fuente && typeof j.por_fuente === 'object' ? j.por_fuente : null, fuentes = [];
    if (pf && tri) Object.keys(pf).forEach(nm => { const sx = sumar4((Array.isArray(pf[nm]) ? pf[nm] : []).filter(t => tri.trimestres.some(q => q.fin === (t && t.fin))), num); if (sx && !sx.error) fuentes.push({ fuente: nm, ventas: sx.ventas, ebit: sx.ebit }); });
    const ct = !pf && Array.isArray(j.contraste) ? j.contraste.map(x => ({ fuente: x && x.fuente, ventas: num(x && x.ventas_12m), ebit: num(x && x.ebit_12m) })) : fuentes;
    [['ventas', 'ventas', ventas], ['ebit', 'EBIT', ebit]].forEach(([k, nom, val]) => { const vs = ct.filter(x => x[k] != null).map(x => ({ fuente: x.fuente, valores: [x[k]] }));
      if (val == null) return; if (vs.length < 2) { avisos.push('Sin contraste: ' + nom + ' de 12 meses viene de ' + (vs.length ? 'una sola fuente (' + (vs[0].fuente || '?') + ')' : 'una fuente sin detallar') + '. Compruébalo en otra.'); return; }
      const rc = L.contrastar(vs, [val], 0.03); if (rc.discrepancias.length) { const x = rc.discrepancias[0]; avisos.push('Las fuentes no coinciden en ' + nom + ': ' + x.min.f + ' ' + nf(x.min.v, 0) + ' vs ' + x.max.f + ' ' + nf(x.max.v, 0) + ' (' + Math.round(x.dif * 100) + ' %). Mira cuál es la buena antes de decidir.'); } });
    return { doce: { fin, dv, de, ventas, ebit, ni: num(j.ni_12m), deuda_neta: num(j.deuda_neta) == null ? undefined : num(j.deuda_neta), acciones: num(j.acciones) == null ? undefined : num(j.acciones), anio_base: f.anio_base, fuente: 'IA' },
      ia: { resumen: String(j.resumen || ''), guidance: String(j.guidance || ''), fuentes: Array.isArray(j.fuentes) ? j.fuentes.map(String) : pf ? Object.keys(pf) : [], fiabilidad: String(j.fiabilidad || ''), periodo: String(j.periodo || ''), fecha: hoy() }, avisos };
  }

  function dialogoIA(r, vuelta) {
    const sym0 = U.simboloYahoo ? U.simboloYahoo(r.tk) : r.tk; U.cargarSimb && U.cargarSimb();
    U.dlg('<h2>Cifras de 12 meses con una IA</h2><p class="small mut">Vale con cualquier IA (Claude, ChatGPT, Gemini…). La IA solo copia los últimos trimestres y la app hace la suma. Las cifras quedan marcadas «IA, sin verificar».</p>' +
      '<div class="f2">' + U.campo('ia-sym', 'Símbolo en Yahoo (ej. VID.MC)', sym0) + '<div><label for="ia-modo">Mi IA…</label><select id="ia-modo"><option value="pegar">no puede abrir páginas (pego yo el texto)</option><option value="nav">puede abrir páginas web</option></select></div></div>' +
      '<div id="ia-ayuda" class="small" style="margin:6px 0"></div><textarea id="ia-p" rows="7" readonly></textarea><div class="acts"><button class="btn sec" id="ia-copy">Copiar texto</button></div>' +
      '<label for="ia-r">Respuesta de la IA (el JSON)</label><textarea id="ia-r" rows="6" placeholder="Pega aquí el JSON"></textarea><div id="ia-err" class="alert bad" style="display:none"></div>' +
      '<div class="acts"><button class="btn sec" id="ia-vuelve">Volver</button><button class="btn" id="ia-ok">Usar estas cifras</button></div>', dd => {
      const pintar = () => { const modo = dd.querySelector('#ia-modo').value, sym = dd.querySelector('#ia-sym').value.trim() || sym0; dd.querySelector('#ia-p').value = promptIA(r, modo, sym);
        dd.querySelector('#ia-ayuda').innerHTML = modo === 'pegar' ? '<b>Cómo hacerlo:</b> 1) abre estos enlaces, en cada uno Ctrl+A y Ctrl+C, y pega el texto debajo del mensaje en tu IA; 2) copia el texto de abajo y pégalo al principio; 3) pega aquí su respuesta.<br>' + (U.enlacesDatos ? U.enlacesDatos(sym, true).map(x => '<a href="' + esc(x.u) + '" target="_blank" rel="noopener">' + esc(x.n) + '</a>').join(' · ') : '') : '<b>Cómo hacerlo:</b> copia el texto de abajo, pégalo en tu IA (con navegación activada) y pega aquí su respuesta. Si dice que no puede abrir páginas, cambia a la otra opción.'; };
      dd.querySelector('#ia-modo').onchange = pintar; dd.querySelector('#ia-sym').oninput = pintar; pintar();
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
    } else if (dc) {
      cuerpo += '<div class="alert warn" style="margin-top:8px">Cifras de 12 meses guardadas (' + esc(dc.fuente) + ', hasta ' + esc(dc.fin) + '), pero no puedo calcular la rentabilidad esperada: ' + 'la ficha está incompleta o es de un tipo que el motor no valora (suelen faltar impuestos, amortización, capex, deuda o caja)' + '. Completa la ficha en Valoración → Editar datos.</div>' +
        '<table class="small" style="width:100%;border-collapse:collapse"><tr class="mut"><td></td><td>Últimos 12 meses frente al año base ' + f.anio_base + '</td></tr>' + fila3('Ventas', pc(dc.dv), '', '') + fila3('EBIT', isN(dc.de) ? pc(dc.de) : 'n/d (la fuente no lo da)', '', '') + '</table>' +
        (isN(dc.deuda_neta) ? '<p class="small mut" style="margin:6px 0 0">Deuda neta indicada: ' + nf(dc.deuda_neta, 0) + ' M.</p>' : '') +
        (r.ia && (r.ia.resumen || r.ia.guidance) ? '<details class="card" style="margin-top:8px" open><summary>Resumen de la IA' + (r.ia.fiabilidad ? ' · fiabilidad ' + esc(r.ia.fiabilidad) : '') + '</summary><p class="small">' + esc(r.ia.resumen) + '</p>' + (r.ia.guidance ? '<p class="small"><b>Guidance:</b> ' + esc(r.ia.guidance) + '</p>' : '') + (r.ia.fuentes && r.ia.fuentes.length ? '<p class="small mut">Fuentes: ' + r.ia.fuentes.map(esc).join(' · ') + '</p>' : '') + '</details>' : '');
    } else {
      cuerpo += (ok ? '<div class="kpis"><div class="kpi"><span>Rentab. esperada</span><b>' + nf(v.ref * 100, 1) + ' %</b><span>5 años, antes de los resultados</span></div><div class="kpi"><span>Precio de entrada</span><b>' + nf(v.entrada, 2) + '</b><span>precio ' + nf(v.precio, 2) + '</span></div></div>' : '') +
        '<div class="alert" style="background:var(--chip)">' + (f && f.divisa === 'USD' && secFin(r.tk) ? 'Aún no hay un trimestre nuevo en la SEC (último: ' + esc(secFin(r.tk)) + '). Se actualiza solo cada domingo, o pide las cifras a una IA ahora.' : 'Para ver si va en línea con tu valoración necesito las cifras de 12 meses. Pídeselas a una IA con búsqueda web (te preparo el texto) o espera a actualizar las cuentas.') + '</div>';
    }
    if (avisosExtra && avisosExtra.length) cuerpo += avisosExtra.map(a => '<div class="alert warn">' + esc(a) + '</div>').join('');
    const nuevoEj = U.secDe && (U.secDe(r.tk, f) || {}).nuevo;
    U.dlg('<h2>' + esc(nombre(r.tk)) + ' · ' + esc(r.periodo || '') + '</h2><p class="small mut" style="margin:0">' + (cartera ? 'En cartera' : 'Watchlist') + (pub ? ' · <b>ya ha publicado</b> (SEC)' : '') + '</p>' + (U.enlaces ? U.enlaces(r.tk, 'res') : '') + cuerpo +
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
  /* Desde Informes: abre la revisión de un trimestre (usa el pendiente de ese periodo o crea uno) */
  U.revisarTrimestre = function (tk, periodo) {
    const d = D(); let r = d.resultados.find(x => x.tk === tk && x.periodo === periodo && x.estado === 'pendiente');
    if (!r) { r = nuevoReg(tk, { fecha: null, periodo, confirmada: true }); d.resultados.push(r); Store.save(); }
    U.render(); revisar(r.id);
  };
  U._resultados = { publico, doceDe, promptIA, parseIA, revDe };
})();
