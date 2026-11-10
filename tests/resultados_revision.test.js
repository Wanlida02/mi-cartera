/* Revisión de resultados frente a la valoración: SEC (EE. UU.), cifras de IA (resto), avisos en Inicio/Valoración/Cartera. Uso: node tests/resultados_revision.test.js datos.json */
const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0, async () => {
  const b = await chromium.launch(), pg = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && !/404/.test(m.text()) && errs.push(m.text())); pg.on('dialog', d => d.accept());
  await pg.goto('http://localhost:' + srv.address().port + '/');
  await pg.click('#btn-ajustes'); await pg.setInputFiles('#a-imp', process.argv[2]); await pg.waitForTimeout(600);
  await pg.click('[data-tab=resultados]'); await pg.waitForTimeout(800);
  // 1) resumen de todas las pendientes: publicó + veredicto
  const res = await pg.evaluate(() => { const U = window.UI, d = Store.get(); return d.resultados.filter(r => r.estado !== 'revisado').map(r => { const f = d.fichas[r.tk]; let v = null; try { v = U._resultados.revDe(r); } catch (e) { v = { error: e.message }; } return { tk: r.tk, per: r.periodo, pub: U._resultados.publico(r), v: v ? (v.error ? 'ERR ' + v.error : v.veredicto + ' ' + (v.antes * 100).toFixed(1) + '→' + (v.despues * 100).toFixed(1) + ' dEbit ' + (v.desvEbit == null ? '-' : (v.desvEbit * 100).toFixed(0)) + ' dVen ' + (v.desvVentas * 100).toFixed(0)) : null }; }); });
  console.log(res.filter(x => x.pub || x.v).map(x => x.tk + ' ' + x.per + ' pub=' + x.pub + ' ' + x.v).join('\n'));
  assert(!res.some(x => x.v && /^ERR/.test(x.v)), 'errores en revision');
  // 2) abrir una que ya publicó: ficha de cifras
  const pub = res.find(x => x.pub && x.v); assert(pub, 'ninguna publicada con veredicto');
  await pg.evaluate(tk => { const r = Store.get().resultados.find(r => r.tk === tk && r.estado !== 'revisado'); document.querySelector('[data-r=rev][data-id="' + r.id + '"]').click(); }, pub.tk);
  let t = await pg.textContent('#dlg'); assert(/Últimos 12 meses hasta/.test(t) && /Rentab\. esperada antes/.test(t) && /Después/.test(t), t.slice(0, 400)); console.log('--- dialogo ' + pub.tk + ':\n' + t.slice(0, 700));
  await pg.selectOption('#r-d', 'mantener'); await pg.click('#r-ok'); await pg.waitForTimeout(200);
  const snap = await pg.evaluate(tk => (Store.get().resultados.find(r => r.tk === tk && r.estado === 'revisado') || {}).snap, pub.tk); assert(snap && snap.antes != null && snap.veredicto, 'snap ' + JSON.stringify(snap));
  // 3) empresa europea: prompt + pegar JSON de IA
  const eu = await pg.evaluate(() => { const d = Store.get(); return Object.keys(d.fichas).find(k => d.fichas[k].divisa !== 'USD' && d.resultados.some(r => r.tk === k && r.estado !== 'revisado')); }); assert(eu, 'sin europea con fecha');
  const base = await pg.evaluate(tk => { const f = Store.get().fichas[tk], h = f.hist, n = h.ventas.length - 1; return { v: h.ventas[n], e: h.ebit[n] - ((h.extra || [])[n] || 0), anio: f.anio_base }; }, eu);
  await pg.evaluate(tk => document.querySelector('[data-r=rev][data-id="' + Store.get().resultados.find(r => r.tk === tk && r.estado !== 'revisado').id + '"]').click(), eu);
  assert(/Cifras con una IA/.test(await pg.textContent('#dlg'))); await pg.click('#r-ia');
  const prompt = await pg.inputValue('#ia-p'); assert(/ÚLTIMOS 5 TRIMESTRES/.test(prompt) && /TEXTO COPIADO/.test(prompt) && /NO sumes/.test(prompt) && /JSON/.test(prompt) && prompt.includes(String(base.anio)), prompt.slice(0, 300));
  await pg.selectOption('#ia-modo', 'nav'); const pn = await pg.inputValue('#ia-p'); assert(/PASO 1/.test(pn) && /sin_navegacion/.test(pn) && /p=quarterly/.test(pn) && /frequency=quarterly/.test(pn), pn.slice(0, 600)); await pg.selectOption('#ia-modo', 'pegar');
  await pg.fill('#ia-r', 'Aquí tienes:\n```json\n' + JSON.stringify({ periodo: 'T3 2026', fin: '2026-09-30', ventas_12m: base.v * 1.04, ebit_12m: base.e * 0.80, ni_12m: null, deuda_neta: null, acciones: null, contraste: [{ fuente: 'nota', ventas_12m: base.v * 1.04, ebit_12m: base.e * 0.80 }, { fuente: 'Yahoo', ventas_12m: base.v * 1.10, ebit_12m: base.e * 0.80 }], guidance: 'Mantiene', resumen: 'Ventas algo por encima, margen a la baja.', fiabilidad: 'media', fuentes: ['ir.test/resultados'] }) + '\n```'); await pg.click('#ia-ok'); await pg.waitForTimeout(300);
  t = await pg.textContent('#dlg'); assert(/Las fuentes no coinciden en ventas/.test(t), 'contraste: ' + t.slice(0, 300));
  assert(/IA/.test(t) && /Real/.test(t) && /Esperado/.test(t) && /Resumen de la IA/.test(t), t.slice(0, 500)); console.log('--- dialogo IA ' + eu + ':\n' + t.slice(0, 600));
  // formato nuevo: la IA copia trimestres y la app suma; una IA sin navegación avisa
  await pg.click('#r-ia'); await pg.fill('#ia-r', '{"error":"sin_navegacion"}'); await pg.click('#ia-ok'); assert(/no puede abrir páginas/.test(await pg.textContent('#ia-err')));
  const q = (fin, f) => ({ fin, ventas: base.v / 4 * f, ebit: base.e / 4 * 0.9 }), tri = [q('2026-09-30', 1.05), q('2026-06-30', 1.04), q('2026-03-31', 1.03), q('2025-12-31', 1.02), q('2025-09-30', 1.0)];
  await pg.fill('#ia-r', '```json\n' + JSON.stringify({ trimestres: tri, por_fuente: { StockAnalysis: tri, Yahoo: tri.map(x => ({ fin: x.fin, ventas: x.ventas * 1.08, ebit: x.ebit })) }, resumen: 'ok', fiabilidad: 'media' }) + '\n```'); await pg.click('#ia-ok'); await pg.waitForTimeout(300);
  const dc = await pg.evaluate(tk => Store.get().resultados.find(r => r.tk === tk && r.estado !== 'revisado').doce, eu); const suma = base.v / 4 * (1.05 + 1.04 + 1.03 + 1.02);
  assert(Math.abs(dc.ventas - suma) < 1e-6 && dc.fin === '2026-09-30', JSON.stringify(dc)); t = await pg.textContent('#dlg'); assert(/Trimestres sumados por la app/.test(t) && /Las fuentes no coinciden en ventas/.test(t), t.slice(0, 500));
  // trimestres no consecutivos
  await pg.click('#r-ia'); await pg.fill('#ia-r', JSON.stringify({ trimestres: [q('2026-09-30', 1), q('2026-06-30', 1), q('2025-12-31', 1), q('2025-09-30', 1)] })); await pg.click('#ia-ok'); assert(/no son consecutivos/.test(await pg.textContent('#ia-err'))); await pg.click('#ia-vuelve'); await pg.waitForTimeout(100);
  // JSON malo
  await pg.click('#r-ia'); await pg.fill('#ia-r', 'no sé'); await pg.click('#ia-ok'); assert(/No encuentro el JSON/.test(await pg.textContent('#ia-err'))); await pg.click('#ia-vuelve'); await pg.waitForTimeout(100);
  // 4) cifras IA alimentan la ficha de Valoración y la etiqueta
  await pg.click('#r-ok'); await pg.waitForTimeout(200);
  await pg.evaluate(tk => window.UI.abrirFicha(tk), eu); await pg.waitForTimeout(300);
  t = await pg.textContent('#vista'); assert(/IA, sin verificar/.test(t) && /Revisiones de resultados/.test(t), 'ficha: ' + t.slice(0, 300));
  // 5) avisos: Inicio y alerta de precio
  await pg.evaluate(([x, y]) => { const d = Store.get(), k = Object.keys(d.fichas).find(k => k !== x && k !== y && d.posiciones.some(p => Logic.tickerDe(d, p) === k) && !d.resultados.some(r => r.tk === k)); d.resultados.push({ id: 'rx', tk: k, periodo: 'T3 2026', fecha: new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10), estado: 'pendiente', precio_ref: Logic.precioFicha(d, k).precio / 1.4, precio_fecha: '2026-08-01' }); Store.save(); window.__k = k; }, [pub.tk, eu]);
  await pg.click('[data-tab=inicio]'); await pg.waitForTimeout(300); t = await pg.textContent('#vista'); assert(/Resultados.*esta semana/.test(t) && /en 2 d/.test(t) && /ha cambiado el motivo|¿hay motivo\?/.test(t), t.slice(0, 600));
  await pg.click('[data-tab=cartera]'); await pg.waitForTimeout(200); assert(/publica en 2 d|desde la revisión/.test(await pg.textContent('#vista')));
  assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); assert.deepEqual(errs, []); console.log('resultados_revision ok'); await b.close(); srv.close();
});
