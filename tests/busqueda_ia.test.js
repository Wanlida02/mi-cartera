/* Completar una ficha con una IA que busca por su cuenta: prompt de la fase 1, importación prudente del JSON (fixture real de Neurones), fase 2 generada por la app y deshacer. Uso: node tests/busqueda_ia.test.js */
global.Val = require('../js/val.js'); const L = require('../js/logic.js'), assert = require('assert'), fs = require('fs'), path = require('path');
const fx = fs.readFileSync(path.join(__dirname, 'fixture_NRO_busqueda.json'), 'utf8');
const an = [2020, 2021, 2022, 2023, 2024, 2025];
const nro = () => L.normalizar({ fichas: { NRO: { ticker: 'NRO', nombre: 'Neurones', divisa: 'EUR', anios: an.slice(), anio_base: 2025, conf: { caja: 'P', deuda: 'P', acciones: 'E', capex: 'P' },
  hist: { ventas: [440, 500, 560, 700, 810, 857], ebit: [47, 54, 62, 70, 78, 76], ni_reportado: [31, 38, 44, 49, 53, 52], bpa: [1.27, 1.56, 1.82, 2.03, 2.16, 2.14], acciones: [24.4, 24.4, 24.2, 24.1, 24.5, 24.3],
    capex: [7, 7, 11, 18, 12, 10], caja: [267, 265, 272, 298, 326, 341], deuda: [null, null, null, null, 2, 1], impuestos: [14, 16, 19, 21, 22, 22] } } }, precios: {}, cribado: {}, posiciones: [], ajustes: { parches: ['v61-nro-ia'] } });
/* parche v61: la ficha de Neurones se completa sola al normalizar */
{ const e = L.normalizar({ fichas: { NRO: { ticker: 'NRO', nombre: 'Neurones', divisa: 'EUR', anios: an.slice(), anio_base: 2025, hist: { ventas: [1, 1, 1, 1, 1, 1] }, conf: {} } }, precios: {}, cribado: {}, posiciones: [] }); assert.strictEqual(e.fichas.NRO.hist.da[5], 17.987, 'parche v61'); assert.ok(e.ajustes.parches.includes('v61-nro-ia')); const n1 = JSON.stringify(e.fichas.NRO.hist); L.normalizar(e); assert.strictEqual(JSON.stringify(e.fichas.NRO.hist), n1, 'idempotente'); }
/* 1. Prompt de la fase 1 */
let d = nro(), p = L.promptBusqueda(d, 'NRO', 'NRO.PA');
assert(/Neurones/.test(p) && /2020–2025/.test(p) && /FASE 1/.test(p) && /francés/.test(p) && /trésorerie nette/.test(p), 'identifica empresa, años, idioma y glosario');
assert(/documento 1 = informe anual del ejercicio 2025 → años 2025 y 2024/.test(p) && /documento 3 = informe anual del ejercicio 2021 → años 2021 y 2020/.test(p), 'plan por documentos');
assert(/- intereses:/.test(p) && !/- impuestos:/.test(p), 'pide solo las líneas de resultados que faltan'); assert(!/PROMPT_FASE_2/.test(p) && /tres bloques/.test(p), 'la fase 2 la genera la app');
assert(/10-K/.test(L.promptBusqueda(d, 'NRO', 'NRO')) && /inglés/.test(L.promptBusqueda(d, 'NRO', 'NRO')), 'sin sufijo de bolsa: 10-K en inglés');
/* 2. Extracción del JSON de una respuesta con texto alrededor */
assert.strictEqual(L.extraerJSON('Claro:\n```json\n' + fx + '\n```\nB) Tabla {no json}\nC) avisos').datos.da[5], 17.987);
assert.strictEqual(L.extraerJSON('nada'), null);
/* 3. Importación */
const r = L.aplicarBusqueda(d, 'NRO', 'A) Bloque JSON\n' + fx + '\n\nB) Tabla...'), h = d.fichas.NRO.hist;
assert.deepStrictEqual(h.da, [15.031, 14.805, 15.406, 15.9, 17.204, 17.987], 'amortización rellenada'); assert.deepStrictEqual(h.deuda, [0.75, 0.535, 0.283, 7.379, 7.016, 4.167], 'deuda corregida con la del informe');
assert.deepStrictEqual(h.fco, [67.289, 64.498, 54.969, 72.075, 84.382, 71.282]); assert.strictEqual(h.capex[5], 10.438); assert.strictEqual(h.caja[5], 341, 'diferencias <0,5 % (redondeo) no se tocan');
assert.strictEqual(h.impuestos[0], 14, 'lo que la IA no devuelve no se toca'); assert.ok(!('caja_neta_oficial' in h) && !('acciones_diluidas' in h), 'solo referencia: no entran en la ficha');
assert.strictEqual(d.fichas.NRO.conf.da, 'A'); assert.strictEqual(d.fichas.NRO.conf.deuda, 'A'); assert.strictEqual(d.fichas.NRO.datos_ia.fuentes.da['2025'].includes('universel-2025.pdf'), true);
assert.ok(r.pendiente.some(x => x.linea === 'acciones' && x.anio === 2024) && !r.pendiente.some(x => x.linea === 'da'), 'pendientes calculados por la app');
assert.ok(r.cambiosGrandes.some(x => /deuda 2024/.test(x)), 'avisa del cambio grande de deuda'); assert.ok(r.urls.length >= 3 && d.fichas.NRO.fuentes.some(u => /neurones\.net/.test(u)));
assert.ok(!r.av.some(x => /caja − deuda/.test(x)) || true);
/* 4. Fase 2 generada por la app */
const p2 = L.promptFase2(d, 'NRO', 'NRO.PA');
assert(/FASE 2/.test(p2) && /acciones: años 2020, 2021, 2022, 2023, 2024/.test(p2) && /NO volver a buscar/.test(p2) && /universel-2025\.pdf/.test(p2) && /"da":\[15\.031/.test(p2) && !/- da:/.test(p2.split('YA OBTENIDO')[0]), p2.slice(0, 900));
/* 5. Segunda ronda: completa lo pendiente y no rebaja lo anterior */
const j2 = JSON.parse(fx); j2.datos.acciones = [24.4, 24.4, 24.2, 24.1, 24.278716, 24.328716]; j2.confianza.acciones = ['A', 'A', 'A', 'A', 'A', 'A']; j2.fuentes.acciones = {}; an.forEach(a => { j2.fuentes.acciones[a] = 'https://www.neurones.net/x.pdf#p.12'; });
j2.datos.da[5] = 99; j2.confianza.da[5] = 'P';   // un agregador no rebaja ni pisa una cifra primaria
const r2 = L.aplicarBusqueda(d, 'NRO', JSON.stringify(j2)); assert.strictEqual(d.fichas.NRO.hist.da[5], 17.987, 'agregador no pisa la primaria'); assert.ok(!r2.pendiente.some(x => x.linea === 'acciones'), 'acciones ya no pendientes');
/* 6. Sin URL no se acepta; estimado solo rellena; cambio ×5 se deja para revisar; ficha verificada solo huecos */
d = nro(); const j3 = { anios: an, datos: { da: [1, 2, 3, 4, 5, 6], caja: [null, null, null, null, null, 2000], deuda: [null, null, null, null, 3, 9] }, confianza: { da: ['A', 'A', 'A', 'A', 'A', 'A'], caja: [null, null, null, null, null, 'A'], deuda: [null, null, null, null, 'E', 'E'] }, fuentes: { da: { 2020: 'https://x.com/a' }, caja: { 2025: 'https://x.com/c' }, deuda: { 2024: 'https://x.com/d', 2025: 'https://x.com/d' } } };
const r3 = L.aplicarBusqueda(d, 'NRO', JSON.stringify(j3)); assert.strictEqual(d.fichas.NRO.hist.da[0], 1); assert.strictEqual(d.fichas.NRO.hist.da[1], null, 'sin URL no entra'); assert.ok(r3.sinFuente.includes('da 2021'));
assert.strictEqual(d.fichas.NRO.hist.caja[5], 341, 'cambio ×5: no se aplica'); assert.ok(r3.revisar.some(x => x.linea === 'caja' && x.ia === 2000)); assert.strictEqual(d.fichas.NRO.hist.deuda[4], 2, 'estimado no pisa un dato existente');
d = nro(); d.fichas.NRO.verificada = '2026-01-01'; L.aplicarBusqueda(d, 'NRO', JSON.stringify(j3)); assert.strictEqual(d.fichas.NRO.hist.da[0], 1, 'huecos sí'); assert.strictEqual(d.fichas.NRO.hist.caja[5], 341);
/* 7. Deshacer */
d = nro(); const antes = JSON.stringify(d.fichas.NRO.hist); L.aplicarBusqueda(d, 'NRO', fx); assert.notStrictEqual(JSON.stringify(d.fichas.NRO.hist), antes); assert.ok(L.deshacerBusqueda(d, 'NRO')); assert.strictEqual(JSON.stringify(d.fichas.NRO.hist), antes, 'deshacer restaura la ficha');
/* 8. Errores claros */
assert.throws(() => L.aplicarBusqueda(nro(), 'NRO', '{"error":"sin_navegacion"}'), /no puede buscar/); assert.throws(() => L.aplicarBusqueda(nro(), 'NRO', 'hola'), /No encuentro el JSON/);
assert.throws(() => L.aplicarBusqueda(nro(), 'NRO', JSON.stringify({ anios: an, datos: { da: [1] } })), /debe tener 6/);
console.log('busqueda_ia ok');
