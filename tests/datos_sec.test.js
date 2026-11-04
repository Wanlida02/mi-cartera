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

/* Cambio de etiqueta con los años (como Apple): se completan los años con la etiqueta siguiente */
{
  const A = require('assert'), S2 = require('../scripts/datos_sec.js');
  const hh = (y, v, tagForm = '10-K') => ({ start: y + '-01-01', end: y + '-12-31', val: v, form: tagForm, filed: (y + 1) + '-02-01' });
  const cf2 = { entityName: 'Cambio Inc', facts: { 'us-gaap': {
    SalesRevenueNet: { units: { USD: [hh(2019, 100e6), hh(2020, 110e6)] } },
    RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [hh(2021, 120e6), hh(2022, 130e6), hh(2023, 140e6)] } },
    OperatingIncomeLoss: { units: { USD: [hh(2019, 10e6), hh(2020, 11e6), hh(2021, 12e6), hh(2022, 13e6), hh(2023, 14e6)] } }
  } } };
  const r2 = S2.construir(cf2);
  A.deepEqual(r2.anios, [2019, 2020, 2021, 2022, 2023]); A.deepEqual(r2.hist.ventas, [100, 110, 120, 130, 140]); console.log('datos_sec etiquetas ok');
}
{
  const A = require('assert'), S3 = require('../scripts/datos_sec.js');
  const hh = (y, v) => ({ start: y + '-01-01', end: y + '-12-31', val: v, form: '10-K', filed: (y + 1) + '-02-01' });
  const ac = [[2019, 5e9], [2020, 20e9], [2021, 19e9], [2022, 18e9]];
  const cf3 = { entityName: 'Split Inc', facts: { 'us-gaap': {
    Revenues: { units: { USD: ac.map(([y]) => hh(y, 100e6)) } },
    WeightedAverageNumberOfDilutedSharesOutstanding: { units: { shares: ac.map(([y, v]) => hh(y, v)) } },
    EarningsPerShareDiluted: { units: { 'USD/shares': ac.map(([y]) => hh(y, 3)) } } } } };
  const r3 = S3.construir(cf3);
  A.deepEqual(r3.hist.acciones, [null, 20000, 19000, 18000]); A.deepEqual(r3.hist.bpa, [null, 3, 3, 3]);
  A(r3.notas.some(x => /split/.test(x))); console.log('datos_sec split ok');
}
