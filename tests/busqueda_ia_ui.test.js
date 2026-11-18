if (!process.argv[2] || !require('fs').existsSync(process.argv[2])) { console.log('OMITIDO busqueda_ia_ui.test.js: necesita tu archivo de datos (node tests/busqueda_ia_ui.test.js datos.json)'); process.exit(0); }
/* Interfaz del completado con IA que busca sola (usa el JSON real de Neurones como respuesta). Uso: node tests/busqueda_ia_ui.test.js datos.json */
const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const fx = fs.readFileSync(path.join(__dirname, 'fixture_NRO_busqueda.json'), 'utf8');
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0, async () => {
  const b = await chromium.launch(), pg = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && !/404/.test(m.text()) && errs.push(m.text())); pg.on('dialog', d => d.accept());
  await pg.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '' })); await pg.goto('http://localhost:' + srv.address().port + '/'); await pg.click('#btn-ajustes'); await pg.setInputFiles('#a-imp', process.argv[2]); await pg.waitForTimeout(800);
  await pg.evaluate(() => { const f = Store.get().fichas.NRO; delete f.hist.da; delete f.hist.fco; f._borrador = true; Store.save(); });
  await pg.evaluate(() => window.UI.abrirFicha('NRO')); await pg.waitForTimeout(500); await pg.click('[data-v=lineasia]');
  const pr = await pg.inputValue('#li-p'); assert(/FASE 1/.test(pr) && /Neurones/.test(pr) && /2020–2025/.test(pr) && /francés/.test(pr) && /documento 1 = informe anual del ejercicio 2025/.test(pr), pr.slice(0, 400));
  assert(/no tienes que abrir ninguna página/.test(await pg.innerHTML('#li-ayuda')));
  await pg.fill('#li-r', 'hola'); await pg.click('#li-ok'); assert(/No encuentro el JSON/.test(await pg.textContent('#li-err')));
  const antes = await pg.evaluate(() => JSON.stringify(Store.get().fichas.NRO.hist));
  await pg.fill('#li-r', 'A) Bloque JSON\n' + fx + '\n\nB) Tabla de fuentes…'); await pg.click('#li-ok'); await pg.waitForTimeout(400);
  const dlg = await pg.textContent('#dlg'); assert(/NRO: datos importados/.test(dlg) && /Pendiente/.test(dlg) && /acciones/.test(dlg), dlg.slice(0, 500));
  const h = await pg.evaluate(() => Store.get().fichas.NRO.hist); assert.deepStrictEqual(h.da, [15.031, 14.805, 15.406, 15.9, 17.204, 17.987]); assert.strictEqual(h.deuda[4], 7.016);
  const p2 = await pg.inputValue('#ib-p'); assert(/FASE 2/.test(p2) && /NO volver a buscar/.test(p2) && /universel-2025\.pdf/.test(p2), p2.slice(0, 300));
  await pg.click('#ib-undo'); await pg.waitForTimeout(300); assert.strictEqual(await pg.evaluate(() => JSON.stringify(Store.get().fichas.NRO.hist)), antes, 'deshacer restaura');
  assert.deepEqual(errs, []); console.log('busqueda_ia_ui ok'); await b.close(); srv.close();
});
