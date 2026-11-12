const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0);
(async () => {
  const b = await chromium.launch(), pg = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.goto('http://localhost:' + srv.address().port + '/');
  await pg.evaluate(() => { const d = Store.get(), A = [1, 2, 3, 4, 5, 6], m = {}; ['Ventas', 'Beneficio operativo (EBIT)', 'Beneficio neto', 'BPA diluido', 'Deuda neta / EBITDA', 'FCF / acción'].forEach(k => { m[k] = A.slice(); });
    d.fichas.FTDR = { ticker: 'FTDR', nombre: 'Frontdoor', divisa: 'USD', anio_base: 2025, anios: [2020, 2021, 2022, 2023, 2024, 2025], _borrador: true, conf: {}, fuentes: [], notas: [], hist: { ventas: A, ebit: A, ni_reportado: A, acciones: A, bpa: A } };
    d.informes = { generado: '2026-11-12T10:00:00', avisos: [], empresas: [{ nombre: 'Frontdoor', carpeta: 'Frontdoor', tk: 'FTDR', ultimo_anio: 2025, documentos: [], csv: 'f.csv', datos: { divisa: 'USD', anios: [2020, 2021, 2022, 2023, 2024, 2025], metricas: m } }] }; Store.save(); });
  await pg.click('[data-tab=informes]'); await pg.waitForTimeout(150); await pg.click('[data-inf="0"]'); await pg.click('#inf-ia'); await pg.waitForTimeout(200);
  const t = await pg.textContent('#dlg');
  assert(/informes están al día/.test(t) && /no puede estar publicado/.test(t) && /intereses/.test(t) && /Ir a la ficha/.test(t), t.slice(0, 400));
  assert.equal(await pg.locator('#ia-p').count(), 0, 'no se genera mensaje vacío');
  await pg.click('#ia-ir'); await pg.waitForTimeout(200); assert((await pg.textContent('#vista')).includes('Ficha incompleta') || (await pg.textContent('#vista')).includes('FTDR'), 'abre la ficha');
  assert.deepEqual(errs, []); console.log('completar_ia_al_dia ok'); await b.close(); srv.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
