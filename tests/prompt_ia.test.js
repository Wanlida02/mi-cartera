const assert = require('assert'), { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0);
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 390, height: 800 } }), pg = await ctx.newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.route('https://api.github.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"simbolos":{}}' }));
  await pg.goto('http://localhost:' + srv.address().port + '/');
  await pg.evaluate(() => { const d = Store.get(); d.cribado.VID = { ticker: 'VID', nombre: 'Vidrala', origen: 'manual' }; });
  await pg.click('[data-tab=cribado]'); await pg.evaluate(() => document.querySelectorAll('details').forEach(x => x.open = true)); await pg.click('[data-c=abrir][data-k=VID]'); await pg.click('[data-c=ia]'); await pg.click('#cr-cp'); await pg.waitForTimeout(300);
  const txt = await pg.evaluate(async () => { const v = document.querySelector('#cr-json').value; return v || await navigator.clipboard.readText().catch(() => ''); });
  const dlg = await pg.textContent('#dlg'); assert(/búsqueda en internet/.test(dlg), dlg.slice(0, 300));
  const p = await pg.evaluate(() => Cribado.prompt('VID', '', null)); assert(/Yahoo Finance/.test(p) && /MarketScreener/.test(p) && !/responde con tu mejor conocimiento/.test(p) && !/mejor estimación aproximada/.test(p));
  if (txt) assert(/Yahoo Finance/.test(txt) && /Vidrala|VID/.test(txt));
  assert.deepEqual(errs, []); console.log('prompt_ia ok', txt ? '(texto copiado verificado)' : '(portapapeles no accesible; prompt verificado por función)'); await b.close(); srv.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
