/* Cambiar el ticker de una ficha (NRO → NRO.PA) desde Valoración → Editar datos: se mueve en ficha, precios, cribado, resultados, posiciones y simbolos.json.
   Uso: node tests/ticker_renombrar.test.js datos.json (el fichero debe tener la ficha NRO) */
const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0, async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 390, height: 900 } }), pg = await ctx.newPage(), errs = [], puts = [], disp = [];
  const simb = JSON.parse(fs.readFileSync(path.join(root, 'simbolos.json'), 'utf8'));
  pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.route('https://api.github.com/**', async r => { const rq = r.request(), u = rq.url();
    if (/contents\/simbolos\.json/.test(u) && rq.method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: /raw/.test(rq.headers().accept || '') ? JSON.stringify(simb) : JSON.stringify({ sha: 'abc' }) });
    if (/contents\/simbolos\.json/.test(u) && rq.method() === 'PUT') { puts.push(JSON.parse(Buffer.from(JSON.parse(rq.postData()).content, 'base64').toString('utf8'))); return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); }
    if (/dispatches/.test(u)) { disp.push(u); return r.fulfill({ status: 204, body: '' }); }
    return r.fulfill({ status: 404, body: '' }); });
  await pg.goto('http://localhost:' + srv.address().port + '/'); await pg.evaluate(() => localStorage.setItem('mc_gh_token', 'x')); await pg.click('#btn-ajustes'); await pg.setInputFiles('#a-imp', process.argv[2]); await pg.waitForTimeout(700);
  const kt = await pg.evaluate(() => Object.keys(localStorage).filter(k => /token/i.test(k)));
  await pg.evaluate(() => { const d = Store.get(); d.resultados.push({ id: 'rt1', tk: 'NRO', periodo: 'T4 2026', fecha: '2027-02-01', estado: 'pendiente' }); d.ajustes.alias_informes = Object.assign({}, d.ajustes.alias_informes, { NRO: 'Neurones annual report' }); Store.save(); });
  const antes = await pg.evaluate(() => { const d = Store.get(); return { precio: d.precios.NRO && d.precios.NRO.precio, tieneFicha: !!d.fichas.NRO, crib: !!d.cribado.NRO }; });
  assert(antes.tieneFicha && antes.crib, 'NRO existe antes');
  await pg.click('[data-tab=cribado]'); await pg.evaluate(() => window.UI.abrirCribado('NRO')); await pg.waitForTimeout(150);
  await pg.evaluate(() => window.UI.abrirFicha('NRO')); await pg.waitForTimeout(200);
  await pg.click('[data-v=datos]'); await pg.waitForTimeout(200);
  assert.equal(await pg.inputValue('#v-tk'), 'NRO'); 
  // 1) tickers no válidos o repetidos se rechazan y no cambian nada
  await pg.fill('#v-tk', 'AAPL'); await pg.click('#v-ds'); await pg.waitForTimeout(200); assert(await pg.evaluate(() => !!Store.get().fichas.NRO), 'AAPL repetido: no cambia');
  await pg.fill('#v-tk', 'N R/O!'); await pg.click('#v-ds'); await pg.waitForTimeout(200); assert(await pg.evaluate(() => !!Store.get().fichas.NRO), 'ticker raro: no cambia');
  // 2) NRO → nro.pa (minúsculas se normalizan)
  await pg.fill('#v-tk', 'nro.pa'); await pg.click('#v-ds'); await pg.waitForTimeout(900);
  const r = await pg.evaluate(() => { const d = Store.get(); return { fichaVieja: !!d.fichas.NRO, ficha: !!d.fichas['NRO.PA'], ant: d.fichas['NRO.PA'] && d.fichas['NRO.PA'].ticker_anterior, precios: Object.keys(d.precios).filter(k => /NRO/.test(k)), pTk: d.precios['NRO.PA'] && d.precios['NRO.PA'].ticker, crib: Object.keys(d.cribado).filter(k => /NRO/.test(k)), cribTk: d.cribado['NRO.PA'] && d.cribado['NRO.PA'].ticker, res: d.resultados.filter(x => x.id === 'rt1')[0].tk, alias: Object.keys(d.ajustes.alias_informes || {}).filter(k => /NRO/.test(k)), val: Logic.valoracion(d, 'NRO.PA'), inf: (Logic.informes(d, Logic.today()) || { lista: [] }).lista.filter(x => x.tk === 'NRO.PA').map(x => x.estado + ':' + !!x.entrada), vista: document.querySelector('#vista').textContent.slice(0, 120) }; });
  console.log(JSON.stringify(r).slice(0, 700));
  assert(!r.fichaVieja && r.ficha && r.ant === 'NRO'); assert.deepEqual(r.precios, ['NRO.PA', 'NRO.PA@ficha'].filter(k => r.precios.includes(k))); assert(!r.precios.includes('NRO')); assert.deepEqual(r.crib, ['NRO.PA']); assert.equal(r.cribTk, 'NRO.PA'); assert.equal(r.res, 'NRO.PA'); assert.deepEqual(r.alias, ['NRO.PA']);
  assert(!r.val.error && r.val.precio > 0, JSON.stringify(r.val).slice(0, 200)); assert(/NRO\.PA/.test(r.vista), 'la pantalla muestra el ticker nuevo: ' + r.vista);
  // 3) simbolos.json: clave nueva, la vieja fuera, y se lanzó el workflow de precios
  assert.equal(puts.length, 1, 'una escritura de simbolos.json'); assert(puts[0].simbolos['NRO.PA'] && puts[0].simbolos['NRO.PA'].y.includes('NRO.PA') && !puts[0].simbolos.NRO, JSON.stringify(puts[0].simbolos['NRO.PA'])); assert(disp.some(u => /precios\.yml/.test(u)), 'workflow de precios');
  // 4) todas las pestañas y el detalle del cribado con el ticker nuevo
  for (const t of ['inicio', 'cartera', 'cribado', 'valoracion', 'resultados', 'informes']) { await pg.click('[data-tab=' + t + ']'); await pg.waitForTimeout(150); const tx = await pg.textContent('#vista'); assert(!/undefined|NaN|Error al mostrar|\[object/.test(tx), t + ': ' + tx.match(/.{0,40}(undefined|NaN|Error al mostrar|\[object).{0,40}/)); }
  await pg.evaluate(() => window.UI.abrirCribado('NRO.PA')); await pg.waitForTimeout(200); assert(/NRO\.PA|Neurones/i.test(await pg.textContent('#vista')));
  assert.deepEqual(errs, []); console.log('ticker_renombrar ok · token en', kt); await b.close(); srv.close();
});
