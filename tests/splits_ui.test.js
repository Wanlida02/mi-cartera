/* Splits en la app: al llegar precios.json con el registro de splits, la posición y la ficha se ajustan solas (una vez) y se avisa; la valoración deja de ser un «chollo» falso.
   Sin datos personales. Uso: node tests/splits_ui.test.js */
const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const L = require('../js/logic.js'), root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const HOY = L.today(), d = L.normalizar(null); d.ajustes.fx = Object.assign(d.ajustes.fx, { USD: 1.15, fecha: HOY });
d.fichas.SNDK = Object.assign(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture_TST.json'), 'utf8')), { nombre: 'Sandisk Corporation', divisa: 'USD', fecha_datos: '2026-10-23', precio: 1260.93, fecha_precio: '2026-10-22' });
const f = d.fichas.SNDK, n = f.hist.ventas.length; f.hist.acciones = f.hist.acciones.map(() => 155);
L.compra(d, { empresa: 'Sandisk', ticker: 'SNDK', broker: 'T212', cantidad: 0.2, precio: 963.18, moneda: 'EUR' });
const FEED = { generado: new Date().toISOString(), estado: { ok: 1, total: 1, fallos: [] }, fx: { EUR: 1, USD: 1.15, fecha: HOY }, precios: { SNDK: { ticker: 'SNDK', precio: 77.57, divisa: 'USD', fecha_precio: HOY, fuente: 'cnbc' } },
  splits: { SNDK: [{ fecha: '2026-11-20', k: 8, estado: 'confirmado' }] }, splits_pendientes: [] };
const DATOS = JSON.stringify(d);
const srv = http.createServer((q, r) => { const u = q.url.split('?')[0]; if (u === '/precios.json') { r.writeHead(200, { 'content-type': 'application/json' }); return r.end(JSON.stringify(FEED)); }
  const p = path.join(root, u.replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0, async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), pg = await ctx.newPage(), errs = [], toasts = []; pg.on('pageerror', e => errs.push(e.message));
  await ctx.route(/api\.github\.com|accounts\.google\.com/, r => r.abort());
  await pg.exposeFunction('__toast', t => toasts.push(t));
  await ctx.addInitScript(x => { if (!sessionStorage.getItem('t')) { localStorage.setItem('mi-cartera:datos:v1', x); sessionStorage.setItem('t', '1'); }
    new MutationObserver(() => { const t = document.getElementById('toast'); if (t && t.classList.contains('on')) window.__toast(t.textContent); }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] }); }, DATOS);
  try {
    await pg.goto('http://localhost:' + srv.address().port + '/'); await pg.waitForTimeout(1500);
    const r = await pg.evaluate(() => { const d = Store.get(), p = d.posiciones[0]; return { q: p.cantidad, pm: p.precio_medio_compra, acc: d.fichas.SNDK.hist.acciones.slice(-1)[0], hechos: d.ajustes.splits_aplicados.length }; });
    assert.deepEqual(r, { q: 1.6, pm: 120.3975, acc: 1240, hechos: 1 }, JSON.stringify(r));
    assert(toasts.some(t => /SNDK: split 8 por 1 del 2026-11-20 aplicado/.test(t)), 'aviso: ' + toasts.join(' | '));
    await pg.reload(); await pg.waitForTimeout(1200);
    assert.equal(await pg.evaluate(() => Store.get().posiciones[0].cantidad), 1.6, 'no se aplica dos veces');
    await pg.evaluate(() => UI.abrirFicha('SNDK')); await pg.waitForTimeout(600);
    assert(!/¿split\?/.test(await pg.textContent('#vista')), 'sin aviso de split tras ajustar');
    assert.deepEqual(errs, []); console.log('splits ui ok');
  } catch (e) { console.error('FALLO', e.message); process.exitCode = 1; }
  await b.close(); srv.close();
});
