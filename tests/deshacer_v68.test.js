/* v68: borrar sin preguntar y con «Deshacer» en el aviso; «Deshacer» se anula si llegan datos de Drive; filas usables con teclado.
   Uso: node tests/deshacer_v68.test.js (sin datos personales) */
const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const L = require('../js/logic.js');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const d0 = L.normalizar(null); d0.ajustes.fx = { EUR: 1, USD: 1, fecha: L.today() };
L.compra(d0, { empresa: 'Uno', ticker: 'UNO', broker: 'X', cantidad: 10, precio: 20, moneda: 'USD' });
L.compra(d0, { empresa: 'Uno', ticker: 'UNO', broker: 'X', cantidad: 5, precio: 26, moneda: 'USD' });
L.compra(d0, { empresa: 'Dos', ticker: 'DOS', broker: 'X', cantidad: 3, precio: 10, moneda: 'USD' });
const tmp = path.join(require('os').tmpdir(), 'deshacer_v68_' + process.pid + '.json'); fs.writeFileSync(tmp, JSON.stringify(d0));
const srv = http.createServer((q, r) => {
  const u = q.url.split('?')[0]; if (u === '/precios.json') { r.writeHead(404); return r.end(); }
  const p = path.join(root, u.replace(/\/$/, '/index.html'));
  fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } });
}).listen(0, async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), pg = await ctx.newPage(), errs = [], dialogos = [];
  pg.on('pageerror', e => errs.push(e.message)); await ctx.route(/api\.github\.com|accounts\.google\.com/, r => r.abort());
  const est = () => pg.evaluate(() => ({ n: Store.get().posiciones.length, uno: (Store.get().posiciones.find(p => p.ticker === 'UNO') || {}).cantidad, movs: Store.get().movimientos.length }));
  try {
    await pg.goto('http://localhost:' + srv.address().port + '/'); await pg.click('#btn-ajustes'); await pg.setInputFiles('#a-imp', tmp); await pg.waitForTimeout(500);
    pg.on('dialog', d => { dialogos.push(d.message()); d.accept(); });   // desde aquí, ningún borrado debe preguntar
    await pg.click('[data-tab=cartera]');
    /* Deshacer una operación: se hace al momento; «Deshacer» del aviso la repone */
    assert.deepEqual(await est(), { n: 2, uno: 15, movs: 3 });
    await pg.click('[data-undo] >> nth=0'); await pg.waitForTimeout(150);
    { const e = await est(); assert.deepEqual(e, { n: 1, uno: 15, movs: 2 }, "la última compra (Dos, nueva) se deshace sin preguntar: " + JSON.stringify(e) + " toast=" + await pg.textContent("#toast")); }
    assert(await pg.isVisible('#toast .toast-b')); assert.equal(await pg.textContent('#toast .toast-b'), 'Deshacer');
    await pg.click('#toast .toast-b'); await pg.waitForTimeout(150);
    assert.deepEqual(await est(), { n: 2, uno: 15, movs: 3 }, 'Deshacer repone la operación');
    assert(/Deshecho/.test(await pg.textContent('#toast')));
    /* Eliminar una posición desde su ficha y recuperarla */
    await pg.click('[data-pos] >> nth=0'); await pg.click('[data-a=eliminar]'); await pg.waitForTimeout(150);
    assert.equal((await est()).n, 1); assert(!(await pg.evaluate(() => document.getElementById('dlg').open)), 'se cierra la ficha');
    await pg.click('#toast .toast-b'); await pg.waitForTimeout(150); assert.equal((await est()).n, 2, 'posición recuperada');
    assert(await pg.evaluate(() => Store.get().updatedAt > 0));
    /* Si entre medias llegan datos de Drive, ya no se deshace */
    await pg.click('[data-pos] >> nth=0'); await pg.click('[data-a=eliminar]'); await pg.waitForTimeout(150);
    await pg.evaluate(() => Store.adopt(JSON.parse(Store.exportar())));
    await pg.click('#toast .toast-b'); await pg.waitForTimeout(150);
    assert.equal((await est()).n, 1, 'no pisa lo que llegó de Drive'); assert(/Ya no se puede deshacer/.test(await pg.textContent('#toast')));
    assert.deepEqual(dialogos, [], 'sin preguntas del navegador: ' + dialogos.join(' | '));
    /* Teclado: las filas tienen foco y se abren con Intro */
    await pg.evaluate(() => UI.render());
    const fila = await pg.$eval('[data-pos]', el => ({ tab: el.tabIndex, role: el.getAttribute('role') }));
    assert.deepEqual(fila, { tab: 0, role: 'button' });
    await pg.focus('[data-pos]'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(100);
    assert(await pg.evaluate(() => document.getElementById('dlg').open), 'Intro abre la posición');
    await pg.evaluate(() => UI.cerrar()); await pg.click('[data-tab=inicio]');
    assert(await pg.evaluate(() => [...document.querySelectorAll('.row.click')].every(el => el.tabIndex === 0)), 'todas las filas del Inicio');
    assert.deepEqual(errs, []);
    console.log('deshacer v68 ok');
  } catch (e) { console.error('FALLO', e.message); process.exitCode = 1; }
  await b.close(); srv.close(); fs.unlinkSync(tmp);
});
