/* Calendario de resultados: script (estimación SEC, lectura Nasdaq) + app (alta automática, actualización de estimadas, fechas con IA). Uso: node tests/calendario.test.js datos.json */
const assert = require('assert'), { fechas202, estimar, leerNasdaq } = require('../scripts/calendario.js');
const sub = { filings: { recent: { form: ['8-K', '10-Q', '8-K', '8-K', '8-K'], items: ['2.02,9.01', '', '5.02', '2.02,9.01', '7.01'], filingDate: ['2026-11-05', '2026-11-05', '2026-10-01', '2026-08-06', '2026-07-01'] } } };
assert.deepEqual(fechas202(sub), ['2026-08-06', '2026-11-05']);
assert.equal(estimar(['2025-11-06', '2026-02-05', '2026-05-07', '2026-08-06', '2026-11-05'], '2026-11-16'), '2027-02-04');   // +364 d de la de feb-2026
assert.equal(estimar(['2026-11-05'], '2026-11-16'), null);
assert.equal(leerNasdaq({ data: { reportText: 'Earnings announcement* for AAPL: Jan 29, 2027' } }), '2027-01-29');
assert.equal(leerNasdaq({ data: {} }), null);
if (!process.argv[2]) { console.log('calendario (script) ok'); process.exit(0); }
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0, async () => {
  const b = await chromium.launch(), pg = await (await b.newContext()).newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '' }));
  await pg.goto('http://localhost:' + srv.address().port + '/'); await pg.click('#btn-ajustes'); await pg.setInputFiles('#a-imp', process.argv[2]); await pg.waitForTimeout(800);
  const r = await pg.evaluate(async () => {
    const d = Store.get(), U = UI._resultados, hoy = Logic.today(), mas = n => new Date(Date.parse(hoy) + n * 864e5).toISOString().slice(0, 10);
    const ks = Object.keys(d.fichas).filter(k => d.fichas[k].estado !== 'candidata' || d.posiciones.some(p => Logic.tickerDe(d, p) === k)); const [a, b2, c] = ks;
    d.resultados = d.resultados.filter(x => ![a, b2, c].includes(x.tk));
    d.resultados.push({ id: 'x1', tk: b2, periodo: 'T4 2026', fecha: mas(10), estimada: true, estado: 'pendiente' });      // estimada → se actualiza
    d.resultados.push({ id: 'x2', tk: c, periodo: 'T4 2026', fecha: mas(20), estado: 'pendiente' });                         // a mano → no se toca
    window.__cal = { fechas: { [a]: { fecha: mas(30), confirmada: false }, [b2]: { fecha: mas(40), confirmada: true }, [c]: { fecha: mas(50), confirmada: false } } };
    const f0 = window.fetch; window.fetch = (u, o) => /calendario_resultados/.test(String(u)) ? Promise.resolve(new Response(JSON.stringify(window.__cal))) : f0(u, o);
    UI.irA('resultados'); await new Promise(r => setTimeout(r, 700));
    const R = x => Store.get().resultados.filter(y => y.tk === x && y.estado !== 'revisado');
    const out = { alta: R(a).map(y => [y.fecha, y.estimada]), act: R(b2).map(y => [y.fecha, y.estimada]), mano: R(c).map(y => [y.fecha, y.estimada]), n: R(a).length };
    out.p = U.parseFechasIA(JSON.stringify({ fechas: [{ tk: a.toLowerCase(), fecha: mas(60), periodo: 't4 2026', confirmada: true, fuente: 'https://x.com/ir' }, { tk: b2, fecha: mas(70), confirmada: true }, { tk: c, fecha: null }, { tk: 'ZZZ', fecha: mas(5) }, { tk: a, fecha: '2020-01-01' }, { tk: b2, fecha: 'mañana' }] }) + ' texto', [a, b2, c]);
    out.err = []; for (const t of ['nada', '{"x":1}', '{"fechas":[']) { try { U.parseFechasIA(t, [a]); out.err.push('sin error'); } catch (e) { out.err.push(e.message.slice(0, 20)); } }
    out.prompt = U.promptFechas([a, b2]).includes(a) && /JSON/.test(U.promptFechas([a]));
    return out;
  });
  assert.equal(r.n, 1, 'una sola alta'); assert.equal(r.alta[0][1], true); assert.equal(r.act[0][1], undefined, 'confirmada → sin estimada'); assert.equal(r.mano.length, 1); assert.notEqual(r.act[0][0], null);
  assert.equal(r.mano[0][1], undefined); assert.equal(r.p.ok.length, 2); assert.equal(r.p.ok[0].confirmada, true); assert.equal(r.p.ok[0].periodo, 'T4 2026'); assert.equal(r.p.ok[1].confirmada, false, 'sin URL no se da por confirmada'); assert.equal(r.p.rechazadas.length, 4, JSON.stringify(r.p.rechazadas));
  assert(r.err.every(e => e !== 'sin error'), JSON.stringify(r.err)); assert(r.prompt);
  // diálogo de la IA: se abre, anota y no deja errores
  await pg.evaluate(() => { window.__j = null; });
  await pg.click('[data-r="iafechas"]').catch(() => {}); await pg.waitForTimeout(300);
  assert(await pg.$('#fi-r'), 'diálogo de fechas con IA'); { const ks = await pg.evaluate(() => (document.querySelector('#fi-p').value.match(/^- ([^ ]+) ·/gm) || []).map(x => x.slice(2).split(' ')[0])); assert(ks.length > 0);
    await pg.fill('#fi-r', JSON.stringify({ fechas: [{ tk: ks[0], fecha: new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10), periodo: 'S1 2027', confirmada: false }] })); await pg.click('#fi-ok'); await pg.waitForTimeout(400);
    const ok = await pg.evaluate(k => Store.get().resultados.some(x => x.tk === k && x.periodo === 'S1 2027' && x.estimada && x.fuente_fecha === 'IA'), ks[0]); assert(ok, 'fecha de la IA anotada'); }
  assert.deepEqual(errs, []); console.log('calendario ok'); await b.close(); srv.close();
});
