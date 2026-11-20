/* v75: precios que la descarga automática no consigue — diagnóstico, prompt para una IA, lectura validada de su respuesta y corrección de símbolos
   en simbolos.json (GitHub simulado). Caso real del 20-11-2026: SOL SPA, NEURONES, COLLEGIUM PHARMACEUTICAL (símbolos mal), MIPS y DANR (Yahoo limitado).
   Uso: node tests/precios_ia_v75.test.js */
const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const L = require('../js/logic.js');
const HOY = L.today(), dia = n => new Date(Date.parse(HOY) - n * 864e5).toISOString().slice(0, 10);
const FALLOS = [
  { ticker: 'MIPS', motivo: 'MIPS.ST/yahoo: Yahoo limitado (429): se omite | MIPS.ST/cnbc: CNBC: bolsa desconocida' },
  { ticker: 'SOL SPA', motivo: 'SOL SPA/yahoo: Yahoo limitado (429): se omite | SOL SPA/cnbc: CNBC sin datos' },
  { ticker: 'NEURONES', motivo: 'NEURONES/yahoo: Yahoo limitado (429): se omite | NEURONES/cnbc: CNBC sin datos' },
  { ticker: 'COLLEGIUM PHARMACEUTICAL', motivo: 'COLLEGIUM PHARMACEUTICAL/yahoo: Yahoo limitado (429): se omite' },
  { ticker: 'DANR', motivo: 'DANR.MI/yahoo: HTTP 404 | DANR.MI/cnbc: CNBC sin precio o divisa' }];
const RESP = 'He buscado los cierres:\n```json\n{"precios":[' + [
  '{"ticker":"SOL SPA","empresa":"SOL S.p.A.","simbolo_yahoo":"SOL.MI","bolsa":"Milán","precio":"39,85","divisa":"EUR","fecha":"' + dia(1) + '","fuente":"https://www.borsaitaliana.it/sol"}',
  '{"ticker":"NEURONES","empresa":"Neurones","simbolo_yahoo":"NRO.PA","precio":44.1,"divisa":"EUR","fecha":"' + dia(1) + '","fuente":"https://live.euronext.com/nro"}',
  '{"ticker":"COLLEGIUM PHARMACEUTICAL","simbolo_yahoo":"COLL","precio":31.2,"divisa":"USD","fecha":"' + dia(1) + '","fuente":"https://www.nasdaq.com/coll"}',
  '{"ticker":"MIPS","simbolo_yahoo":"MIPS.ST","precio":350,"divisa":"SEK","fecha":"' + dia(20) + '","fuente":"https://x.com/mips"}',
  '{"ticker":"DANR","simbolo_yahoo":"DAN.MI","precio":30.5,"divisa":"USD","fecha":"' + dia(1) + '","fuente":"https://x.com/danr","nota":"cotiza también en OTC"}',
  '{"ticker":"XXX","precio":1,"divisa":"EUR","fecha":"' + dia(1) + '","fuente":"https://x.com"}'].join(',') + ']}\n```';
const DIV = { MIPS: 'SEK', 'SOL SPA': 'EUR', NEURONES: 'EUR', 'COLLEGIUM PHARMACEUTICAL': 'USD', DANR: 'EUR' };
const items = () => FALLOS.map(f => ({ tk: f.ticker, nombre: f.ticker === 'SOL SPA' ? 'Sol S.p.A.' : f.ticker, simbolo: L.diagnosticoPrecio(f, DIV[f.ticker]).simbolo, divisa: DIV[f.ticker], ultimo: f.ticker === 'NEURONES' ? { precio: 30, fecha: dia(5) } : null }));

/* ── Lógica ── */
{
  const dg = FALLOS.map(f => L.diagnosticoPrecio(f, DIV[f.ticker]).tipo);
  assert.deepEqual(dg, ['temporal', 'simbolo', 'simbolo', 'simbolo', 'simbolo'], 'MIPS temporal; los demás, símbolo dudoso: ' + dg);
  assert(/no es un símbolo de bolsa válido/.test(L.diagnosticoPrecio(FALLOS[1], 'EUR').txt));
  assert(/no lleva el sufijo de su bolsa/.test(L.diagnosticoPrecio(FALLOS[2], 'EUR').txt), 'NEURONES en EUR sin .PA');
  const p = L.promptPreciosIA(items(), HOY);
  assert(/SOL SPA: Sol S\.p\.A\..*«SOL SPA»/.test(p) && /"precios"/.test(p) && /sufijo de su bolsa/.test(p), 'prompt');
  const r = L.leerPreciosIA(RESP, items(), HOY), by = k => r.ok.find(x => x.tk === k);
  assert.equal(by('SOL SPA').precio, 39.85, 'coma decimal'); assert.equal(by('SOL SPA').simbolo, 'SOL.MI'); assert(by('SOL SPA').cambiaSim);
  assert.equal(by('COLLEGIUM PHARMACEUTICAL').simbolo, 'COLL');
  assert(by('NEURONES') && Math.round(by('NEURONES').salto * 100) === 47, 'acepta con aviso de salto'); assert(r.avisos.some(a => /NEURONES: cambia un 47 %/.test(a)));
  assert(!by('MIPS'), 'precio de hace 20 días: no'); assert(r.rechazados.some(x => /MIPS: precio de hace 20 días/.test(x)));
  assert(by('DANR') && by('DANR').soloSimbolo, 'DANR: divisa distinta → no se usa el precio pero sí se propone el símbolo');
  assert(r.rechazados.some(x => /DANR: la IA da el precio en USD y tu valor cotiza en EUR.*OTC/.test(x)));
  assert(r.rechazados.some(x => /XXX: no es ninguno/.test(x)));
  assert.throws(() => L.leerPreciosIA('nada', items()), /No encuentro el JSON/);
  const sinUrl = L.leerPreciosIA('{"precios":[{"ticker":"SOL SPA","precio":40,"divisa":"EUR","fecha":"' + dia(1) + '"}]}', items(), HOY);
  assert(!sinUrl.ok.length && sinUrl.rechazados.some(x => /sin enlace/.test(x)), 'sin fuente no se acepta');
  const gbp = L.leerPreciosIA('{"precios":[{"ticker":"ATYM","precio":806,"divisa":"GBp","fecha":"' + dia(1) + '","fuente":"https://x.com"}]}', [{ tk: 'ATYM', simbolo: 'ATYM.L', divisa: 'GBP' }], HOY);
  assert.equal(gbp.ok[0].precio, 8.06, 'peniques → libras');
  const c = L.corregirSimbolos({ _nota: 'x', simbolos: { 'SOL SPA': { y: ['SOL SPA'], pausa: true }, TSM: { y: ['TSM'], ficha: 'X' } } }, [{ tk: 'SOL SPA', simbolo: 'SOL.MI' }, { tk: 'TSM@ficha', simbolo: '2330.TW' }, { tk: 'NUEVO', simbolo: 'NEW.PA' }]);
  assert.deepEqual(c.cfg.simbolos['SOL SPA'], { y: ['SOL.MI'] }, 'el símbolo con espacios se quita y se reactiva');
  assert.equal(c.cfg.simbolos.TSM.ficha, '2330.TW'); assert.deepEqual(c.cfg.simbolos.NUEVO.y, ['NEW.PA']); assert.equal(c.cfg._nota, 'x');
  assert.equal(c.hechos.length, 3);
}
console.log('lógica ok');

/* ── Navegador: Inicio → ventana → pegar → aplicar precios y corregir símbolos (GitHub simulado) ── */
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const FEED = { generado: new Date().toISOString(), estado: { ok: 1, total: 6, fallos: FALLOS }, fx: { EUR: 1, USD: 1.1, SEK: 11.5, fecha: HOY }, precios: { AAA: { ticker: 'AAA', precio: 10, divisa: 'EUR', fecha_precio: HOY } } };
const SIMB = { _nota: 'nota', simbolos: { 'SOL SPA': { y: ['SOL SPA'] }, NEURONES: { y: ['NEURONES'] }, 'COLLEGIUM PHARMACEUTICAL': { y: ['COLLEGIUM PHARMACEUTICAL'] }, MIPS: { y: ['MIPS.ST'] }, DANR: { y: ['DANR.MI'] } } };
const srv = http.createServer((q, r) => {
  const u = q.url.split('?')[0]; if (u === '/precios.json') { r.writeHead(200, { 'content-type': 'application/json' }); return r.end(JSON.stringify(FEED)); }
  const p = path.join(root, u.replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } });
}).listen(0, async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] }), pg = await ctx.newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); await ctx.route(/accounts\.google\.com/, r => r.abort());
  let escrito = null, lanzado = null;
  await ctx.route(/api\.github\.com/, async r => {
    const q = r.request(), u = q.url();
    if (/contents\/simbolos\.json/.test(u) && q.method() === 'GET') return /raw/.test(q.headers().accept || '') ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SIMB) }) : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sha: 'abc' }) });
    if (/contents\/simbolos\.json/.test(u) && q.method() === 'PUT') { const j = JSON.parse(q.postData()); escrito = { msg: j.message, cfg: JSON.parse(Buffer.from(j.content, 'base64').toString('utf8')) }; return r.fulfill({ status: 200, body: '{}' }); }
    if (/dispatches/.test(u)) { lanzado = JSON.parse(q.postData()); return r.fulfill({ status: 204, body: '' }); }
    return r.fulfill({ status: 404, body: '' });
  });
  try {
    await pg.goto('http://localhost:' + srv.address().port + '/'); await pg.waitForTimeout(500);
    await pg.evaluate(([H, d5]) => { const d = Store.get(); d.posiciones.push({ empresa: 'Sol S.p.A.', ticker: 'SOL SPA', broker: 'X', cantidad: 10, precio_medio_compra: 30, moneda: 'EUR' }, { empresa: 'Neurones', ticker: 'NEURONES', broker: 'X', cantidad: 5, precio_medio_compra: 35, moneda: 'EUR' });
      d.precios.NEURONES = { ticker: 'NEURONES', precio: 30, divisa: 'EUR', fecha_precio: d5, fuente: 'yahoo' }; d.fichas.DANR = { nombre: 'Danieli', divisa: 'EUR', estado: 'watchlist' }; Store.save(); UI.render(); }, [HOY, dia(5)]);
    assert(await pg.isVisible('[data-a="precios-ia"]'), 'botón en el Inicio');
    await pg.click('[data-a="precios-ia"]'); await pg.waitForSelector('#pi-r');
    assert.equal(await pg.isDisabled('#pi-ok'), true, 'Aplicar desactivado hasta pegar algo válido');
    await pg.click('#pi-cp'); assert(/SOL SPA/.test(await pg.evaluate(() => navigator.clipboard.readText())), 'prompt copiado');
    await pg.fill('#pi-r', RESP);
    const res = await pg.textContent('#pi-res');
    assert(/3 precios válidos/.test(res) && /Símbolos a corregir/.test(res) && /SOL SPA.*SOL\.MI/.test(res.replace(/\s+/g, ' ')), res);
    assert(await pg.isVisible('#pi-tok'), 'pide el token si hace falta corregir símbolos');
    await pg.fill('#pi-t', 'github_pat_prueba'); await pg.click('#pi-ok'); await pg.waitForTimeout(800);
    const d = await pg.evaluate(() => ({ sol: Store.get().precios['SOL SPA'], col: Store.get().precios['COLLEGIUM PHARMACEUTICAL'] }));
    assert.equal(d.sol.precio, 39.85); assert.equal(d.sol.fuente, 'IA'); assert.equal(d.sol.fecha_precio, dia(1)); assert(/borsaitaliana/.test(d.sol.url));
    assert(escrito, 'simbolos.json escrito'); assert.deepEqual(escrito.cfg.simbolos['SOL SPA'].y, ['SOL.MI']); assert.deepEqual(escrito.cfg.simbolos.NEURONES.y, ['NRO.PA']);
    assert.deepEqual(escrito.cfg.simbolos['COLLEGIUM PHARMACEUTICAL'].y, ['COLL']); assert.deepEqual(escrito.cfg.simbolos.DANR.y, ['DAN.MI', 'DANR.MI']); assert.equal(escrito.cfg._nota, 'nota');
    assert(lanzado && lanzado.inputs.forzar === 'true', 'descarga nueva lanzada');
    assert(/3 precios aplicados.*Símbolos corregidos/.test(await pg.textContent('#toast')), await pg.textContent('#toast'));
    /* La descarga automática no pisa el precio de la IA con otro del mismo día */
    const n = await pg.evaluate(f => Store.cargarPreciosAuto(f), Object.assign({}, FEED, { precios: { 'SOL SPA': { ticker: 'SOL SPA', precio: 1, divisa: 'EUR', fecha_precio: dia(1), fuente: 'yahoo' } } }));
    assert.equal(await pg.evaluate(() => Store.get().precios['SOL SPA'].precio), 39.85, 'mismo día: se queda el de la IA');
    assert.deepEqual(errs, []);
    console.log('precios ia v75 ok');
  } catch (e) { console.error('FALLO', e.message); process.exitCode = 1; }
  await b.close(); srv.close();
});
