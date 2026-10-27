/* Extras de la pestaña Cartera: simulador de compra/venta (límites 10 % empresa / 30 % sector) y otras inversiones fuera de bolsa. */
(function () {
  const L = Logic, U = window.UI, { esc, nf } = U, D = () => Store.get();
  const eur = n => nf(n, 0) + ' €';
  const ultimo = a => (a.historial || []).slice().sort((x, y) => (y.fecha || '').localeCompare(x.fecha || ''))[0];

  U.pies.cartera = [() => {
    const d = D(), ac = (d.otras && d.otras.accounts) || [];
    const tot = ac.reduce((s, a) => s + ((ultimo(a) || {}).valor || 0), 0);
    return '<div class="tools" style="margin-top:14px"><button class="btn" data-x="sim">Simular compra o venta</button></div>' +
      '<h3 style="margin:14px 2px 6px">Otras inversiones <span class="mut small">fuera de bolsa · ' + eur(tot) + '</span></h3><div class="card">' + (ac.length ? ac.map(a => { const u = ultimo(a);
        return '<div class="row click" data-x="otra" data-id="' + esc(a.id) + '"><div class="main"><div class="name">' + esc(a.nombre) + '</div><div class="meta">' + esc(a.tipo || '') + (a.notas ? ' · ' + esc(a.notas) : '') + '</div></div><div class="num"><b>' + (u ? eur(u.valor) : '—') + '</b><div class="meta">' + (u ? esc(u.fecha) : 'sin valor') + '</div></div></div>'; }).join('') : '<div class="empty">Sin otras inversiones.</div>') +
      '</div><div class="tools"><button class="btn sec sm" data-x="otra-nueva">+ Añadir</button></div>';
  }];

  function otra(id) {
    const d = D(), a = id ? d.otras.accounts.find(x => x.id === id) : { id: 'o' + Date.now().toString(36), nombre: '', tipo: '', notas: '', historial: [] }, u = ultimo(a);
    U.dlg('<h2>' + (id ? esc(a.nombre) : 'Nueva inversión') + '</h2>' + U.campo('o-n', 'Nombre', a.nombre) + U.campo('o-t', 'Tipo', a.tipo || '') + U.campo('o-v', 'Valor actual (€)', u ? u.valor : '', 'number') + U.campo('o-no', 'Notas', a.notas || '') +
      (a.historial.length ? '<p class="small mut">Historial: ' + a.historial.slice(-6).map(h => esc(h.fecha) + ' ' + eur(h.valor)).join(' · ') + '</p>' : '') +
      '<div class="acts">' + (id ? '<button class="btn sec" id="o-del">Eliminar</button>' : '') + '<button class="btn sec" data-a="cerrar">Cancelar</button><button class="btn" id="o-ok">Guardar</button></div>', dd => {
      dd.querySelector('#o-ok').onclick = () => { const n = U.val('o-n').trim(); if (!n) return U.toast('Pon un nombre'); a.nombre = n; a.tipo = U.val('o-t'); a.notas = U.val('o-no');
        const v = parseFloat(U.val('o-v').replace(',', '.')); if (isFinite(v) && (!u || u.valor !== v)) a.historial.push({ fecha: L.today(), valor: v });
        if (!id) d.otras.accounts.push(a); U.guardar({ ok: true, msg: 'Guardado' }); };
      const del = dd.querySelector('#o-del'); if (del) del.onclick = () => { if (confirm('¿Eliminar ' + a.nombre + '?')) { d.otras.accounts.splice(d.otras.accounts.indexOf(a), 1); U.guardar({ ok: true, msg: 'Eliminada' }); } };
    });
  }

  function sim() {
    const d = D(), W = L.pesos(d), emps = Object.keys(W.emp).sort(), secs = Object.keys(W.sec).sort();
    U.dlg('<h2>Simular compra o venta</h2><div class="f2"><div><label for="s-t">Operación</label><select id="s-t"><option value="compra">Compra</option><option value="venta">Venta</option></select></div>' + U.campo('s-i', 'Importe (€)', '', 'number') + '</div>' +
      '<label for="s-e">Empresa</label><select id="s-e">' + emps.map(e => '<option>' + esc(e) + '</option>').join('') + '<option value="__n">Otra empresa (nueva)</option></select>' +
      '<div id="s-sw" hidden><label for="s-s">Sector de la nueva</label><select id="s-s">' + secs.map(s => '<option>' + esc(s) + '</option>').join('') + '</select></div>' +
      '<div class="acts"><button class="btn sec" data-a="cerrar">Cerrar</button><button class="btn" id="s-go">Simular</button></div><div id="s-out"></div>', dd => {
      const e = dd.querySelector('#s-e'); e.onchange = () => { dd.querySelector('#s-sw').hidden = e.value !== '__n'; };
      dd.querySelector('#s-go').onclick = () => {
        const tipo = U.val('s-t'), imp = parseFloat(U.val('s-i').replace(',', '.')), em = e.value, nueva = em === '__n';
        if (!(imp > 0)) return U.toast('Importe no válido');
        const fila = nueva ? null : W.filas.find(r => (r.tk || r.p.empresa) === em), sec = nueva ? U.val('s-s') : fila.sector, act = nueva ? 0 : W.emp[em] || 0;
        if (tipo === 'venta' && (nueva || imp > act + 1e-6)) return U.toast('No puedes vender más de lo que tienes (' + eur(act) + ')');
        const dl = tipo === 'compra' ? imp : -imp, T0 = W.total, T1 = T0 + dl, e0 = act, e1 = act + dl, s0 = W.sec[sec] || 0, s1 = s0 + dl, A = d.ajustes;
        const pc = (a, b) => b > 0 ? a / b * 100 : 0, ee0 = pc(e0, T0), ee1 = pc(e1, T1), ss0 = pc(s0, T0), ss1 = pc(s1, T1);
        const row = (t, a, b, lim) => '<div class="alert ' + (b > lim ? 'bad' : '') + '"' + (b > lim ? '' : ' style="background:var(--ok-bg);color:var(--ok)"') + '>' + (b > lim ? '⚠ ' : '') + '<b>' + esc(t) + '</b>: ' + nf(a, 1) + ' % → ' + nf(b, 1) + ' %' + (b > lim ? ' (supera el límite del ' + lim + ' %)' : '') + '</div>';
        dd.querySelector('#s-out').innerHTML = row(nueva ? 'Nueva empresa' : em, ee0, ee1, A.lim_empresa) + row('Sector ' + sec, ss0, ss1, A.lim_sector) + '<p class="small mut">Cartera: ' + eur(T0) + ' → ' + eur(T1) + '. Importe máximo que cabe en la empresa: ' + eur(Math.max(0, (A.lim_empresa / 100 * T0 - e0) / (1 - A.lim_empresa / 100))) + '.</p>';
      };
    });
  }
  U.clicks.push(e => { const t = e.target.closest('[data-x]'); if (!t) return false; const a = t.dataset.x; if (a === 'sim') sim(); else if (a === 'otra') otra(t.dataset.id); else if (a === 'otra-nueva') otra(); else return false; return true; });
})();
