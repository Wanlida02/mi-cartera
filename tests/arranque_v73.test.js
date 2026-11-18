/* v73: la app nunca se queda en blanco al abrir. Datos raros (ticker numérico, posición/ficha vacía, foto diaria mal formada) se limpian;
   si el código no carga, aviso de rescate con el error y salidas; si los datos no se pueden leer, se guarda una copia intacta. Uso: node tests/arranque_v73.test.js */
const assert = require('assert'), { chromium, devices } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
let romper = false;
const srv = http.createServer((q, r) => {
  const u = q.url.split('?')[0];
  if (romper && u === '/js/logic.js') { r.writeHead(200, { 'content-type': 'text/javascript' }); return r.end('const Logic = (function () { return {'); }   // código que no llega a cargar
  const p = path.join(root, u.replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } });
}).listen(0, async () => {
  const b = await chromium.launch(), U = 'http://localhost:' + srv.address().port + '/';
  const nueva = async () => { const ctx = await b.newContext(Object.assign({}, devices['iPhone 13'], { acceptDownloads: true })); await ctx.route(/api\.github\.com|accounts\.google\.com/, r => r.abort()); const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message)); return { ctx, pg, errs }; };
  try {
    /* 1. Datos raros guardados en el dispositivo: la app abre y los limpia */
    { const { ctx, pg, errs } = await nueva(); await pg.goto(U); await pg.waitForTimeout(800);   // que la app recién abierta termine de guardar antes de escribir los datos de prueba
      await pg.evaluate(() => { localStorage.setItem('mi-cartera:datos:v1', JSON.stringify({ posiciones: [null, { empresa: 'Taiwan Semi', ticker: 2330, broker: 'X', cantidad: 2, precio_medio_compra: 500, moneda: 'TWD' }, { empresa: 123, broker: 'Y', cantidad: 1, precio_medio_compra: 10, moneda: 'EUR' }],
        movimientos: [null], fichas: { NUL: null, OK: { nombre: 'Ok' } }, precios: { X: null }, historico: [null, { f: 5 }, 'x', { f: '2026-01-02', v: 10, c: 9 }], ajustes: {} })); });
      await pg.reload(); await pg.waitForTimeout(800);
      const st = await pg.evaluate(() => ({ vista: document.getElementById('vista').textContent.length, pos: Store.get().posiciones.length, tk: Store.get().posiciones[0].ticker, emp: Store.get().posiciones[1].empresa, fichas: Object.keys(Store.get().fichas), h: Store.get().historico.length, rescate: !!document.getElementById('r-err') }));
      assert(st.vista > 100 && !st.rescate, 'la app se dibuja'); assert.equal(st.pos, 2); assert.equal(st.tk, '2330'); assert.equal(st.emp, '123'); assert.deepEqual(st.fichas, ['OK']); assert(st.h >= 1);
      await pg.click('[data-tab=cartera]'); assert(/Taiwan Semi/.test(await pg.textContent('#vista')));
      assert.deepEqual(errs, [], 'sin errores: ' + errs.join(' | ')); await ctx.close(); }
    /* 2. Datos que no se pueden leer: se guarda una copia intacta y se puede descargar */
    { const { ctx, pg } = await nueva(); await pg.goto(U); await pg.waitForTimeout(800);
      await pg.evaluate(() => localStorage.setItem('mi-cartera:datos:v1', '{"posiciones": [ roto'));
      await pg.reload(); await pg.waitForTimeout(600);
      assert.equal(await pg.evaluate(() => localStorage.getItem('mi-cartera:copia-ilegible')), '{"posiciones": [ roto', 'copia intacta');
      assert(/No se pudo leer.*copia intacta/.test(await pg.textContent('#vista')), 'avisa de la copia en el Inicio');
      await pg.click('#btn-ajustes'); const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#a-rota')]);
      assert.equal(fs.readFileSync(await dl.path(), 'utf8'), '{"posiciones": [ roto'); await ctx.close(); }
    /* 3. Código que no carga: aviso de rescate con el error y las tres salidas (no pantalla en blanco) */
    { const { ctx, pg } = await nueva(); await pg.goto(U); await pg.waitForTimeout(800); await pg.evaluate(() => localStorage.setItem('mi-cartera:datos:v1', JSON.stringify({ posiciones: [{ empresa: 'A', broker: 'X', cantidad: 1, moneda: 'EUR' }] })));
      romper = true; await pg.reload(); await pg.waitForTimeout(4500);
      assert(await pg.isVisible('#r-err'), 'aviso de rescate'); const err = await pg.textContent('#r-err');
      assert(/logic\.js/.test(err) || /Logic/.test(err), 'dice el error: ' + err.slice(0, 120));
      const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#r-dat')]); assert(/"empresa":"A"/.test(fs.readFileSync(await dl.path(), 'utf8')), 'descarga los datos');
      romper = false; await Promise.all([pg.waitForEvent('load'), pg.click('#r-cache')]); await pg.waitForTimeout(800);
      assert(!(await pg.$('#r-err')) && (await pg.textContent('#vista')).length > 100, 'tras borrar la caché arranca'); await ctx.close(); }
    console.log('arranque v73 ok');
  } catch (e) { console.error('FALLO', e.message); process.exitCode = 1; }
  await b.close(); srv.close();
});
