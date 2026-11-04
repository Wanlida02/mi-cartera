const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), DW = require('../js/datos-web.js');
// plan puro
const pl = DW.planSimbolos({ A: { y: ['A'] }, B: { y: ['B'], pausa: true } }, { A: { pausa: true }, B: { pausa: false }, C: { pausa: false }, D: { pausa: true } });
assert.deepEqual([pl.anadir, pl.pausar, pl.reactivar], [['C'], ['A'], ['B']]); assert(!pl.nuevo.D && pl.nuevo.A.pausa && !pl.nuevo.B.pausa && pl.nuevo.C.y[0] === 'C');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0);
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 390, height: 800 } }), pg = await ctx.newPage(), errs = []; let put = null;
  pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.route('https://api.github.com/**', r => { const q = r.request();
    if (q.method() === 'PUT') { put = JSON.parse(q.postData()); return r.fulfill({ status: 200, body: '{}' }); }
    if (/actions/.test(q.url())) return r.fulfill({ status: 204, body: '' });
    const raw = (q.headers().accept || '').includes('raw'); const body = JSON.stringify({ simbolos: { AAA: { y: ['AAA'] } } });
    r.fulfill({ status: 200, contentType: 'application/json', body: raw ? body : JSON.stringify({ sha: 'abc', content: Buffer.from(body).toString('base64') }) }); });
  await pg.goto('http://localhost:' + srv.address().port + '/');
  const t = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixture_TST.json')));
  await pg.evaluate(t => { localStorage.setItem('mc_gh_token', 'x'); const d = Store.get(); const f = tk => ({ ticker: tk, nombre: tk + ' Co', divisa: 'USD', anio_base: 2024, anios: t.anios, hist: t.hist, conf: {}, fuentes: [], notas: [], fecha_datos: '2026-01-01' });
    ['AAA', 'BBB', 'CCC'].forEach(k => { d.fichas[k] = f(k); d.cribado[k] = { ticker: k, nombre: k + ' Co', origen: 'ficha' }; });
    d.posiciones.push({ id: 'p1', ticker: 'AAA', empresa: 'AAA Co', cantidad: 1, precio_medio_compra: 10, moneda: 'USD' }); }, t);
  await pg.click('[data-tab=cribado]'); await pg.waitForTimeout(700);
  const x = await pg.textContent('#vista'); assert(x.includes('Fuera de cartera') && x.includes('En cartera'), x.slice(0, 300));
  assert(x.includes('Lista de precios por actualizar') && x.includes('BBB'), x.slice(0, 600));
  await pg.click('[data-c=simbolos]'); await pg.waitForTimeout(500);
  assert(put, 'no se escribió'); const nuevo = JSON.parse(Buffer.from(put.content, 'base64').toString()); assert(nuevo.simbolos.BBB && nuevo.simbolos.CCC && nuevo.simbolos.AAA, JSON.stringify(nuevo));
  assert.deepEqual(errs, []); console.log('simbolos_cribado ok'); await b.close(); srv.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
