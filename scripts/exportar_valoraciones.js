#!/usr/bin/env node
/* Exporta las valoraciones detalladas de todas las fichas (escenarios pesimista / conservador / optimista, supuestos y proyección a 5 años).
   Uso: node scripts/exportar_valoraciones.js datos_usuario.json salida.json
   (el motor no tiene escenario «base»: el conservador es el histórico M14 y es el que fija la referencia de entrada) */
global.Val = require('../js/val.js'); const V = global.Val, L = require('../js/logic.js'), fs = require('fs');
const d = L.normalizar(JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))), hoy = new Date().toISOString().slice(0, 10), out = { generado: hoy, escenarios: ['pesimista', 'conservador', 'optimista'], fichas: {} };
for (const tk of Object.keys(d.fichas)) {
  const f0 = d.fichas[tk], o = { nombre: f0.nombre, divisa: f0.divisa, estado: f0.estado, anio_base: f0.anio_base, escenarios_guardados: !!f0.escenarios };
  try { const pf = L.precioFicha(d, tk); o.precio = pf.precio; o.fecha_precio = pf.fecha || null; } catch (e) { /* sin precio */ }
  try { o.valoracion = L.valoracion(d, tk, hoy); } catch (e) { o.valoracion_error = e.message; }
  try {
    if (V.soportado(f0)) {
      const f = Object.assign({}, f0, { precio: o.precio }); o.escenarios = {};
      for (const n of o.escenarios_lista || ['pesimista', 'conservador', 'optimista']) {
        const esc = Object.assign({}, V.defaults(f)[n] || {}, (f.escenarios || {})[n] || {});
        try { const r = V.proyectar(f, esc); o.escenarios[n] = { supuestos: esc, rentabilidad_5y: r.cagr && r.cagr[5] ? r.cagr[5].ref : null, cagr: r.cagr, filas: r.rows }; } catch (e) { o.escenarios[n] = { error: e.message }; }
      }
    } else o.soportado = false;
  } catch (e) { o.escenarios_error = e.message; }
  out.fichas[tk] = o;
}
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1)); console.log(Object.keys(out.fichas).length + ' fichas → ' + process.argv[3]);
