const assert = require('assert'), L = require('../js/logic.js'), fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/logic.js', 'utf8');
['avisos', 'borrador', 'multguia', 'precioauto'].forEach(a => assert(src.includes("'" + a + "'"), 'falta acción ' + a));
assert(!/'abrir', 'Revisar datos'|'abrir', 'Revisar'\)|Corregir precio\/divisa/.test(src), 'quedan botones que no llevan a ningún sitio');
const s = JSON.parse(fs.readFileSync(__dirname + '/../simbolos.json', 'utf8')).simbolos;
['NRO', 'MIPS'].forEach(k => assert(!s[k] || !s[k].pausa, k + ' sigue en pausa'));
console.log('calidad_acciones ok');
const ui = fs.readFileSync(__dirname + '/../js/resultados-ui.js', 'utf8');
assert(/value="busca">busca sola/.test(ui) && /modo === 'busca'/.test(ui), 'cifras 12m sin modo de búsqueda');
console.log('cifras12 busca ok');
{ const m = /const urlOk = (.*?);   \/\/ URL/.exec(src); assert(m, 'urlOk'); const f = eval(m[1]);
  assert(f('https://x.com/a') && f('URD2025.pdf#p79') && f('informe.pdf p. 12') && !f('') && !f('StockAnalysis') && !f(null)); console.log('fuentes pdf ok'); }
