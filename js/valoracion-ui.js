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

  /* ───── Datos públicos de la SEC: últimos 12 meses y último ejercicio (datos/resumen.json, lo genera el workflow semanal) ───── */
  let SECR = null, secCarga = false;
  function cargarSEC() { if (SECR || secCarga) return; secCarga = true; fetch('datos/resumen.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).then(j => { SECR = (j && j.empresas) || {}; U.render(); }).catch(() => { SECR = {}; }); }
  /* Para una ficha: ejercicio nuevo publicado y factor de 12 meses (EBIT 12 meses / EBIT del mismo ejercicio en la SEC) */
  function secSEC(tk, f) {
    const e = SECR && SECR[tk]; if (!e || e.error || !f || f.divisa !== 'USD') return null;
    const out = { nombre: e.nombre };
    if (L.lineasFaltantes(f).length && !(f.tipo === 'reit')) out.completar = true;
    if (e.ultimo_ejercicio && e.ultimo_ejercicio.anio > f.anio_base) out.nuevo = e.ultimo_ejercicio.anio;
    const an = (e.anual && e.anual.anios) || [], i = an.indexOf(f.anio_base) >= 0 && !(e.ultimo_ejercicio && f.anio_base > e.ultimo_ejercicio.anio) ? an.indexOf(f.anio_base) : an.length - 1;
    const eb = e.anual && e.anual.ebit && e.anual.ebit[i], vb = e.anual && e.anual.ventas && e.anual.ventas[i], t = e.ttm;
    if (t && isN(t.ebit) && isN(eb) && eb > 0 && !out.nuevo && t.fin > (e.ultimo_ejercicio ? e.ultimo_ejercicio.fin : '')) {
      out.doce = { fin: t.fin, k: t.ebit / eb, ventas: t.ventas, ebit: t.ebit, ni: t.ni_reportado, dv: isN(t.ventas) && vb > 0 ? t.ventas / vb - 1 : null, de: t.ebit / eb - 1, anio: an[i], basefin: e.ultimo_ejercicio && e.ultimo_ejercicio.anio === an[i] ? e.ultimo_ejercicio.fin : null, fuente: 'SEC' };
    }
    return out;
  }
  /* Cifras de 12 meses pegadas a mano / desde una IA en la revisión de resultados (empresas sin SEC): se usan igual que las de la SEC mientras la ficha siga en el mismo año base */
  function secManual(tk, f) {
    const R = (Store.get().resultados || []).filter(r => r.tk === tk && r.doce && r.doce.anio_base === f.anio_base && isN(r.doce.dv)).sort((a, b) => (b.doce.fin || '').localeCompare(a.doce.fin || ''))[0];
    return R ? Object.assign({}, R.doce, { k: 1 + R.doce.de, anio: f.anio_base, fuente: R.doce.fuente || 'IA' }) : null;
  }
  function secDe(tk, f) {
    const out = secSEC(tk, f); if (out && (out.doce || out.nuevo)) return out;
    const m = f ? secManual(tk, f) : null; if (!m) return out;
    return Object.assign(out || {}, { doce: Object.assign({ ebit: null }, m) });
  }
  U.abrirFicha = tk => { sel = tk; U.irA('valoracion'); };
  U.secDe = secDe; U.cargarSEC = cargarSEC; U.secRaw = () => SECR;

  /* Ejercicio nuevo desde datos/TICKER.json (SEC): se añaden los años que faltan a la ficha (o se sustituye si está muy desfasada) */
  async function nuevoEjercicio(tk) {
    const d = D(), f = d.fichas[tk]; let j;
    try { const r = await fetch('datos/' + tk.replace(/[^A-Z0-9]/g, '_') + '.json', { cache: 'no-cache' }); j = r.ok ? await r.json() : null; } catch (e) { j = null; }
    if (!j || !j.anios) return U.toast('No encuentro los datos de la SEC de ' + tk);
    const nuevos = j.anios.filter(a => a > f.anio_base), inc = L.lineasFaltantes(f).length > 0;
    if (!nuevos.length && !inc) return U.toast('No hay ejercicios nuevos');
    if (inc || nuevos.length > 1 || f.anio_base < 2020) {
      if (!confirm((inc ? 'La ficha de ' + tk + ' es un borrador incompleto.' : 'La ficha de ' + tk + ' está muy desfasada (' + f.anio_base + ').') + ' ¿Sustituirla por los datos de la SEC (' + j.anios[0] + '–' + j.anios[j.anios.length - 1] + ')? Se conservan los múltiplos históricos y las notas.')) return;
      const g = DatosWeb.aFicha(j, hoy()); ['mult_hist', 'escenarios', 'tipo', 'precio', 'fecha_precio'].forEach(k => { if (f[k] != null && g[k] == null) g[k] = f[k]; });
      g.notas = (f.notas || []).concat(g.notas || [], ['Ficha sustituida por los datos de la SEC el ' + hoy() + ' (antes llegaba a ' + f.anio_base + ').']);
      d.fichas[tk] = g; return U.guardar({ ok: true, msg: 'Ficha de ' + tk + ' actualizada hasta ' + g.anio_base });
    }
    const y = nuevos[0], i = j.anios.indexOf(y), copiadas = [];
    f.anios.push(y);
    Object.keys(f.hist).forEach(k => { const s = f.hist[k]; if (!Array.isArray(s)) return; let v = j.hist[k] && isN(j.hist[k][i]) ? j.hist[k][i] : k === 'extra' ? 0 : null; if (v == null && isN(s[s.length - 1])) { v = s[s.length - 1]; copiadas.push(k); } s.push(v); });
    f.anio_base = y; f.fecha_datos = hoy();
    f.notas = (f.notas || []).concat(['Ejercicio ' + y + ' añadido desde la SEC el ' + hoy() + ' (sin verificar con el informe anual). Revisa en especial intereses (la SEC da el gasto bruto) y caja (efectivo + inversiones a corto); sin dato en la SEC, copiadas del año anterior: ' + (copiadas.join(', ') || 'ninguna') + '.']);
    U.guardar({ ok: true, msg: 'Añadido ' + y + ' a ' + tk + ' desde la SEC' });
  }


  /* ───── Completar con una IA las líneas que faltan de una ficha borrador (intereses, impuestos, amortización, capex, deuda, caja) ─────
     Dos modos para que valga con cualquier IA: «navegar» (la IA abre las páginas) y «pegar» (tú copias el texto de las páginas y se lo pegas: no necesita navegación). */
  const LINEAS_IA = ['intereses', 'impuestos', 'da', 'capex', 'deuda', 'caja'];
  const BOLSA_SA = { MC: 'bme', PA: 'epa', DE: 'etr', F: 'fra', AS: 'ams', L: 'lon', MI: 'bit', BR: 'ebr', LS: 'eli', HK: 'hkg', SW: 'swx', ST: 'sto', CO: 'cph', HE: 'hel', OL: 'osl', T: 'tyo', TO: 'tsx', AX: 'asx', AT: 'ath', VI: 'vie', IR: 'ise' };
  const simboloYahoo = tk => { const S = U.simbolos && U.simbolos(), e = S && S[tk]; return (e && e.y && e.y[0]) || tk; };
  /* Enlaces a las páginas de datos para un símbolo de Yahoo (ej. VID.MC, AAPL) */
  function enlacesDatos(sym, trim, opc) {
    sym = String(sym || '').trim(); const m = /^(.+)\.([A-Z]{1,2})$/.exec(sym), base = m ? m[1] : sym, ex = m ? BOLSA_SA[m[2]] : null, q = trim ? '?p=quarterly' : '', y = trim ? '?frequency=quarterly' : '';
    const sa = ex ? 'https://stockanalysis.com/quote/' + ex + '/' + base.toLowerCase() + '/' : 'https://stockanalysis.com/stocks/' + base.toLowerCase() + '/', ya = 'https://finance.yahoo.com/quote/' + encodeURIComponent(sym) + '/';
    const L1 = [['StockAnalysis · cuenta de resultados', sa + 'financials/income-statement/' + q], ['StockAnalysis · balance', sa + 'financials/balance-sheet/' + q]];
    if (!trim) L1.push(['StockAnalysis · flujos de caja', sa + 'financials/cash-flow-statement/' + q]);
    if (opc) L1.push(['Yahoo · resultados (opcional)', ya + 'financials/' + y], ['Yahoo · balance (opcional)', ya + 'balance-sheet/' + y]), !trim && L1.push(['Yahoo · flujos de caja (opcional)', ya + 'cash-flow/' + y]);
    return L1.map(([n, u]) => ({ n, u }));
  }
  U.enlacesDatos = enlacesDatos; U.simboloYahoo = simboloYahoo;
  const REGLAS_IA = 'REGLAS: usa SOLO datos de las páginas indicadas (no tu memoria, no estimes, no inventes). Si un dato no aparece pon null. Importes en millones de la divisa de la ficha, en número (sin texto ni símbolos), con punto decimal. Responde SOLO con el JSON, sin texto antes ni después.';
  function promptLineas(tk, modo, sym) {
    const f = D().fichas[tk], h = f.hist, an = f.anios || [], r1 = x => (isN(x) ? Math.round(x * 10) / 10 : null), fila = k => JSON.stringify((h[k] || []).map(r1)), div = f.divisa || 'EUR', E = enlacesDatos(sym || simboloYahoo(tk));
    const campos = 'LÍNEAS QUE NECESITO (un valor por cada año [' + an.join(', ') + '], en ese orden, de MÁS ANTIGUO a MÁS RECIENTE, números positivos). Dónde está cada una en StockAnalysis:\n- intereses = Interest Expense (cuenta de resultados) MENOS Interest & Investment Income, como coste neto (si los ingresos superan al gasto, número negativo).\n- impuestos = Income Tax Expense (cuenta de resultados).\n- da = Depreciation & Amortization (flujos de caja).\n- capex = Capital Expenditures + Sale (Purchase) of Intangibles (flujos de caja), en positivo; sin compras de empresas.\n- deuda = Short-Term Debt + Current Portion of Long-Term Debt + Long-Term Debt (balance), SIN las filas de Leases / arrendamientos.\n- caja = Cash & Short-Term Investments (balance).\n- leases_deuda = filas de Leases del balance (corriente + largo plazo). minoritarios = Minority Interest in Earnings (cuenta de resultados; 0 si no hay).\n';
    const formato = 'FORMATO (rellena las listas, una posición por año; "contraste" = lo que da CADA fuente por separado, para las líneas donde tengas dos fuentes):\n{"anios":[' + an.join(',') + '],"intereses":[],"impuestos":[],"da":[],"capex":[],"deuda":[],"caja":[],"leases_deuda":[],"minoritarios":[],"resumen":"qué filas has usado y cualquier duda","faltan":["líneas que no has podido sacar del texto, y por qué"],"fiabilidad":"alta|media|baja"}\nSi además tienes una segunda fuente (Yahoo) y difiere más de un 5 %, pon el dato de StockAnalysis y explícalo en "resumen".';
    const cab = 'Eres un analista financiero. Tarea: extraer cuentas anuales de ' + (f.nombre || tk) + ' (símbolo ' + (sym || simboloYahoo(tk)) + ', divisa ' + div + ') para completar mi ficha. Años: ' + an.join(', ') + '. Ya tengo (millones de ' + div + '): ventas ' + fila('ventas') + ' · EBIT ' + fila('ebit') + ' · beneficio neto ' + fila('ni_reportado') + ' — úsalos para comprobar que miras la empresa y las unidades correctas.\n\n';
    if (modo === 'pegar') return cab + 'Debajo te pego el TEXTO COPIADO de 3 páginas de StockAnalysis (cuenta de resultados, balance y flujos de caja); puede traer menús y publicidad, ignóralos. No necesitas navegar ni buscar nada.\nOJO: en StockAnalysis las columnas van del año MÁS RECIENTE al más antiguo y hay una columna «TTM» que debes IGNORAR; el año es el del cierre del ejercicio (FY 2025 = 2025). Devuélvelo en el orden de mi lista (de más antiguo a más reciente). Si un año no aparece (StockAnalysis da unos 5), pon null.\nSi falta una de las 3 páginas entera (p. ej. no hay balance), no inventes: responde SOLO {"error":"faltan_paginas","faltan":["balance"]}. Si solo faltan algunos años o filas, rellena lo que puedas y apunta el resto en "faltan".\n\n' + campos + '\n' + formato + '\n\n' + REGLAS_IA + '\n\n=== TEXTO COPIADO DE LAS PÁGINAS (pégalo aquí debajo) ===\n';
    return cab + 'PASO 1. Abre estas páginas:\n' + E.map(x => '- ' + x.n + ': ' + x.u).join('\n') + '\nSi no puedes abrir páginas web, responde SOLO {"error":"sin_navegacion"} y nada más (no respondas de memoria).\nSi alguna no carga, usa las demás o la web de relación con inversores de la empresa.\n\nPASO 2. Copia los datos de cada año y compara las dos fuentes.\n\n' + campos + '\n' + formato + '\n\n' + REGLAS_IA;
  }
  const norm = k => String(k).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z&]/g, '');
  const ALIAS = { intereses: ['intereses', 'gastosfinancieros', 'interest', 'interesesnetos', 'resultadofinanciero'], impuestos: ['impuestos', 'impuesto', 'tax', 'taxes', 'taxprovision', 'incometax'], da: ['da', 'd&a', 'amortizacion', 'amortizaciones', 'depreciacion', 'depreciation'], capex: ['capex', 'inversiones', 'capitalexpenditure'], deuda: ['deuda', 'deudabruta', 'debt', 'deudafinanciera'], caja: ['caja', 'efectivo', 'cash'], leases_deuda: ['leasesdeuda', 'leases', 'arrendamientos', 'deudaleases'], minoritarios: ['minoritarios', 'minorities'] };
  function normalizarRespuesta(j) {   // tolera nombres de campo en otro formato, mayúsculas, tildes
    const o = {}; Object.keys(j).forEach(k => { const n = norm(k); const c = Object.keys(ALIAS).find(c => ALIAS[c].includes(n)); o[c || k] = j[k]; }); return o;
  }
  function aplicarLineas(tk, txt) {
    const f = D().fichas[tk], an = (f.anios || []).map(Number), n = an.length, m = /\{[\s\S]*\}/.exec(txt || ''); if (!m) throw new Error('No encuentro el JSON en lo que has pegado.');
    let j0; try { j0 = JSON.parse(m[0]); } catch (e) { throw new Error('El JSON no es válido (' + e.message + '). Pídele a la IA que lo repita «solo con el JSON, sin texto».'); }
    if (j0.error === 'sin_navegacion' || /sin_navegacion/.test(String(j0.error || ''))) throw new Error('Esa IA no puede abrir páginas web. Cambia a «Mi IA no puede abrir páginas»: abre los enlaces, copia el texto de las páginas y pégaselo a la IA debajo del texto.');
    if (/faltan/.test(String(j0.error || ''))) throw new Error('A la IA le faltan páginas: ' + (Array.isArray(j0.faltan) ? j0.faltan.join(', ') : String(j0.faltan || j0.error)) + '. Copia también esas páginas (cuenta de resultados, balance y flujos de caja de StockAnalysis), pégalas a continuación del mensaje y pídele que repita.');
    const j = normalizarRespuesta(j0);
    const num = x => (isN(x) ? x : typeof x === 'string' && x.trim() !== '' && isFinite(Number(x.replace(/\s/g, '').replace(',', '.'))) ? Number(x.replace(/\s/g, '').replace(',', '.')) : null), nuevo = {}, av = [];
    if (Array.isArray(j.anios) && j.anios.length && (j.anios.length !== n || j.anios.some((a, i) => Number(a) !== an[i]))) throw new Error('Los años no coinciden con los de la ficha (' + an.join(', ') + '). Pídele a la IA que use exactamente esos años y en ese orden.');
    const ABS = new Set(['impuestos', 'da', 'capex', 'deuda', 'caja', 'leases_deuda']);   // las fuentes dan capex y otras líneas en negativo: se usa el valor absoluto
    LINEAS_IA.concat(['leases_deuda', 'minoritarios']).forEach(k => { const a = j[k]; if (a == null) return; if (!Array.isArray(a) || a.length !== n) throw new Error('«' + k + '» debe tener ' + n + ' valores (uno por año: ' + an.join(', ') + '), pone ' + (Array.isArray(a) ? a.length : 'otra cosa') + '.'); nuevo[k] = a.map(num).map(x => (x != null && ABS.has(k) ? Math.abs(x) : x)); });
    if (!Object.keys(nuevo).some(k => nuevo[k].some(isN))) throw new Error('La IA no ha encontrado ninguna cifra' + (j.resumen ? ' (dice: «' + String(j.resumen).slice(0, 160) + '»)' : '') + '. Si esa IA no navega, usa «Mi IA no puede abrir páginas» y pega tú el texto de las páginas.');
    const ult = k => nuevo[k] && isN(nuevo[k][n - 1]);
    const faltan = ['impuestos', 'da', 'capex', 'deuda', 'caja'].filter(k => !(f.hist[k] && isN((f.hist[k] || [])[n - 1])) && !ult(k));
    if (faltan.length) throw new Error('Falta el dato del último año (' + an[n - 1] + ') de: ' + faltan.join(', ') + '. Sin eso no se puede valorar; prueba con otra fuente o ponlo a mano.');
    if (!nuevo.intereses && !(f.hist.intereses && f.hist.intereses.some(isN))) { nuevo.intereses = Array(n).fill(null); av.push('Sin intereses: se toman como 0 (si la empresa tiene deuda importante, ponlos a mano).'); }
    const ct0 = j.contraste && typeof j.contraste === 'object' ? j.contraste : {}, ctn = {}; Object.keys(ct0).forEach(k => { ctn[norm(k) === 'da' ? 'da' : (Object.keys(ALIAS).find(c => ALIAS[c].includes(norm(k))) || k)] = ct0[k]; });
    const fuentesDe = c => (Array.isArray(c) ? c : c && typeof c === 'object' ? Object.keys(c).map(fu => ({ fuente: fu, valores: c[fu] })) : []).filter(x => x && Array.isArray(x.valores)).map(x => ({ fuente: x.fuente, valores: x.valores.map(num).map(v => (v != null ? Math.abs(v) : v)) }));
    const disc = [], una = [], NOM = { intereses: 'intereses', impuestos: 'impuestos', da: 'amortización', capex: 'capex', deuda: 'deuda', caja: 'caja', leases_deuda: 'arrendamientos', minoritarios: 'minoritarios' };
    Object.keys(nuevo).forEach(k => { const F = fuentesDe(ctn[k]); if (!nuevo[k].some(isN)) return; if (F.length < 2) { if (k !== 'minoritarios') una.push(NOM[k]); return; } const r = L.contrastar(F, nuevo[k]); r.discrepancias.forEach(x => disc.push(NOM[k] + ' ' + an[x.i] + ': ' + x.min.f + ' ' + x.min.v + ' vs ' + x.max.f + ' ' + x.max.v + ' (' + Math.round(x.dif * 100) + ' %)')); });
    if (una.length) av.push('Sin contraste entre varias fuentes: ' + una.join(', ') + '.');
    if (disc.length) av.push(disc.length + ' diferencias de más del 5 % entre fuentes: ' + disc.slice(0, 6).join('; ') + (disc.length > 6 ? '…' : ''));
    const v0 = f.hist.ventas[n - 1];
    if (isN(v0) && v0 > 0) ['capex', 'da'].forEach(k => { const x = nuevo[k] && nuevo[k][n - 1]; if (isN(x) && x / v0 > 0.4) av.push('«' + k + '» del último año es ' + Math.round(x / v0 * 100) + ' % de las ventas: comprueba unidades y signo.'); });
    Object.keys(nuevo).forEach(k => { f.hist[k] = nuevo[k]; });
    ['minoritarios', 'otros', 'leases', 'leases_deuda'].forEach(k => { if (!Array.isArray(f.hist[k])) f.hist[k] = Array(n).fill(0); });
    ['equity', 'goodwill'].forEach(k => { if (!Array.isArray(f.hist[k])) f.hist[k] = Array(n).fill(null); });
    f.notas = (f.notas || []).concat(['Líneas completadas por IA desde webs de datos el ' + hoy() + ' (sin verificar con el informe anual): ' + Object.keys(nuevo).join(', ') + '.' + (j.resumen ? ' ' + String(j.resumen) : '') + (Array.isArray(j.fuentes) && j.fuentes.length ? ' Fuentes: ' + j.fuentes.map(String).join(' · ') + '.' : '')]);
    if (av.length) f.notas.push('Avisos al completar con IA: ' + av.join(' '));
    f.fecha_datos = hoy(); return { av, disc, una, fiab: String(j.fiabilidad || '') };
  }
  function lineasIA(tk) {
    const f = D().fichas[tk]; if (!f) return; U.cargarSimb && U.cargarSimb(); const sym0 = simboloYahoo(tk);
    U.dlg('<h2>Completar ' + esc(tk) + ' con una IA</h2><p class="small mut">Vale con cualquier IA (Claude, ChatGPT, Gemini…). Elige según lo que pueda hacer la tuya:</p>' +
      '<div class="f2">' + U.campo('li-sym', 'Símbolo en Yahoo (ej. VID.MC)', sym0) + '<div><label for="li-modo">Mi IA…</label><select id="li-modo"><option value="pegar">no puede abrir páginas (pego yo el texto)</option><option value="nav">puede abrir páginas web</option></select></div></div>' +
      '<div id="li-ayuda" class="small" style="margin:6px 0"></div><textarea id="li-p" rows="7" readonly></textarea><div class="acts"><button class="btn sec" id="li-copy">Copiar texto</button></div>' +
      '<label for="li-r">Respuesta de la IA (el JSON)</label><textarea id="li-r" rows="6" placeholder="Pega aquí el JSON"></textarea><div id="li-err" class="alert bad" style="display:none"></div>' +
      '<div class="acts"><button class="btn sec" data-a="cerrar">Cancelar</button><button class="btn" id="li-ok">Usar estas cifras</button></div>', dd => {
      const pintar = () => { const modo = dd.querySelector('#li-modo').value, sym = dd.querySelector('#li-sym').value.trim() || sym0; dd.querySelector('#li-p').value = promptLineas(tk, modo, sym);
        dd.querySelector('#li-ayuda').innerHTML = modo === 'pegar' ? '<b>Cómo hacerlo (sin internet en la IA):</b> 1) copia el texto de abajo y pégalo en tu IA; 2) abre los 3 enlaces, en cada uno pulsa Ctrl+A y Ctrl+C y pega el texto a continuación, uno tras otro (cuenta de resultados, balance y flujos de caja); 3) pega aquí su respuesta. Con eso basta: no hace falta Yahoo. <b>El prompt solo no sirve: sin las 3 páginas pegadas la IA contestará «faltan_paginas».</b><br>' + enlacesDatos(sym).map(x => '<a href="' + esc(x.u) + '" target="_blank" rel="noopener">' + esc(x.n) + '</a>').join(' · ') : '<b>Cómo hacerlo:</b> copia el texto de abajo, pégalo en tu IA (con navegación activada) y pega aquí su respuesta. Si dice que no puede abrir páginas, cambia a la otra opción.'; };
      dd.querySelector('#li-modo').onchange = pintar; dd.querySelector('#li-sym').oninput = pintar; pintar();
      dd.querySelector('#li-copy').onclick = () => { const t = dd.querySelector('#li-p'); t.select(); try { navigator.clipboard.writeText(t.value); } catch (e) { document.execCommand && document.execCommand('copy'); } U.toast('Texto copiado'); };
      dd.querySelector('#li-ok').onclick = () => { try { const o = aplicarLineas(tk, dd.querySelector('#li-r').value); U.guardar({ ok: true, msg: 'Ficha completada' }); if (o.av.length) U.dlg('<h2>Ficha completada: revisa esto</h2>' + o.av.map(x => '<div class="alert warn">' + esc(x) + '</div>').join('') + '<p class="small mut">Los avisos también quedan en las notas de la ficha. Contrasta con el informe anual los datos con diferencias antes de fiarte de la valoración.</p><div class="acts"><button class="btn" data-a="cerrar">Entendido</button></div>'); } catch (e) { const b = dd.querySelector('#li-err'); b.style.display = ''; b.textContent = e.message; } };
    });
  }
  U._lineasIA = { promptLineas, aplicarLineas, enlacesDatos };

  /* ───── Lista ───── */
  function vistaLista() {
    const d = D(), a = d.ajustes, q = L.norm(filtro), ks = Object.keys(d.fichas).filter(k => !q || L.norm(k + ' ' + (d.fichas[k].nombre || '')).includes(q));
    cargarSEC();
    const filas = ks.map(k => ({ k, est: estadoDe(k), v: L.valoracion(d, k, hoy()) })).filter(x => x.v);
    const grupos = [['cartera', 'En cartera'], ['watchlist', 'Watchlist'], ['candidata', 'Candidatas']];
    let h = (U.lineaPrecios ? U.lineaPrecios() : '') + '<div class="tools"><button class="btn" data-v="nueva">+ Nueva ficha</button><button class="btn sec" data-v="releer" title="Vuelve a leer el índice de informes y rehace las fichas borrador">↻ Releer informes</button><input id="v-q" type="search" placeholder="Buscar" value="' + esc(filtro) + '"></div>';
    grupos.forEach(([g, t]) => {
      const rows = filas.filter(x => x.est === g).sort((x, y) => (y.v.ref == null ? -9 : y.v.ref) - (x.v.ref == null ? -9 : x.v.ref));
      if (!rows.length) return;
      h += '<h3 style="margin:14px 2px 6px">' + t + ' <span class="mut small">' + rows.length + '</span></h3><div class="card">' + rows.map(({ k, v }) => {
        if (v.noSoportado || v.error) return '<div class="row click" data-v="abrir" data-k="' + esc(k) + '"><div class="main"><div class="name">' + esc(v.nombre) + '</div><div class="meta">' + esc(k) + (v.incompleta ? ' · <span class="pill warn">ficha incompleta</span> faltan ' + esc(v.incompleta.join(', ')) : v.error ? ' · error: ' + esc(v.error) : ' · tipo no soportado') + '</div></div></div>';
        return '<div class="row click" data-v="abrir" data-k="' + esc(k) + '"><div class="main"><div class="name">' + esc(v.nombre) + (v.graves ? ' <span class="pill warn">datos dudosos</span>' : '') + ((secDe(k, d.fichas[k]) || {}).nuevo ? ' <span class="pill">ejercicio ' + secDe(k, d.fichas[k]).nuevo + ' publicado</span>' : '') + (U.etiquetasResultados ? U.etiquetasResultados(k) : '') + '</div>' +
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
    catch (e) {
      const falta = L.lineasFaltantes(f); cargarSEC(); const sd0 = secDe(sel, f);
      return h + '<h2 style="margin:12px 0 4px">' + esc(sel) + ' — ' + esc(f.nombre || '') + '</h2><div class="alert warn" style="margin-top:10px">' + (falta.length ? '<b>Ficha incompleta.</b> Es un borrador y le faltan: ' + esc(falta.join(', ')) + '. Con esas líneas el motor no puede valorar la empresa.' : 'No se pudo calcular: ' + esc(e.message)) + (sd0 && sd0.completar ? '<br>La SEC tiene las cuentas completas de ' + esc(sel) + ': <button class="btn sm" data-v="nuevoej">Completar con los datos de la SEC</button>' : falta.length ? '<br>Pídeselas a una IA con búsqueda web (te preparo el texto) o complétalas a mano en «Revisar datos»: <button class="btn sm" data-v="lineasia">Completar con una IA</button>' : '') + '</div>' + (U.enlaces ? U.enlaces(sel, 'val') : '') + '<div class="tools"><button class="btn sec sm" data-v="datos">Revisar datos</button></div>' + acciones(f);
    }
    const cons = R.conservador, ref5 = cons.cagr[5].ref, pe = V.precioEntrada(f, cons, o / 100), pt = V.precioEntrada(f, cons, m / 100);
    cargarSEC(); const sd = secDe(sel, f);
    const vm = V.valorMultiplo ? V.valorMultiplo(f, sd && sd.doce) : null, VMT = { chollo: ['g', 'Chollo ahora'], debajo: ['y', 'Algo por debajo'], encima: ['y', 'Algo por encima'], cara: ['r', 'Cara ahora'] };
    let t = 'r', title = 'Cara frente a su valor', sub;
    if (ref5 >= o / 100) { t = 'g'; title = 'Compra: supera tu objetivo'; sub = 'Rentabilidad anual esperada a 5 años: ' + pc(ref5) + ' (objetivo ' + nf(o, 0) + ' %).'; }
    else if (ref5 >= m / 100) { t = 'y'; title = 'Watchlist: buena empresa, precio justo'; sub = 'Rentabilidad esperada ' + pc(ref5) + ': sobre tu mínimo (' + nf(m, 0) + ' %) pero bajo el objetivo. Compra por debajo de ' + nf(pe, 2) + '.'; }
    else if (!isN(ref5)) { t = 'y'; title = 'No valorable con estos supuestos'; sub = 'En el escenario conservador el valor teórico a 5 años no es positivo (pérdidas o EBIT negativo), así que no hay rentabilidad calculable. Revisa los márgenes o descarta la empresa: una valoración value necesita beneficios.'; }
    else sub = 'Rentabilidad esperada ' + pc(ref5) + ', bajo tu mínimo del ' + nf(m, 0) + ' %. Si la tienes, candidata a vender por sobrevaloración.';
    if (fi.graves) sub += ' Provisional: hay avisos graves en los datos.';
    if (fi.nivel !== 'profunda') sub += ' Valoración rápida: ' + (fi.nP + fi.nE) + ' de ' + (fi.nA + fi.nP + fi.nE) + ' líneas críticas sin contrastar con el informe anual.';
    if (mo) sub += ' Depende de una hipótesis de margen futuro.';
    const dp = L.diasDesde(f.fecha_precio, hoy());
    h += '<div class="card" style="margin-top:10px;border-left:6px solid var(--' + { g: 'ok', y: 'warn', r: 'bad' }[t] + ')"><div class="meta">' + esc(sel) + ' — ' + esc(f.nombre || '') + ' · ' + estadoDe(sel) + '</div><h2 style="font-size:21px;margin:4px 0">' + title + '</h2><p style="margin:0 0 8px">' + sub + '</p>' + (U.enlaces ? U.enlaces(sel, 'val') : '') +
      '<p class="small mut" style="margin:0 0 8px">En el pesimista: ' + pc(R.pesimista.cagr[5].ref) + ' anual · en el optimista: ' + pc(R.optimista.cagr[5].ref) + '</p>' +
      '<div class="kpis"><div class="kpi"><span>Precio actual</span><b>' + nf(f.precio, 2) + '</b><span>' + esc(f.divisa) + (dp != null ? ' · hace ' + dp + ' d' : '') + '</span></div><div class="kpi"><span>Objetivo a 5 años</span><b>' + (cons.po[5].ref > 0 ? nf(cons.po[5].ref, 2) : '—') + '</b></div>' +
      '<div class="kpi"><span>Entrada para ' + nf(o, 0) + ' %</span><b>' + (pe ? nf(pe, 2) : '—') + '</b></div><div class="kpi"><span>Máximo para ' + nf(m, 0) + ' %</span><b>' + (pt ? nf(pt, 2) : '—') + '</b></div>' +
      (vm && vm.sinBeneficio ? '<div class="kpi"><span>¿Chollo ahora?</span><b>—</b><span class="c-r">EBIT de 12 meses negativo</span></div>' : '') +
      (vm && !vm.sinBeneficio ? '<div class="kpi"><span>A su múltiplo de siempre</span><b>' + nf(vm.valor, 2) + '</b><span class="c-' + VMT[vm.nivel][0] + '">' + VMT[vm.nivel][1] + ' (' + (vm.descuento >= 0 ? '−' : '+') + nf(Math.abs(vm.descuento) * 100, 0) + ' %)' + (vm.doce ? ' · 12 meses' : '') + '</span></div>' : '') + '</div>' +
      '<p class="small" style="margin:8px 0 0"><b>Precio objetivo hoy</b>: ' + (pe && pt ? 'hasta ' + nf(pe, 2) + ' para ganar tu ' + nf(o, 0) + ' % anual; hasta ' + nf(pt, 2) + ' para tu mínimo del ' + nf(m, 0) + ' %' : '—') + '. Es el objetivo a 5 años traído a hoy.' +
      (vm && vm.sinBeneficio ? ' <b>¿Chollo ahora?</b> No hay lectura: en los últimos 12 meses (hasta ' + esc(vm.doce.fin) + ') el EBIT es negativo.' : '') +
      (vm && !vm.sinBeneficio ? ' <b>¿Chollo ahora?</b> Con las cifras ' + (vm.doce ? 'de los últimos 12 meses (hasta ' + esc(vm.doce.fin) + ')' : 'del último año') + ' a sus múltiplos de siempre valdría ' + nf(vm.valor, 2) + ': cotiza ' + nf(Math.abs(vm.descuento) * 100, 0) + ' % ' + (vm.descuento >= 0 ? 'por debajo' : 'por encima') + '. Lectura a corto plazo: supone que esas cifras se mantienen y el múltiplo vuelve a su media.' +
        (vm.raro ? ' <span class="c-y">Ojo: su múltiplo de siempre es ' + nf(vm.ratioHist, 1) + ' veces el de hoy' + (vm.raro === 'alto' ? ' (años de rampa o de euforia en la media): la lectura exagera el chollo.' : ' (años más baratos en la media): la lectura exagera lo cara.') + '</span>' : '') : '') + '</p>' +
      (sd && sd.doce ? '<p class="small' + (Math.abs(sd.doce.de) > 0.25 ? ' c-y' : ' mut') + '" style="margin:6px 0 0"><b>Últimos 12 meses</b> (' + esc(sd.doce.fuente === 'SEC' ? 'SEC' : 'IA, sin verificar') + ', hasta ' + esc(sd.doce.fin) + '): ventas ' + nf(sd.doce.ventas, 0) + ' M' + (isN(sd.doce.dv) ? ' (' + (sd.doce.dv >= 0 ? '+' : '') + nf(sd.doce.dv * 100, 0) + ' %)' : '') + ', EBIT ' + (isN(sd.doce.ebit) && isN(sd.doce.de) ? nf(sd.doce.ebit, 0) + ' M (' + (sd.doce.de >= 0 ? '+' : '') + nf(sd.doce.de * 100, 0) + ' %)' : 'n/d') + ' frente a ' + sd.doce.anio + '.' + (Math.abs(sd.doce.de) > 0.25 ? ' El negocio se ha movido mucho desde el año base: el objetivo a 5 años parte de cifras desfasadas.' : '') + '</p>' : '') +
      (sd && sd.completar && !sd.nuevo ? '<div class="alert warn" style="margin-top:8px">Esta ficha es un borrador (faltan ' + esc(L.lineasFaltantes(f).join(', ')) + ') y por eso no se puede valorar. La SEC tiene las cuentas completas de ' + esc(sel) + ': <button class="btn sm" data-v="nuevoej">Completar con los datos de la SEC</button></div>' : '') +
      (sd && sd.nuevo ? '<div class="alert warn" style="margin-top:8px">La SEC ya tiene el ejercicio ' + sd.nuevo + ' y esta ficha llega a ' + f.anio_base + '. <button class="btn sm" data-v="nuevoej">' + (sd.nuevo - f.anio_base > 1 || f.anio_base < 2020 ? 'Sustituir por los datos de la SEC' : 'Añadir ' + sd.nuevo + ' desde la SEC') + '</button></div>' : '') + '</div>' +
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
      if (vm && !vm.sinBeneficio) extra += '<li class="y"><b>Valor a su múltiplo histórico</b>: ' + [['per', 'PER'], ['pfcf', 'P/FCF'], ['ev_ebitda', 'EV/EBITDA'], ['ev_ebit', 'EV/EBIT']].filter(([k]) => isN(vm.porMetodo[k])).map(([k, n]) => n + ' ' + nf(vm.porMetodo[k], 2)).join(' · ') + ' → mediana ' + nf(vm.valor, 2) + '. Si el último ejercicio fue excepcional (bueno o malo) o los múltiplos históricos son de años raros, esta lectura engaña: mira el objetivo a 5 años.</li>';
      const mio = V.margenImplicito(f, sc.conservador, o / 100);
      extra += '<li class="y"><b>Margen implícito</b>: para ganar un ' + nf(o, 0) + ' % anual el margen EBIT tendría que ser ' + (mio == null ? 'imposible (>95 %)' : pc(mio)) + '. Solo contraste.</li>';
    }
    h += sec('real', 'Control de realismo', al.length ? al.length + ' aviso(s)' : 'sin avisos', '<ul class="al crl">' + (al.length ? al.map(x => '<li class="cr s-' + x.n + '"><span class="bdg">' + ({ g: '✓', y: '!', r: '✕' }[x.n] || '!') + '</span><div>' + esc(x.txt) + '</div></li>').join('') : '<li class="cr s-g"><span class="bdg">✓</span><div>Los supuestos están dentro de lo que la empresa ha hecho.</div></li>') + extra + '</ul>');
    // fiabilidad
    h += sec('dat', 'Fiabilidad de los datos', fi.puntuacion + ' % · ' + fi.nivel, '<ul class="crl">' + (fi.avisos.length ? fi.avisos.map(x => '<li class="cr s-' + x.nivel + '"><span class="bdg">' + ({ g: '✓', y: '!', r: '✕' }[x.nivel] || '!') + '</span><div>' + esc(x.txt) + '</div></li>').join('') : '<li class="cr s-g"><span class="bdg">✓</span><div>Sin avisos.</div></li>') + '</ul>' +
      (f.fecha_datos ? '<p class="small mut">Datos de ' + esc(f.fecha_datos) + (f.fuentes && f.fuentes.length ? ' · ' + esc(f.fuentes.join(', ')) : '') + '</p>' : '') + (Array.isArray(f.notas) && f.notas.length ? '<details><summary class="small">Notas de la ficha (' + f.notas.length + ')</summary><ul class="small">' + f.notas.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul></details>' : ''));
    return h + (U.historialResultados ? U.historialResultados(sel) : '') + acciones(f);
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

  /* Fuerza la relectura del índice de informes (Drive) y rehace las fichas borrador con él. Las fichas completas no se tocan: solo avisa si el informe trae un ejercicio más nuevo. */
  async function releerInformes() {
    const msg = h => U.dlg('<h2>Releer informes</h2><p class="small">' + h + '</p><div class="acts"><button class="btn" data-a="cerrar">Vale</button></div>');
    const d = D(); let via = 'índice ya cargado en la app';
    if (Drive.estado().conectado) { U.toast('Leyendo el índice de informes en Drive…'); const r = await Drive.releerInformes(); if (r.msg) return msg('No he podido leer Drive: ' + r.msg); via = 'Drive (' + r.n + ' empresas, generado ' + String(r.generado || '?').slice(0, 16).replace('T', ' ') + ')'; }
    const I = Store.get().informes, emp = (I && I.empresas) || [], enlazadas = (Logic.informes(d, hoy()) || { lista: [] }).lista;
    if (!emp.length) return msg('No hay índice de informes. En tu PC ejecuta python herramientas/indice_informes.py --drive (o carga el archivo en Ajustes) y vuelve a pulsar.');
    const rehechas = [], nuevas = [], sinDatos = [];
    Object.keys(d.fichas).forEach(k => {
      const f = d.fichas[k], e = enlazadas.find(x => (x.tk || '').toUpperCase() === k.toUpperCase()); if (!e) return;
      const an = ((e.datos || {}).anios || []).map(Number), ult = an.length ? Math.max.apply(null, an) : null;
      if (f._borrador) { const n = DatosWeb.aFichaInformes(e, hoy()); if (n) { n.precio = f.precio; n.precio_fecha = f.precio_fecha; d.fichas[k] = n; rehechas.push(k + ' (hasta ' + ult + ')'); } else sinDatos.push(k); }
      else if (ult && Number(f.anio_base) < ult) nuevas.push(k + ': ficha ' + f.anio_base + ' → informes ' + ult);
    });
    if (rehechas.length) { Store.save(); U.render(); }
    msg('Leído desde ' + via + '.' + (rehechas.length ? '<br><br><b>Fichas borrador rehechas:</b> ' + esc(rehechas.join(', ')) : '<br><br>No había fichas borrador que rehacer.') + (nuevas.length ? '<br><br><b>Fichas completas con ejercicio más nuevo en los informes</b> (no las toco; actualízalas con «Nuevo ejercicio»): ' + esc(nuevas.join('; ')) : '') + (sinDatos.length ? '<br><br><b>Sin cifras suficientes en el CSV:</b> ' + esc(sinDatos.join(', ')) : ''));
  }

  /* ───── Eventos ───── */
  const restore = fn => { const y = window.scrollY; fn(); U.render(); window.scrollTo(0, y); };
  U.clicks.push(e => {
    const t = e.target.closest('[data-v]'); if (!t) return false; const a = t.dataset.v, d = D();
    if (a === 'nueva') nuevaDlg();
    else if (a === 'releer') releerInformes();
    else if (a === 'abrir') { sel = t.dataset.k; U.render(); window.scrollTo(0, 0); }
    else if (a === 'abrir-tk') U.abrirFicha(t.dataset.k);
    else if (a === 'volver') { sel = null; U.render(); }
    else if (a === 'precio') precioDlg();
    else if (a === 'datos') datosDlg();
    else if (a === 'nuevoej') nuevoEjercicio(sel);
    else if (a === 'lineasia') lineasIA(sel);
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
