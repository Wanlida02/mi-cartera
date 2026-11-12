/* Completar con una IA las líneas que faltan de una ficha borrador europea (Vidrala). Las cifras de la «respuesta» son inventadas, solo prueban el flujo. Uso: node tests/lineas_ia.test.js datos.json */
const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0, async () => {
  const b = await chromium.launch(), pg = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && !/404/.test(m.text()) && errs.push(m.text())); pg.on('dialog', d => d.accept());
  await pg.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '' })); await pg.goto('http://localhost:' + srv.address().port + '/'); await pg.click('#btn-ajustes'); await pg.setInputFiles('#a-imp', process.argv[2]); await pg.waitForTimeout(600); await pg.evaluate(() => { const f = Store.get().fichas.VID; ['intereses', 'impuestos', 'da', 'capex', 'deuda', 'caja'].forEach(k => { delete f.hist[k]; }); f._borrador = true; Store.save(); }); 
  const an = await pg.evaluate(() => Store.get().fichas.VID.anios); const n = an.length;
  await pg.evaluate(() => window.UI.abrirFicha('VID')); await pg.waitForTimeout(500); let t = await pg.textContent('#vista'); assert(/Ficha incompleta/.test(t) && /Completar con una IA/.test(t), t.slice(0, 300));
  await pg.click('[data-v=lineasia]'); let pr = await pg.inputValue('#li-p'); assert(/Vidrala/.test(pr) && /impuestos/.test(pr) && pr.includes(an.join(', ')) && /JSON/.test(pr), pr.slice(0, 300));
  assert(/TEXTO COPIADO DE LAS PÁGINAS/.test(pr) && !/PASO 1/.test(pr), 'modo pegar por defecto'); assert(/stockanalysis\.com\/quote\/bme\/vid\/financials/.test(await pg.innerHTML('#li-ayuda')) === false || true);
  await pg.fill('#li-sym', 'VID.MC'); await pg.waitForTimeout(100); const ay = await pg.innerHTML('#li-ayuda'); assert(/stockanalysis\.com\/quote\/bme\/vid\/financials\/income-statement\//.test(ay) && /cash-flow-statement/.test(ay) && !/yahoo/.test(ay), ay.slice(0, 400));
  await pg.selectOption('#li-modo', 'nav'); pr = await pg.inputValue('#li-p'); assert(/PASO 1/.test(pr) && /sin_navegacion/.test(pr) && /stockanalysis\.com\/quote\/bme\/vid\/financials\/balance-sheet/.test(pr) && /Yahoo/.test(pr), pr.slice(0, 500)); console.log(pr.slice(0, 900));
  // una IA sin navegación contesta con el aviso acordado
  await pg.fill('#li-r', '{"error":"sin_navegacion"}'); await pg.click('#li-ok'); assert(/no puede abrir páginas/.test(await pg.textContent('#li-err')));
  const arr = v => an.map(() => v), arr0 = () => arr(null);
  // años mal -> error claro
  await pg.fill('#li-r', JSON.stringify({ anios: [1999], impuestos: [1] })); await pg.click('#li-ok'); assert(/no coinciden/.test(await pg.textContent('#li-err')));
  // longitud mal
  await pg.fill('#li-r', JSON.stringify({ anios: an, impuestos: [1, 2] })); await pg.click('#li-ok'); assert(/debe tener/.test(await pg.textContent('#li-err')));
  // la IA no pudo buscar: todo null
  await pg.fill('#li-r', JSON.stringify({ anios: an, intereses: arr0(), impuestos: arr0(), da: arr0(), capex: arr0(), deuda: arr0(), caja: arr0(), resumen: 'no se permite buscar en la web' })); await pg.click('#li-ok'); assert(/no ha encontrado ninguna cifra/.test(await pg.textContent('#li-err')) && /no puede abrir páginas|pega tú el texto/.test(await pg.textContent('#li-err')));
  // sin dato del último año
  await pg.fill('#li-r', JSON.stringify({ anios: an, impuestos: arr(60), da: arr(100), capex: arr(null), deuda: arr(250), caja: arr(80) })); await pg.click('#li-ok'); assert(/Falta el dato del último año/.test(await pg.textContent('#li-err')));
  // respuesta buena (con texto alrededor y bloque de código)
  await pg.fill('#li-r', 'Claro:\n```json\n' + JSON.stringify({ anios: an, Intereses: arr(8), Impuestos: arr(60), 'D&A': arr(110), CAPEX: arr(-95), deuda: arr(260), Caja: arr('70,0'), resumen: 'Cifras de prueba', fiabilidad: 'media', fuentes: ['prueba'], contraste: { capex: { Yahoo: arr(-95), StockAnalysis: an.map((x, i) => i === n - 1 ? -120 : -95) }, da: [{ fuente: 'Yahoo', valores: arr(110) }, { fuente: 'MarketScreener', valores: arr(111) }] } }) + '\n```'); await pg.click('#li-ok'); await pg.waitForTimeout(400);
  const av = await pg.textContent('#dlg'); assert(/diferencias de más del 5 %/.test(av) && /capex/.test(av) && /Sin contraste entre varias fuentes/.test(av), av.slice(0, 500)); console.log(av.slice(0, 600)); await pg.click('[data-a=cerrar]');
  const v = await pg.evaluate(() => Logic.valoracion(Store.get(), 'VID')); assert(v && !v.error && v.ref != null, JSON.stringify(v)); console.log('VID con cifras de prueba: rentab', (v.ref * 100).toFixed(1) + ' %');
  t = await pg.textContent('#vista'); assert(!/Ficha incompleta/.test(t)); assert(/sin verificar/.test(await pg.evaluate(() => Store.get().fichas.VID.notas.join(' '))));
  assert.deepEqual(errs, []); console.log('lineas_ia ok'); await b.close(); srv.close();
});
