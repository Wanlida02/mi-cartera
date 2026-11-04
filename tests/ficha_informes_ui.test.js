const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0);
(async () => {
  const b = await chromium.launch(), pg = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.goto('http://localhost:' + srv.address().port + '/');
  await pg.evaluate(() => { Store.get().informes = { generado: '2026-10-30T10:00:00', avisos: [], empresas: [{ nombre: 'Aena', carpeta: 'Aena annual report', tk: 'AENA', ident: null, ultimo_anio: 2025, documentos: [{ anio: 2025, archivo: 'Aena_2025.pdf', tipo: 'AR', kb: 900 }], csv: 'Aena_datos.csv',
    datos: { divisa: 'EUR', anios: [2020, 2021, 2022, 2023, 2024, 2025], metricas: { 'Ventas': [1700, 2500, 4200, 4800, 5100, 5400], 'Beneficio operativo (EBIT)': [-400, 500, 1500, 2000, 2200, 2400], 'Beneficio neto': [-300, 300, 1100, 1500, 1700, 2100], 'BPA diluido': [-0.02, 0.02, 0.07, 0.10, 0.11, 0.14], 'Deuda neta / EBITDA': [9, 5, 3, 2.5, 2, 1.7] } } }] }; });
  await pg.click('[data-tab=informes]'); await pg.waitForTimeout(200);
  await pg.click('[data-inf="0"]'); await pg.waitForSelector('#inf-ficha'); await pg.click('#inf-ficha'); await pg.waitForTimeout(300);
  const r = await pg.evaluate(() => { const d = Store.get(); return { f: !!d.fichas.AENA, c: d.cribado.AENA && d.cribado.AENA.deuda_neta_ebitda, m: d.cribado.AENA && d.cribado.AENA.margen_ebit }; });
  assert(r.f && r.c === 1.7 && r.m === 44.4, JSON.stringify(r));
  assert.deepEqual(errs, []); console.log('ficha_informes_ui ok'); await b.close(); srv.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
