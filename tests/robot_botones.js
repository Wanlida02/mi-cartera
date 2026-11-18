/* Robot de botones: pulsa cada botón de cada pestaña (y de las pantallas y ventanas que abre) partiendo siempre del mismo estado
   y avisa de los que no hacen nada, solo suben arriba o dan error. Lleva sus propios datos de prueba (no necesita datos personales).
   Tarda ~20 min (no está en tests/ejecutar.js). Uso: node tests/robot_botones.js [pestañas separadas por comas, p. ej. valoracion,cartera] */
const fs0 = require('fs'), os0 = require('os'), path0 = require('path');
function datosDePrueba() {
  const L = require('../js/logic.js'), tst = JSON.parse(fs0.readFileSync(path0.join(__dirname, 'fixture_TST.json'), 'utf8')), pr = require('../precios.json');
  const d = L.normalizar(null), tks = Object.keys(pr.precios).filter(k => !/@/.test(k)).slice(0, 14);
  tks.forEach((tk, i) => {
    const p = pr.precios[tk], div = p.divisa === 'GBp' ? 'GBP' : p.divisa, px = p.divisa === 'GBp' ? p.precio / 100 : p.precio;
    const f = JSON.parse(JSON.stringify(tst)); f.ticker = tk; f.nombre = 'Empresa ' + tk; f.divisa = div; f.estado = i < 10 ? 'cartera' : 'watchlist'; f.sector = ['Industria', 'Tecnología', 'Consumo'][i % 3];
    const k = px / 25; Object.keys(f.hist).forEach(h => { if (h !== 'acciones') f.hist[h] = f.hist[h].map(x => x * k * (0.6 + (i % 5) * 0.2)); });
    d.fichas[tk] = f;
    if (i < 10) L.compra(d, { empresa: f.nombre, ticker: tk, broker: i % 2 ? 'XTB' : 'IBKR', cantidad: 10 + i * 3, precio: px * (0.8 + (i % 4) * 0.12), moneda: div, sector: f.sector });
  });
  const hoy = Date.parse(L.today()); let v = 100000; for (let i = 120; i >= 1; i -= 3) { v *= 1 + Math.sin(i / 7) * 0.01; d.historico.push({ f: new Date(hoy - i * 864e5).toISOString().slice(0, 10), v: Math.round(v), c: 105000 }); }
  global.window = global; global.Logic = L; global.Store = { get: () => null };
  eval(fs0.readFileSync(path0.join(__dirname, '../js/datos-web.js'), 'utf8').replace('const DatosWeb', 'global.DatosWeb'));
  const nv = DatosWeb.aFicha(JSON.parse(fs0.readFileSync(path0.join(__dirname, '../datos/NVDA.json'), 'utf8')), L.today()); nv.estado = 'cartera'; d.fichas.NVDA = nv;
  d.posiciones.push({ empresa: 'NVIDIA', ticker: 'NVDA', broker: 'XTB', cantidad: 10, precio_medio_compra: 100, moneda: 'USD', sector: 'Tecnología' });
  d.fichas.VID = { nombre: 'Vidrala', divisa: 'EUR', estado: 'watchlist', sector: 'Envases', anios: [2020, 2021, 2022, 2023, 2024, 2025], anio_base: 2025, precio: 80, fecha_precio: L.today(), _borrador: true, hist: { ventas: [956, 1100, 1300, 1600, 1580, 1650], ebit: [170, 180, 150, 230, 280, 292], ni_reportado: [150, 140, 150, 230, 290, 210] } };
  L.aplicarBusqueda(d, 'VID', fs0.readFileSync(path0.join(__dirname, 'fixture_VID_busqueda.txt'), 'utf8'));
  const dia = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  d.resultados.push({ id: 'r1', tk: 'NVDA', periodo: 'T3 2026', fecha: dia(-2), estado: 'pendiente' }, { id: 'r2', tk: 'VID', periodo: 'FY 2025', fecha: dia(5), estado: 'pendiente' });
  d.cribado.NVDA = { ticker: 'NVDA', nombre: 'NVIDIA', divisa: 'USD' };
  d.informes = { generado: '2026-11-01T10:00:00', avisos: ['Aviso de prueba'], empresas: [{ nombre: 'NVIDIA', carpeta: 'NVIDIA', tk: 'NVDA', ultimo_anio: 2025, documentos: [{ anio: 2025, tipo: '10-K', archivo: 'nvda_2025.pdf', url: 'https://www.nvidia.com/a.pdf', kb: 2048 }], trimestrales: [{ periodo: 'T3 2026', archivo: 'q3.pdf', kb: 900 }], csv: 'nvda.csv' }, { nombre: 'Carpeta libre', carpeta: 'Libre', tk: '', ultimo_anio: 2024, documentos: [{ anio: 2024, tipo: 'AR' }] }] };
  d.otras = { accounts: [{ nombre: 'Depósito', saldo: 1000, moneda: 'EUR' }] };
  const p = path0.join(os0.tmpdir(), 'robot_datos_' + process.pid + '.json'); fs0.writeFileSync(p, JSON.stringify(d)); return p;
}
process.argv.splice(2, 0, path0.join(__dirname, '..'), datosDePrueba());   // raíz de la app y datos, como espera el robot
const { chromium, devices } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const root = process.argv[2], DATOS = fs.readFileSync(process.argv[3], 'utf8'), TABS = (process.argv[4] || 'inicio,cartera,cribado,valoracion,resultados,informes').split(',');
const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', webmanifest: 'application/json' };
const srv = http.createServer((q, r) => { const p = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html')); fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[p.split('.').pop()] || 'text/plain' }); r.end(b); } }); }).listen(0, run);
const CAND = 'button, [data-a], [data-v], [data-go], [data-pos], [data-inf], [data-rep], [data-evo], [data-undo], .row.click, a.btn, label.btn, a[href], [data-c], [data-k]';
async function run() {
  const b = await chromium.launch(), U = 'http://localhost:' + srv.address().port + '/', res = [];
  const ctx = await b.newContext(Object.assign({}, devices['iPhone 13'], { acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] }));
  await ctx.route(/api\.github\.com|accounts\.google\.com|googleapis/, r => r.abort());
  await ctx.addInitScript(d => {
    if (!sessionStorage.getItem('__robot')) { localStorage.clear(); localStorage.setItem('mi-cartera:datos:v1', d); sessionStorage.setItem('__robot', '1'); }
    window.__ev = []; const ev = x => window.__ev.push(x);
    try { const w = navigator.clipboard.writeText.bind(navigator.clipboard); navigator.clipboard.writeText = t => { ev('portapapeles'); return w(t).catch(() => {}); }; } catch (e) { }
    window.open = () => { ev('ventana'); return null; }; window.confirm = () => { ev('confirm'); return true; }; window.alert = () => ev('alert'); window.prompt = () => { ev('prompt'); return ''; };
    document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[href]'); if (a && /^https?:/.test(a.href) && a.origin !== location.origin) { e.preventDefault(); ev('enlace ' + a.hostname); } }, true);
  }, DATOS);
  const pg = await ctx.newPage(); let errs = [], dl = 0;
  pg.on('pageerror', e => errs.push(e.message)); pg.on('download', () => { dl++; });
  const fresco = async tab => {
    await pg.evaluate(() => sessionStorage.removeItem('__robot')).catch(() => {}); await pg.goto(U); await pg.waitForTimeout(500);
    await pg.evaluate(t => UI.irA(t), tab); await pg.waitForTimeout(250);
    await pg.evaluate(() => document.querySelectorAll('#vista details').forEach(d => { d.open = true; }));   // lo plegado también se prueba
    errs = []; dl = 0;
  };
  const firma = el => el.tagName.toLowerCase() + '|' + [...el.attributes].filter(a => /^data-|^id$/.test(a.name)).map(a => a.name + '=' + (/^data-(pos|inf|k|tk|i|undo)$/.test(a.name) ? '*' : a.value)).sort().join(',') + '|' + (el.textContent || '').trim().replace(/\d+/g, '#').slice(0, 40);
  const estado = () => pg.evaluate(() => { const v = document.getElementById('vista'), d = document.getElementById('dlg'), t = document.getElementById('toast');
    const h = s => { let x = 0; for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0; return x; };
    const n = x => x.replace(/ open=""| open(?=[ >])/g, '').replace(/ resalta/g, '');   // abrir/cerrar secciones (lo hace el propio robot) no cuenta como efecto
    return { v: h(n(v.innerHTML)), d: d.open ? h(n(d.innerHTML)) : 0, t: t.classList.contains('on') ? t.textContent : '', y: Math.round(scrollY), dy: d.open ? Math.round((d.querySelector('.dlg-in') || d).scrollTop) : 0, url: location.href, ev: window.__ev.length, foco: document.activeElement && (document.activeElement.id || document.activeElement.tagName) }; });
  const lista = scope => pg.evaluate(([sel, scope]) => { const R = document.querySelector(scope); if (!R) return []; return [...R.querySelectorAll(sel)].filter(el => { const r = el.getBoundingClientRect(); return (r.width > 0 || el.tagName === 'LABEL') && !el.closest('summary') && !(el.tagName === 'A' && !el.classList.contains('btn') && !el.hasAttribute('data-go')) && !el.matches('input,select,textarea,option'); })
    .filter((el, i, a) => !a.some(o => o !== el && o.contains(el) && o.matches('[data-pos],[data-inf],.row.click,[data-go]'))).map((el, i) => i); }, [CAND, scope]);
  const elem = (scope, i) => pg.evaluateHandle(([sel, scope, i]) => { const R = document.querySelector(scope); const all = [...R.querySelectorAll(sel)].filter(el => { const r = el.getBoundingClientRect(); return (r.width > 0 || el.tagName === 'LABEL') && !el.closest('summary') && !(el.tagName === 'A' && !el.classList.contains('btn') && !el.hasAttribute('data-go')) && !el.matches('input,select,textarea,option'); })
    .filter((el, k, a) => !a.some(o => o !== el && o.contains(el) && o.matches('[data-pos],[data-inf],.row.click,[data-go]'))); return all[i]; }, [CAND, scope, i]);
  const pulsar = async (h, ruta) => {
    const nombre = await h.evaluate(el => (el.textContent || el.getAttribute('aria-label') || el.title || '').trim().replace(/\s+/g, ' ').slice(0, 60) || el.outerHTML.slice(0, 60));
    await h.evaluate(el => el.scrollIntoView({ block: 'center' })).catch(() => {}); await pg.waitForTimeout(150);
    const e0 = await estado(), dl0 = dl;   // medido con el botón ya a la vista (como lo pulsaría una persona)
    try { await h.click({ timeout: 3000, force: true }); } catch (e) { return { ruta, nombre, r: 'NO SE PUEDE PULSAR: ' + e.message.split('\n')[0] }; }
    await pg.waitForTimeout(700);
    const e1 = await estado().catch(() => null), cambios = [];
    if (!e1) return { ruta, nombre, r: 'ok (navega)' };
    if (e1.v !== e0.v) cambios.push('pantalla'); if (e1.d !== e0.d) cambios.push('ventana'); if (e1.t && e1.t !== e0.t) cambios.push('aviso: ' + e1.t.slice(0, 50)); if (e1.y !== e0.y || e1.dy !== e0.dy) cambios.push('desplaza');
    if (e1.url !== e0.url) cambios.push('url'); if (e1.ev > e0.ev) cambios.push((await pg.evaluate(n => window.__ev.slice(n).join('+'), e0.ev))); if (dl > dl0) cambios.push('descarga'); if (e1.foco !== e0.foco && /INPUT|TEXTAREA|SELECT/.test(e1.foco)) cambios.push('foco');
    const err = errs.splice(0);
    if (!err.length && cambios.length === 1 && cambios[0] === 'desplaza' && e1.y === 0 && e1.dy === 0) return { ruta, nombre, r: 'SOLO SUBE ARRIBA (no lleva a nada)' };
    return { ruta, nombre, r: err.length ? 'ERROR: ' + err.join(' | ') : cambios.length ? 'ok (' + cambios.join(', ') + ')' : 'SIN EFECTO', dbg: cambios.length ? undefined : { e0, e1 } };
  };
  for (const tab of TABS) {
    await fresco(tab); const vistos = new Map(), vistosG = new Set(), idx = await lista('#vista');
    const firmas = []; for (const i of idx) { const h = await elem('#vista', i); firmas.push(h ? await h.evaluate(new Function('el', 'return (' + firma.toString() + ')(el)')) : null); }
    for (let n = 0; n < idx.length; n++) {
      const f = firmas[n]; if (!f) continue; const c = vistos.get(f) || 0; if (c >= 1) continue; vistos.set(f, c + 1);   // una muestra de cada tipo de botón
      await fresco(tab); const h = await elem('#vista', idx[n]); if (!h || !(await h.evaluate(el => !!el))) { res.push({ ruta: tab, nombre: f, r: 'desaparece al recargar' }); continue; }
      const x = await pulsar(h, tab); res.push(x);
      if (/pantalla/.test(x.r) && !/ventana/.test(x.r)) {   // lleva a otra pantalla (p. ej. la ficha): se prueban sus botones nuevos
        await pg.evaluate(() => document.querySelectorAll('#vista details').forEach(d => { d.open = true; }));
        const sub = await lista('#vista'); const fs2 = []; for (const j of sub) { const hh = await elem('#vista', j); fs2.push(hh ? await hh.evaluate(new Function('el', 'return (' + firma.toString() + ')(el)')) : null); }
        for (let m = 0; m < sub.length; m++) {
          const f2 = fs2[m]; if (!f2 || vistosG.has(f2)) continue; vistosG.add(f2);   // el mismo botón dentro de la ficha también se prueba
          await fresco(tab); const h1 = await elem('#vista', idx[n]); await h1.click({ force: true }).catch(() => {}); await pg.waitForTimeout(500);
          await pg.evaluate(() => document.querySelectorAll('#vista details').forEach(d => { d.open = true; }));
          const h2 = await elem('#vista', sub[m]); if (!h2 || !(await h2.evaluate(el => !!el))) continue;
          if ((await h2.evaluate(new Function('el', 'return (' + firma.toString() + ')(el)'))) !== f2) continue;
          res.push(await pulsar(h2, tab + ' › ' + x.nombre.slice(0, 30)));
        }
      }
      if (/ventana/.test(x.r)) {   // un nivel dentro de la ventana que abre
        const sub = await lista('#dlg'); const fs2 = []; for (const j of sub) { const hh = await elem('#dlg', j); fs2.push(hh ? await hh.evaluate(new Function('el', 'return (' + firma.toString() + ')(el)')) : null); }
        const vistos2 = new Set();
        for (let m = 0; m < sub.length; m++) {
          if (!fs2[m] || vistos2.has(fs2[m])) continue; vistos2.add(fs2[m]);
          await fresco(tab); const h1 = await elem('#vista', idx[n]); await h1.click({ force: true }).catch(() => {}); await pg.waitForTimeout(500);
          await pg.evaluate(() => document.querySelectorAll('#dlg details').forEach(d => { d.open = true; }));
          const h2 = await elem('#dlg', sub[m]); if (!h2 || !(await h2.evaluate(el => !!el))) continue;
          res.push(await pulsar(h2, tab + ' › ' + x.nombre.slice(0, 30)));
        }
      }
    }
    console.error('pestaña', tab, 'hecha:', res.length);
  }
  fs.writeFileSync(path.join(os0.tmpdir(), 'robot_botones_res.json'), JSON.stringify(res, null, 1));
  const malos = res.filter(x => !/^ok/.test(x.r));
  console.log(res.length + ' pulsaciones · ' + malos.length + ' a revisar');
  malos.forEach(x => console.log('- [' + x.ruta + '] «' + x.nombre + '» → ' + x.r));
  await b.close(); srv.close(); process.exitCode = malos.length ? 1 : 0;
}
