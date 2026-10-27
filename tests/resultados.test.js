const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0);
(async () => {
  const b = await chromium.launch(), pg = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && !/404/.test(m.text()) && errs.push(m.text())); pg.on('dialog', d => d.accept());
  await pg.goto('http://localhost:' + srv.address().port + '/');
  await pg.click('#btn-ajustes'); await pg.setInputFiles('#a-imp', process.argv[2]); await pg.waitForTimeout(500);
  await pg.click('[data-tab=resultados]'); assert((await pg.textContent('#vista')).includes('Sin fecha anotada'));
  await pg.click('[data-r=nuevo]'); await pg.selectOption('#r-tk', 'LIN'); await pg.fill('#r-f', '2026-10-30'); await pg.click('#r-ok'); await pg.waitForTimeout(150);
  let t = await pg.textContent('#vista'); assert(t.includes('Linde') && t.includes('2026-10-30') && t.includes('T3 2026'), t.slice(0, 200));
  await pg.click('[data-r=rev]'); assert((await pg.textContent('#dlg')).includes('Rentab. esperada'));
  await pg.selectOption('#r-d', 'mantener'); await pg.fill('#r-n', 'Todo bien'); await pg.click('#r-ok'); await pg.waitForTimeout(150);
  t = await pg.textContent('#vista'); assert(t.includes('Revisados') && t.includes('Mantener'), t);
  assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errs, []); console.log('resultados ok'); await b.close(); srv.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
