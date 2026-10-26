const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), datos = process.argv[2], out = process.argv[3] || '/tmp';
const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', webmanifest: 'application/json', png: 'image/png', svg: 'image/svg+xml' };
const srv = http.createServer((q, r) => { let p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0);
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, acceptDownloads: true }), pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && !/404/.test(m.text()) && errs.push(m.text()));
  await pg.goto('http://localhost:' + srv.address().port + '/');
  await pg.screenshot({ path: out + '/0_vacio.png' });
  await pg.click('#btn-ajustes'); await pg.setInputFiles('#a-imp', datos); await pg.waitForTimeout(500);
  console.log('toast:', await pg.textContent('#toast'));
  await pg.screenshot({ path: out + '/1_inicio.png', fullPage: true });
  console.log('inicio:', (await pg.textContent('.kpis')).replace(/\s+/g, ' '));
  await pg.click('[data-tab=cartera]'); await pg.screenshot({ path: out + '/2_cartera.png' });
  const n0 = await pg.locator('[data-pos]').count();
  // compra de prueba sobre una posición existente
  await pg.click('[data-pos="0"]'); await pg.screenshot({ path: out + '/3_detalle.png' });
  await pg.click('[data-a=mas]'); await pg.fill('#c-q', '1'); await pg.fill('#c-p', '100'); await pg.screenshot({ path: out + '/4_compra.png' });
  await pg.click('#ok'); await pg.waitForTimeout(300);
  console.log('tras compra:', await pg.textContent('#toast'), '| filas', n0, '->', await pg.locator('[data-pos]').count());
  pg.once('dialog', d => d.accept()); await pg.click('[data-undo]:first-of-type'); await pg.waitForTimeout(300);
  console.log('tras deshacer:', await pg.textContent('#toast'));
  await pg.click('[data-tab=valoracion]'); console.log('pend:', (await pg.textContent('#vista')).slice(0, 60));
  await pg.reload(); await pg.waitForTimeout(300); console.log('persistencia kpi:', (await pg.textContent('.kpis')).replace(/\s+/g, ' ').slice(0, 60));
  const ov = await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth); console.log('scroll horizontal:', ov);
  console.log('errores:', errs.length ? errs : 'ninguno'); await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
