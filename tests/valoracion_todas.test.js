/* Ninguna ficha debe romper la valoración con un error técnico (undefined…). Uso: node tests/valoracion_todas.test.js datos.json */
const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0, async () => {
  const b = await chromium.launch(), pg = await (await b.newContext()).newPage();
  await pg.goto('http://localhost:' + srv.address().port + '/'); await pg.click('#btn-ajustes'); await pg.setInputFiles('#a-imp', process.argv[2]); await pg.waitForTimeout(700);
  const r = await pg.evaluate(() => { const d = Store.get(), out = []; Object.keys(d.fichas).forEach(tk => { try { const v = Logic.valoracion(d, tk); if (v && v.error && /undefined|null|not an object|Cannot/.test(v.error)) out.push(tk + ': ' + v.error); } catch (e) { out.push(tk + ' EXC ' + e.message); } }); return out; });
  console.log(r); assert.equal(r.length, 0, r.join(' | ')); await b.close(); srv.close(); console.log('valoracion_todas ok');
});
