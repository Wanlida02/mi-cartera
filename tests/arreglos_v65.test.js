/* Arreglos de la v65: precio manual con ticker distinto al de la ficha, fecha local, precios al importar, «Precios actualizados» solo si cambia algo,
   Ajustes no congela las divisas, divisas de todas las posiciones, enlaces solo http(s) y caché del service worker acotada.
   Uso: node tests/arreglos_v65.test.js (no necesita datos personales) */
const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const L = require('../js/logic.js');

/* ── 1. Precio manual: se guarda con la clave con la que se lee ── */
{
  const d = L.normalizar(null);
  d.fichas.GOOGL = { nombre: 'Alphabet Inc.', divisa: 'USD', precio: 100, fecha_precio: '2026-11-01' };
  L.compra(d, { empresa: 'Alphabet', ticker: 'GOOG', broker: 'X', cantidad: 1, precio: 90, moneda: 'USD' });
  const p = d.posiciones[0];
  assert.equal(L.tickerDe(d, p), 'GOOGL');
  assert(L.precioManual(d, p, 150));
  assert.equal(L.precioPos(d, p).precio, 150, 'el precio manual se ve aunque el ticker de la posición no sea el de la ficha');
  assert.equal(L.precioPos(d, p).fuente, 'manual');
  const s = L.normalizar(null);   // sin ticker ni ficha: sigue yendo a la propia posición
  L.compra(s, { empresa: 'Sin Ficha', broker: 'X', cantidad: 1, precio: 5, moneda: 'EUR' });
  assert(L.precioManual(s, s.posiciones[0], 7)); assert.equal(s.posiciones[0].precio_actual, 7); assert.equal(L.precioPos(s, s.posiciones[0]).precio, 7);
}

/* ── 4. today() en hora local: a las 00:30 en Madrid ya es el día nuevo ── */
{
  const tz = process.env.TZ; process.env.TZ = 'Europe/Madrid';
  const D0 = Date, fijo = D0.parse('2026-11-18T23:30:00Z');   // 00:30 del 19 en Madrid
  global.Date = class extends D0 { constructor(...a) { super(...(a.length ? a : [fijo])); } static now() { return fijo; } };
  try { assert.equal(L.today(), '2026-11-19', 'fecha local, no UTC'); } finally { global.Date = D0; if (tz == null) delete process.env.TZ; else process.env.TZ = tz; }
}
console.log('lógica ok');

/* ── Navegador ── */
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const HOY = L.today();
const FEED = { generado: new Date().toISOString(), estado: { ok: 1, total: 1, fallos: [] }, fx: { EUR: 1, USD: 1.2, GBP: 0.85, CNY: 7.3, TWD: 36, fecha: HOY },
  precios: { AAA: { ticker: 'AAA', precio: 50, divisa: 'USD', fecha_precio: HOY, fuente: 'yahoo' } } };
const ARCHIVO = { posiciones: [{ empresa: 'Aaa Corp', ticker: 'AAA', broker: 'X', cantidad: 10, precio_medio_compra: 40, moneda: 'USD' }, { empresa: 'Bbb plc', ticker: 'BBB', broker: 'X', cantidad: 10, precio_medio_compra: 2, moneda: 'GBP' }],
  movimientos: [], fichas: {}, precios: { AAA: { ticker: 'AAA', precio: 30, divisa: 'USD', fecha_precio: '2026-01-02', fuente: 'yahoo' } },
  ajustes: { fx: { EUR: 1, USD: 1.1, CNY: 7, TWD: 35, fecha: '2026-01-02' } } };
const tmp = path.join(require('os').tmpdir(), 'arreglos_v65_' + process.pid + '.json'); fs.writeFileSync(tmp, JSON.stringify(ARCHIVO));
const srv = http.createServer((q, r) => {
  const u = q.url.split('?')[0];
  if (u === '/precios.json') { r.writeHead(200, { 'content-type': 'application/json' }); return r.end(JSON.stringify(FEED)); }
  const p = path.join(root, u.replace(/\/$/, '/index.html'));
  fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } });
}).listen(0, async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 390, height: 800 } }), pg = await ctx.newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await ctx.route(/api\.github\.com|accounts\.google\.com/, r => r.abort());
  const URL0 = 'http://localhost:' + srv.address().port + '/';
  try {
    await pg.goto(URL0); await pg.waitForTimeout(400);
    /* 2. Importar: los precios y divisas del feed se aplican sin recargar */
    await pg.click('#btn-ajustes'); await pg.setInputFiles('#a-imp', tmp); await pg.waitForTimeout(600);
    let r = await pg.evaluate(() => ({ p: Store.get().precios.AAA.precio, fx: Store.get().ajustes.fx }));
    assert.equal(r.p, 50, 'precio del feed aplicado tras importar'); assert.equal(r.fx.fecha, HOY); assert.equal(r.fx.GBP, 0.85);
    assert(/divisas \d{4}-\d\d-\d\d/.test(await pg.textContent('#sub')) && (await pg.textContent('#sub')).includes(HOY), 'la cabecera muestra las divisas de hoy');
    /* 3. Volver a leer el mismo feed no cuenta como cambio (antes: «Precios actualizados» en cada arranque) */
    assert.equal(await pg.evaluate(() => Store.cargarPreciosAuto()), 0);
    const toasts = []; await pg.exposeFunction('__toast', t => toasts.push(t));
    await pg.addInitScript(() => { new MutationObserver(() => { const t = document.getElementById('toast'); if (t && t.classList.contains('on')) window.__toast(t.textContent); }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] }); });
    await pg.reload(); await pg.waitForTimeout(800);
    assert(!toasts.some(t => /Precios actualizados/.test(t)), 'sin aviso de precios si nada cambia: ' + toasts.join(' | '));
    /* 6. Ajustes: cambiar un umbral no marca las divisas como manuales; todas las divisas son editables */
    await pg.click('#btn-ajustes');
    for (const k of ['USD', 'GBP', 'CNY', 'TWD']) assert(await pg.$('#a-fx-' + k), 'campo de divisa ' + k);
    await pg.fill('#a-b', '16'); await pg.click('#a-ok'); await pg.waitForTimeout(200);
    r = await pg.evaluate(() => Store.get().ajustes); assert.equal(r.umbral_barata, 16); assert(!r.fx.manual, 'un umbral no congela las divisas');
    await pg.click('#btn-ajustes'); await pg.fill('#a-fx-GBP', '0.9'); await pg.click('#a-ok'); await pg.waitForTimeout(200);
    r = await pg.evaluate(() => Store.get().ajustes.fx); assert.equal(r.GBP, 0.9); assert.equal(r.manual, true, 'tocar una divisa sí es ajuste manual');
    /* Aviso de posiciones sin tipo de cambio */
    await pg.evaluate(() => { delete Store.get().ajustes.fx.GBP; UI.render(); });
    assert(/Sin tipo de cambio para GBP/.test(await pg.textContent('#vista')), 'aviso de divisa sin cambio');
    /* 8. Enlaces: solo http(s) */
    r = await pg.evaluate(() => [UI.urlSegura('javascript:alert(1)'), UI.urlSegura(' https://x.com/a.pdf'), UI.urlSegura(null)]);
    assert.deepEqual(r, [null, 'https://x.com/a.pdf', null]);
    /* 5. Service worker: sin entradas «?_=» ni duplicados por «?v=» */
    await pg.evaluate(() => navigator.serviceWorker.ready);
    for (let i = 0; i < 3; i++) { await pg.reload(); await pg.waitForTimeout(500); }
    const claves = await pg.evaluate(async () => { const out = []; for (const k of await caches.keys()) for (const q of await (await caches.open(k)).keys()) out.push(q.url); return out; });
    assert(claves.length > 0, 'la caché tiene la app');
    assert(!claves.some(u => /[?&]_=/.test(u)), 'sin comprobaciones de versión en caché: ' + claves.filter(u => /_=/.test(u)).join(' '));
    assert.equal(new Set(claves.map(u => u.split('?')[0])).size, claves.length, 'una entrada por archivo');
    assert.deepEqual(errs, []);
    console.log('arreglos v65 ok (' + claves.length + ' archivos en caché)');
  } catch (e) { console.error('FALLO', e.message); process.exitCode = 1; }
  await b.close(); srv.close(); fs.unlinkSync(tmp);
});
