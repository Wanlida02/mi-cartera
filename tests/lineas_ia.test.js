/* Completar con una IA las líneas que faltan de una ficha borrador europea (Vidrala). Las cifras de la «respuesta» son inventadas, solo prueban el flujo. Uso: node tests/lineas_ia.test.js datos.json */
const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0, async () => {
  const b = await chromium.launch(), pg = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && !/404/.test(m.text()) && errs.push(m.text())); pg.on('dialog', d => d.accept());
  await pg.goto('http://localhost:' + srv.address().port + '/'); await pg.click('#btn-ajustes'); await pg.setInputFiles('#a-imp', process.argv[2]); await pg.waitForTimeout(600);
  const an = await pg.evaluate(() => Store.get().fichas.VID.anios); const n = an.length;
  await pg.evaluate(() => window.UI.abrirFicha('VID')); await pg.waitForTimeout(500); let t = await pg.textContent('#vista'); assert(/Ficha incompleta/.test(t) && /Completar con una IA/.test(t), t.slice(0, 300));
  await pg.click('[data-v=lineasia]'); const pr = await pg.inputValue('#li-p'); assert(/Vidrala/.test(pr) && /impuestos/.test(pr) && pr.includes(an.join(', ')) && /JSON/.test(pr), pr.slice(0, 300)); console.log(pr.slice(0, 700));
  const arr = v => an.map(() => v), arr0 = () => arr(null);
  // años mal -> error claro
  await pg.fill('#li-r', JSON.stringify({ anios: [1999], impuestos: [1] })); await pg.click('#li-ok'); assert(/no coinciden/.test(await pg.textContent('#li-err')));
  // longitud mal
  await pg.fill('#li-r', JSON.stringify({ anios: an, impuestos: [1, 2] })); await pg.click('#li-ok'); assert(/debe tener/.test(await pg.textContent('#li-err')));
  // la IA no pudo buscar: todo null
  await pg.fill('#li-r', JSON.stringify({ anios: an, intereses: arr0(), impuestos: arr0(), da: arr0(), capex: arr0(), deuda: arr0(), caja: arr0(), resumen: 'no se permite buscar en la web' })); await pg.click('#li-ok'); assert(/no ha encontrado ninguna cifra/.test(await pg.textContent('#li-err')) && /búsqueda web/.test(await pg.textContent('#li-err')));
  // sin dato del último año
  await pg.fill('#li-r', JSON.stringify({ anios: an, impuestos: arr(60), da: arr(100), capex: arr(null), deuda: arr(250), caja: arr(80) })); await pg.click('#li-ok'); assert(/Falta el dato del último año/.test(await pg.textContent('#li-err')));
  // respuesta buena (con texto alrededor y bloque de código)
  await pg.fill('#li-r', 'Claro:\n```json\n' + JSON.stringify({ anios: an, intereses: arr(8), impuestos: arr(60), da: arr(110), capex: arr(95), deuda: arr(260), caja: arr(70), resumen: 'Cifras de prueba', fiabilidad: 'media', fuentes: ['prueba'], contraste: { capex: [{ fuente: 'Yahoo', valores: arr(95) }, { fuente: 'MarketScreener', valores: an.map((x, i) => i === n - 1 ? 120 : 95) }, { fuente: 'Informe', valores: arr(95) }], da: [{ fuente: 'Yahoo', valores: arr(110) }, { fuente: 'MarketScreener', valores: arr(111) }] } }) + '\n```'); await pg.click('#li-ok'); await pg.waitForTimeout(400);
  const av = await pg.textContent('#dlg'); assert(/diferencias de más del 5 %/.test(av) && /capex/.test(av) && /Sin contraste entre varias fuentes/.test(av), av.slice(0, 500)); console.log(av.slice(0, 600)); await pg.click('[data-a=cerrar]');
  const v = await pg.evaluate(() => Logic.valoracion(Store.get(), 'VID')); assert(v && !v.error && v.ref != null, JSON.stringify(v)); console.log('VID con cifras de prueba: rentab', (v.ref * 100).toFixed(1) + ' %');
  t = await pg.textContent('#vista'); assert(!/Ficha incompleta/.test(t)); assert(/sin verificar/.test(await pg.evaluate(() => Store.get().fichas.VID.notas.join(' '))));
  assert.deepEqual(errs, []); console.log('lineas_ia ok'); await b.close(); srv.close();
});
