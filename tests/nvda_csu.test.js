/* Compra sin ficha (NVDA) sale en Resultados y pide símbolo; carpeta de informes de una candidata del cribado (CSU ↔ «Constellation») se enlaza sola. Autocontenido. */
const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const datos = { version: 1, posiciones: [{ empresa: 'Nvidia', ticker: 'NVDA', broker: 'XTB', cantidad: 3.2, precio_medio_compra: 171.2, moneda: 'USD', sector: 'Tecnologico', fecha_compra: '2026-11-11', notas: '' }], movimientos: [], otras: { accounts: [] }, ajustes: {}, fichas: {}, precios: { NVDA: { ticker: 'NVDA', precio: 166.23, divisa: 'USD', fecha_precio: '2026-11-13', fuente: 'manual' } },
  cribado: { CSU: { ticker: 'CSU', nombre: 'CSU', origen: 'ia', divisa_cotizacion: 'CAD' } }, resultados: [], updatedAt: 1,
  informes: { generado: '2026-11-16T15:09:30', empresas: [
    { nombre: 'Constellation', carpeta: 'Constellation annual report', ticker: null, ident: null, ultimo_anio: null, documentos: [], trimestrales: [{ periodo: 'T3', anio: null, archivo: 'CSI-Financial-Statement-Q326-Final.pdf', tipo: 'TRIM', kb: 409, modificado: '2026-11-16' }], datos: null, csv: null, modificado: '2026-11-16' },
    { nombre: 'Nvidia', carpeta: 'Nvidia annual report', ticker: 'NVDA', ident: 'CIK 1045810 (SEC)', ultimo_anio: 2026, documentos: [{ anio: 2026, tipo: 'AR', archivo: 'a.pdf' }], trimestrales: [], datos: null, csv: 'Nvidia_datos.csv', modificado: '2026-11-13' }] } };
const f = path.join(os.tmpdir(), 'nvda_csu_datos.json'); fs.writeFileSync(f, JSON.stringify(datos));
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0]; if (u === '/calendario_resultados.json') { r.writeHead(200, { 'content-type': 'application/json' }); return r.end(JSON.stringify({ fechas: { NVDA: { fecha: new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10), confirmada: false } } })); }
  if (u === '/simbolos.json') { r.writeHead(200, { 'content-type': 'application/json' }); return r.end(JSON.stringify({ simbolos: { AAPL: { y: ['AAPL'] } } })); }
  const p = path.join(root, u.replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0, async () => {
  const b = await chromium.launch(), pg = await (await b.newContext()).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route('https://api.github.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(JSON.stringify({ simbolos: { AAPL: { y: ['AAPL'] } } })).toString('base64'), sha: 'x' }) }));
  await pg.goto('http://localhost:' + srv.address().port + '/'); await pg.click('#btn-ajustes'); await pg.setInputFiles('#a-imp', f); await pg.waitForTimeout(800);
  const I = await pg.evaluate(() => { const i = Logic.informes(Store.get()); return { csu: i.lista.find(e => e.tk === 'CSU'), nvda: i.lista.find(e => e.tk === 'NVDA'), sin: i.sin.map(o => o.tk) }; });
  assert(I.csu && I.csu.carpeta === 'Constellation annual report', 'CSU enlazada con Constellation: ' + JSON.stringify(I)); assert.equal(I.csu.estado, 'watchlist'); assert(I.nvda && I.nvda.estado === 'cartera');
  await pg.evaluate(() => UI.irA('resultados')); await pg.waitForTimeout(1000);
  const R = await pg.evaluate(() => ({ pend: Store.get().resultados.filter(r => r.estado !== 'revisado').map(r => [r.tk, r.estimada]), html: document.body.innerText }));
  assert.deepEqual(R.pend, [['NVDA', true]], JSON.stringify(R.pend)); assert(/NVDA[\s\S]*sin ficha de valoración/.test(R.html), 'aviso sin ficha'); assert(/NVDA[\s\S]*sin símbolo/.test(R.html), 'aviso de símbolo pendiente');
  await pg.click('[data-r="rev"]'); await pg.waitForTimeout(300); assert(/Aún no hay ficha de valoración de NVDA/.test(await pg.evaluate(() => document.body.innerText)), 'revisión sin ficha no revienta');
  assert.deepEqual(errs, []); console.log('nvda_csu ok'); await b.close(); srv.close();
});
