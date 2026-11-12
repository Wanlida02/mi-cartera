/* Conexiones entre pestañas: una barra de enlaces por empresa (Valoración · Cribado · Informes · Resultados · Cartera)
   y una tarjeta de «calidad de datos» en Inicio que lleva a lo que falta. Solo muestra los destinos que existen para ese ticker. */
(function () {
  const L = Logic, U = window.UI, { esc } = U, D = () => Store.get();
  const posDe = tk => D().posiciones.findIndex(p => L.tickerDe(D(), p) === tk);
  const infDe = tk => { const I = L.informes(D()); return I ? I.lista.findIndex(e => (e.tk || '').toUpperCase() === String(tk).toUpperCase()) : -1; };
  const destinos = tk => {
    const d = D(), o = [];
    if (d.fichas[tk]) o.push(['val', 'Valoración']);
    if ((d.cribado || {})[tk]) o.push(['cri', 'Cribado']);
    if (infDe(tk) >= 0) o.push(['inf', 'Informes']);
    if ((d.resultados || []).some(r => r.tk === tk) || (d.fichas[tk] && posDe(tk) >= 0)) o.push(['res', 'Resultados']);
    if (posDe(tk) >= 0) o.push(['pos', 'Posición']);
    return o;
  };
  /* actual: el destino en el que ya estás (no se muestra) */
  U.enlaces = (tk, actual) => {
    if (!tk) return ''; const o = destinos(tk).filter(x => x[0] !== actual); if (!o.length) return '';
    return '<div class="links" role="navigation" aria-label="Ir a otra pestaña de ' + esc(tk) + '"><span class="mut small">Ir a</span>' + o.map(([g, n]) => '<button type="button" class="lk" data-go="' + g + '" data-tk="' + esc(tk) + '">' + n + '</button>').join('') + '</div>';
  };
  U.ir = (g, tk) => {
    if (U.cerrar) U.cerrar();
    if (g === 'val') U.abrirFicha && U.abrirFicha(tk);
    else if (g === 'cri') U.abrirCribado && U.abrirCribado(tk);
    else if (g === 'inf') U.abrirInforme && U.abrirInforme(tk);
    else if (g === 'res') U.abrirResultados && U.abrirResultados(tk);
    else if (g === 'pos') U.abrirPosicion && U.abrirPosicion(tk);
  };
  U.clicks.push(e => { const t = e.target.closest('[data-go]'); if (!t) return false; e.preventDefault(); U.ir(t.dataset.go, t.dataset.tk); return true; });

  /* Calidad de datos (Inicio): fichas que no se pueden valorar y por qué, con enlace directo */
  U.calidadDatos = () => {
    const d = D(), items = [];
    Object.keys(d.fichas).forEach(tk => {
      const v = L.valoracion(d, tk); if (!v) return;
      const enCart = posDe(tk) >= 0, est = d.fichas[tk].estado;
      if (!enCart && est !== 'watchlist' && !d.fichas[tk]._borrador) return;
      if (v.noSoportado) return;
      if (v.error) items.push({ tk, n: v.nombre, m: v.sinPrecio ? 'sin precio' : v.sinAcciones ? 'falta nº de acciones' : v.incompleta ? 'faltan ' + v.incompleta.join(', ') : v.error, cart: enCart });
      else if (v.ref == null) items.push({ tk, n: v.nombre, m: 'no valorable (pérdidas)', cart: enCart });
      else if (v.graves) items.push({ tk, n: v.nombre, m: 'datos dudosos', cart: enCart });
    });
    const sinFicha = (L.cartera ? [] : []);
    if (!items.length) return '';
    items.sort((a, b) => (b.cart ? 1 : 0) - (a.cart ? 1 : 0));
    return '<div class="sec-t"><h2>Datos por completar <span class="mut small">' + items.length + '</span></h2></div><div class="card">' +
      items.slice(0, 12).map(x => '<div class="row click" data-go="val" data-tk="' + esc(x.tk) + '"><div class="main"><div class="name">' + esc(x.n) + '</div><div class="meta">' + esc(x.tk) + ' · ' + esc(x.m) + '</div></div><div class="num"><span class="pill ' + (x.cart ? 'warn' : '') + '">' + (x.cart ? 'cartera' : 'seguimiento') + '</span></div></div>').join('') +
      (items.length > 12 ? '<div class="meta" style="padding-top:8px">…y ' + (items.length - 12) + ' más en Valoración.</div>' : '') + '</div>';
  };
})();
