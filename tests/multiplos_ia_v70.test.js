/* v70: Múltiplos de salida — pegar la respuesta de la IA rellena las medianas; se guardan con su fuente. Uso: node tests/multiplos_ia_v70.test.js */
const assert = require('assert'), { chromium, devices } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const L = require('../js/logic.js');
/* ── Lógica ── */
{
  const r = L.multiplosDeIA('Te dejo la tabla y el JSON:\n```json\n{"anios":[2016,2017,2018,2019,2020,2021,2022,2023,2024,2025],"per":[14.2,16.1,null,18.5,22.0,15.3,-5,12.8,13.9,14.4],"pfcf":["18,2",20.1,17.4,19,null,25,16,15.2,14.8,17.7],"ev_ebitda":[8.1,8.9,9.4,10.2,11.5,8.7,7.2,7.9,8.3,8.6],"ev_ebit":[11,12.5,13.1,14.4,17.9,12,9.8,10.9,11.6,12.1],"fuentes":["https://a.com/x","sin enlace"],"dudas":["2022 con pérdidas"]}\n```\nEspero que sirva.');
  assert.equal(r.mult.per.mediana, 14.9); assert.equal(r.mult.per.n, 8); assert.equal(r.mult.per.descartados, 1, 'el PER negativo se descarta');
  assert.equal(r.mult.pfcf.mediana, 17.7, 'acepta «18,2» con coma'); assert.equal(r.mult.ev_ebitda.mediana, 8.6); assert.equal(r.mult.ev_ebit.mediana, 12.1);
  assert.deepEqual(r.fuentes, ['https://a.com/x']); assert.deepEqual(r.dudas, ['2022 con pérdidas']);
  assert.equal(L.multiplosDeIA('{"multiplos":{"PER":17.5,"EV/EBITDA":"9,2x"}}').mult.ev_ebitda.mediana, 9.2, 'medianas sueltas y claves con barra');
  const t = L.multiplosDeIA('Resumen:\nPER mediana: 18,4x\nEV/EBITDA (mediana) 9.1x\nEV/EBIT mediana 12x\nP/FCF mediana: 16').mult;
  assert.deepEqual([t.per.mediana, t.pfcf.mediana, t.ev_ebitda.mediana, t.ev_ebit.mediana], [18.4, 16, 9.1, 12], 'texto sin JSON');
  assert.throws(() => L.multiplosDeIA('no hay nada'), /No encuentro los múltiplos/);
  assert.equal(L.extraerJSON('x {"datos":{"a":1}} y').datos.a, 1, 'extraerJSON sigue igual');
}
console.log('lógica ok');
/* ── Navegador (móvil) ── */
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const RESP = 'Aquí están los múltiplos de Vidrala:\n\n| Año | PER |\n|---|---|\n| 2024 | 13,9 |\n\n```json\n{"anios":[2019,2020,2021,2022,2023,2024],"per":[18.5,22.0,15.3,null,12.8,13.9],"pfcf":[19,null,25,16,15.2,14.8],"ev_ebitda":[10.2,11.5,8.7,7.2,7.9,8.3],"ev_ebit":[14.4,17.9,12,9.8,10.9,11.6],"fuentes":["https://www.vidrala.com/es/inversores"],"dudas":["2022 sin PER fiable"]}\n```';
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0, async () => {
  const b = await chromium.launch(), ctx = await b.newContext(devices['iPhone 13']), pg = await ctx.newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); await ctx.route(/api\.github\.com|accounts\.google\.com/, r => r.abort());
  try {
    await pg.goto('http://localhost:' + srv.address().port + '/'); await pg.waitForTimeout(300);
    const tst = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture_TST.json')));
    await pg.evaluate(f => { Store.get().fichas.VID = Object.assign(f, { nombre: 'Vidrala', estado: 'watchlist' }); Store.save(); UI.multGuia('VID'); }, tst);
    /* Pegar texto que no sirve: mensaje claro */
    await pg.fill('#mg-r', 'no tengo datos'); assert(/No encuentro los múltiplos/.test(await pg.textContent('#mg-res')));
    /* Pegar la respuesta: rellena las cuatro casillas con las medianas */
    await pg.fill('#mg-r', RESP);
    const v = await pg.evaluate(() => ['per', 'pfcf', 'ev_ebitda', 'ev_ebit'].map(k => document.getElementById('mg-' + k).value));
    assert.deepEqual(v, ['15,3', '16', '8,5', '11,8'], v.join(' '));
    const res = await pg.textContent('#mg-res');
    assert(/6 ejercicios \(2019–2024\) · 1 fuente/.test(res), res); assert(/PER 15,3x/.test(res) && /5 años · 12,8–22,0/.test(res), res); assert(/2022 sin PER fiable/.test(res));
    assert.equal(await pg.locator('input.mg-auto').count(), 4, 'marcadas como rellenadas');
    await pg.fill('#mg-ev_ebit', '11'); assert.equal(await pg.locator('input.mg-auto').count(), 3, 'al tocarla deja de estar marcada');
    /* Guardar */
    await pg.click('#mg-ok'); await pg.waitForTimeout(150);
    const f = await pg.evaluate(() => Store.get().fichas.VID);
    assert.deepEqual(f.mult_hist, { per: 15.3, pfcf: 16, ev_ebitda: 8.5, ev_ebit: 11 });
    assert(/medianas de una IA \(2019–2024\)/.test(f.mult_hist_manual.fuente), f.mult_hist_manual.fuente); assert.deepEqual(f.mult_hist_manual.fuentes, ['https://www.vidrala.com/es/inversores']);
    /* Aspecto en el móvil: los botones de abajo se ven; sin desbordar a lo ancho */
    await pg.evaluate(() => UI.multGuia('VID'));
    const m = await pg.evaluate(() => ({ pie: document.querySelector('.aj-pie').getBoundingClientRect().bottom <= innerHeight, ancho: document.querySelector('.dlg-in').scrollWidth > document.querySelector('.dlg-in').clientWidth, pasos: document.querySelectorAll('.paso').length, prompt: getComputedStyle(document.getElementById('mg-p')).display !== 'none' && document.querySelector('.mg-txt').open }));
    assert(m.pie && !m.ancho && m.pasos === 3 && !m.prompt, JSON.stringify(m));
    assert.equal(await pg.inputValue('#mg-per'), '15,3', 'al volver muestra lo guardado');
    /* «Pegar respuesta» lee el portapapeles y rellena igual */
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    await pg.evaluate(t => navigator.clipboard.writeText(t), RESP.replace('"ev_ebitda":[10.2', '"ev_ebitda":[12.2'));
    await pg.click('#mg-pg'); await pg.waitForTimeout(200);
    assert.equal(await pg.inputValue('#mg-ev_ebitda'), '8,5', 'medianas desde el portapapeles'); assert(/Rellenado/.test(await pg.textContent('#mg-res')));
    assert.deepEqual(errs, []);
    console.log('multiplos ia v70 ok');
  } catch (e) { console.error('FALLO', e.message); process.exitCode = 1; }
  await b.close(); srv.close();
});
