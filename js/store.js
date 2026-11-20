/* Almacenamiento. Fase 1: este dispositivo (localStorage) + exportar/importar JSON.
   Los precios automáticos llegan en precios.json (público, lo escribe una tarea programada de GitHub; no contiene datos personales).
   La sincronización con Google Drive se añade como otro «backend» sin cambiar el resto de la app. */
const Store = (function () {
  const KEY = 'mi-cartera:datos:v1', BK = 'mi-cartera:copia-previa', META = 'mi-cartera:meta', ROTA = 'mi-cartera:copia-ilegible';
  const INFO = 'mi-cartera:precios-info';
  let data = null, aviso = '', avisoCarga = '', info = null, gen = 0;   // gen: sube cuando los datos se sustituyen desde fuera (Drive, importar); invalida un «Deshacer» pendiente
  try { info = JSON.parse(localStorage.getItem(INFO) || 'null'); } catch (e) { info = null; }
  const subs = [];

  function load() {
    try {
      const t = localStorage.getItem(KEY), raw = t ? JSON.parse(t) : null; data = Logic.normalizar(raw);
      const n0 = raw && raw.ajustes && Array.isArray(raw.ajustes.parches) ? raw.ajustes.parches.length : 0;
      if (raw && data.ajustes.parches && data.ajustes.parches.length > n0) setTimeout(() => save(true), 0);   // parche de datos aplicado: se guarda sin contar como edición tuya (cada dispositivo lo aplica igual al leer los datos; si contara, el segundo en sincronizar vería «Datos distintos»)
    }
    catch (e) {   // no se pierde nada: lo que no se pudo leer se guarda aparte antes de empezar vacío (si no, el siguiente guardado lo pisaría)
      console.error(e); let guardada = false;
      try { const t = localStorage.getItem(KEY); if (t) { localStorage.setItem(ROTA, t); guardada = true; } } catch (e2) { /* sin espacio */ }
      data = Logic.normalizar(null); aviso = 'No se pudo leer lo guardado en este dispositivo (' + (e && e.message || 'error') + ').' + (guardada ? ' Hay una copia intacta: en ⚙ Ajustes, «Descargar lo que no se pudo leer».' : ''); avisoCarga = aviso;
    }
    return data;
  }
  function save(silencioso) {
    if (!silencioso) data.updatedAt = Date.now();   // los precios automáticos no cuentan como edición tuya (no disparan sincronización)
    try { localStorage.setItem(KEY, JSON.stringify(data)); aviso = ''; }
    catch (e) { aviso = 'No se pudo guardar en este dispositivo (¿navegación privada o sin espacio?). Exporta una copia.'; }
    if (!silencioso) subs.forEach(f => f());
    return !aviso;
  }
  function validar(o) {
    if (!o || typeof o !== 'object') throw new Error('El archivo no es un JSON de la app.');
    if (!Array.isArray(o.posiciones)) throw new Error('Falta la lista de posiciones.');
    if (o.fichas && typeof o.fichas !== 'object') throw new Error('Las fichas no tienen el formato esperado.');
    return o;
  }
  function importar(texto) {
    const o = validar(JSON.parse(texto));
    try { const prev = localStorage.getItem(KEY); if (prev) localStorage.setItem(BK, prev); } catch (e) { /* sin copia previa */ }
    data = Logic.normalizar(o); gen++;
    return save();
  }
  /* Adopta datos que vienen de Drive sin tocar su updatedAt (así no se vuelven a subir) */
  function adopt(o) {
    const previo = data && data.historico;
    data = Logic.normalizar(validar(o));
    data.historico = Logic.unirHistorico(previo, data.historico); gen++;   // las fotos diarias de este dispositivo no se pierden al traer los datos de Drive
    try { localStorage.setItem(KEY, JSON.stringify(data)); aviso = ''; } catch (e) { aviso = 'No se pudo guardar en este dispositivo.'; }
  }
  /* Foto del día del valor de la cartera (no cuenta como edición tuya: viaja a Drive con la siguiente) */
  function foto() { if (data && Logic.fotoDiaria(data)) save(true); }
  /* Vuelve a una copia tomada con exportar() (botón «Deshacer»): cuenta como edición tuya, así que también se sincroniza */
  function restaurar(texto) { data = Logic.normalizar(JSON.parse(texto)); return save(); }
  function exportar() { return JSON.stringify(data); }
  function marcarCopia() { try { localStorage.setItem(META, JSON.stringify({ copia: Date.now() })); } catch (e) { } }
  function ultimaCopia() { try { return (JSON.parse(localStorage.getItem(META) || '{}')).copia || null; } catch (e) { return null; } }

  /* precios.json: se fusiona solo si es más reciente que lo que ya hay (nunca pisa un precio manual más nuevo) */
  async function cargarPreciosAuto(jIn) {
    try {
      let j = jIn; if (!j) { const r = await fetch('precios.json', { cache: 'no-store' }); if (!r.ok) return false; j = await r.json(); }
      let n = 0;
      Object.keys(j.precios || {}).forEach(tk => {
        let nuevo = j.precios[tk]; const ant = data.precios[tk];
        if (nuevo && (nuevo.divisa === 'GBp' || nuevo.divisa === 'GBX') && nuevo.precio > 0) nuevo = Object.assign({}, nuevo, { precio: nuevo.precio / 100, divisa: 'GBP' });   // peniques → libras (un precios.json antiguo los traía así)
        if (!nuevo || !(nuevo.precio > 0)) return;
        if (!ant || (ant.simbolo && nuevo.simbolo && ant.simbolo !== nuevo.simbolo) || (nuevo.fecha_precio || '') > (ant.fecha_precio || '') || ((nuevo.fecha_precio || '') === (ant.fecha_precio || '') && !/^(manual|IA)$/.test(ant.fuente || ''))) {
          if (!ant || JSON.stringify(ant) !== JSON.stringify(nuevo)) n++;   // solo cuenta lo que cambia de verdad (si no, «Precios actualizados» salía en cada arranque)
          data.precios[tk] = nuevo;
        }
      });
      const fl = data.ajustes.fx;   // divisas: gana la fecha más reciente; un ajuste manual de hoy se respeta hasta mañana
      if (j.fx && j.fx.fecha && (j.fx.fecha > (fl.fecha || '') || (j.fx.fecha === fl.fecha && !fl.manual))) {
        const nfx = Object.assign({}, fl, j.fx, { manual: false });
        if (Object.keys(nfx).some(k => nfx[k] !== fl[k])) { data.ajustes.fx = nfx; n++; }
      }
      try { localStorage.setItem(INFO, JSON.stringify({ generado: j.generado, estado: j.estado })); } catch (e) { /* sin info */ }
      info = { generado: j.generado, estado: j.estado };
      if (n) save(true);
      return n;
    } catch (e) { return false; }
  }
  return { avisoCarga: () => avisoCarga, copiaIlegible: () => { try { return localStorage.getItem(ROTA); } catch (e) { return null; } }, restaurar, generacion: () => gen, foto, load, save, adopt, importar, exportar, marcarCopia, ultimaCopia, cargarPreciosAuto, get: () => data, preciosInfo: () => info, aviso: () => aviso, onChange: f => subs.push(f) };
})();
