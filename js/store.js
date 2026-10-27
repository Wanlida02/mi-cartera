/* Almacenamiento. Fase 1: este dispositivo (localStorage) + exportar/importar JSON.
   Los precios automáticos llegan en precios.json (público, lo escribe una tarea programada de GitHub; no contiene datos personales).
   La sincronización con Google Drive se añade como otro «backend» sin cambiar el resto de la app. */
const Store = (function () {
  const KEY = 'mi-cartera:datos:v1', BK = 'mi-cartera:copia-previa', META = 'mi-cartera:meta';
  const INFO = 'mi-cartera:precios-info';
  let data = null, aviso = '', info = null;
  try { info = JSON.parse(localStorage.getItem(INFO) || 'null'); } catch (e) { info = null; }
  const subs = [];

  function load() {
    try { const t = localStorage.getItem(KEY); data = Logic.normalizar(t ? JSON.parse(t) : null); }
    catch (e) { data = Logic.normalizar(null); aviso = 'No se pudo leer lo guardado en este dispositivo.'; }
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
    data = Logic.normalizar(o);
    return save();
  }
  /* Adopta datos que vienen de Drive sin tocar su updatedAt (así no se vuelven a subir) */
  function adopt(o) {
    data = Logic.normalizar(validar(o));
    try { localStorage.setItem(KEY, JSON.stringify(data)); aviso = ''; } catch (e) { aviso = 'No se pudo guardar en este dispositivo.'; }
  }
  function exportar() { return JSON.stringify(data); }
  function marcarCopia() { try { localStorage.setItem(META, JSON.stringify({ copia: Date.now() })); } catch (e) { } }
  function ultimaCopia() { try { return (JSON.parse(localStorage.getItem(META) || '{}')).copia || null; } catch (e) { return null; } }

  /* precios.json: se fusiona solo si es más reciente que lo que ya hay (nunca pisa un precio manual más nuevo) */
  async function cargarPreciosAuto() {
    try {
      const r = await fetch('precios.json', { cache: 'no-store' }); if (!r.ok) return false;
      const j = await r.json(); let n = 0;
      Object.keys(j.precios || {}).forEach(tk => {
        const nuevo = j.precios[tk], ant = data.precios[tk];
        if (!nuevo || !(nuevo.precio > 0)) return;
        if (!ant || (nuevo.fecha_precio || '') > (ant.fecha_precio || '') || ((nuevo.fecha_precio || '') === (ant.fecha_precio || '') && ant.fuente !== 'manual')) { data.precios[tk] = nuevo; n++; }
      });
      const fl = data.ajustes.fx;   // divisas: gana la fecha más reciente; un ajuste manual de hoy se respeta hasta mañana
      if (j.fx && j.fx.fecha && (j.fx.fecha > (fl.fecha || '') || (j.fx.fecha === fl.fecha && !fl.manual))) { data.ajustes.fx = Object.assign({}, fl, j.fx, { manual: false }); n++; }
      try { localStorage.setItem(INFO, JSON.stringify({ generado: j.generado, estado: j.estado })); } catch (e) { /* sin info */ }
      info = { generado: j.generado, estado: j.estado };
      if (n) save(true);
      return n;
    } catch (e) { return false; }
  }
  return { load, save, adopt, importar, exportar, marcarCopia, ultimaCopia, cargarPreciosAuto, get: () => data, preciosInfo: () => info, aviso: () => aviso, onChange: f => subs.push(f) };
})();
