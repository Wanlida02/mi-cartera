/* v66: Inicio con plusvalía latente y reparto (empresa/sector/divisa con límite), alertas con el nombre de la empresa,
   pestañas abajo en el móvil, el aviso no tapa «+ Compra» y precios en peniques convertidos a libras.
   Uso: node tests/inicio_v66.test.js (no necesita datos personales) */
const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const L = require('../js/logic.js'), { subunidad } = require('../scripts/actualizar_precios.js');

/* ── Lógica ── */
const HOY = L.today();
function datos() {
  const d = L.normalizar(null);
  d.ajustes.fx = { EUR: 1, USD: 2, GBP: 0.5, fecha: HOY };
  d.precios.AAA = { ticker: 'AAA', precio: 30, divisa: 'USD', fecha_precio: HOY };
  d.precios.BBB = { ticker: 'BBB', precio: 5, divisa: 'GBP', fecha_precio: HOY };
  L.compra(d, { empresa: 'Aaa Corp', ticker: 'AAA', broker: 'X', cantidad: 10, precio: 20, moneda: 'USD', sector: 'Industria' });   // coste 100 €, mercado 150 €
  L.compra(d, { empresa: 'Bbb plc', ticker: 'BBB', broker: 'X', cantidad: 10, precio: 10, moneda: 'GBP', sector: 'Consumo' });       // coste 200 €, mercado 100 €
  L.compra(d, { empresa: 'Sin Coste', ticker: 'CCC', broker: 'X', cantidad: 1, moneda: 'EUR', sector: 'Consumo', actual: 50 });       // sin precio de compra: no entra en la plusvalía
  return d;
}
{
  const D = L.dashboard(datos()), R = D.resumen;
  assert.equal(R.plusEur, -50); assert.equal(Math.round(R.plusPct * 1e4) / 1e4, -0.1667); assert.equal(R.nPlus, 2); assert.equal(R.nTotal, 3);
  assert.deepEqual(D.reparto.empresa.map(x => x.nombre), ['Aaa Corp', 'Bbb plc', 'Sin Coste'], 'ordenado de mayor a menor, con nombre');
  assert.equal(Math.round(D.reparto.sector[0].pct * 100), 50); assert.deepEqual(D.reparto.divisa.map(x => x.k), ['USD', 'GBP', 'EUR']);
  assert(D.alertas.some(a => a.tipo === 'empresa' && a.nombre === 'Aaa Corp' && a.tk === 'AAA'), 'la alerta dice el nombre de la empresa');
  assert.equal(L.dashboard(L.normalizar(null)).resumen.plusEur, null);
}
assert.deepEqual(subunidad({ precio: 806, divisa: 'GBp', fecha: 'x' }), { precio: 8.06, divisa: 'GBP', fecha: 'x' });
assert.deepEqual(subunidad({ precio: 806, divisa: 'GBX' }).divisa, 'GBP');
assert.deepEqual(subunidad({ precio: 5, divisa: 'USD' }), { precio: 5, divisa: 'USD' });
console.log('lógica ok');

/* ── Navegador ── */
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const FEED = { generado: new Date().toISOString(), estado: { ok: 1, total: 1, fallos: [] }, fx: { EUR: 1, USD: 2, GBP: 0.5, fecha: HOY },
  precios: { AAA: { ticker: 'AAA', precio: 30, divisa: 'USD', fecha_precio: HOY }, BBB: { ticker: 'BBB', precio: 500, divisa: 'GBp', fecha_precio: HOY } } };   // BBB en peniques: la app lo pasa a libras
const tmp = path.join(require('os').tmpdir(), 'inicio_v66_' + process.pid + '.json'); { const d = datos(); d.precios = {}; fs.writeFileSync(tmp, JSON.stringify(d)); }
const srv = http.createServer((q, r) => {
  const u = q.url.split('?')[0];
  if (u === '/precios.json') { r.writeHead(200, { 'content-type': 'application/json' }); return r.end(JSON.stringify(FEED)); }
  const p = path.join(root, u.replace(/\/$/, '/index.html'));
  fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } });
}).listen(0, async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 390, height: 800 } }), pg = await ctx.newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); await ctx.route(/api\.github\.com|accounts\.google\.com/, r => r.abort());
  try {
    await pg.goto('http://localhost:' + srv.address().port + '/'); await pg.click('#btn-ajustes'); await pg.setInputFiles('#a-imp', tmp); await pg.waitForTimeout(700);
    assert.equal(await pg.evaluate(() => Store.get().precios.BBB.divisa), 'GBP'); assert.equal(await pg.evaluate(() => Store.get().precios.BBB.precio), 5, 'peniques → libras');
    const kp = (await pg.textContent('.kpis')).replace(/\s+/g, ' ');
    assert(/Plusvalía latente\s*-50 €/.test(kp) && /-16,7% sobre coste · 2 de 3 pos\./.test(kp), kp);
    assert(await pg.$('.kpi b.down'), 'la plusvalía negativa va en rojo');
    /* Reparto: empresa por defecto, con la que supera el límite marcada; el cambio de vista se recuerda */
    assert.equal(await pg.locator('.rb').count(), 3); assert.equal(await pg.locator('.rb.over').count(), 3, 'las tres superan el 10%');
    assert(/Aaa Corp/.test(await pg.textContent('.rb >> nth=0')));
    assert(/Empresa Aaa Corp|Aaa Corp pesa/.test(await pg.textContent('#vista')), 'alerta con nombre');
    await pg.click('[data-rep=divisa]'); assert.equal(await pg.getAttribute('[data-rep=divisa]', 'aria-pressed'), 'true');
    assert.equal(await pg.locator('.rb .rb-t b').count(), 0, 'sin límite por divisa: sin línea');
    await pg.click('[data-rep=sector]'); assert.equal(await pg.locator('.rb .rb-t b').count(), 2); assert.equal(await pg.locator('.rb.over').count(), 2);
    await pg.reload(); await pg.waitForTimeout(300); assert.equal(await pg.getAttribute('[data-rep=sector]', 'aria-pressed'), 'true', 'se recuerda la vista');
    /* Móvil: pestañas fijas abajo, sin desbordar; el aviso queda por encima de «+ Compra» */
    let t = await pg.evaluate(() => { const r = document.getElementById('tabs').getBoundingClientRect(); return { pos: getComputedStyle(document.getElementById('tabs')).position, bottom: r.bottom, h: innerHeight, sw: document.documentElement.scrollWidth > innerWidth }; });
    assert.equal(t.pos, 'fixed'); assert(Math.abs(t.bottom - t.h) < 1); assert(!t.sw, 'sin scroll horizontal');
    await pg.click('[data-tab=cartera]'); await pg.evaluate(() => UI.toast('Prueba de aviso')); await pg.waitForTimeout(300);
    const [to, fab, tabs] = await Promise.all(['#toast', '.fab', '#tabs'].map(s => pg.evaluate(s => document.querySelector(s).getBoundingClientRect().toJSON(), s)));
    assert(to.bottom <= fab.top, 'el aviso no tapa + Compra'); assert(fab.bottom <= tabs.top, '+ Compra por encima de las pestañas');
    /* Escritorio: pestañas arriba */
    await pg.setViewportSize({ width: 1100, height: 800 }); await pg.waitForTimeout(100);
    t = await pg.evaluate(() => getComputedStyle(document.getElementById('tabs')).position); assert.equal(t, 'sticky');
    assert.deepEqual(errs, []);
    console.log('inicio v66 ok');
  } catch (e) { console.error('FALLO', e.message); process.exitCode = 1; }
  await b.close(); srv.close(); fs.unlinkSync(tmp);
});
