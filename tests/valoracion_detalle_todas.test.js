/* Abre el detalle de Valoración de TODAS las fichas y exige que ninguna muestre un error técnico. Uso: node tests/valoracion_detalle_todas.test.js datos.json */
const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0, async () => {
  const b = await chromium.launch(), pg = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.goto('http://localhost:' + srv.address().port + '/'); await pg.click('#btn-ajustes'); await pg.setInputFiles('#a-imp', process.argv[2]); await pg.waitForTimeout(700);
  const tks = await pg.evaluate(() => Object.keys(Store.get().fichas)), mal = [];
  for (const tk of tks) { await pg.evaluate(t => window.UI.abrirFicha(t), tk); await pg.waitForTimeout(60); const t = await pg.textContent('#vista'); if (/No se pudo calcular|undefined|NaN|Error al mostrar/.test(t)) mal.push(tk + ': ' + (t.match(/No se pudo calcular[^.]*|Error al mostrar[^.]*/) || ['undefined/NaN'])[0].slice(0, 120)); }
  console.log(tks.length + ' fichas', mal); assert.equal(mal.length, 0, mal.join(' | ')); assert.equal(errs.length, 0, errs.join(' | ')); await b.close(); srv.close(); console.log('valoracion_detalle_todas ok');
});
