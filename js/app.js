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
  let tab = 'inicio', filtro = '', orden = 'peso', toastT;

  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200); }
  function dlg(html, onReady) {
    const d = $('#dlg'); d.innerHTML = '<div class="dlg-in">' + html + '</div>';
    if (!d.open) d.showModal();
    if (onReady) onReady(d);
    return d;
  }
  const cerrar = () => { const d = $('#dlg'); if (d.open) d.close(); };
  const UI = window.UI = { vistas: {}, clicks: [], changes: [] };   // enganches para módulos que añaden pestañas (cribado, valoración…)
  function guardar(res, ok) {
    if (!res.ok) { toast(res.msg); return false; }
    Store.save(); const av = Store.aviso(); cerrar(); render(); toast(av || res.msg); if (ok) ok(); return true;
  }

  /* ───── Inicio ───── */
  function filaVal(v, extra) {
    const peso = v.peso != null ? ' · ' + nf(v.peso * 100, 1) + '% cartera' : '';
    const aviso = v.graves ? ' <span class="pill warn" title="' + esc((v.avisos || []).join(' | ')) + '">datos dudosos</span>' : '';
    const viejo = v.diasPrecio != null && v.diasPrecio > Store.get().ajustes.dias_precio_viejo ? ' <span class="pill">precio de hace ' + v.diasPrecio + ' d</span>' : '';
    return '<div class="row"><div class="main"><div class="name">' + esc(v.nombre) + '</div><div class="meta">' + esc(v.tk) + peso + '</div>' +
      '<div class="meta">Precio ' + money(v.precio, v.divisa) + ' · entrada ' + money(v.entrada, v.divisa) + '</div>' + (aviso || viejo ? '<div class="chips">' + aviso + viejo + '</div>' : '') + '</div>' +
      '<div class="num">' + extra + '</div></div>';
  }
  function vistaInicio() {
    const d = Store.get(), D = L.dashboard(d), R = D.resumen;
    if (!d.posiciones.length && !Object.keys(d.fichas).length)
      return '<div class="card empty"><p><b>Aún no hay datos en este dispositivo.</b></p><p>Abre ⚙ Ajustes e importa tu archivo <code>datos.json</code> (o empieza añadiendo una compra en Cartera).</p><button class="btn" data-a="ajustes">Abrir ajustes</button></div>';
    let h = '<div class="kpis">' +
      '<div class="kpi"><span>Valor de la cartera</span><b>' + eur(R.valorEur) + '</b></div>' +
      '<div class="kpi"><span>Empresas</span><b>' + R.nPos + '</b></div>' +
      '<div class="kpi"><span>Rentab. esperada (pond.)</span><b>' + (R.refPond == null ? '—' : nf(R.refPond * 100, 1) + '%') + '</b></div>' +
      '<div class="kpi"><span>Cartera valorada</span><b>' + (R.cubierto == null ? '—' : nf(R.cubierto * 100, 0) + '%') + '</b></div></div>';
    D.alertas.forEach(a => h += '<div class="alert bad">⚠ ' + esc(a.nombre) + ' pesa ' + nf(a.pct, 1) + '% (límite ' + (a.tipo === 'empresa' ? 'por empresa' : 'por sector') + ' ' + a.lim + '%)</div>');
    if (R.preciosViejos) h += '<div class="alert warn">' + R.preciosViejos + ' posición(es) con precio de hace más de ' + d.ajustes.dias_precio_viejo + ' días.</div>';
    const A = d.ajustes;
    h += '<div class="sec-t"><h2>Muy baratas <span class="mut small">≥ ' + A.umbral_barata + '% anual</span></h2></div><div class="card">' +
      (D.baratas.length ? D.baratas.map(v => filaVal(v, '<span class="pill ok">' + nf(v.ref * 100, 1) + '%</span>')).join('') : '<div class="empty">Ninguna posición supera el umbral.</div>') + '</div>';
    h += '<div class="sec-t"><h2>Caras <span class="mut small">≤ ' + A.umbral_cara + '% anual</span></h2></div><div class="card">' +
      (D.caras.length ? D.caras.map(v => filaVal(v, '<span class="pill bad">' + nf(v.ref * 100, 1) + '%</span>')).join('') : '<div class="empty">Ninguna posición está cara.</div>') + '</div>';
    h += '<div class="sec-t"><h2>Watchlist en precio de entrada</h2></div><div class="card">' +
      (D.watch.length ? D.watch.map(v => filaVal(v, '<span class="pill ok">' + pct(v.distEntrada, 0) + '</span><div class="meta">vs entrada</div>')).join('') : '<div class="empty">Ninguna llega aún a su precio de entrada.</div>') + '</div>';
    if (D.watchResto.length) h += '<details class="card"><summary>Watchlist: el resto (' + D.watchResto.length + ')</summary>' +
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

  /* ───── Cartera ───── */
  function vistaCartera() {
    const d = Store.get(), W = L.pesos(d), q = L.norm(filtro);
    let filas = W.filas.map((r, i) => Object.assign({ i }, r)).filter(r => !q || L.norm(r.p.empresa + ' ' + (r.p.ticker || '') + ' ' + (r.p.broker || '')).includes(q));
    const key = { peso: r => -(r.eur || 0), nombre: r => L.norm(r.p.empresa), var: r => -(L.variacion(d, r.p) ?? -9) }[orden];
    filas.sort((a, b) => { const x = key(a), y = key(b); return x < y ? -1 : x > y ? 1 : 0; });
    let h = '<div class="tools"><input id="q" type="search" placeholder="Buscar empresa, ticker o broker" value="' + esc(filtro) + '">' +
      '<select id="ord"><option value="peso"' + (orden === 'peso' ? ' selected' : '') + '>Mayor peso</option><option value="nombre"' + (orden === 'nombre' ? ' selected' : '') + '>Nombre</option><option value="var"' + (orden === 'var' ? ' selected' : '') + '>Mejor rentab.</option></select></div>';
    h += '<div class="card">' + (filas.length ? filas.map(r => {
      const p = r.p, pp = L.precioPos(d, p), v = L.variacion(d, p), w = W.total && r.eur != null ? r.eur / W.total : null;
      return '<div class="row click" data-pos="' + r.i + '"><div class="main"><div class="name">' + esc(p.empresa) + '</div><div class="meta">' + esc(p.broker || '') + ' · ' + nf(p.cantidad, 4).replace(/,?0+$/, '') + ' acc. · ' + money(pp && pp.precio, p.moneda) +
        (pp && pp.convertido ? ' (conv.)' : '') + '</div></div><div class="num"><b>' + eur(r.eur) + '</b><div class="meta"><span class="' + cls(v) + '">' + pct(v) + '</span> · ' + (w == null ? '—' : nf(w * 100, 1) + '%') + '</div></div></div>';
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
    dlg('<h2>' + esc(p.empresa) + '</h2><p class="mut small">' + esc(p.ticker || tk || 'sin ticker') + ' · ' + esc(p.broker || '') + ' · ' + esc(p.sector || '') + '</p>' +
      '<div class="kpis" style="grid-template-columns:1fr 1fr"><div class="kpi"><span>Acciones</span><b>' + nf(p.cantidad, 4) + '</b></div><div class="kpi"><span>Precio medio</span><b>' + money(p.precio_medio_compra, p.moneda) + '</b></div>' +
      '<div class="kpi"><span>Precio actual</span><b>' + money(pp && pp.precio, p.moneda) + '</b></div><div class="kpi"><span>Rentab. esperada</span><b>' + (v && v.ref != null ? nf(v.ref * 100, 1) + '%' : '—') + '</b></div></div>' +
      (v && v.entrada != null ? '<p class="small">Precio de entrada ' + money(v.entrada, v.divisa) + ' · máximo ' + money(v.max, v.divisa) + '</p>' : '') +
      (p.notas ? '<p class="small mut">' + esc(p.notas) + '</p>' : '') +
      '<div class="acts" style="justify-content:flex-start"><button class="btn" data-a="mas" data-i="' + i + '">Comprar más</button><button class="btn bad" data-a="vender" data-i="' + i + '">Vender</button>' +
      '<button class="btn sec" data-a="precio" data-i="' + i + '">Precio</button><button class="btn sec" data-a="editar" data-i="' + i + '">Editar</button></div>' +
      '<div class="acts"><button class="btn sec sm" data-a="eliminar" data-i="' + i + '">Eliminar ficha</button><button class="btn sec" data-a="cerrar">Cerrar</button></div>');
  }

  /* ───── Ajustes ───── */
  function ajustes() {
    const d = Store.get(), A = d.ajustes, cp = Store.ultimaCopia();
    dlg('<h2>Ajustes</h2><h3>Umbrales del Inicio (rentabilidad anual esperada a 5 años)</h3><div class="f2">' + campo('a-b', 'Barata ≥ %', A.umbral_barata, 'number') + campo('a-c', 'Cara ≤ %', A.umbral_cara, 'number') + '</div>' +
      '<h3 style="margin-top:14px">Límites de cartera</h3><div class="f2">' + campo('a-le', 'Máx. por empresa %', A.lim_empresa, 'number') + campo('a-ls', 'Máx. por sector %', A.lim_sector, 'number') + '</div>' +
      '<h3 style="margin-top:14px">Divisas (unidades por 1 €) <span class="mut small">' + esc(A.fx.fecha || '') + '</span></h3><div class="f2">' + campo('a-usd', 'USD', A.fx.USD, 'number') + campo('a-cny', 'CNY', A.fx.CNY, 'number') + campo('a-twd', 'TWD', A.fx.TWD, 'number') + '</div>' +
      '<div class="acts" style="justify-content:flex-start"><button class="btn" id="a-ok">Guardar ajustes</button></div>' +
      '<h3 style="margin-top:18px">Google Drive</h3><p class="small mut" id="dr-t">' + textoDrive() + '</p><div class="acts" style="justify-content:flex-start">' +
      (Drive.estado().conectado ? '<button class="btn" id="dr-now">Sincronizar ahora</button><button class="btn sec" id="dr-off">Desconectar</button>' : '<button class="btn" id="dr-on">Conectar con Drive</button>') + '</div>' +
      '<h3 style="margin-top:18px">Datos</h3><p class="small mut">Ahora se guardan en este dispositivo. Última copia exportada: ' + (cp ? new Date(cp).toLocaleString('es-ES') : 'nunca') + '.</p>' +
      '<div class="acts" style="justify-content:flex-start"><button class="btn sec" id="a-exp">Exportar copia</button><label class="btn sec" style="margin:0;color:var(--ink)">Importar archivo<input id="a-imp" type="file" accept=".json,application/json" hidden></label></div>' +
      '<h3 style="margin-top:18px">Informes anuales</h3><p class="small mut">Carga el <code>indice_informes.json</code> que genera <code>herramientas/indice_informes.py</code> en tu PC.</p>' +
      '<div class="acts" style="justify-content:flex-start"><label class="btn sec" style="margin:0;color:var(--ink)">Cargar índice de informes<input id="a-inf" type="file" accept=".json,application/json" hidden></label></div>' +
      '<div class="acts"><button class="btn sec" data-a="cerrar">Cerrar</button></div>',
      dd => {
        dd.querySelector('#a-ok').onclick = () => {
          const n = id => Number(val(id));
          const v = { b: n('a-b'), c: n('a-c'), e: n('a-le'), s: n('a-ls'), u: n('a-usd'), y: n('a-cny'), t: n('a-twd') };
          if (Object.values(v).some(x => !(x > 0)) || v.c >= v.b) return toast('Revisa los valores (la barata debe ser mayor que la cara)');
          Object.assign(A, { umbral_barata: v.b, umbral_cara: v.c, lim_empresa: v.e, lim_sector: v.s }); Object.assign(A.fx, { USD: v.u, CNY: v.y, TWD: v.t, fecha: L.today(), manual: true });
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
            try { Store.importar(t); cerrar(); render(); toast('Datos importados'); } catch (err) { toast('No se pudo importar: ' + err.message); }
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
    h += '<div class="card">' + (filas.length ? filas.map(({ e, i }) => {
      const pill = e.estado === 'cartera' ? 'ok' : e.estado === 'watchlist' ? 'warn' : '';
      return '<div class="row click" data-inf="' + i + '"><div class="main"><div class="name">' + esc(e.nombre) + '</div><div class="meta">' + esc(e.tk || '') + ' · ' + e.documentos.length + ' informes · último ' + esc(e.ultimo_anio || '—') + (e.datos && e.datos.anios ? ' · con cifras' : '') + '</div></div>' +
        '<div class="num"><span class="pill ' + pill + '">' + ESTADO_TXT[e.estado] + '</span>' + (e.desactualizado ? '<div class="meta down">falta el último</div>' : '') + '</div></div>';
    }).join('') : '<div class="empty">Sin coincidencias.</div>') + '</div>';
    if (I.sin.length) h += '<div class="sec-t"><h2>Sin informes descargados</h2></div><div class="card">' + I.sin.map(o =>
      '<div class="row"><div class="main"><div class="name">' + esc(o.nombre) + '</div><div class="meta">Ejecuta: <code>python informes_anuales.py ' + esc(o.tk || o.nombre) + '</code></div></div><span class="pill ' + (o.estado === 'cartera' ? 'ok' : 'warn') + '">' + ESTADO_TXT[o.estado] + '</span></div>').join('') + '</div>';
    return h;
  }
  function detalleInforme(i) {
    const e = infLista[i]; if (!e) return;
    const dt = e.datos && e.datos.metricas && e.datos.anios ? e.datos : null;
    const f = (v, m) => v == null ? '—' : nf(v, /%|\/|BPA/.test(m) ? 2 : 0);
    dlg('<h2>' + esc(e.nombre) + '</h2><p class="mut small">' + esc(e.tk || '') + (e.ident ? ' · ' + esc(e.ident) : '') + '</p>' +
      '<h3>Informes anuales</h3><div>' + e.documentos.slice().reverse().map(x =>
        '<div class="row"><div class="main"><div class="name">' + esc(x.anio) + ' · ' + esc(x.tipo || '') + (x.idioma ? ' (' + esc(x.idioma) + ')' : '') + '</div><div class="meta">' + esc(x.archivo || 'solo enlace') + (x.kb ? ' · ' + nf(x.kb / 1024, 1) + ' MB' : '') + '</div></div>' +
        (x.url ? '<a class="btn sec sm" href="' + esc(x.url) + '" target="_blank" rel="noopener">Abrir original</a>' : '') + '</div>').join('') + '</div>' +
      '<p class="small mut">Los PDF están en tu PC: carpeta «' + esc(e.carpeta) + '».</p>' +
      (dt ? '<h3 style="margin-top:12px">Cifras clave (' + esc(dt.divisa || '') + ' millones)</h3><div style="overflow:auto"><table style="border-collapse:collapse;font-size:13px;width:100%"><tr><th></th>' + dt.anios.map(a => '<th style="text-align:right;padding:3px 6px">' + a + '</th>').join('') + '</tr>' +
        Object.keys(dt.metricas).map(m => '<tr><td style="padding:3px 6px 3px 0;white-space:nowrap">' + esc(m) + '</td>' + dt.metricas[m].map(v => '<td style="text-align:right;padding:3px 6px">' + f(v, m) + '</td>').join('') + '</tr>').join('') + '</table></div>' +
        '<p class="small mut">Detalle completo en ' + esc(e.csv || 'el CSV') + '.</p>' : '') +
      '<div class="acts"><button class="btn sec" data-a="cerrar">Cerrar</button></div>');
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
  function pintaSync(est) {
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
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    const v = $('#vista'), keep = document.activeElement && document.activeElement.id === 'q';
    const keepI = document.activeElement && document.activeElement.id === 'qi';
    v.innerHTML = tab === 'inicio' ? vistaInicio() : tab === 'cartera' ? vistaCartera() : tab === 'informes' ? vistaInformes() : UI.vistas[tab] ? UI.vistas[tab]() :
      '<div class="card empty"><h2>' + PEND[tab][0] + '</h2><p>' + PEND[tab][1] + '</p></div>';
    const fx = d.ajustes.fx.fecha;
    $('#sub').textContent = d.posiciones.length ? d.posiciones.length + ' posiciones · divisas ' + (fx || '') : 'sin datos';
    if (keep) { const q = $('#q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    if (keepI) { const q = $('#qi'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  }

  document.addEventListener('click', e => {
    for (const f of UI.clicks) if (f(e)) return;
    const t = e.target.closest('[data-tab],[data-a],[data-pos],[data-undo],[data-inf]'); if (!t) return;
    if (t.dataset.inf != null) return detalleInforme(+t.dataset.inf);
    if (t.dataset.tab) { tab = t.dataset.tab; render(); window.scrollTo(0, 0); return; }
    if (t.dataset.pos) return detalle(+t.dataset.pos);
    if (t.dataset.undo) {
      if (!confirm('¿Deshacer esta operación?')) return;
      return guardar(L.borrarMov(Store.get(), t.dataset.undo));
    }
    const i = +t.dataset.i;
    switch (t.dataset.a) {
      case 'cerrar': cerrar(); break;
      case 'ajustes': ajustes(); break;
      case 'compra': formCompra(); break;
      case 'mas': { const p = Store.get().posiciones[i]; formCompra({ empresa: p.empresa, ticker: p.ticker, broker: p.broker, moneda: p.moneda, sector: p.sector }); break; }
      case 'vender': formVenta(i); break;
      case 'editar': formEditar(i); break;
      case 'precio': formPrecio(i); break;
      case 'eliminar': if (confirm('¿Eliminar la ficha sin registrar venta? Para vender usa «Vender».')) guardar(L.eliminar(Store.get(), i)); break;
    }
  });
  document.addEventListener('input', e => { if (e.target.id === 'q') { filtro = e.target.value; render(); } if (e.target.id === 'qi') { filtroInf = e.target.value; render(); } });
  document.addEventListener('change', e => { if (e.target.id === 'ord') { orden = e.target.value; render(); } });
  document.addEventListener('input', e => UI.changes.forEach(f => f(e)));
  document.addEventListener('change', e => UI.changes.forEach(f => f(e)));
  $('#btn-ajustes').onclick = ajustes;
  $('#btn-sync').onclick = () => { const e = Drive.estado(); if (!e.conectado) ajustes(); else if (e.estado === 'conflicto' || e.estado === 'reconectar' || e.estado === 'error') Drive.ahora(); else toast(textoDrive()); };

  Object.assign(UI, { dlg, cerrar, toast, esc, nf, pct, money, eur, guardar, render, campo, val, cls });
  Store.load(); render();
  Drive.init({ onEstado: pintaSync, onDatos: () => { render(); toast('Datos actualizados desde Drive'); Store.cargarPreciosAuto().then(n => n && render()); }, preguntar: preguntarConflicto });
  if (Store.aviso()) toast(Store.aviso());
  Store.cargarPreciosAuto().then(n => { if (n) { render(); toast('Precios actualizados'); } });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
})();
