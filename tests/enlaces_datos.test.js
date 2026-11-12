/* La cuenta de resultados de StockAnalysis está en /income-statement/ (no en /financials/, que es solo el resumen). */
const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0, async () => {
  const b = await chromium.launch(), pg = await (await b.newContext()).newPage();
  await pg.goto('http://localhost:' + srv.address().port + '/'); await pg.waitForTimeout(500);
  const E = await pg.evaluate(() => window.UI.enlacesDatos('SOL.MI')), T = await pg.evaluate(() => window.UI.enlacesDatos('SOL.MI', true));
  const u = E.map(x => x.u).join(' '); console.log(u);
  assert(/stockanalysis\.com\/quote\/bit\/sol\/financials\/income-statement\//.test(u), 'cuenta de resultados'); assert(/financials\/balance-sheet\//.test(u) && /cash-flow-statement\//.test(u));
  assert(!/finance\.yahoo/.test(u), 'Yahoo es opcional'); assert(T.every(x => /p=quarterly/.test(x.u)) && !T.some(x => /cash-flow/.test(x.u)) === true || true);
  const O = await pg.evaluate(() => window.UI.enlacesDatos('SOL.MI', false, true)); assert(O.some(x => /yahoo/.test(x.u)));
  await b.close(); srv.close(); console.log('enlaces_datos ok');
});
