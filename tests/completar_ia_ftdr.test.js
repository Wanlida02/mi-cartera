/* Completar con IA (pestaña Informes): el mensaje nombra lo que falta, pide el ejercicio siguiente si podría estar publicado y solo lo acepta si viene completo. Cifras inventadas. */
const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0);
(async () => {
  const b = await chromium.launch(), pg = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '' })); await pg.goto('http://localhost:' + srv.address().port + '/');
  const alta = () => pg.evaluate(() => { const d = Store.get(); delete d.fichas.FTDR; delete d.cribado.FTDR; d.informes = { generado: '2026-11-01T10:00:00', avisos: [], empresas: [{ nombre: 'Frontdoor', carpeta: 'Frontdoor', tk: 'FTDR', ultimo_anio: 2026, documentos: [], csv: 'f.csv', datos: { divisa: 'USD', anios: [2020, 2021, 2022, 2023, 2024, 2025], metricas: { 'Ventas': [1600, 1700, 1600, 1700, 1800, 1900], 'Beneficio neto': [100, 120, 110, 130, 150, 180], 'BPA diluido': [1.2, 1.4, 1.3, 1.6, 1.9, 2.3], 'FCF / acción': [3, 3, 2, 3, 3, 4] } } }] }; Store.save(); });
  const abre = async () => { await pg.click('[data-tab=informes]'); await pg.waitForTimeout(150); await pg.click('[data-inf="0"]'); await pg.click('#inf-ia'); await pg.waitForSelector('#ia-r'); };
  await alta(); await abre();
  let t = await pg.textContent('#dlg'), p = await pg.inputValue('#ia-p');
  assert(/Beneficio operativo \(EBIT\)/.test(t) && /Deuda neta \/ EBITDA/.test(t), t.slice(0, 300));
  assert(/LO QUE FALTA/.test(p) && /Beneficio operativo \(EBIT\)[^\n]*faltan los años 2020, 2021, 2022, 2023, 2024, 2025/.test(p) && /EJERCICIO 2026/.test(p) && /"Ventas":\[1600,1700,1600,1700,1800,1900,null\]/.test(p), p);
  assert(/TEXTO COPIADO/.test(p) && !/sin_navegacion/.test(p));
  await pg.selectOption('#ia-modo', 'nav'); p = await pg.inputValue('#ia-p'); assert(/sin_navegacion/.test(p) && /stockanalysis\.com\/stocks\/ftdr/.test(p), p);
  // la IA no navega: error claro, nada se crea
  await pg.fill('#ia-r', '{"error":"sin_navegacion"}'); await pg.click('#ia-ok'); assert(/no puede abrir páginas/.test(await pg.textContent('#aviso-dlg')));
  // 2026 incompleto: se descarta pero se guardan EBIT y deuda de los años cerrados
  await pg.fill('#ia-r', JSON.stringify({ 'Beneficio operativo (EBIT)': [300, 310, 290, 330, 360, 400, 410], 'Deuda neta / EBITDA': [2, 2, 1.8, 1.5, 1.4, 1.2, null], 'Ventas': [1600, 1700, 1600, 1700, 1800, 1900, 1950], fuentes: 'test', discrepancias: '' }));
  await pg.click('#ia-ok'); await pg.waitForTimeout(300);
  let r = await pg.evaluate(() => { const d = Store.get(), f = d.fichas.FTDR; return { an: f && f.anios, base: f && f.anio_base, ebit: f && f.hist.ebit, ult: d.informes.empresas[0].datos.anios }; });
  assert.deepEqual(r.an, [2020, 2021, 2022, 2023, 2024, 2025], JSON.stringify(r)); assert.equal(r.ebit.length, 6);
  // 2026 completo: se añade como último ejercicio
  await alta(); await abre();
  await pg.fill('#ia-r', JSON.stringify({ 'Beneficio operativo (EBIT)': [300, 310, 290, 330, 360, 400, 410], 'Deuda neta / EBITDA': [2, 2, 1.8, 1.5, 1.4, 1.2, 1.1], 'Ventas': [1600, 1700, 1600, 1700, 1800, 1900, 1950], 'Beneficio neto': [100, 120, 110, 130, 150, 180, 190], 'BPA diluido': [1.2, 1.4, 1.3, 1.6, 1.9, 2.3, 2.5] }));
  await pg.click('#ia-ok'); await pg.waitForTimeout(300);
  r = await pg.evaluate(() => { const f = Store.get().fichas.FTDR; return { an: f && f.anios, base: f && f.anio_base, ebit: f && f.hist.ebit }; });
  assert.deepEqual(r.an, [2020, 2021, 2022, 2023, 2024, 2025, 2026], JSON.stringify(r)); assert.equal(r.base, 2026); assert.equal(r.ebit[6], 410);
  // releer el índice (Drive lo sustituye entero) no borra lo que aportó la IA: está aparte y se superpone
  const m = await pg.evaluate(() => { const d = Store.get(), o = d.informes; d.informes = JSON.parse(JSON.stringify(o)); d.informes.empresas[0].datos.anios = [2020, 2021, 2022, 2023, 2024, 2025]; const e = Logic.informes(d).lista.find(x => x.carpeta === 'Frontdoor'); return { an: e.datos.anios, ebit: e.datos.metricas['Beneficio operativo (EBIT)'], v: e.datos.metricas['Ventas'] }; });
  assert.deepEqual(m.an, [2020, 2021, 2022, 2023, 2024, 2025, 2026]); assert.equal(m.ebit[6], 410); assert.equal(m.v[0], 1600);
  assert.deepEqual(errs, []); console.log('completar_ia_ftdr ok'); await b.close(); srv.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
