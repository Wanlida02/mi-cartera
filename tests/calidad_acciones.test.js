const assert = require('assert'), L = require('../js/logic.js'), fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/logic.js', 'utf8');
['avisos', 'borrador', 'multguia', 'precioauto'].forEach(a => assert(src.includes("'" + a + "'"), 'falta acción ' + a));
assert(!/'abrir', 'Revisar datos'|'abrir', 'Revisar'\)|Corregir precio\/divisa/.test(src), 'quedan botones que no llevan a ningún sitio');
const s = JSON.parse(fs.readFileSync(__dirname + '/../simbolos.json', 'utf8')).simbolos;
['NRO', 'MIPS'].forEach(k => assert(!s[k] || !s[k].pausa, k + ' sigue en pausa'));
console.log('calidad_acciones ok');
