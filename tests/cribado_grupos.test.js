const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0);
(async () => {
  const b = await chromium.launch(), pg = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.goto('http://localhost:' + srv.address().port + '/');
  const t = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixture_TST.json')));
  await pg.evaluate(t => { const d = Store.get(); const f = tk => ({ ticker: tk, nombre: tk + ' Co', divisa: 'USD', anio_base: 2024, anios: t.anios, hist: t.hist, conf: {}, fuentes: [], notas: [], fecha_datos: '2026-01-01' });
    d.fichas.AAA = f('AAA'); d.fichas.BBB = f('BBB'); d.posiciones.push({ id: 'p1', ticker: 'AAA', nombre: 'AAA Co', cantidad: 1, precio_medio: 10, divisa: 'USD' }); }, t);
  await pg.click('[data-tab=cribado]'); await pg.waitForTimeout(200);
  let x = await pg.textContent('#vista'); assert(x.includes('Candidatas por cribar (1)') && x.includes('En cartera · ya analizadas'), x.slice(0, 400));
  await pg.click('[data-c=cribartodas]'); await pg.waitForTimeout(300);
  const r = await pg.evaluate(() => Object.keys(Store.get().cribado)); assert.deepEqual(r, ['BBB']);
  assert.deepEqual(errs, []); console.log('cribado_grupos ok'); await b.close(); srv.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
