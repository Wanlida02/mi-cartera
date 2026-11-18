/* v69: Ajustes en el móvil — ✕ arriba, Cancelar/Guardar siempre visibles, divisas plegadas, Cancelar no guarda. Uso: node tests/ajustes_v69.test.js */
const assert = require('assert'), { chromium, devices } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0, async () => {
  const b = await chromium.launch(), ctx = await b.newContext(devices['iPhone 13']), pg = await ctx.newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); await ctx.route(/api\.github\.com|accounts\.google\.com/, r => r.abort());
  try {
    await pg.goto('http://localhost:' + srv.address().port + '/'); await pg.waitForTimeout(300);
    await pg.click('#btn-ajustes');
    const m = await pg.evaluate(() => { const i = document.querySelector('.dlg-in'), pie = document.querySelector('.aj-pie').getBoundingClientRect(), x = document.querySelector('.icon-x').getBoundingClientRect();
      return { pieVisible: pie.bottom <= innerHeight && pie.top > 0, xVisible: x.top >= 0 && x.bottom < 120, ratio: i.scrollHeight / i.clientHeight, ancho: i.scrollWidth > i.clientWidth, fxAbierto: document.getElementById('a-fx').open, ver: document.querySelector('.aj-cab').textContent }; });
    assert(m.pieVisible, 'Cancelar/Guardar visibles sin desplazar'); assert(m.xVisible, '✕ arriba'); assert(!m.ancho, 'sin desbordar a lo ancho');
    assert(m.ratio < 1.7, 'cabe en menos de dos pantallas: ' + m.ratio.toFixed(2)); assert(!m.fxAbierto, 'divisas plegadas'); assert(/Versión \d+/.test(m.ver) && m.ver.length < 40, 'versión corta: ' + m.ver);
    /* Los botones de abajo siguen visibles tras desplazar */
    await pg.evaluate(() => { document.querySelector('.dlg-in').scrollTop = 99999; });
    assert(await pg.evaluate(() => document.querySelector('.aj-pie').getBoundingClientRect().bottom <= innerHeight));
    /* Cancelar no guarda; Guardar sí */
    await pg.evaluate(() => { document.querySelector('.dlg-in').scrollTop = 0; });
    await pg.fill('#a-b', '22'); await pg.click('.aj-pie [data-a=cerrar]');
    assert.equal(await pg.evaluate(() => Store.get().ajustes.umbral_barata), 15); assert(!(await pg.evaluate(() => document.getElementById('dlg').open)));
    await pg.click('#btn-ajustes'); await pg.fill('#a-b', '22'); await pg.click('#a-ok');
    assert.equal(await pg.evaluate(() => Store.get().ajustes.umbral_barata), 22);
    /* ✕ cierra */
    await pg.click('#btn-ajustes'); await pg.click('.icon-x'); assert(!(await pg.evaluate(() => document.getElementById('dlg').open)));
    /* Novedades plegadas al final, con la versión actual primero */
    await pg.click('#btn-ajustes'); assert(/^\d+ · /.test(await pg.textContent('.aj-ver li')));
    assert.deepEqual(errs, []);
    console.log('ajustes v69 ok');
  } catch (e) { console.error('FALLO', e.message); process.exitCode = 1; }
  await b.close(); srv.close();
});
