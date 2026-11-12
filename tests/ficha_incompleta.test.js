/* Fichas borrador (desde informes) no se pueden valorar: se explica y, si es de EE. UU., se completa con la SEC. Una ficha completa no se pisa con un borrador. Uso: node tests/ficha_incompleta.test.js datos.json (con AAPL borrador) */
const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0, async () => {
  const b = await chromium.launch(), pg = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && !/404/.test(m.text()) && errs.push(m.text())); pg.on('dialog', d => d.accept());
  await pg.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '' })); await pg.goto('http://localhost:' + srv.address().port + '/'); await pg.click('#btn-ajustes'); await pg.setInputFiles('#a-imp', process.argv[2]); await pg.waitForTimeout(600);
  await pg.click('[data-tab=valoracion]'); await pg.waitForTimeout(1200); let t = await pg.textContent('#vista');
  assert(!/undefined is not an object|Cannot read/.test(t), 'mensaje técnico en la lista'); assert(/ficha incompleta/.test(t), 'sin aviso de ficha incompleta');
  const inc = await pg.evaluate(() => Object.keys(Store.get().fichas).filter(k => (Logic.valoracion(Store.get(), k) || {}).incompleta)); console.log('incompletas:', inc.join(','));
  // AAPL borrador -> completar con la SEC
  if (inc.includes('AAPL')) {
    await pg.evaluate(() => window.UI.abrirFicha('AAPL')); await pg.waitForTimeout(700); assert(/Completar con los datos de la SEC/.test(await pg.textContent('#vista')));
    await pg.click('[data-v=nuevoej]'); await pg.waitForTimeout(800);
    const v = await pg.evaluate(() => Logic.valoracion(Store.get(), 'AAPL')); assert(v && v.ref != null && !v.error, JSON.stringify(v)); console.log('AAPL tras completar: rentab', (v.ref * 100).toFixed(1) + ' %, entrada', v.entrada.toFixed(1));
    // una ficha completa no se sustituye por un borrador
    const r = await pg.evaluate(() => window.UI.fichaDeInformes({ tk: 'AAPL', nombre: 'Apple', datos: { anios: [2024, 2025], metricas: { Ventas: [1, 2], 'Beneficio operativo (EBIT)': [1, 2], 'Beneficio neto': [1, 2], 'BPA diluido': [1, 2] } } })); assert.equal(r, false); assert(/ficha completa/.test(await pg.textContent('#aviso-dlg')));
  }
  assert.deepEqual(errs, []); console.log('ficha_incompleta ok'); await b.close(); srv.close();
});
