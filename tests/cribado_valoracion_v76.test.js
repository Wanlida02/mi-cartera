/* v76: pasar a mano de «Vigilar» a «Pasan el cribado» (con nota y vuelta atrás); Valoración con bloques plegables que se recuerdan;
   watchlist solo con las que pasan el cribado y las que estuvieron en cartera (dos grupos) y las que pasan sin ficha como «pendiente».
   Uso: node tests/cribado_valoracion_v76.test.js */
const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const L = require('../js/logic.js');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
/* Datos: cribados reales del repositorio (AZO y LIN pasan; AAPL, GCT y KRI en «Vigilar») y fichas de cada caso */
const CR = JSON.parse(fs.readFileSync(path.join(root, 'cribado_inicial.json'), 'utf8')), tst = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture_TST.json'), 'utf8'));
const d = L.normalizar(null); d.cribado = CR.cribado || CR;
const ficha = (n, estado) => Object.assign(JSON.parse(JSON.stringify(tst)), { nombre: n, estado, divisa: 'USD', precio: 25, fecha_precio: L.today() });
d.fichas = { MSFT: ficha('Microsoft', 'cartera'), AZO: ficha('AutoZone', 'watchlist'), AAPL: Object.assign(ficha('Apple', 'watchlist'), { precio: 270 }), GCT: ficha('GigaCloud', 'watchlist'), ZZZ: ficha('Zeta', 'watchlist'), KRI: ficha('Kristal', 'watchlist'), CAN: ficha('Candidata SA', 'candidata') };
L.compra(d, { empresa: 'Microsoft', ticker: 'MSFT', broker: 'X', cantidad: 1, precio: 20, moneda: 'USD' });
L.compra(d, { empresa: 'GigaCloud', ticker: 'GCT', broker: 'X', cantidad: 3, precio: 20, moneda: 'USD' }); L.venta(d, 1, { cantidad: 3, precio: 30 });   // GCT: estuvo en cartera
assert(L.estuvoEnCartera(d, 'GCT') && !L.estuvoEnCartera(d, 'MSFT') && !L.estuvoEnCartera(d, 'ZZZ'), 'estuvoEnCartera');
const DATOS = JSON.stringify(d);
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0, async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), pg = await ctx.newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); await ctx.route(/api\.github\.com|accounts\.google\.com/, r => r.abort());
  await ctx.addInitScript(x => { if (!sessionStorage.getItem('t')) { localStorage.setItem('mi-cartera:datos:v1', x); sessionStorage.setItem('t', '1'); } }, DATOS);
  const grupos = () => pg.$$eval('#vista details.vgrp', ds => ds.map(x => ({ g: x.dataset.vg, open: x.open, ks: [...x.querySelectorAll('[data-k]')].map(e => e.dataset.k + (e.closest('.row') && /pendiente/.test(e.closest('.row').textContent) ? '*' : '')) })));
  const de = (G, g) => (G.find(x => x.g === g) || { ks: [] });
  try {
    await pg.goto('http://localhost:' + srv.address().port + '/'); await pg.waitForTimeout(500);
    await pg.click('[data-tab=valoracion]'); await pg.waitForTimeout(300);
    let G = await grupos();
    /* Lo esperado sale del propio veredicto del cribado (depende del precio del día) */
    const pasa = await pg.evaluate(() => Object.fromEntries(['AAPL', 'AZO', 'GCT', 'KRI', 'LIN', 'ZZZ'].map(k => [k, UI.cribadoPasa(k)])));
    assert(!pasa.KRI && !pasa.ZZZ, 'KRI en «Vigilar» y ZZZ sin cribado: ' + JSON.stringify(pasa));
    const esp = { pasan: ['AAPL', 'AZO', 'GCT'].filter(k => pasa[k]).concat(pasa.LIN ? ['LIN*'] : []).sort(), excartera: pasa.GCT ? [] : ['GCT'], otras: ['AAPL', 'AZO', 'KRI', 'ZZZ'].filter(k => !pasa[k]).sort() };
    assert.deepEqual(de(G, 'cartera').ks, ['MSFT'], JSON.stringify(G));
    assert.deepEqual(de(G, 'pasan').ks.sort(), esp.pasan, 'pasan el cribado (+ pendientes sin ficha): ' + JSON.stringify(G));
    assert.deepEqual(de(G, 'excartera').ks, esp.excartera, 'estuvo en cartera');
    assert.deepEqual(de(G, 'otras').ks.sort(), esp.otras, 'el resto, fuera de la watchlist');
    assert(pasa.LIN, 'LIN pasa el cribado (para probar «pendiente»)');
    assert.deepEqual(de(G, 'candidata').ks, ['CAN']);
    assert.equal(G.find(x => x.g === 'calidad').open, false, 'calidad plegada de entrada'); assert.equal(de(G, 'otras').open, false, 'otras plegadas');
    assert.equal(de(G, 'cartera').open, true);
    /* Plegar «En cartera» se recuerda al volver a abrir la app */
    await pg.click('details.vgrp[data-vg="cartera"] > summary'); await pg.reload(); await pg.waitForTimeout(400); await pg.click('[data-tab=valoracion]'); await pg.waitForTimeout(200);
    assert.equal(de(await grupos(), 'cartera').open, false, 'se recuerda plegado');
    /* LIN pendiente → «Crear ficha» abre la ficha nueva con el ticker y el nombre */
    await pg.click('[data-v="nuevade"][data-k="LIN"]'); await pg.waitForTimeout(150);
    assert.equal(await pg.inputValue('#n-tk'), 'LIN'); assert(/Linde/i.test(await pg.inputValue('#n-nom')), await pg.inputValue('#n-nom')); await pg.evaluate(() => UI.cerrar());
    /* Cribado: pasar KRI a mano, con nota */
    await pg.click('[data-tab=cribado]'); await pg.waitForTimeout(200); await pg.click('[data-c="abrir"][data-k="KRI"]'); await pg.waitForTimeout(200);
    assert(/^Vigilar/.test(await pg.textContent('#vista h2')));
    await pg.click('[data-c="pasar"]'); await pg.fill('#pm-n', 'Múltiplo inflado por un año extraordinario'); await pg.click('#pm-ok'); await pg.waitForTimeout(200);
    const c = await pg.evaluate(() => Store.get().cribado.KRI.paso_manual);
    assert(c && c.nota === 'Múltiplo inflado por un año extraordinario' && c.fecha === L.today() && /^Vigilar/.test(c.antes), JSON.stringify(c));
    assert(/Pasa el cribado · a mano/.test(await pg.textContent('#vista h2')) && /La pasaste tú el .*Múltiplo inflado/.test(await pg.textContent('#vista')));
    await pg.click('[data-c="volver"]'); await pg.waitForTimeout(150);
    const grupoCr = await pg.$$eval('#vista details.card', ds => ds.map(x => x.querySelector('summary').textContent.trim().split(' ')[0] + ':' + [...x.querySelectorAll('[data-c="abrir"]')].map(e => e.dataset.k).join(',')));
    assert(grupoCr.some(x => /^Pasan:.*KRI/.test(x)), 'en el cribado, KRI en «Pasan»: ' + grupoCr);
    /* … y en Valoración pasa de «Otras» a la watchlist */
    await pg.click('[data-tab=valoracion]'); await pg.waitForTimeout(200); G = await grupos();
    assert(de(G, 'pasan').ks.includes('KRI') && !de(G, 'otras').ks.includes('KRI'), JSON.stringify(G));
    /* Volver a «Vigilar» (con Deshacer) */
    await pg.click('[data-tab=cribado]'); await pg.click('[data-c="abrir"][data-k="KRI"]'); await pg.click('[data-c="despasar"]'); await pg.waitForTimeout(150);
    assert(!(await pg.evaluate(() => Store.get().cribado.KRI.paso_manual)) && /^Vigilar/.test(await pg.textContent('#vista h2')));
    await pg.click('#toast .toast-b'); await pg.waitForTimeout(150); assert(await pg.evaluate(() => !!Store.get().cribado.KRI.paso_manual), 'Deshacer devuelve el paso manual');
    /* Una en «Pasa» o «Descartar» no ofrece el botón */
    await pg.click('[data-c="volver"]').catch(() => {}); await pg.evaluate(() => UI.irA('cribado')); await pg.click('[data-c="abrir"][data-k="AZO"]'); assert(!(await pg.$('[data-c="pasar"]')) || !(await pg.evaluate(() => UI.cribadoPasa('AZO'))), 'si ya pasa, sin botón');
    assert.deepEqual(errs, []);
    console.log('cribado valoracion v76 ok');
  } catch (e) { console.error('FALLO', e.message); process.exitCode = 1; }
  await b.close(); srv.close();
});
