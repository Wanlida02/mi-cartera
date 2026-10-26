/* Almacenamiento. Fase 1: este dispositivo (localStorage) + exportar/importar JSON.
   Los precios automáticos llegan en precios.json (público, lo escribe una tarea programada de GitHub; no contiene datos personales).
   La sincronización con Google Drive se añade como otro «backend» sin cambiar el resto de la app. */
const Store = (function () {
  const KEY = 'mi-cartera:datos:v1', BK = 'mi-cartera:copia-previa', META = 'mi-cartera:meta';
  let data = null, aviso = '';
  const subs = [];

  function load() {
    try { const t = localStorage.getItem(KEY); data = Logic.normalizar(t ? JSON.parse(t) : null); }
    catch (e) { data = Logic.normalizar(null); aviso = 'No se pudo leer lo guardado en este dispositivo.'; }
    return data;
  }
  function save() {
    data.updatedAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(data)); aviso = ''; }
    catch (e) { aviso = 'No se pudo guardar en este dispositivo (¿navegación privada o sin espacio?). Exporta una copia.'; }
    subs.forEach(f => f());
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
      if (j.fx && (j.fx.fecha || '') > (data.ajustes.fx.fecha || '')) { data.ajustes.fx = Object.assign({}, data.ajustes.fx, j.fx); n++; }
      if (n) save();
      return n;
    } catch (e) { return false; }
  }
  return { load, save, importar, exportar, marcarCopia, ultimaCopia, cargarPreciosAuto, get: () => data, aviso: () => aviso, onChange: f => subs.push(f) };
})();
