/* Informes: los trimestrales del índice se muestran aparte y enlazan con la revisión de Resultados. */
const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0);
(async () => {
  const b = await chromium.launch(), pg = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.goto('http://localhost:' + srv.address().port + '/');
  await pg.evaluate(() => { Store.get().informes = { generado: '2026-11-12T10:00:00', avisos: [], empresas: [{ nombre: 'Technogym', carpeta: 'Technogym annual report', ticker: 'TGYM.MI', ultimo_anio: 2025, documentos: [{ anio: 2025, archivo: 'Technogym_AR_2025.pdf', tipo: 'AR', kb: 900 }], trimestrales: [{ periodo: 'T3 2026', anio: 2026, archivo: 'presentation-3Q-months-2026-revenues.pdf', tipo: 'TRIM', kb: 12000 }], csv: null, datos: null }] }; Store.save(); });
  await pg.click('[data-tab=informes]'); await pg.waitForTimeout(200);
  const vv = await pg.textContent('#vista'); assert(/trimestral T3 2026/.test(vv), vv.slice(0, 400));
  await pg.click('[data-inf="0"]'); await pg.waitForSelector('[data-trim]');
  const t = await pg.textContent('#dlg'); assert(/Resultados trimestrales/.test(t) && /T3 2026/.test(t) && /último|Informes anuales/.test(t));
  await pg.click('[data-trim="T3 2026"]'); await pg.waitForTimeout(300);
  const r = await pg.evaluate(() => Store.get().resultados.filter(x => x.tk === 'TGYM').map(x => x.periodo));
  assert.deepEqual(r, ['T3 2026']); assert(/TGYM|Technogym|T3 2026/.test(await pg.textContent('#dlg')));
  assert.deepEqual(errs, []); console.log('informes_trimestrales ok'); await b.close(); srv.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
