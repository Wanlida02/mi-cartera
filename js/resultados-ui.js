/* Pestaña Resultados trimestrales: calendario de presentaciones de cartera y watchlist, y registro de cada revisión.
   Registro en datos.json → resultados[{id,tk,periodo,fecha,estado:'pendiente'|'revisado',decision,nota,revisado}]. Las fechas se introducen a mano. */
(function () {
  const L = Logic, U = window.UI, { esc, nf } = U, D = () => Store.get(), hoy = () => L.today();
  const DEC = { mantener: 'Mantener', vigilar: 'Vigilar de cerca', comprar: 'Comprar más', vender: 'Vender / reducir' };
  const enCartera = tk => D().posiciones.some(p => L.tickerDe(D(), p) === tk);
  const nombre = tk => (D().fichas[tk] || {}).nombre || tk;
  const trimestre = f => { const t = new Date(f || hoy()); let q = Math.floor(t.getUTCMonth() / 3), y = t.getUTCFullYear(); if (--q < 0) { q = 3; y--; } return 'T' + (q + 1) + ' ' + y; };   // se publica el trimestre anterior
  const dif = f => Math.round((Date.parse(f) - Date.parse(hoy())) / 864e5);
  const seguidas = () => Object.keys(D().fichas).filter(k => enCartera(k) || D().fichas[k].estado !== 'candidata').sort((a, b) => (enCartera(b) - enCartera(a)) || a.localeCompare(b));

  U.vistas.resultados = () => {
    const d = D(), R = d.resultados || [], pend = R.filter(r => r.estado !== 'revisado').sort((a, b) => (a.fecha || '9').localeCompare(b.fecha || '9')), hechas = R.filter(r => r.estado === 'revisado').sort((a, b) => (b.revisado || '').localeCompare(a.revisado || ''));
    const conFecha = new Set(pend.map(r => r.tk)), sin = seguidas().filter(k => !conFecha.has(k));
    const val = tk => { const v = L.valoracion(d, tk, hoy()); return v && v.ref != null ? '<span class="pill ' + (v.ref >= d.ajustes.umbral_barata / 100 ? 'ok' : v.ref <= d.ajustes.umbral_cara / 100 ? 'bad' : '') + '">' + nf(v.ref * 100, 1) + ' %</span>' : ''; };
    let h = '<div class="tools"><button class="btn" data-r="nuevo">+ Añadir fecha</button></div>';
    h += '<h3 style="margin:8px 2px 6px">Próximos resultados <span class="mut small">' + pend.length + '</span></h3><div class="card">' + (pend.length ? pend.map(r => {
      const n = r.fecha ? dif(r.fecha) : null, tag = n == null ? 'sin fecha' : n < 0 ? 'hace ' + (-n) + ' d: ¿ya publicó?' : n === 0 ? 'hoy' : 'en ' + n + ' d';
      return '<div class="row click" data-r="rev" data-id="' + esc(r.id) + '"><div class="main"><div class="name">' + esc(nombre(r.tk)) + '</div><div class="meta">' + esc(r.tk) + ' · ' + esc(r.periodo || '') + ' · ' + (enCartera(r.tk) ? 'cartera' : 'watchlist') + '</div></div><div class="num"><span class="pill ' + (n != null && n < 0 ? 'warn' : n != null && n <= 7 ? 'ok' : '') + '">' + esc(r.fecha || '—') + '</span><div class="meta">' + tag + '</div></div></div>';
    }).join('') : '<div class="empty">Ninguna fecha anotada. Añade la de las empresas que quieras seguir.</div>') + '</div>';
    if (sin.length) h += '<details class="card"><summary>Sin fecha anotada (' + sin.length + ')</summary><div class="chips" style="margin-top:8px">' + sin.map(k => '<button class="btn sec sm" data-r="nuevo" data-k="' + esc(k) + '">' + esc(k) + '</button>').join('') + '</div></details>';
    if (hechas.length) h += '<h3 style="margin:14px 2px 6px">Revisados <span class="mut small">' + hechas.length + '</span></h3><div class="card">' + hechas.slice(0, 40).map(r => '<div class="row click" data-r="rev" data-id="' + esc(r.id) + '"><div class="main"><div class="name">' + esc(nombre(r.tk)) + ' · ' + esc(r.periodo || '') + '</div><div class="meta">' + esc(r.nota || '').slice(0, 90) + '</div></div><div class="num"><span class="pill">' + esc(DEC[r.decision] || '—') + '</span><div class="meta">' + esc(r.revisado || '') + '</div></div></div>').join('') + '</div>';
    return h;
  };

  function nuevo(tk) {
    const ks = seguidas();
    U.dlg('<h2>Fecha de resultados</h2><label for="r-tk">Empresa</label><select id="r-tk">' + ks.map(k => '<option value="' + esc(k) + '"' + (k === tk ? ' selected' : '') + '>' + esc(nombre(k)) + ' (' + esc(k) + ')</option>').join('') + '</select>' +
      '<div class="f2">' + U.campo('r-f', 'Fecha de presentación', '', 'date') + U.campo('r-p', 'Periodo (ej. T3 2026)', '') + '</div><p class="small mut">La fecha la ves en la web de relación con inversores o en tu broker. Puedes dejarla en blanco y ponerla luego.</p>' +
      '<div class="acts"><button class="btn sec" data-a="cerrar">Cancelar</button><button class="btn" id="r-ok">Guardar</button></div>', dd => {
      dd.querySelector('#r-ok').onclick = () => { const t = U.val('r-tk'), f = U.val('r-f'); D().resultados.push({ id: 'r' + Date.now().toString(36), tk: t, periodo: U.val('r-p') || trimestre(f), fecha: f || null, estado: 'pendiente' }); U.guardar({ ok: true, msg: 'Fecha anotada' }); };
      dd.querySelector('#r-tk').onchange = () => {}; });
  }
  function revisar(id) {
    const d = D(), r = d.resultados.find(x => x.id === id); if (!r) return;
    const v = L.valoracion(d, r.tk, hoy()), ok = v && v.ref != null;
    U.dlg('<h2>' + esc(nombre(r.tk)) + ' · ' + esc(r.periodo || '') + '</h2>' +
      (ok ? '<div class="kpis"><div class="kpi"><span>Rentab. esperada</span><b>' + nf(v.ref * 100, 1) + ' %</b><span>5 años, antes de los resultados</span></div><div class="kpi"><span>Precio de entrada</span><b>' + nf(v.entrada, 2) + '</b><span>precio ' + nf(v.precio, 2) + '</span></div></div>' : '') +
      '<div class="alert" style="background:var(--chip)">Pasos: 1) lee el informe/nota de resultados; 2) actualiza las cuentas en Valoración → Editar datos; 3) mira si cambia la tesis (márgenes, deuda, dilución, dirección); 4) decide. No vendas por ruido: solo si el precio supera claramente el valor.</div>' +
      '<div class="f2">' + U.campo('r-fe', 'Fecha', r.fecha || '', 'date') + U.campo('r-pe', 'Periodo', r.periodo || '') + '</div>' +
      '<label for="r-d">Decisión</label><select id="r-d"><option value="">—</option>' + Object.keys(DEC).map(k => '<option value="' + k + '"' + (r.decision === k ? ' selected' : '') + '>' + DEC[k] + '</option>').join('') + '</select>' +
      '<label for="r-n">Notas de la revisión</label><textarea id="r-n" rows="4">' + esc(r.nota || '') + '</textarea>' +
      '<div class="acts"><button class="btn sec" id="r-del">Eliminar</button><button class="btn sec" id="r-sv">Guardar</button><button class="btn" id="r-ok">' + (r.estado === 'revisado' ? 'Reabrir' : 'Marcar revisado') + '</button></div>', dd => {
      const set = (fin) => { r.fecha = U.val('r-fe') || null; r.periodo = U.val('r-pe') || r.periodo; r.decision = U.val('r-d') || null; r.nota = dd.querySelector('#r-n').value.trim(); if (fin === 'rev') { r.estado = 'revisado'; r.revisado = hoy(); } if (fin === 'reabrir') { r.estado = 'pendiente'; delete r.revisado; } U.guardar({ ok: true, msg: fin === 'rev' ? 'Revisión guardada' : 'Guardado' }); };
      dd.querySelector('#r-sv').onclick = () => set(); dd.querySelector('#r-ok').onclick = () => set(r.estado === 'revisado' ? 'reabrir' : 'rev');
      dd.querySelector('#r-del').onclick = () => { if (confirm('¿Eliminar este registro?')) { d.resultados.splice(d.resultados.indexOf(r), 1); U.guardar({ ok: true, msg: 'Eliminado' }); } };
    });
  }
  U.clicks.push(e => { const t = e.target.closest('[data-r]'); if (!t) return false; if (t.dataset.r === 'nuevo') nuevo(t.dataset.k); else if (t.dataset.r === 'rev') revisar(t.dataset.id); else return false; return true; });
})();
