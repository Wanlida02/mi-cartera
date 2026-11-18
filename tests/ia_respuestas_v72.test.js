/* v72: respuestas de IA — fuentes agrupadas de cualquier forma (por bloque de años, por documento…) y JSON con texto alrededor, comas sobrantes o comentarios.
   Caso real: Vidrala, fuentes {"2020-2021 (todas las líneas)": "…pdf"} → antes «ninguna cifra con URL». Uso: node tests/ia_respuestas_v72.test.js */
const assert = require('assert'), fs = require('fs'), path = require('path'), { chromium } = require('playwright'), http = require('http');
const L = require('../js/logic.js');
const AN = [2020, 2021, 2022, 2023, 2024, 2025], DOC = 'https://www.vidrala.com/default/documentos/';

/* ── 1. El caso de Vidrala: se aceptan las 66 cifras, cada una con su documento ── */
{
  const d = L.normalizar(null);
  d.fichas.VID = { nombre: 'Vidrala', divisa: 'EUR', anios: AN, hist: { ventas: [956, 1100, 1300, 1600, 1580, 1650], ebit: [170, 180, 150, 230, 280, 292], ni_reportado: [150, 140, 150, 230, 290, 210] } };
  const r = L.aplicarBusqueda(d, 'VID', fs.readFileSync(path.join(__dirname, 'fixture_VID_busqueda.txt'), 'utf8'));
  const F = d.fichas.VID.datos_ia.fuentes, n = Object.keys(F).reduce((s, k) => s + Object.keys(F[k]).length, 0);
  assert.equal(n, 66, 'todas las cifras con fuente'); assert(r.escritos.length >= 50, 'escritas en la ficha: ' + r.escritos.length);
  assert.equal(F.impuestos[2020], DOC + '1391_es-informacion_financiera_consolidada_2021.pdf');
  assert.equal(F.impuestos[2023], DOC + '1809_es-informacion_financiera_consolidada_2023.pdf');
  assert.equal(F.capex[2025], DOC + '2308_es-informacion_financiera_consolidada_2025.pdf');
  assert.equal(F.caja_neta_oficial[2022], DOC + '2012_es-informe_resultados_final_2023.pdf#p12', 'la más concreta gana');
  assert.equal(F.caja_neta_oficial[2024], DOC + '2308_es-informacion_financiera_consolidada_2025.pdf', 'sin una concreta, la del bloque de años');
  assert.deepEqual(d.fichas.VID.hist.impuestos, [29.703, 27.357, 34.062, 54.098, 64.968, 67.32]);
}
/* ── 2. Todas las formas de agrupar fuentes ── */
{
  const LS = ['capex', 'deuda', 'caja', 'caja_neta_oficial', 'da'], f = fu => L.resolverFuentes(fu, LS, AN);
  assert.equal(f({ capex: { 2024: 'https://a.com/1' } })('capex', 2024), 'https://a.com/1', 'línea → año');
  assert.equal(f({ capex: { 2024: 'https://a.com/1' } })('capex', 2023), null);
  assert.equal(f({ capex: 'https://a.com/c' })('capex', 2021), 'https://a.com/c', 'línea → url (todos los años)');
  assert.equal(f({ 2024: { deuda: 'https://a.com/d' } })('deuda', 2024), 'https://a.com/d', 'año → línea');
  assert.equal(f({ '2024': 'https://a.com/y' })('caja', 2024), 'https://a.com/y', 'año → url (todas las líneas)');
  assert.equal(f({ '2020–2022 todas': 'https://a.com/r' })('da', 2021), 'https://a.com/r', 'rango con guion largo');
  assert.equal(f({ '2020/21': 'https://a.com/s' })('da', 2021), 'https://a.com/s', 'rango 2020/21');
  assert.equal(f({ 'todas las líneas': 'https://a.com/t', 'da 2021': 'https://a.com/da' })('da', 2021), 'https://a.com/da');
  assert.equal(f({ 'todas las líneas': 'https://a.com/t', 'da 2021': 'https://a.com/da' })('capex', 2021), 'https://a.com/t', '«todas» no se confunde con «da»');
  assert.equal(f({ 'caja_neta_oficial 2022': 'https://a.com/n' })('caja', 2022), null, '«caja_neta_oficial» no es «caja»');
  assert.equal(f({ 'deuda neta (caja neta oficial) 2022': 'https://a.com/n2' })('caja_neta_oficial', 2022), 'https://a.com/n2', 'nombre con espacios');
  assert.equal(f(['https://a.com/unico.pdf'])('deuda', 2020), 'https://a.com/unico.pdf', 'una sola para todo');
  const docs = f(['https://a.com/informe_2021.pdf', 'https://a.com/informe_2023.pdf', 'https://a.com/informe_2025.pdf']);
  assert.deepEqual(AN.map(a => docs('capex', a).match(/\d{4}/)[0]), ['2021', '2021', '2023', '2023', '2025', '2025'], 'por el año del documento');
  assert.equal(f([{ linea: 'capex', anio: 2024, url: 'https://a.com/o' }])('capex', 2024), 'https://a.com/o', 'lista de objetos');
  assert.equal(f({ capex: { 2024: { url: 'https://a.com/u', pagina: 7 } } })('capex', 2024), 'https://a.com/u', '{url, pagina}');
  assert.equal(f({ capex: { 2024: 'informe_anual_2024.pdf#p55' } })('capex', 2024), 'informe_anual_2024.pdf#p55', 'PDF con página');
  assert.equal(f({ capex: { 2024: 'www.empresa.com/inversores/2024.pdf' } })('capex', 2024), 'www.empresa.com/inversores/2024.pdf', 'sin https://');
  assert.equal(f({ capex: { 2024: 'StockAnalysis' } })('capex', 2024), null, 'un nombre sin enlace no vale');
  assert.equal(f('https://a.com/todo')('caja', 2025), 'https://a.com/todo', 'una cadena para todo');
}
/* ── 3. JSON tal como lo escriben las IA ── */
{
  assert.deepEqual(L.jsonDeIA('Aquí va:\n```json\n{"a":[1,2,],"b":{"c":3,},}\n```\nNota: {esto no es JSON}'), { a: [1, 2], b: { c: 3 } }, 'comas sobrantes y texto con llaves');
  assert.deepEqual(L.jsonDeIA('{"a": 1, // comentario\n "u": "https://x.com/a//b", /* otro */ "n": NaN}'), { a: 1, u: 'https://x.com/a//b', n: null }, 'comentarios sin romper URLs; NaN → null');
  assert.deepEqual(L.jsonDeIA('{“a”: “hola”}'), { a: 'hola' }, 'comillas tipográficas');
  assert.deepEqual(L.jsonDeIA('Lista: [{"tk":"X"}] y {"otro":1}', o => Array.isArray(o)), [{ tk: 'X' }], 'listas');
  assert.equal(L.jsonDeIA('{"pequeño":1} … {"datos":{"x":[1]},"anios":[2024]}', o => o.datos).anios[0], 2024, 'el que encaja, aunque no sea el primero');
  assert.equal(L.jsonDeIA('sin json'), null);
  assert.equal(L.extraerJSON('texto {"datos":{"a":[1,]},} más').datos.a[0], 1, 'Completar con IA también tolera comas sobrantes');
}
console.log('lógica ok');

/* ── 4. Navegador: calendario y cifras de 12 meses con respuestas «sucias» ── */
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0, async () => {
  const b = await chromium.launch(), pg = await b.newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); await pg.route(/api\.github\.com|accounts\.google\.com/, r => r.abort());
  try {
    await pg.goto('http://localhost:' + srv.address().port + '/'); await pg.waitForTimeout(300);
    const r = await pg.evaluate(() => {
      const R = UI._resultados, hoy = Logic.today(), f = new Date(Date.parse(hoy) + 20 * 864e5).toISOString().slice(0, 10);
      const fechas = R.parseFechasIA('He buscado las fechas:\n```json\n{"fechas":[{"tk":"VID","fecha":"' + f + '","periodo":"FY 2025","confirmada":true,"fuente":"www.vidrala.com/es/inversores/calendario"},],}\n```\nOjo: {la de VID está confirmada}', ['VID']);
      Store.get().fichas.VID = { nombre: 'Vidrala', divisa: 'EUR', anios: [2024, 2025], anio_base: 2025, hist: { ventas: [1580, 1650], ebit: [280, 292] } };
      const doce = R.parseIA('Resultados 9M 2026.\n{"ventas_12m": 1700, "ebit_12m": 300, "fin": "2026-09-30", "fuentes": ["https://www.vidrala.com/x.pdf"],}\nNotas {sin cambios}', { tk: 'VID' });
      return { ok: fechas.ok.length, conf: fechas.ok[0] && fechas.ok[0].confirmada, ventas: doce.doce.ventas, fin: doce.doce.fin };
    });
    assert.deepEqual(r, { ok: 1, conf: true, ventas: 1700, fin: '2026-09-30' }, JSON.stringify(r));
    assert.deepEqual(errs, []);
    console.log('ia respuestas v72 ok');
  } catch (e) { console.error('FALLO', e.message); process.exitCode = 1; }
  await b.close(); srv.close();
});
