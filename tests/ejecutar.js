/* Lanza todos los tests y resume: node tests/ejecutar.js [datos.json]
   Sin archivo de datos, los que lo necesitan salen como OMITIDO (no como fallo). Con él, se pasan también. */
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const dir = __dirname, datos = process.argv[2] ? path.resolve(process.argv[2]) : null, r = { OK: [], FALLA: [], OMITIDO: [] };
if (datos && !fs.existsSync(datos)) { console.error('No existe ' + datos); process.exit(2); }
const necesita = f => /OMITIDO .*necesita tu archivo de datos/.test(fs.readFileSync(path.join(dir, f), 'utf8').split('\n')[0]);
for (const f of fs.readdirSync(dir).filter(f => /\.test\.js$/.test(f)).sort()) {
  const args = [path.join(dir, f)].concat(datos && necesita(f) ? [datos] : []);   // el archivo solo a los que lo piden (otros usan el argumento como ruta de captura)
  const p = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 180000 }), out = (p.stdout || '') + (p.stderr || '');
  const k = p.status === 0 ? (/^OMITIDO /m.test(out) ? 'OMITIDO' : 'OK') : 'FALLA'; r[k].push(f);
  console.log(k.padEnd(8) + f + (k === 'FALLA' ? '  → ' + ((out.match(/(FALLO|AssertionError|Error)[^\n]*/) || [''])[0]).slice(0, 140) : ''));
}
for (const f of fs.readdirSync(dir).filter(f => /_test\.py$/.test(f)).sort()) {
  const p = spawnSync('python3', [path.join(dir, f)], { encoding: 'utf8', timeout: 180000 }), k = p.status === 0 ? 'OK' : 'FALLA'; r[k].push(f); console.log(k.padEnd(8) + f);
}
console.log('\n' + r.OK.length + ' OK · ' + r.FALLA.length + ' fallan · ' + r.OMITIDO.length + ' omitidos' + (r.OMITIDO.length ? ' (pásale tu datos.json para incluirlos)' : ''));
process.exitCode = r.FALLA.length ? 1 : 0;
