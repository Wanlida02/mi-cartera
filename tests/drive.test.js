/* Prueba de sincronización con un Google Drive simulado: dos dispositivos (móvil y PC) comparten un archivo. */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..'), datos = fs.readFileSync(process.argv[2], 'utf8');
const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', webmanifest: 'application/json', png: 'image/png', svg: 'image/svg+xml' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0);
const STUB = `window.google={accounts:{oauth2:{initTokenClient:c=>({requestAccessToken:()=>setTimeout(()=>c.callback({access_token:'tok',expires_in:3600}),10)}),revoke:(t,f)=>f&&f()}}};`;
let file = null; const log = [];   // Drive simulado
async function equipo(browser, nombre) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } }), pg = await ctx.newPage();
  pg.on('pageerror', e => console.log('ERR', nombre, e.message));
  await ctx.route('https://accounts.google.com/gsi/client', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await ctx.route('https://www.googleapis.com/**', async r => {
    const q = r.request(), u = new URL(q.url()), m = q.method(); log.push(nombre + ' ' + m + ' ' + u.pathname);
    const json = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify(o) });
    if (m === 'GET' && u.pathname === '/drive/v3/files' && /informes/.test(u.searchParams.get('q') || '')) return json({ files: inf ? [{ id: 'F2', modifiedTime: new Date().toISOString() }] : [] });
    if (m === 'GET' && u.pathname === '/drive/v3/files/F2') return r.fulfill({ contentType: 'application/json', body: inf });
    if (m === 'GET' && u.pathname === '/drive/v3/files') return json({ files: file ? [{ id: 'F1', modifiedTime: new Date().toISOString() }] : [] });
    if (m === 'GET') return r.fulfill({ contentType: 'application/json', body: file });
    if (m === 'PATCH') { file = q.postData(); return json({ id: 'F1' }); }
    if (m === 'POST') { file = q.postData().split('\r\n\r\n')[2].replace(/\r\n--[^\r\n]*--\s*$/, ''); return json({ id: 'F1' }); }
    r.continue();
  });
  await pg.goto('http://localhost:' + srv.address().port + '/'); return pg;
}
let inf = null;
const espera = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch(), movil = await equipo(b, 'movil'), pc = await equipo(b, 'pc');
  // 1) el móvil importa y conecta → se crea el archivo
  await movil.evaluate(t => { Store.importar(t); }, datos); await movil.reload();
  await movil.click('#btn-ajustes'); await movil.click('#dr-on'); await espera(600);
  assert(file, 'se creó el archivo en Drive'); assert.equal(JSON.parse(file).posiciones.length, 33);
  console.log('1 ok · estado móvil:', await movil.getAttribute('#btn-sync', 'class'));
  // 2) el PC conecta vacío → baja los datos
  await pc.click('#btn-ajustes'); await pc.click('#dr-on'); await espera(800);
  assert.equal(await pc.evaluate(() => Store.get().posiciones.length), 33); console.log('2 ok · PC recibe 33 posiciones');
  // 3) el móvil registra una compra → sube; el PC al sincronizar la ve
  await movil.evaluate(() => { Logic.compra(Store.get(), { empresa: 'Prueba SA', broker: 'XTB', cantidad: 3, precio: 10, moneda: 'EUR' }); Store.save(); });
  await espera(3500); assert.equal(JSON.parse(file).posiciones.length, 34); console.log('3 ok · compra del móvil subida');
  await pc.click('#btn-ajustes'); await pc.click('#dr-now'); await espera(800);
  assert.equal(await pc.evaluate(() => Store.get().posiciones.length), 34); console.log('3b ok · PC la recibe');
  // 4) conflicto: los dos cambian a la vez → el segundo en subir debe preguntar, no pisar
  await pc.evaluate(() => { Logic.compra(Store.get(), { empresa: 'Solo PC', broker: 'XTB', cantidad: 1, precio: 5, moneda: 'EUR' }); Store.save(); });
  await espera(3500);   // el PC sube primero; el móvil aún no lo sabe
  await movil.evaluate(() => { Logic.compra(Store.get(), { empresa: 'Solo movil', broker: 'XTB', cantidad: 1, precio: 5, moneda: 'EUR' }); Store.save(); });
  await espera(4000);
  const hayDlg = await Promise.all([movil, pc].map(p => p.evaluate(() => document.querySelector('#dlg').open && document.querySelector('#dlg').textContent.includes('Datos distintos'))));
  console.log('4 conflicto detectado en [móvil, PC]:', hayDlg); assert(hayDlg.some(Boolean), 'debe preguntar');
  const quien = hayDlg[0] ? movil : pc; await quien.click('#k-d'); await espera(500);
  console.log('4 ok · tras elegir Drive:', await quien.evaluate(() => Store.get().posiciones.length), 'posiciones');
  // 5) precios automáticos no cuentan como edición
  const u0 = await pc.evaluate(() => Store.get().updatedAt); await pc.evaluate(() => Store.cargarPreciosAuto()); assert.equal(await pc.evaluate(() => Store.get().updatedAt), u0); console.log('5 ok');
  // 6) el índice de informes subido desde el PC (script) llega a la app sin tocar nada
  inf = JSON.stringify({ version: 1, generado: '2026-10-27T17:00:00', empresas: [{ nombre: 'Linde', carpeta: 'x', ticker: 'LIN', documentos: [], datos: null }] });
  const u1 = await pc.evaluate(() => Store.get().updatedAt); await pc.click('#btn-ajustes'); await pc.click('#dr-now'); await espera(900);
  assert.equal(await pc.evaluate(() => Store.get().informes && Store.get().informes.empresas[0].nombre), 'Linde'); assert.equal(await pc.evaluate(() => Store.get().updatedAt), u1, 'no cuenta como edición'); console.log('6 ok');
  console.log(log.length, 'llamadas a Drive simuladas'); await b.close(); srv.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
