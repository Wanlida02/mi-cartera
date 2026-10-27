const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0);
(async () => {
  const b = await chromium.launch(), pg = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && !/404/.test(m.text()) && errs.push(m.text())); pg.on('dialog', d => d.accept());
  await pg.goto('http://localhost:' + srv.address().port + '/');
  await pg.click('#btn-ajustes'); await pg.setInputFiles('#a-imp', process.argv[2]); await pg.waitForTimeout(500);
  await pg.click('[data-tab=cartera]'); assert((await pg.textContent('#vista')).includes('Otras inversiones'));
  await pg.click('[data-x=otra][data-id=mintos]'); await pg.fill('#o-v', '1500'); await pg.click('#o-ok'); await pg.waitForTimeout(150);
  assert((await pg.textContent('#vista')).includes('1500'));
  await pg.click('[data-x=sim]'); await pg.fill('#s-i', '100000'); await pg.click('#s-go'); assert((await pg.textContent('#s-out')).includes('supera el límite'));
  await pg.click('#dlg [data-a=cerrar]');
  assert.deepEqual(errs, []); console.log('extras ok'); await b.close(); srv.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
