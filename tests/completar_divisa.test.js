/* Completar con IA: el mensaje no da por hecha la moneda (CSU cotiza en CAD e informa en USD); la respuesta debe traer «divisa» y no se mezclan monedas. Autocontenido. */
const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const datos = { version: 1, posiciones: [], movimientos: [], otras: { accounts: [] }, ajustes: {}, fichas: {}, precios: { CSU: { ticker: 'CSU', precio: 3490.23, divisa: 'CAD', fecha_precio: '2026-11-16', fuente: 'cnbc' } },
  cribado: { CSU: { ticker: 'CSU', nombre: 'Constellation Software', origen: 'ia', divisa_cotizacion: 'CAD' } }, resultados: [], updatedAt: 1,
  informes: { generado: '2026-11-16T15:09:30', empresas: [{ nombre: 'Constellation', carpeta: 'Constellation annual report', ticker: null, ident: null, ultimo_anio: 2025, documentos: [], trimestrales: [], datos: null, csv: null, modificado: '2026-11-16' }] } };
const f = path.join(os.tmpdir(), 'divisa_datos.json'); fs.writeFileSync(f, JSON.stringify(datos));
const serie = a => a.map(x => x);
const resp = (div, k) => JSON.stringify(Object.assign(div ? { divisa: div } : {}, { Ventas: [6100, 7100, 8400, 9500, 10600, 11800 * (k || 1)], 'Beneficio operativo (EBIT)': [1000, 1200, 1500, 1700, 1900, 2100], 'Beneficio neto': [500, 600, 700, 800, 900, 1000], 'BPA diluido': [23.6, 28, 33, 38, 43, 48], 'Deuda neta / EBITDA': [1, 1, 1, 1, 1, 1], 'FCF / acción': [60, 70, 80, 90, 100, 110], fuentes: 'x', discrepancias: '' }));
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0]; const p = path.join(root, u.replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0, async () => {
  const b = await chromium.launch(), pg = await (await b.newContext()).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '' }));
  await pg.goto('http://localhost:' + srv.address().port + '/'); await pg.click('#btn-ajustes'); await pg.setInputFiles('#a-imp', f); await pg.waitForTimeout(800);
  await pg.evaluate(() => { delete Store.get().fichas.CSU; });   // el parche crea la ficha CSU (USD/FCFA2S); aquí se parte de «sin ficha» para probar el mensaje cuando no se sabe la moneda
  const abre = async () => { await pg.evaluate(() => { const e = Logic.informes(Store.get()).lista.find(x => x.tk === 'CSU'); UI.completarIA(e); }); await pg.waitForTimeout(300); };
  await abre(); const p1 = await pg.inputValue('#ia-p');
  assert(!/divisa EUR/.test(p1) && !/en EUR/.test(p1), 'no debe suponer EUR'); assert(/MONEDA: no sé en qué moneda presenta cuentas \(la acción cotiza en CAD/.test(p1), p1.slice(0, 400)); assert(/"divisa":"XXX"/.test(p1) && /campo "divisa"/.test(p1));
  // sin divisa en la respuesta: se rechaza
  await pg.fill('#ia-r', resp(null)); await pg.click('#ia-ok'); await pg.waitForTimeout(300); assert(/no indica la moneda/.test(await pg.evaluate(() => document.body.innerText)), 'sin divisa se rechaza');
  assert.equal(await pg.evaluate(() => (Store.get().informes_manual || {})['Constellation annual report']), undefined, 'no se guarda nada');
  await pg.evaluate(() => UI.cerrar && UI.cerrar()); await abre();
  // con divisa USD: se guarda en USD (no CAD ni EUR)
  await pg.fill('#ia-r', resp('USD')); await pg.click('#ia-ok'); await pg.waitForTimeout(500);
  const m = await pg.evaluate(() => ({ man: Store.get().informes_manual['Constellation annual report'].divisa, f: (Store.get().fichas.CSU || {}).divisa }));
  assert.equal(m.man, 'USD'); assert.equal(m.f, 'USD', 'la ficha nace en la moneda de las cuentas');
  // ya con cifras en USD: el mensaje las fija y una respuesta en otra moneda se rechaza
  await pg.evaluate(() => UI.cerrar && UI.cerrar()); await pg.evaluate(() => { const d = Store.get(); const e = Logic.informes(d).lista.find(x => x.tk === 'CSU'); const m = d.informes_manual['Constellation annual report']; Object.keys(m.metricas).forEach(k => { delete m.metricas[k]['2025']; }); Store.save(); UI.completarIA(Logic.informes(d).lista.find(x => x.tk === 'CSU')); }); await pg.waitForTimeout(300);
  const p2 = await pg.inputValue('#ia-p'); assert(/mis cifras están en USD/.test(p2) && /"divisa":"USD"/.test(p2), p2.slice(0, 300));
  await pg.fill('#ia-r', resp('CAD')); await pg.click('#ia-ok'); await pg.waitForTimeout(300); assert(/No se pueden mezclar monedas/.test(await pg.evaluate(() => document.body.innerText)), 'moneda distinta rechazada');
  assert.deepEqual(errs, []); console.log('completar_divisa ok'); await b.close(); srv.close();
});
