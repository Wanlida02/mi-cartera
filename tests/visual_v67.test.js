/* v67: foto diaria y gráfico de evolución, medidor de la watchlist, Cartera por broker y por rentab. esperada, aviso único de «sin precio»,
   cabecera con la antigüedad de los precios y precios al volver a la app. Uso: node tests/visual_v67.test.js (sin datos personales) */
const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const L = require('../js/logic.js');
const HOY = L.today(), dia = n => new Date(Date.parse(HOY) - n * 864e5).toISOString().slice(0, 10);

/* ── Lógica: una foto por día, la de hoy se actualiza; unir dos dispositivos ── */
{
  const d = L.normalizar(null); d.ajustes.fx = { EUR: 1, USD: 2, fecha: HOY };
  assert.equal(L.fotoDiaria(d), false, 'sin posiciones no hay foto');
  L.compra(d, { empresa: 'Aaa', ticker: 'AAA', broker: 'X', cantidad: 10, precio: 20, moneda: 'USD' });   // coste 100 €
  L.compra(d, { empresa: 'Sin Coste', ticker: 'CCC', broker: 'X', cantidad: 1, moneda: 'EUR', actual: 50 });
  d.precios.AAA = { precio: 30, divisa: 'USD', fecha_precio: HOY };
  assert(L.fotoDiaria(d, dia(1))); assert(L.fotoDiaria(d)); assert.equal(d.historico.length, 2);
  assert.deepEqual(d.historico[1], { f: HOY, v: 200, c: 150 }, 'sin coste cuenta su valor en los dos lados');
  assert.equal(L.fotoDiaria(d), false, 'igual que la de hoy: no guarda');
  d.precios.AAA.precio = 40; assert(L.fotoDiaria(d)); assert.equal(d.historico.length, 2); assert.equal(d.historico[1].v, 250, 'la de hoy se actualiza');
  const u = L.unirHistorico([{ f: dia(3), v: 1, c: 1 }, { f: dia(1), v: 2, c: 2 }], [{ f: dia(2), v: 3, c: 3 }, { f: dia(1), v: 9, c: 9 }]);
  assert.deepEqual(u.map(x => x.f + ':' + x.v), [dia(3) + ':1', dia(2) + ':3', dia(1) + ':9']);
  assert.deepEqual(L.normalizar({ posiciones: [] }).historico, []);
}
console.log('lógica ok');

/* ── Navegador ── */
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const tst = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture_TST.json')));
const ficha = (n, estado) => Object.assign(JSON.parse(JSON.stringify(tst)), { nombre: n, estado, divisa: 'USD', precio: 25, fecha_precio: HOY });
const D0 = {
  posiciones: [{ empresa: 'Uno', ticker: 'UNO', broker: 'XTB', cantidad: 10, precio_medio_compra: 20, moneda: 'USD' }, { empresa: 'Dos', ticker: 'DOS', broker: 'IBKR', cantidad: 100, precio_medio_compra: 20, moneda: 'USD' },
    { empresa: 'Tres', ticker: 'TRES', broker: 'XTB', cantidad: 5, precio_medio_compra: 10, moneda: 'USD' }, { empresa: 'Sin Precio', ticker: 'SP', broker: 'IBKR', cantidad: 1, precio_medio_compra: 10, moneda: 'USD' }],
  movimientos: [], fichas: { UNO: ficha('Uno', 'cartera'), DOS: ficha('Dos', 'cartera'), TRES: ficha('Tres', 'cartera'), WAT: ficha('Vigilada', 'watchlist') },
  precios: {}, ajustes: { fx: { EUR: 1, USD: 1, fecha: HOY } }, historico: [{ f: dia(40), v: 2000, c: 2100 }, { f: dia(20), v: 2300, c: 2100 }, { f: dia(5), v: 2500, c: 2200 }]
};
D0.fichas.UNO.hist.ebit = D0.fichas.UNO.hist.ebit.map(x => x * 3);   // UNO más barata: mayor rentab. esperada
let FEED = { generado: new Date(Date.now() - 3 * 3600e3).toISOString(), estado: { ok: 3, total: 3, fallos: [] }, fx: { EUR: 1, USD: 1, fecha: HOY },
  precios: { UNO: { precio: 25, divisa: 'USD', fecha_precio: HOY }, DOS: { precio: 25, divisa: 'USD', fecha_precio: HOY }, TRES: { precio: 25, divisa: 'USD', fecha_precio: HOY } } };
const tmp = path.join(require('os').tmpdir(), 'visual_v67_' + process.pid + '.json'); fs.writeFileSync(tmp, JSON.stringify(D0));
const srv = http.createServer((q, r) => {
  const u = q.url.split('?')[0];
  if (u === '/precios.json') { r.writeHead(200, { 'content-type': 'application/json' }); return r.end(JSON.stringify(FEED)); }
  const p = path.join(root, u.replace(/\/$/, '/index.html'));
  fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } });
}).listen(0, async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), pg = await ctx.newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); await ctx.route(/api\.github\.com|accounts\.google\.com/, r => r.abort());
  try {
    await pg.goto('http://localhost:' + srv.address().port + '/'); await pg.click('#btn-ajustes'); await pg.setInputFiles('#a-imp', tmp); await pg.waitForTimeout(800);
    /* Foto de hoy con los precios ya aplicados, incluida en el gráfico */
    const H = await pg.evaluate(() => Store.get().historico);
    assert.equal(H.length, 4); assert.deepEqual(H[3], { f: HOY, v: 2885, c: 2260 }, JSON.stringify(H[3]));
    assert(/hace 3 h/.test(await pg.textContent('#sub')), await pg.textContent('#sub'));
    /* Evolución: 3 M por defecto (4 días), 1 M deja 3; hover y teclado muestran el día */
    assert(await pg.$('.evo-plot svg .lv'));
    assert(/Ver datos \(4 días\)/.test(await pg.textContent('.evo')));
    assert(/2885 €/.test(await pg.textContent('.evo-top')) && /\+725 €/.test(await pg.textContent('.evo-top')), await pg.textContent('.evo-top'));
    await pg.click('[data-evo=m1]'); assert(/Ver datos \(3 días\)/.test(await pg.textContent('.evo')));
    const bx = await pg.locator('.evo-plot').boundingBox(); await pg.mouse.move(bx.x + 2, bx.y + bx.height / 2);
    assert(await pg.isVisible('.evo-tip')); assert((await pg.textContent('.evo-tip')).includes('Valor 2300 €'), await pg.textContent('.evo-tip'));
    await pg.mouse.move(0, 0); assert(!(await pg.isVisible('.evo-tip')), 'se oculta al salir');
    await pg.focus('.evo-plot'); await pg.keyboard.press('ArrowRight'); assert((await pg.textContent('.evo-tip')).includes('Valor 2885 €'), 'con teclado: el último día');
    await pg.keyboard.press('ArrowLeft'); assert((await pg.textContent('.evo-tip')).includes('Valor 2500 €'));
    await pg.reload(); await pg.waitForTimeout(400); assert.equal(await pg.getAttribute('[data-evo=m1]', 'aria-pressed'), 'true', 'se recuerda el periodo');
    /* Con una sola foto: explicación en vez de gráfico */
    await pg.evaluate(() => { Store.get().historico = Store.get().historico.slice(-1); UI.render(); });
    assert(!(await pg.$('.evo-plot'))); assert(/aparece en cuanto haya dos días/.test(await pg.textContent('.evo')));
    /* Watchlist: medidor con el precio entre las zonas */
    assert(await pg.$('.med b'), 'medidor de la watchlist'); assert(await pg.$('.med-ley'));
    /* Cartera: aviso único de «sin precio», sin pastillas por fila */
    await pg.click('[data-tab=cartera]');
    assert(/1 posición sin precio/.test(await pg.textContent('#vista'))); assert(!/sin fecha/.test(await pg.textContent('#vista')));
    await pg.selectOption('#ord', 'broker');
    assert.deepEqual(await pg.$$eval('.grp b', n => n.map(x => x.textContent)), ['IBKR', 'XTB']);
    assert(/2510 € · 87,0%/.test(await pg.textContent('.grp >> nth=0')), await pg.textContent('.grp >> nth=0'));
    await pg.selectOption('#ord', 'ref');
    const orden = await pg.$$eval('[data-pos] .name', n => n.map(x => x.textContent.trim()));
    assert.equal(orden[0], 'Uno', 'la de mayor rentab. esperada primero: ' + orden.join(', ')); assert(/esperada/.test(await pg.textContent('[data-pos]')));
    /* Precios al volver a la app (si han pasado 15 min) */
    FEED = Object.assign({}, FEED, { generado: new Date().toISOString(), precios: Object.assign({}, FEED.precios, { UNO: { precio: 26, divisa: 'USD', fecha_precio: HOY, hora: 'b' } }) });
    await pg.evaluate(() => { const n = Date.now; Date.now = () => n() + 16 * 60000; Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await pg.waitForTimeout(500);
    assert.equal(await pg.evaluate(() => Store.get().precios.UNO.precio), 26, 'precios traídos al volver');
    /* Datos de Drive: se juntan las fotos de los dos dispositivos */
    const j = await pg.evaluate(d99 => { const loc = Store.get().historico.map(x => x.f); Store.adopt(Object.assign(JSON.parse(Store.exportar()), { historico: [{ f: d99, v: 1, c: 1 }] })); return { loc, ahora: Store.get().historico.map(x => x.f) }; }, dia(99));
    assert.deepEqual(j.ahora, [dia(99)].concat(j.loc), 'unión de historias al adoptar');
    assert.deepEqual(errs, []);
    console.log('visual v67 ok');
  } catch (e) { console.error('FALLO', e.message); process.exitCode = 1; }
  await b.close(); srv.close(); fs.unlinkSync(tmp);
});
