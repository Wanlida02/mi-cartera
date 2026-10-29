const assert = require('assert'), S = require('../scripts/datos_sec.js');
const h = (start, end, val, form = '10-K', filed = end) => ({ start, end, val, form, filed });
const flujo = (arr) => ({ units: { USD: arr } });
const cf = { entityName: 'Prueba Inc', facts: { 'us-gaap': {
  Revenues: flujo([h('2022-01-01', '2022-12-31', 1000e6), h('2023-01-01', '2023-12-31', 1100e6), h('2024-01-01', '2024-12-31', 1250e6), h('2024-01-01', '2024-03-31', 300e6, '10-Q'), h('2023-01-01', '2023-12-31', 1105e6, '10-K', '2025-02-01')]),
  OperatingIncomeLoss: flujo([h('2022-01-01', '2022-12-31', 200e6), h('2023-01-01', '2023-12-31', 230e6), h('2024-01-01', '2024-12-31', 270e6)]),
  WeightedAverageNumberOfDilutedSharesOutstanding: { units: { shares: [h('2022-01-01', '2022-12-31', 100e6), h('2023-01-01', '2023-12-31', 99e6), h('2024-01-01', '2024-12-31', 98e6)] } },
  CashAndCashEquivalentsAtCarryingValue: { units: { USD: [{ end: '2023-12-31', val: 50e6, form: '10-K', filed: '2024-02-01' }, { end: '2024-12-31', val: 70e6, form: '10-K', filed: '2025-02-01' }] } },
  ShortTermInvestments: { units: { USD: [{ end: '2024-12-31', val: 30e6, form: '10-K', filed: '2025-02-01' }] } },
  LongTermDebtNoncurrent: { units: { USD: [{ end: '2024-12-31', val: 400e6, form: '10-K', filed: '2025-02-01' }] } }
} } };
const r = S.construir(cf);
assert.deepEqual(r.anios, [2022, 2023, 2024]);
assert.deepEqual(r.hist.ventas, [1000, 1105, 1250], 'gana el más reciente presentado y se ignoran los trimestres');
assert.deepEqual(r.hist.ebit, [200, 230, 270]); assert.deepEqual(r.hist.acciones, [100, 99, 98]);
assert.deepEqual(r.hist.caja, [null, 50, 100], 'caja + inversiones a corto'); assert.deepEqual(r.hist.deuda, [null, null, 400]);
assert(r.faltan.includes('capex') && r.notas.length >= 3);
assert.throws(() => S.construir({ facts: { 'ifrs-full': {} } }), /US-GAAP/);
assert.equal(S.anioDe('2026-01-31'), 2025); assert.equal(S.anioDe('2025-12-31'), 2025); assert.equal(S.anioDe('2025-06-30'), 2025);
console.log('datos_sec ok');
