/* Lógica de la app (sin DOM, probada en Node). Reglas de cartera heredadas de «Mi Cartera»:
   compra con precio medio ponderado, venta parcial/total, deshacer con instantánea «antes».
   La valoración usa el motor Val (M14) sin cambios. */
const Logic = (function () {
  const V = typeof Val !== 'undefined' ? Val : require('./val.js');
  const isN = v => typeof v === 'number' && isFinite(v);
  const today = () => new Date().toISOString().slice(0, 10);
  const round8 = x => Math.round(x * 1e8) / 1e8;
  const clone = o => (o == null ? o : JSON.parse(JSON.stringify(o)));

  const AJUSTES = () => ({
    umbral_barata: 15,   // % anual esperado a 5 años (escenario conservador) a partir del cual una posición es «barata»
    umbral_cara: 3,      // % anual por debajo del cual es «cara»
    objetivo: 15,        // rentabilidad objetivo (precio de entrada)
    minimo: 8,           // rentabilidad mínima (precio máximo)
    lim_empresa: 10,     // % máximo de la cartera en una empresa
    lim_sector: 30,      // % máximo en un sector
    dias_precio_viejo: 5,
    fx: { EUR: 1, USD: 1.1193, CAD: 1.575, CNY: 7.466, TWD: 36.5, fecha: '2026-10-23' }  // unidades de divisa por 1 EUR
  });
  function nuevoDatos() {
    return { version: 1, posiciones: [], movimientos: [], otras: { accounts: [] }, ajustes: AJUSTES(), fichas: {}, precios: {}, cribado: {}, resultados: [], informes: null, updatedAt: 0 };
  }
  /* Rellena lo que falte sin pisar lo que existe (datos importados de versiones anteriores) */

  /* ───── Parches de datos: correcciones verificadas contra fuentes públicas, aplicadas una sola vez por ficha (no pisan lo que edites después) ───── */
  const PARCHES = [{"id":"danr-2026-11-13","tk":"DANR","anios":[2020,2021,2022,2023,2024,2025,2026],"anio_base":2026,"hist":{"ventas":[2673.4,2725.5,3619,4102.1,4349.8,4200,3833.5],"ebit":[91.6,143.9,209.6,265.1,220.8,303.1,220.8],"ni_reportado":[62.9,80.2,218.7,243.6,240.8,220.1,230.4],"acciones":[75.3,74.9,74.3,74.2,74.2,71.6,71.6],"bpa":[0.8351,1.0712,2.9416,3.2815,3.2432,3.0354,3.2179],"intereses":[1.3,-19.8,21.2,-49.6,-73,-91,-83.4],"da":[96.1,106.3,149.6,158.9,170.4,134.7,218.1],"capex":[175.4,141.4,112.9,158.6,175.8,188.2,188.0],"caja":[null,null,null,null,1711.1,1650.0,1893.7],"equity":[1936.7,2014,2219.7,2404.7,2627.2,2758.8,2972.5],"impuestos":[22.2,34.9,68.1,55.9,69.8,87.8,100.7],"deuda":[601.8,585.3,566.5,315,1011.9,923.7,834.3],"extra":[null,null,null,null,null,null,null],"minoritarios":[null,null,null,null,null,null,null],"otros":[null,null,null,null,null,null,null],"leases":[null,null,null,null,null,null,null],"leases_deuda":[null,null,null,null,35.6,37.6,39.9],"goodwill":[null,null,null,null,null,null,null]},"conf":{"ventas":"A","ebit":"A","ni_reportado":"A","acciones":"P","bpa":"P","intereses":"A","da":"A","capex":"E","caja":"P","equity":"A","impuestos":"A","deuda":"A","extra":"A","minoritarios":"A","otros":"A","leases":"A","leases_deuda":"A","goodwill":"A"}}];
  const NOTAS_DANR = [
    'Revisada el 13-11-2026 contra los comunicados de resultados de Danieli (ejercicio a 30-jun-2025 y a 30-jun-2026): ventas, EBIT, D&A, intereses netos, impuestos, beneficio y patrimonio coinciden con el comunicado en 2024, 2025 y 2026.',
    'Caja = efectivo + valores financieros − anticipos netos de clientes (criterio de caja neta «ajustada» de Danieli: 689 M en 2025, 1.020 M en 2026). Deuda = deuda financiera bancaria sin arrendamientos (834 M en 2026); arrendamientos IFRS 16 aparte (40 M).',
    'Intereses: ingreso financiero neto (signo negativo = ingreso). No incluye las diferencias de cambio (−87 M en 2025, +27 M en 2026), que se tratan como no recurrentes.',
    'D&A 2026 (218 M) incluye «svalutazioni» (saneamientos) que el comunicado no desglosa. Capex 2026 no está en el comunicado: estimado (≈ 2025). Acciones: 71,6 M en circulación (ordinarias 36,4 M + ahorro 35,2 M, calculadas con el total del dividendo); NO son las 81,3 M del capital, que incluyen autocartera.',
    'Acciones ordinarias (DAN) y de ahorro (DANR) comparten beneficio por acción; la de ahorro cotiza con descuento (sin voto) y paga más dividendo (0,3353 € frente a 0,3146 €).'];
  /* CSU: cotiza en CAD (TSX) pero las cuentas son en USD y el beneficio IFRS está distorsionado (amortización de intangibles de compras, pasivo IRGA/TSS):
     ficha en USD con método FCFA2S (cifras de los comunicados de Constellation; 2020 queda fuera: 989 M sin restar minoritarios, no comparable). */
  const nul5 = [null, null, null, null, null];
  const FICHA_CSU = { ticker: 'CSU', nombre: 'Constellation Software', divisa: 'USD', metodo: 'fcfa2s', estado: 'watchlist', anio_base: 2025, anios: [2021, 2022, 2023, 2024, 2025], precio: 2403.17, fecha_precio: '2026-11-16', dividend_yield: 0, leases_ok: true,
    hist: { ventas: [5106, 6622, 8407, 10066, 11623], ebit: [870, 920, 1182, 1471, 1928], ni_reportado: [310, 512, 565, 731, 512], bpa: [14.63, 24.16, 26.66, 34.48, 24.15], acciones: [21.19, 21.19, 21.19, 21.2, 21.2],
      fcfa2s: [883, 853, 1160, 1472, 1683], caja: [763, 811, 1284, 1980, 3089], deuda: [1387, 2288, 3682, 4533, 5787], equity: [1060, 1712, 1876, 2794, 3576], goodwill: [610, 792, 1263, 1451, 1781],
      intereses: nul5, da: nul5, capex: nul5, impuestos: nul5, leases: nul5, leases_deuda: nul5, minoritarios: nul5, otros: nul5, extra: nul5 },
    conf: { ventas: 'P', ebit: 'P', ni_reportado: 'P', bpa: 'P', acciones: 'P', fcfa2s: 'A', caja: 'P', deuda: 'P', equity: 'P', goodwill: 'P' },
    fuentes: ['Comunicados de resultados de Constellation Software (conciliación FCFA2S 2021-2025); StockAnalysis (ventas, EBIT, BPA, balance)'],
    notas: ['Método FCFA2S: se valora solo por el flujo libre para el accionista (después de intereses, arrendamientos, minoritarios de Topicus/Lumine y la revalorización IRGA/TSS). PER, EV/EBIT y EV/EBITDA no se usan: el beneficio IFRS lleva la amortización de intangibles de compras y el pasivo IRGA/TSS.',
      'Precio y cifras en USD: la acción cotiza en CAD en Toronto y la app convierte con el tipo de cambio de Ajustes (CAD por 1 €). Múltiplos de salida: pesimista 20x, base 26x, optimista 30x FCFA2S.',
      'Deuda = deuda total del balance (incluye arrendamientos); no se resta al valor porque el FCFA2S ya es posterior a intereses. Acciones = beneficio neto / BPA. El FCFA2S de 2020 (989 M) no lleva restados los minoritarios y se excluye de la serie.'],
    fecha_datos: '2026-11-17', verificada: '2026-11-17', extra_cribado: {} };
  const BASE_TTM_CSU = { fcfa2s: 1946, fin: '2026-09-30', ajuste: 0.85, fraccion: 0.25, nota: 'FCFA2S últimos 12 meses a 30-09-2026 = FY2025 1.683 + 9M 2026 1.522 − 9M 2025 1.259 (comunicado T3 2026). Se proyecta hasta dic-2030 (4,25 años de crecimiento) y se anualiza a 4,15 años (desde mediados de noviembre de 2026).' };
  FICHA_CSU.base_ttm = BASE_TTM_CSU;
  const ID_CSU = 'csu-fcfa2s-2026-11-17', ID_CSU_TTM = 'csu-ttm-2026-11-17';
  /* Nombres de cribado que son solo el ticker: con el nombre real se enlazan solas las carpetas de informes */
  const NOMBRES = { CSU: 'Constellation Software' };
  function aplicarParches(d) {
    Object.keys(NOMBRES).forEach(k => { const c = d.cribado && d.cribado[k]; if (c && (!c.nombre || c.nombre === k) && !(d.fichas && d.fichas[k])) c.nombre = NOMBRES[k]; });
    d.ajustes = d.ajustes || {}; const ya = d.ajustes.parches = Array.isArray(d.ajustes.parches) ? d.ajustes.parches : [];
    if (ya.indexOf(ID_CSU) < 0) {   // CSU: si no hay ficha, o la que hay no está verificada (borrador o en otra divisa), se crea la de USD/FCFA2S; la anterior se guarda en ajustes.copia_ficha_CSU
      const f = d.fichas && d.fichas.CSU;
      const interes = !!f || !!(d.cribado && d.cribado.CSU) || (d.posiciones || []).some(x => (x.ticker || '').toUpperCase() === 'CSU');   // solo si ya sigues CSU (cribado, posición o ficha): una instalación vacía no la recibe
      if (interes && (!f || (!f.verificada && f.metodo !== 'fcfa2s'))) { d.fichas = d.fichas || {}; if (f) d.ajustes.copia_ficha_CSU = JSON.parse(JSON.stringify(f)); d.fichas.CSU = JSON.parse(JSON.stringify(FICHA_CSU)); }
      if (interes) ya.push(ID_CSU);
    }
    if (ya.indexOf(ID_CSU_TTM) < 0) {   // quien ya tenía la ficha FCFA2S de la v50: se le añade la base TTM sin tocar nada más
      const f = d.fichas && d.fichas.CSU; if (f && f.metodo === 'fcfa2s' && !f.base_ttm) { f.base_ttm = JSON.parse(JSON.stringify(BASE_TTM_CSU)); f.notas = (f.notas || []).concat(['Base TTM (T3 2026): ' + BASE_TTM_CSU.nota]); }
      if (f || ya.indexOf(ID_CSU) >= 0) ya.push(ID_CSU_TTM);
    }
    PARCHES.forEach(p => {
      if (ya.indexOf(p.id) >= 0) return; const f = d.fichas && d.fichas[p.tk];
      if (!f || !/danieli/i.test(f.nombre || '')) return;
      if (f.verificada) { ya.push(p.id); return; }
      f.anios = p.anios.slice(); f.anio_base = p.anio_base; f.hist = JSON.parse(JSON.stringify(p.hist)); f.conf = Object.assign({}, p.conf);
      delete f._borrador; f.leases_ok = true; f.verificada = '2026-11-13'; f.fecha_datos = '2026-11-13';
      f.fuentes = ['Comunicados de resultados de Danieli (25-09-2025 y 25-09-2026), Intermonte (29-09-2026), Teleborsa (28-10-2026)'];
      f.notas = NOTAS_DANR.slice(); f.extra_cribado = f.extra_cribado || {};
      const pr = d.precios && d.precios[p.tk]; if (!pr || pr.simbolo !== 'DANR.MI') d.precios[p.tk] = Object.assign({}, pr || {}, { ticker: p.tk, precio: 37.36, divisa: 'EUR', fecha_precio: '2026-11-13', hora: '2026-11-13T09:00:00.000Z', simbolo: 'DANR.MI', fuente: 'manual', actualizado: '2026-11-13T09:00:00.000Z' });
      const c = d.cribado && d.cribado[p.tk];
      if (c) { Object.assign(c, { ventas_cagr_5y: 7.1, ebit_cagr_5y: 8.9, margen_ebit: 5.8, margen_ebit_hace_5y: 5.3, margen_ebit_pico_10y: 8.2, acciones_diluidas_m: 71.6, bpa_ttm: 3.22, bpa_cagr_5y: 24.6, deuda_neta_m: -1019.7, deuda_neta_ebitda: -2.3, ebitda_m: 438.9, market_cap_eur_m: 3240, anio_dato: 2026, fecha_datos: '2026-11-13', confianza: 'media', control_familiar: true });
        delete c.fcf_por_accion; c.notas_datos = ['Cifras corregidas el 13-11-2026 con los comunicados de resultados (las del cribado anterior venían de una IA y no cuadraban: capitalización 1.650 M, EBITDA 340 M, BPA 3,65).', 'Caja neta ajustada de Danieli 1.020 M (descuenta anticipos de clientes). Dos clases de acciones: ordinarias (DAN) y de ahorro (DANR); aquí se valora la de ahorro.']; }
      ya.push(p.id);
    });
    aplicarParchesV60(d, ya);
    aplicarParchesV61(d, ya);
    return d;
  }

  /* ───── Parches v60 (18-11-2026): cifras contrastadas con la SEC (10-K) y comunicados; solo fichas SIN verificar y sin pisar lo que ya tengas, salvo `pisa` (caja = efectivo + inversiones a corto, convención del resto de fichas) ───── */
  const A60 = [2020, 2021, 2022, 2023, 2024, 2025, 2026];
  const DATOS_V60 = [
    { id: 'v60-prdo', tk: 'PRDO', conf: 'A', fuente: 'Perdoceo, 10-K y comunicado FY2025 (19-02-2026), vía SEC', nota: 'Caja = efectivo + inversiones a corto plazo (SEC; antes solo efectivo: infravaloraba la caja neta). Deuda 2024-2025: financiación de la construcción del campus (56,5 M) y de la venta con arrendamiento posterior (57,0 M); sin deuda bancaria. Capex = compras de inmovilizado (SEC).',
      pisa: { caja: { 2020: 406.4, 2021: 494.2, 2022: 508.7, 2023: 603.1, 2024: 568.9, 2025: 622.2 } },
      pone: { capex: { 2020: 9.8, 2021: 10.5, 2022: 12.6, 2023: 6.4, 2024: 4.6, 2025: 8.6 }, deuda: { 2020: 0, 2021: 0, 2022: 0, 2023: 0, 2024: 56.5, 2025: 57.0 } } },
    { id: 'v60-aapl', tk: 'AAPL', conf: 'A', fuente: 'Apple, 10-K (SEC)', nota: 'Caja = efectivo + valores negociables a corto plazo (SEC; antes solo efectivo). No incluye los valores negociables a largo plazo.',
      pisa: { caja: { 2021: 62639, 2022: 48304, 2023: 61555, 2024: 65171, 2025: 54697, 2026: 56722 } } },
    { id: 'v60-strl', tk: 'STRL', conf: 'A', fuente: 'Sterling Infrastructure, 10-K (SEC)', nota: 'Caja 2020-2021 = efectivo + inversiones a corto (SEC).', pisa: { caja: { 2020: 66.2, 2021: 81.8 } } },
    { id: 'v60-mips', tk: 'MIPS', conf: 'A', fuente: 'MIPS, informe anual 2025 (SEK M)', nota: 'Amortización 2024-2025 y deuda financiera 2024 (0) y 2025 (304) del informe anual.', pone: { da: { 2024: 20, 2025: 19 }, deuda: { 2024: 0, 2025: 304 } } },
    { id: 'v60-che', tk: 'CHE', conf: 'A', fuente: 'Chemed, 10-K (SEC)', nota: 'Sin deuda financiera a cierre de 2024 y 2025 (10-K).', pone: { deuda: { 2024: 0, 2025: 0 } } },
    { id: 'v60-belfa', tk: 'BELFA', conf: 'A', fuente: 'Bel Fuse, comunicado de resultados (acciones A + B en circulación)', nota: 'Acciones (millones) 2024 y 2025 del comunicado de resultados.', pone: { acciones: { 2024: 12.615, 2025: 12.661 } } },
    { id: 'v60-sol', tk: 'BIT:SOL', conf: 'P', fuente: 'Balance consolidado de SOL (vía StockAnalysis; contrasta con el informe anual 2025)', nota: 'Deuda financiera bruta sin arrendamientos = deuda a largo + parte corriente + corto plazo (544 / 587 / 733 M en 2023 / 2024 / 2025). Arrendamientos aparte. Fuente secundaria: confirmar con el informe anual.', pone: { deuda: { 2023: 546.4, 2024: 587.3, 2025: 733.3 } } }
  ];
  function aplicarParchesV60(d, ya) {
    const idx = (f, a) => (f.anios || []).indexOf(a);
    DATOS_V60.forEach(p => {
      if (ya.indexOf(p.id) >= 0) return; const f = d.fichas && d.fichas[p.tk]; if (!f || !f.hist || !f.anios) return;
      if (f.verificada) { ya.push(p.id); return; }
      let n = 0; f.conf = f.conf || {};
      [['pone', false], ['pisa', true]].forEach(([k, pisa]) => Object.keys(p[k] || {}).forEach(campo => {
        const arr = f.hist[campo] = Array.isArray(f.hist[campo]) ? f.hist[campo] : (f.anios || []).map(() => null);
        Object.keys(p[k][campo]).forEach(a => { const i = idx(f, +a); if (i < 0) return; if (pisa || arr[i] == null) { if (arr[i] !== p[k][campo][a]) n++; arr[i] = p[k][campo][a]; } });
        f.conf[campo] = p.conf;
      }));
      if (n) { f.notas = (f.notas || []).concat(['Datos contrastados el 18-11-2026 (' + p.fuente + '). ' + p.nota]); f.fuentes = (f.fuentes || []).concat([p.fuente]); }
      ya.push(p.id);
    });
    /* FDX: el escenario conservador guardado traía EV/EBITDA 1,4x (frente a 8,9x histórico): arrastraba un error de la serie con Freight. Se descarta y se usa el calculado; copia en ajustes.copia_escenarios_FDX */
    if (ya.indexOf('v60-fdx-esc') < 0) {
      const f = d.fichas && d.fichas.FDX;
      if (f) { const c = f.escenarios && f.escenarios.conservador, mh = f.mult_hist && f.mult_hist.ev_ebitda;
        if (c && isN(c.ev_ebitda) && isN(mh) && c.ev_ebitda < 0.5 * mh) { d.ajustes.copia_escenarios_FDX = JSON.parse(JSON.stringify(f.escenarios)); delete f.escenarios; f.notas = (f.notas || []).concat(['18-11-2026: descartado el escenario guardado (EV/EBITDA de salida 1,4x frente a 8,9x histórico, restos de la serie con Freight). La valoración usa ahora los escenarios calculados.']); }
        ya.push('v60-fdx-esc'); }
    }
    /* Interruptores de ficha: ESEA es naviera (flota: el CapEx es el negocio, no se normaliza); AIR: el crecimiento no arranca del año hundido del COVID */
    if (ya.indexOf('v60-flags') < 0) {
      const e = d.fichas && d.fichas.ESEA, a = d.fichas && d.fichas.AIR;
      if (e && e.flota == null) e.flota = true; if (a && a.crec_desde_previo == null) a.crec_desde_previo = false;
      if (e || a) ya.push('v60-flags');
    }
    /* Múltiplos propios (cierres anuales de precio × cifras de la ficha), calculados el 18-11-2026 con los datos ya corregidos */
    MULT_V60.forEach(m => {
      if (ya.indexOf(m.id) >= 0) return; const f = d.fichas && d.fichas[m.tk]; if (!f) return;
      if (!f.mult_hist && !f.verificada) { f.mult_hist = Object.assign({}, m.mult); f.mult_hist_auto = { fecha: '2026-11-18', anios: m.anios.slice(), n: Object.assign({}, m.n), dispersion: Object.assign({}, m.disp), ajustes_split: [], fuente: 'cierres anuales (Yahoo) × cifras de la ficha' }; d.ajustes.mult_auto = d.ajustes.mult_auto || {}; d.ajustes.mult_auto[m.tk] = { fecha: '2026-11-18' }; }
      ya.push(m.id);
    });
  }
  /* v61: Neurones — datos extraídos por una IA que busca en sus informes anuales (URD 2020-2025), cada cifra con su URL; entra por las reglas de aplicarBusqueda (sin URL no entra, lo estimado solo rellena huecos, copia para deshacer) */
  const JSON_NRO_IA = {"anios":[2020,2021,2022,2023,2024,2025],"datos":{"da":[15.031,14.805,15.406,15.9,17.204,17.987],"capex":[7.192,6.579,10.605,17.982,12.037,10.438],"fco":[67.289,64.498,54.969,72.075,84.382,71.282],"deuda":[0.75,0.535,0.283,7.379,7.016,4.167],"caja":[266.603,265.174,272.058,297.758,326.491,340.781],"caja_neta_oficial":[null,null,271.775,290.379,319.475,336.614],"leases_deuda":[33.543,34.913,35.838,36.637,35.045,32.846],"acciones":[null,null,null,null,null,24.328716],"acciones_diluidas":[null,null,null,null,null,null]},"confianza":{"da":["A","A","A","A","A","A"],"capex":["A","A","A","A","A","A"],"fco":["A","A","A","A","A","A"],"deuda":["A","A","A","A","A","A"],"caja":["A","A","A","A","A","A"],"caja_neta_oficial":[null,null,"A","A","A","A"],"leases_deuda":["A","A","A","A","A","A"],"acciones":[null,null,null,null,null,"A"],"acciones_diluidas":[null,null,null,null,null,null]},"fuentes":{"da":{"2020":"https://echanges.dila.gouv.fr/OPENDATA/AMF/260/8888/01/FC260381462_20210427.pdf#Compte-de-resultat-consolide","2021":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2022.pdf#Compte-de-resultat-consolide","2022":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2022.pdf#Compte-de-resultat-consolide","2023":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2024.pdf#Compte-de-resultat-consolide","2024":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2025.pdf#p.66","2025":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2025.pdf#p.66"},"capex":{"2020":"https://echanges.dila.gouv.fr/OPENDATA/AMF/260/8888/01/FC260381462_20210427.pdf#Tableau-des-flux","2021":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2022.pdf#p.85","2022":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2022.pdf#p.85","2023":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2024.pdf#p.70","2024":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2025.pdf#p.70","2025":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2025.pdf#p.70"},"fco":{"2020":"https://echanges.dila.gouv.fr/OPENDATA/AMF/260/8888/01/FC260381462_20210427.pdf#Tableau-des-flux","2021":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2022.pdf#p.85","2022":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2022.pdf#p.85","2023":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2024.pdf#p.70","2024":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2025.pdf#p.70","2025":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2025.pdf#p.70"},"deuda":{"2020":"https://echanges.dila.gouv.fr/OPENDATA/AMF/260/8888/01/FC260381462_20210427.pdf#Bilan-consolide-Note-9","2021":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2022.pdf#p.83","2022":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2022.pdf#p.83","2023":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2024.pdf#Bilan-consolide-Note-9","2024":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2025.pdf#Bilan-consolide-Note-9","2025":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2025.pdf#Bilan-consolide-Note-9"},"caja":{"2020":"https://echanges.dila.gouv.fr/OPENDATA/AMF/260/8888/01/FC260381462_20210427.pdf#Bilan-consolide-Note-9","2021":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2022.pdf#p.83","2022":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2022.pdf#p.83","2023":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2024.pdf#Bilan-consolide-Note-9","2024":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2025.pdf#Bilan-consolide-Note-9","2025":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2025.pdf#Bilan-consolide-Note-9"},"caja_neta_oficial":{"2022":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2022.pdf#Note-9","2023":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2024.pdf#Note-9","2024":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2025.pdf#Note-9","2025":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2025.pdf#Note-9"},"leases_deuda":{"2020":"https://echanges.dila.gouv.fr/OPENDATA/AMF/260/8888/01/FC260381462_20210427.pdf#Bilan-consolide-Note-3","2021":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2022.pdf#p.83","2022":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2022.pdf#p.83","2023":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2024.pdf#Bilan-consolide-Note-3","2024":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2025.pdf#Bilan-consolide-Note-3","2025":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2025.pdf#Bilan-consolide-Note-3"},"acciones":{"2025":"https://www.neurones.net/sites/default/files/documents/NEURONES-rapport-annuel-document-d-enregistrement-universel-2025.pdf#Capital-social"}},"pendiente":[]};
  function aplicarParchesV61(d, ya) {
    if (ya.indexOf('v61-nro-ia') >= 0) return; const f = d.fichas && d.fichas.NRO; if (!f || !f.hist) return;
    if (!f.verificada && /neurones/i.test(f.nombre || '')) { try { aplicarBusqueda(d, 'NRO', JSON.stringify(JSON_NRO_IA)); } catch (e) { /* ficha distinta: no se toca */ } }
    ya.push('v61-nro-ia');
  }
  const MULT_V60 = [{"id":"v60-mult-aapl","tk":"AAPL","mult":{"per":31.7,"pfcf":32.2,"ev_ebitda":25.5,"ev_ebit":28.1},"anios":[2021,2022,2023,2024,2025],"n":{"per":5,"pfcf":5,"ev_ebitda":5,"ev_ebit":5},"disp":{"per":0.21395002714228123,"pfcf":0.17662077419912883,"ev_ebitda":0.19438323599682097,"ev_ebit":0.18598277379293424}},{"id":"v60-mult-nro","tk":"NRO","mult":{"per":20.8,"pfcf":16.5},"anios":[2020,2021,2022,2023,2024,2025],"n":{"per":6,"pfcf":6,"ev_ebitda":0,"ev_ebit":2},"disp":{"per":0.0943841225778858,"pfcf":0.2311376441191297}},{"id":"v60-mult-ftdr","tk":"FTDR","mult":{"per":21.1,"pfcf":17.6,"ev_ebitda":13,"ev_ebit":15.5},"anios":[2020,2021,2022,2023,2024,2025],"n":{"per":6,"pfcf":6,"ev_ebitda":6,"ev_ebit":6},"disp":{"per":0.3671292326725646,"pfcf":0.2625575693109757,"ev_ebitda":0.37503745839521113,"ev_ebit":0.34013515377566794}},{"id":"v60-mult-prdo","tk":"PRDO","mult":{"per":8.9,"pfcf":8,"ev_ebitda":3.5},"anios":[2020,2021,2022,2023,2024,2025],"n":{"per":6,"pfcf":6,"ev_ebitda":5,"ev_ebit":5},"disp":{"per":0.48207385039269557,"pfcf":0.7210548581519756,"ev_ebitda":0.7698450771661408,"ev_ebit":0.8893229914619295}}];

  /* ───── Completar una ficha con una IA que BUSCA por su cuenta (sin abrir páginas a mano) ─────
     Fase 1: un prompt único (ficha → JSON con datos, confianza, fuentes por URL y pendientes). Fase 2: la genera la app con lo que sigue pendiente.
     Reglas de importación prudentes: sin URL no se escribe; lo estimado solo rellena huecos; ficha verificada: solo huecos; cambios ×5 se dejan para revisar; copia para deshacer. */
  const LIN_BUSQ = ['intereses', 'impuestos', 'da', 'capex', 'fco', 'deuda', 'caja', 'leases_deuda', 'acciones'];
  const IDIOMA_BOLSA = { PA: 'fr', BR: 'fr', MC: 'es', MI: 'it', DE: 'de', F: 'de', SW: 'de', VI: 'de' };
  const IDIOMAS = { fr: ['francés', ['dotations aux amortissements + amortissements des droits d\'utilisation IFRS 16', 'acquisitions d\'immobilisations corporelles et incorporelles', 'flux nets de trésorerie générés par l\'activité', 'passifs financiers courants + non courants, incluidos descubiertos', 'trésorerie et équivalents', 'dettes locatives IFRS 16', '«trésorerie nette»', 'nombre moyen d\'actions diluées']],
    es: ['español', ['amortizaciones + amortización de derechos de uso (NIIF 16)', 'adquisiciones de inmovilizado material e intangible', 'flujos de efectivo de las actividades de explotación', 'deuda financiera corriente + no corriente, con descubiertos', 'efectivo y equivalentes', 'pasivos por arrendamiento NIIF 16', '«deuda financiera neta» o «caja neta»', 'número medio ponderado de acciones diluidas']],
    it: ['italiano', ['ammortamenti + ammortamento dei diritti d\'uso IFRS 16', 'investimenti in immobilizzazioni materiali e immateriali', 'flusso di cassa dell\'attività operativa', 'debiti finanziari correnti e non correnti', 'disponibilità liquide e mezzi equivalenti', 'passività per leasing IFRS 16', '«posizione finanziaria netta»', 'numero medio ponderato di azioni diluite']],
    de: ['alemán', ['Abschreibungen (inkl. Nutzungsrechte IFRS 16)', 'Auszahlungen für Investitionen in Sach- und immaterielle Anlagen', 'Cashflow aus betrieblicher Tätigkeit', 'Finanzverbindlichkeiten kurz- und langfristig', 'Zahlungsmittel und Zahlungsmitteläquivalente', 'Leasingverbindlichkeiten', '«Nettofinanzverbindlichkeiten» / Nettoliquidität', 'verwässerte durchschnittliche Aktienzahl']],
    en: ['inglés', ['depreciation and amortization (incl. right-of-use assets)', 'capital expenditures (purchases of PP&E and intangibles)', 'net cash provided by operating activities', 'short-term + long-term debt, excluding leases', 'cash and cash equivalents (+ short-term investments)', 'lease liabilities (operating + finance)', 'net cash / net debt as reported by the company', 'weighted-average diluted shares']] };
  function idiomaDe(sym) { const m = /\.([A-Z]{1,2})$/.exec(String(sym || '')); return IDIOMA_BOLSA[m && m[1]] || 'en'; }
  const serieCompleta = a => Array.isArray(a) && a.length > 0 && a.every(isN);
  const ultimoNum = a => { for (let i = (a || []).length - 1; i >= 0; i--) if (isN(a[i])) return a[i]; return null; };
  function promptBusqueda(d, tk, sym) {
    const f = d.fichas[tk], h = f.hist || {}, an = (f.anios || []).map(Number), n = an.length, div = f.divisa || 'EUR', id = idiomaDe(sym), [idN, g] = IDIOMAS[id], eur = id !== 'en' || /\.[A-Z]{1,2}$/.test(sym || '');
    const r1 = x => (isN(x) ? Math.round(x * 10) / 10 : null), fila = k => JSON.stringify((h[k] || []).map(r1));
    const faltaIntImp = ['intereses', 'impuestos'].filter(k => !serieCompleta(h[k]));
    const docs = []; for (let i = n - 1; i >= 0; i -= 2) docs.push(i > 0 ? [an[i], an[i - 1]] : [an[i]]);
    const tipoDoc = eur ? 'informe anual / documento de registro (URD, Annual Report)' : 'Form 10-K (SEC EDGAR)';
    const lin = [
      ['da', 'depreciación y amortización total del ejercicio (' + g[0] + '). Desglosa ambos componentes en AVISOS.'],
      ['capex', 'compras de inmovilizado material e intangible (' + g[1] + '). Indica si es bruto o neto de desinversiones.'],
      ['fco', 'flujo de caja operativo (' + g[2] + ').'],
      ['deuda', 'deuda financiera bruta SIN arrendamientos IFRS 16 (' + g[3] + '). Desglosa.'],
      ['caja', 'efectivo y equivalentes + inversiones financieras a corto plazo, si las hay (' + g[4] + ').'],
      ['caja_neta_oficial', 'la caja o deuda neta que publica la propia empresa (' + g[6] + '), cifra exacta sin redondear (negativa si es deuda neta), e indica si excluye IFRS 16.'],
      ['leases_deuda', 'pasivos por arrendamientos IFRS 16 / de explotación, corrientes + no corrientes (' + g[5] + '). Desglosa.'],
      ['acciones', 'acciones en circulación al cierre de cada ejercicio (millones).'],
      ['acciones_diluidas', 'media ponderada de acciones diluidas usada en el BPA (' + g[7] + '), en millones.']];
    if (faltaIntImp.indexOf('intereses') >= 0) lin.unshift(['intereses', 'coste financiero neto (gasto financiero menos ingresos financieros); negativo si la empresa gana más de lo que paga.']);
    if (faltaIntImp.indexOf('impuestos') >= 0) lin.unshift(['impuestos', 'gasto por impuesto sobre beneficios del ejercicio.']);
    const claves = lin.map(x => x[0]), jsonDatos = claves.map(k => '"' + k + '":[...]').join(',');
    return 'Eres un analista financiero. Necesito datos históricos verificados de ' + (f.nombre || tk) + ' (ticker ' + tk + (sym ? ', símbolo en Yahoo ' + sym : '') + '; cuentas en ' + div + '; informes en ' + idN + ') para los ejercicios ' + an[0] + '–' + an[n - 1] + '. Identifica tú el mes de cierre del ejercicio fiscal y las normas contables (IFRS o US GAAP). Referencia de mi ficha, solo para comprobar que miras la empresa y las unidades correctas (millones de ' + div + '): ventas ' + fila('ventas') + ' · EBIT ' + fila('ebit') + ' · beneficio neto ' + fila('ni_reportado') + '.\n\n' +
      'Trabajas en DOS FASES. Esta conversación es la FASE 1. Es normal que no consigas todo: tu objetivo es entregar lo que puedas verificar y decir con precisión qué queda pendiente.\n\n' +
      'CÓMO TRABAJAR\n1. Busca tú mismo en internet, sin pedirme datos ni enlaces. Si no puedes abrir una página, busca otra fuente para el mismo dato.\n' +
      '2. Trabaja por documentos, no por líneas. Cada informe anual trae el ejercicio actual y el anterior, así que ' + docs.length + ' documentos cubren los ' + n + ' años: ' + docs.map((p, i) => 'documento ' + (i + 1) + ' = ' + (eur ? 'informe anual' : '10-K') + ' del ejercicio ' + p[0] + ' → años ' + p.join(' y ')).join('; ') + '. Abre un documento, extrae de una vez todas las líneas pedidas para sus años y pasa al siguiente. No repitas búsquedas.\n' +
      '3. Presupuesto: planifica unas 5 búsquedas o aperturas por documento y reserva las últimas para redactar la respuesta. Prioridad si te quedas corto: primero da, capex, fco, deuda y caja de los años más recientes; después los más antiguos; después el resto.\n' +
      '4. Fuentes: primero primarias (' + tipoDoc + ', comunicados anuales de resultados, web de relación con inversores de la empresa y el regulador: SEC, AMF, CNMV, Consob, BaFin…). Los agregadores (StockAnalysis, MarketScreener, Yahoo Finance, Morningstar…) solo para un dato concreto que no aparezca en el documento primario, con confianza "P".\n' +
      '5. No inventes cifras. Si no puedes abrir ninguna fuente para un dato, devuelve null y anótalo como pendiente. Un null honesto vale más que una cifra sin fuente.\n' +
      '6. Unidades: millones de ' + div + '; acciones en millones; ejercicio completo, nunca 12 meses móviles.\n\n' +
      'LÍNEAS (serie ' + an[0] + '–' + an[n - 1] + ', del más antiguo al más reciente)\n' + lin.map(x => '- ' + x[0] + ': ' + x[1]).join('\n') + '\n\n' +
      'CONFIANZA (por año)\nA = leída en el documento primario (también la suma de dos líneas publicadas); P = agregador o una sola fuente secundaria; E = calculada por ti (con la cuenta en AVISOS). Un null no lleva confianza (null).\n\n' +
      'VERIFICACIONES ANTES DE RESPONDER\n- Si un año sale en dos documentos (actual en uno y comparativo en otro), usa el documento donde es el año actual; si difieren más de un 1 %, explica ambas cifras con su URL en AVISOS.\n- caja − deuda ≈ la caja neta oficial; da, capex y fco del mismo ejercicio; acciones diluidas coherentes con beneficio neto / BPA (±3 %); la deuda no incluye arrendamientos.\n\n' +
      'FORMATO DE RESPUESTA (obligatorio: una respuesta sin los tres bloques se considera incompleta)\nA) JSON, sin texto dentro:\n{"anios":[' + an.join(',') + '],\n "datos":{' + jsonDatos + '},\n "confianza":{"da":[...], ...},\n "fuentes":{"da":{"' + an[n - 1] + '":"https://...#página"}, ...},\n "pendiente":[{"linea":"capex","anio":' + an[0] + ',"motivo":"..."}, ...]}\n' +
      'B) Tabla de FUENTES USADAS: línea, año, documento, URL exacta, página o nota del PDF, fecha de publicación. Incluye las páginas que intentaste abrir y no pudiste.\nC) AVISOS: desgloses, discrepancias (con ambas cifras y URL), definiciones distintas y cifras calculadas con su cuenta.';
  }
  function extraerJSON(txt) {   // primer objeto JSON válido con «datos» (tolera texto y bloques de código alrededor)
    txt = String(txt || ''); const out = [];
    for (let i = 0; i < txt.length; i++) if (txt[i] === '{') {
      let dep = 0, str = false, esc = false;
      for (let j = i; j < txt.length; j++) { const c = txt[j];
        if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; }
        else if (c === '"') str = true; else if (c === '{') dep++;
        else if (c === '}') { dep--; if (dep === 0) { try { out.push(JSON.parse(txt.slice(i, j + 1))); i = j; } catch (e) { /* no era JSON */ } break; } } }
    }
    return out.find(o => o && typeof o === 'object' && o.datos) || null;
  }
  const numB = x => (isN(x) ? x : typeof x === 'string' && x.trim() !== '' && isFinite(Number(x.replace(/\s/g, '').replace(',', '.'))) ? Number(x.replace(/\s/g, '').replace(',', '.')) : null);
  const urlOk = u => typeof u === 'string' && /^https?:\/\/\S+/.test(u.trim());
  const RANGO = { A: 3, P: 2, E: 1 };
  function aplicarBusqueda(d, tk, txt) {
    const f = d.fichas[tk]; if (!f) throw new Error('No existe la ficha ' + tk + '.');
    const an = (f.anios || []).map(Number), n = an.length;
    if (/sin_navegacion/.test(String(txt)) && !/"datos"/.test(String(txt))) throw new Error('Esa IA no puede buscar en internet. Usa otra IA, o la opción «no puede abrir páginas» (pegas tú el texto de las páginas).');
    const j = extraerJSON(txt); if (!j) throw new Error('No encuentro el JSON con «datos» en lo que has pegado. Pega la respuesta completa de la IA (el bloque A con el JSON) y vuelve a probar.');
    const ja = (Array.isArray(j.anios) && j.anios.length ? j.anios : an).map(Number); if (ja.some(a => !isFinite(a))) throw new Error('Los años de la respuesta no son números.');
    const datos = j.datos && typeof j.datos === 'object' ? j.datos : {}, conf = j.confianza || {}, fu = j.fuentes || {};
    f.hist = f.hist || {}; f.conf = f.conf || {};
    const orig = {}, soloHuecos = !!f.verificada, av = [], escritos = [], revisar = [], sinFuente = [], cambiosGrandes = [], antes = {}, hoyS = today();
    const ia = f.datos_ia = f.datos_ia || { anios: an.slice(), datos: {}, confianza: {}, fuentes: {}, pendiente: [] };
    const aIdx = {}; ja.forEach((a, i) => { aIdx[a] = i; });
    const fuera = ja.filter(a => an.indexOf(a) < 0); if (fuera.length) av.push('Años de la respuesta que no están en la ficha (se ignoran): ' + fuera.join(', ') + '.');
    const sinAnio = an.filter(a => aIdx[a] == null); if (sinAnio.length) av.push('La respuesta no trae estos años de la ficha: ' + sinAnio.join(', ') + '.');
    const ABS = { da: 1, capex: 1, deuda: 1, caja: 1, leases_deuda: 1 }, extras = ['caja_neta_oficial', 'acciones_diluidas'];
    LIN_BUSQ.concat(extras).forEach(k => {
      const arr = datos[k]; if (arr == null) return; if (!Array.isArray(arr) || arr.length !== ja.length) throw new Error('«' + k + '» debe tener ' + ja.length + ' valores (uno por año: ' + ja.join(', ') + ').');
      ia.datos[k] = ia.datos[k] || an.map(() => null); ia.confianza[k] = ia.confianza[k] || an.map(() => null); ia.fuentes[k] = ia.fuentes[k] || {};
      const cf = Array.isArray(conf[k]) ? conf[k] : [];
      an.forEach((a, ix) => {
        const i = aIdx[a]; if (i == null) return; let v = numB(arr[i]); if (v == null) return; if (ABS[k]) v = Math.abs(v);
        const c = /^[APE]$/.test(String(cf[i])) ? String(cf[i]) : 'P', url = fu[k] && fu[k][a], hayUrl = urlOk(url);
        if (!hayUrl) { sinFuente.push(k + ' ' + a); return; }                       // sin URL no se acepta nada
        if (ia.datos[k][ix] == null || (RANGO[c] || 0) >= (RANGO[ia.confianza[k][ix]] || 0)) { ia.datos[k][ix] = v; ia.confianza[k][ix] = c; ia.fuentes[k][a] = url.trim(); }
        if (extras.indexOf(k) >= 0) return;                                          // solo se guardan como referencia y para contrastar
        if (!(k in orig)) orig[k] = Array.isArray(f.hist[k]) ? f.hist[k].slice() : null;
        const arrF = f.hist[k] = Array.isArray(f.hist[k]) ? f.hist[k] : an.map(() => null); while (arrF.length < n) arrF.push(null);
        const e = arrF[ix], vacio = !isN(e);
        if (vacio) { antes[k] = orig[k]; arrF[ix] = v; escritos.push({ linea: k, anio: a, antes: null, despues: v, conf: c }); return; }
        if (soloHuecos || c !== 'A') return;                                          // lo estimado o de agregador no pisa lo que ya hay
        if (Math.abs(v - e) <= 0.005 * Math.max(1, Math.abs(e))) return;
        if (e !== 0 && v !== 0 && (Math.abs(v / e) > 5 || Math.abs(e / v) > 5)) { revisar.push({ linea: k, anio: a, actual: e, ia: v }); return; }
        antes[k] = orig[k]; arrF[ix] = v; escritos.push({ linea: k, anio: a, antes: e, despues: v, conf: c });
        if (Math.abs(v - e) > 0.25 * Math.max(1, Math.abs(e))) cambiosGrandes.push(k + ' ' + a + ': ' + Math.round(e * 100) / 100 + ' → ' + Math.round(v * 100) / 100);
      });
    });
    if (!escritos.length && !Object.keys(ia.datos).some(k => ia.datos[k].some(isN))) throw new Error('La IA no ha devuelto ninguna cifra con URL' + (sinFuente.length ? ' (' + sinFuente.length + ' datos sin fuente se descartan)' : '') + '. Si no puede buscar en internet, usa otra IA o la opción «no puede abrir páginas».');
    /* contrastes internos */
    const dat = (k, a) => { const v = ia.datos[k] && ia.datos[k][an.indexOf(a)]; return isN(v) ? v : null; };
    an.forEach(a => { const c = dat('caja', a), de = dat('deuda', a), ne = dat('caja_neta_oficial', a); if (c != null && de != null && ne != null && Math.abs(c - de - ne) > Math.max(1, 0.015 * Math.abs(ne))) av.push('caja − deuda ≠ caja neta oficial en ' + a + ' (' + Math.round((c - de) * 10) / 10 + ' frente a ' + ne + '): definición distinta o dato dudoso.'); });
    const vt = f.hist.ventas || [];
    ['capex', 'da'].forEach(k => an.forEach((a, ix) => { const x = dat(k, a), v0 = vt[ix]; if (x != null && isN(v0) && v0 > 0 && x / v0 > 0.4) av.push('«' + k + '» ' + a + ' es el ' + Math.round(x / v0 * 100) + ' % de las ventas: comprueba unidades y signo.'); }));
    an.forEach((a, ix) => { const x = dat('acciones', a), ni = (f.hist.ni_reportado || [])[ix], b = (f.hist.bpa || [])[ix]; if (x != null && isN(ni) && isN(b) && b > 0 && Math.abs(x / (ni / b) - 1) > 0.15) av.push('Acciones ' + a + ' (' + x + ' M) no cuadran con beneficio neto / BPA (' + Math.round(ni / b * 10) / 10 + ' M): comprueba si son del cierre o del año.'); });
    /* copia para deshacer y marcas de confianza */
    if (Object.keys(antes).length) { d.ajustes = d.ajustes || {}; d.ajustes.copia_ia = d.ajustes.copia_ia || {}; d.ajustes.copia_ia[tk] = { fecha: hoyS, hist: antes }; }
    const lineas = Object.keys(antes);
    lineas.forEach(k => { const todasA = an.every((a, ix) => !isN(f.hist[k][ix]) || (ia.confianza[k] && ia.confianza[k][ix] === 'A')); f.conf[k] = todasA ? 'A' : (f.conf[k] === 'A' ? 'A' : 'P'); });
    const urls = []; Object.keys(ia.fuentes).forEach(k => Object.keys(ia.fuentes[k]).forEach(a => { const u = String(ia.fuentes[k][a]).replace(/#.*$/, ''); if (urls.indexOf(u) < 0) urls.push(u); }));
    f.fuentes = Array.isArray(f.fuentes) ? f.fuentes : []; urls.forEach(u => { if (f.fuentes.indexOf(u) < 0 && f.fuentes.length < 14) f.fuentes.push(u); });
    ia.fecha = hoyS; ia.pendiente = Array.isArray(j.pendiente) ? j.pendiente.slice(0, 80) : (ia.pendiente || []);
    const pend = pendientesBusqueda(f);
    if (escritos.length) { f.notas = (f.notas || []).concat(['Datos completados el ' + hoyS + ' con una IA que busca en documentos de la empresa (cada cifra con su URL en «datos_ia»): ' + lineas.join(', ') + '.' + (pend.length ? ' Pendiente: ' + pend.length + ' datos.' : '') + (av.length ? ' Avisos: ' + av.join(' ') : '')]); f.fecha_datos = hoyS; }
    return { escritos, revisar, sinFuente, cambiosGrandes, av, pendiente: pend, lineas, urls };
  }
  function pendientesBusqueda(f) {   // líneas de la ficha × años aún sin dato con fuente en datos_ia
    const an = (f.anios || []).map(Number), ia = f.datos_ia || { datos: {} }, out = [];
    LIN_BUSQ.forEach(k => { if (['intereses', 'impuestos'].indexOf(k) >= 0 && serieCompleta(f.hist[k])) return; an.forEach((a, ix) => { const v = ia.datos && ia.datos[k] && ia.datos[k][ix]; if (!isN(v)) { const m = (ia.pendiente || []).find(p => p && p.linea === k && Number(p.anio) === a); out.push({ linea: k, anio: a, motivo: m && m.motivo ? String(m.motivo).slice(0, 220) : '' }); } }); });
    return out;
  }
  function deshacerBusqueda(d, tk) {
    const c = d.ajustes && d.ajustes.copia_ia && d.ajustes.copia_ia[tk], f = d.fichas[tk]; if (!c || !f) return false;
    Object.keys(c.hist).forEach(k => { if (c.hist[k] == null) delete f.hist[k]; else f.hist[k] = c.hist[k].slice(); }); delete d.ajustes.copia_ia[tk]; return true;
  }
  function promptFase2(d, tk, sym) {
    const f = d.fichas[tk], an = (f.anios || []).map(Number), div = f.divisa || 'EUR', ia = f.datos_ia || { datos: {}, fuentes: {} }, pend = pendientesBusqueda(f);
    const por = {}; pend.forEach(p => { (por[p.linea] = por[p.linea] || []).push(p); });
    const falta = Object.keys(por).map(k => '- ' + k + ': años ' + por[k].map(p => p.anio).join(', ') + (por[k].find(p => p.motivo) ? ' — motivo previo: ' + por[k].find(p => p.motivo).motivo : '')).join('\n') || '- (nada pendiente)';
    const ya = {}; Object.keys(ia.datos || {}).forEach(k => { if (ia.datos[k].some(isN)) ya[k] = ia.datos[k]; });
    const urls = []; Object.keys(ia.fuentes || {}).forEach(k => Object.keys(ia.fuentes[k]).forEach(a => { const u = String(ia.fuentes[k][a]).replace(/#.*$/, ''); if (urls.indexOf(u) < 0) urls.push(u); }));
    return 'Eres un analista financiero. FASE 2: completar los datos que faltan de ' + (f.nombre || tk) + ' (ticker ' + tk + (sym ? ', símbolo en Yahoo ' + sym : '') + '; cuentas en ' + div + ') para los ejercicios ' + an[0] + '–' + an[an.length - 1] + '. En una fase 1 anterior ya se obtuvo una parte; ahora SOLO hay que conseguir lo pendiente.\n\n' +
      'CÓMO TRABAJAR\n1. Busca tú mismo en internet, sin pedirme datos ni enlaces. Si no puedes abrir una página, busca otra fuente para el mismo dato.\n2. Fuentes: primero primarias (informe anual / documento de registro / 10-K de cada año, comunicados de resultados, web de la empresa y el regulador). Agregadores (StockAnalysis, MarketScreener, Yahoo Finance…) solo para un dato que no aparezca en el primario, con confianza "P".\n3. Presupuesto: planifica unas 5 búsquedas por documento. Un informe anual trae el ejercicio actual y el anterior: abre cada documento una vez y extrae de él todo lo pendiente de sus dos años.\n4. No inventes cifras. Si no puedes abrir ninguna fuente para un dato, null y anótalo como pendiente con el motivo.\n5. Unidades: millones de ' + div + '; acciones en millones; ejercicio completo, nunca 12 meses móviles. Confianza por año: A = leída en el documento primario (también la suma de dos líneas publicadas); P = agregador; E = calculada por ti (con la cuenta en AVISOS); null sin confianza.\n\n' +
      'LO QUE FALTA (solo esto)\n' + falta + '\n\n' +
      'YA OBTENIDO — NO volver a buscar; úsalo solo para contrastar (años ' + an.join(', ') + ')\n' + JSON.stringify(ya) + '\n\n' +
      'DOCUMENTOS YA LOCALIZADOS (reutilízalos, no gastes búsquedas en volver a encontrarlos)\n' + (urls.length ? urls.map(u => '- ' + u).join('\n') : '- (ninguno)') + '\n\n' +
      'FORMATO DE RESPUESTA (obligatorio: tres bloques)\nA) JSON COMPLETO de la serie (lo ya obtenido + lo nuevo), sin texto dentro: {"anios":[' + an.join(',') + '],"datos":{...},"confianza":{...},"fuentes":{"linea":{"año":"https://...#página"}},"pendiente":[{"linea":"...","anio":0,"motivo":"..."}]}\nB) Tabla de FUENTES USADAS: línea, año, documento, URL exacta, página, fecha de publicación; incluye las páginas que no pudiste abrir.\nC) AVISOS: discrepancias entre fuentes (ambas cifras con URL), definiciones distintas y cifras calculadas con su cuenta.';
  }

  function normalizar(d) {
    const b = nuevoDatos(); d = d || {};
    const out = Object.assign({}, b, d);
    out.ajustes = Object.assign({}, b.ajustes, d.ajustes || {});
    out.ajustes.fx = Object.assign({}, b.ajustes.fx, (d.ajustes && d.ajustes.fx) || {});
    ['posiciones', 'movimientos', 'resultados'].forEach(k => { if (!Array.isArray(out[k])) out[k] = []; });
    ['fichas', 'precios', 'cribado'].forEach(k => { if (!out[k] || typeof out[k] !== 'object') out[k] = {}; });
    if (!out.otras || !Array.isArray(out.otras.accounts)) out.otras = { accounts: [] };
    const limpia = o => { if (o && typeof o.divisa === 'string') { const t = o.divisa.trim().toUpperCase(); if (t !== o.divisa) o.divisa = t; } };   // «EUR » con un espacio rompía la comparación de divisas (BIT:SOL@ficha)
    Object.keys(out.fichas).forEach(k => limpia(out.fichas[k])); Object.keys(out.precios).forEach(k => limpia(out.precios[k]));
    return aplicarParches(out);
  }

  /* ───── Nombres y coincidencia de empresas ───── */
  const norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const STOP = { inc: 1, corp: 1, corporation: 1, co: 1, ltd: 1, sa: 1, plc: 1, class: 1, a: 1, b: 1, the: 1, platforms: 1, holdings: 1, group: 1, company: 1, technologies: 1, technology: 1 };
  const coreName = s => norm(s).replace(/['’`´]/g, '').replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w && !STOP[w]).join(' ');
  function sameCompany(p, empresa, ticker) {
    const tk = (ticker || '').trim().toLowerCase(), ptk = (p.ticker || '').trim().toLowerCase();
    if (tk && ptk && tk === ptk) return true;
    const a = coreName(p.empresa), b = coreName(empresa);
    if (!a || !b) return false;
    if (a === b) return true;
    const sh = a.length < b.length ? a : b, lg = a.length < b.length ? b : a;
    return sh.length >= 3 && lg.indexOf(sh + ' ') === 0;
  }
  function findExisting(d, empresa, ticker, broker) {
    const cands = d.posiciones.filter(p => sameCompany(p, empresa, ticker));
    const b = norm(broker).trim();
    if (b) { const ex = cands.filter(p => norm(p.broker).trim() === b); return ex.length ? ex[0] : null; }
    return cands.length === 1 ? cands[0] : null;
  }
  function tickerDe(d, pos) {
    const t = (pos.ticker || '').trim().toUpperCase();
    if (t && d.fichas[t]) return t;
    const a = coreName(pos.empresa);
    for (const k of Object.keys(d.fichas)) { if (a && (coreName(d.fichas[k].nombre) === a || k.toLowerCase() === a)) return k; }
    return t || null;
  }

  /* ───── Divisas y precios ───── */
  function fxPorEur(d, div) { if (div === 'EUR') return 1; const k = d.ajustes.fx[div]; return isN(k) && k > 0 ? k : null; }
  function aEur(d, importe, div) { const k = fxPorEur(d, div); return k ? importe / k : null; }
  /* Precio de una posición en SU moneda. Gana el dato más reciente entre: precio manual de la posición, precios del día y ficha (misma moneda);
     si no hay ninguno en su moneda, convierte el de otra divisa. */
  function precioPos(d, pos) {
    const tk = tickerDe(d, pos), pr = tk && d.precios[tk], f = tk && d.fichas[tk], m = pos.moneda, c = [];
    if (pr && isN(pr.precio) && pr.divisa === m) c.push({ precio: pr.precio, fecha: pr.fecha_precio || '', fuente: pr.fuente || 'precios', rank: 2 });
    if (isN(pos.precio_actual) && pos.precio_actual > 0) c.push({ precio: pos.precio_actual, fecha: pos.fecha_precio || '', fuente: 'manual', rank: 3 });
    if (f && isN(f.precio) && f.divisa === m) c.push({ precio: f.precio, fecha: f.fecha_precio || '', fuente: 'ficha', rank: 1 });
    if (c.length) { c.sort((a, b) => (b.fecha > a.fecha ? 1 : b.fecha < a.fecha ? -1 : b.rank - a.rank)); return Object.assign({ divisa: m, convertido: false }, c[0]); }
    const o = [];
    if (pr && isN(pr.precio) && pr.divisa) o.push({ precio: pr.precio, div: pr.divisa, fecha: pr.fecha_precio || '', fuente: pr.fuente || 'precios' });
    if (f && isN(f.precio) && f.divisa) o.push({ precio: f.precio, div: f.divisa, fecha: f.fecha_precio || '', fuente: 'ficha' });
    o.sort((a, b) => (b.fecha > a.fecha ? 1 : b.fecha < a.fecha ? -1 : 0));
    for (const x of o) {
      const e = aEur(d, x.precio, x.div), k = fxPorEur(d, m);
      if (e != null && k) return { precio: e * k, divisa: m, fecha: x.fecha, fuente: x.fuente, convertido: true };
    }
    return null;
  }
  const costeEur = (d, p) => (isN(p.precio_medio_compra) ? aEur(d, p.cantidad * p.precio_medio_compra, p.moneda) : null);
  function mercadoEur(d, p) { const pp = precioPos(d, p); return pp ? aEur(d, p.cantidad * pp.precio, p.moneda) : null; }
  function valorEur(d, p) { const m = mercadoEur(d, p); return m != null ? m : costeEur(d, p); }
  function variacion(d, p) {
    const pp = precioPos(d, p);
    return pp && !pp.convertido && p.precio_medio_compra > 0 ? pp.precio / p.precio_medio_compra - 1 : null;
  }
  function diasDesde(iso, hoy) {
    if (!iso) return null; const a = Date.parse(iso), b = Date.parse(hoy || today());
    return isN(a) && isN(b) ? Math.round((b - a) / 864e5) : null;
  }

  /* ───── Operaciones de cartera ───── */
  function addMov(d, m) {
    m.id = 'm_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    m.fecha = m.fecha || today(); d.movimientos.push(m); return m;
  }
  function compra(d, x) {
    const empresa = (x.empresa || '').trim(), broker = (x.broker || '').trim(), ticker = (x.ticker || '').trim().toUpperCase();
    const cantidad = Number(x.cantidad), precio = x.precio === '' || x.precio == null ? null : Number(x.precio);
    const moneda = x.moneda || 'USD', fecha = x.fecha || null, sector = (x.sector || '').trim(), notas = (x.notas || '').trim();
    const actual = x.actual === '' || x.actual == null ? null : Number(x.actual);
    if (!empresa) return { ok: false, msg: 'Falta el nombre de la empresa' };
    if (!(cantidad > 0)) return { ok: false, msg: 'Cantidad no válida' };
    if (precio !== null && !(precio > 0)) return { ok: false, msg: 'Precio no válido' };
    const ex = findExisting(d, empresa, ticker, broker);
    if (ex) {
      if (ex.moneda && moneda !== ex.moneda) return { ok: false, msg: 'Esa posición cotiza en ' + ex.moneda + ': cambia la moneda a ' + ex.moneda };
      const antes = clone(ex), oq = ex.cantidad || 0, op = ex.precio_medio_compra, nq = round8(oq + cantidad);
      if (precio !== null && isN(op)) ex.precio_medio_compra = (oq * op + cantidad * precio) / nq;
      else if (precio !== null) ex.precio_medio_compra = precio;
      ex.cantidad = nq;
      if (ticker && !ex.ticker) ex.ticker = ticker;
      if (sector && !ex.sector) ex.sector = sector;
      if (!ex.moneda) ex.moneda = moneda;
      if (notas) ex.notas = (ex.notas ? ex.notas + ' | ' : '') + notas;
      if (actual > 0) { ex.precio_actual = actual; ex.fecha_precio = today(); }
      addMov(d, { tipo: 'compra', empresa: ex.empresa, broker: ex.broker || '', cantidad, precio, moneda: ex.moneda, fecha, antes });
      return { ok: true, msg: 'Sumadas ' + cantidad + ' acciones a ' + ex.empresa };
    }
    if (!broker) return { ok: false, msg: 'Falta el broker' };
    const np = { empresa, ticker, broker, cantidad, precio_medio_compra: precio, moneda, sector, fecha_compra: fecha, notas };
    if (actual > 0) { np.precio_actual = actual; np.fecha_precio = today(); }
    d.posiciones.push(np);
    addMov(d, { tipo: 'compra', empresa, broker, cantidad, precio, moneda, fecha, antes: null });
    return { ok: true, msg: 'Posición añadida: ' + empresa };
  }
  function venta(d, idx, x) {
    const p = d.posiciones[idx]; if (!p) return { ok: false, msg: 'La posición no existe' };
    const cantidad = Number(x.cantidad), pv = x.precio === '' || x.precio == null ? null : Number(x.precio);
    if (!(cantidad > 0)) return { ok: false, msg: 'Cantidad no válida' };
    if (cantidad > p.cantidad + 1e-9) return { ok: false, msg: 'No puedes vender más de lo que tienes' };
    const total = cantidad >= p.cantidad - 1e-9, antes = clone(p);
    addMov(d, { tipo: 'venta', empresa: p.empresa, broker: p.broker || '', cantidad: total ? p.cantidad : cantidad, precio: pv, moneda: p.moneda || null, fecha: x.fecha || null, total, antes });
    if (total) d.posiciones.splice(idx, 1); else p.cantidad = round8(p.cantidad - cantidad);
    return { ok: true, msg: total ? 'Posición cerrada: ' + p.empresa : 'Venta parcial registrada: ' + p.empresa };
  }
  function editar(d, idx, x) {
    const t = d.posiciones[idx]; if (!t) return { ok: false, msg: 'La posición no existe' };
    const cantidad = Number(x.cantidad);
    if (!(x.empresa || '').trim()) return { ok: false, msg: 'Falta el nombre de la empresa' };
    if (!(cantidad > 0)) return { ok: false, msg: 'Cantidad no válida' };
    t.empresa = x.empresa.trim(); t.ticker = (x.ticker || '').trim().toUpperCase(); t.broker = (x.broker || '').trim();
    t.cantidad = cantidad; t.precio_medio_compra = x.precio === '' || x.precio == null ? null : Number(x.precio);
    t.moneda = x.moneda || t.moneda; t.sector = (x.sector || '').trim(); t.fecha_compra = x.fecha || null; t.notas = (x.notas || '').trim();
    return { ok: true, msg: 'Posición actualizada: ' + t.empresa };
  }
  function eliminar(d, idx) { const p = d.posiciones[idx]; if (!p) return { ok: false, msg: 'La posición no existe' }; d.posiciones.splice(idx, 1); return { ok: true, msg: 'Ficha eliminada: ' + p.empresa }; }
  function reverseMov(d, m) {
    if (m.importado) return 'Se quita solo del historial (venta anterior al registro de movimientos).';
    let idx = -1;
    d.posiciones.forEach((p, i) => { if (idx === -1 && norm(p.empresa) === norm(m.empresa) && norm(p.broker) === norm(m.broker)) idx = i; });
    if (m.tipo === 'venta') {
      if (idx >= 0) { d.posiciones[idx].cantidad = round8(d.posiciones[idx].cantidad + m.cantidad); return ''; }
      if (m.antes) { const c = clone(m.antes); c.cantidad = m.cantidad; d.posiciones.push(c); return ''; }
      return 'No se pudo recuperar la posición; se quita solo del historial.';
    }
    if (m.tipo === 'compra') {
      if (idx < 0) return 'La posición ya no existe; se quita solo del historial.';
      const p = d.posiciones[idx], nq = p.cantidad - m.cantidad;
      if (nq <= 1e-9) { d.posiciones.splice(idx, 1); return ''; }
      if (m.antes && Math.abs(p.cantidad - (m.antes.cantidad + m.cantidad)) < 1e-9) p.precio_medio_compra = m.antes.precio_medio_compra;
      else if (m.precio != null && p.precio_medio_compra != null) {
        const avg = (p.cantidad * p.precio_medio_compra - m.cantidad * m.precio) / nq;
        if (isFinite(avg) && avg > 0) p.precio_medio_compra = avg;
      }
      p.cantidad = round8(nq); return '';
    }
    return '';
  }
  function borrarMov(d, id) {
    const i = d.movimientos.findIndex(m => m.id === id); if (i < 0) return { ok: false, msg: 'No existe esa operación' };
    const m = d.movimientos[i], aviso = reverseMov(d, m); d.movimientos.splice(i, 1);
    return { ok: true, msg: aviso || ((m.tipo === 'venta' ? 'Venta' : 'Compra') + ' deshecha: ' + m.empresa) };
  }
  /* Precio manual de un valor: se guarda por ticker (lo leen cartera y valoración) o, sin ticker, en la propia posición */
  function precioManual(d, pos, precio, hoy) {
    const p = Number(precio); if (!(p > 0)) return false;
    const tk = (pos.ticker || '').trim().toUpperCase();
    if (tk) d.precios[tk] = { ticker: tk, precio: p, divisa: pos.moneda, fecha_precio: hoy || today(), fuente: 'manual', actualizado: new Date().toISOString() };
    else { pos.precio_actual = p; pos.fecha_precio = hoy || today(); }
    return true;
  }

  /* ───── Valoración de una empresa (motor Val) ───── */
  const MISMO_VALOR = { EUR: 1, USD: 1, CAD: 1 };   // divisas entre las que una misma cotización se convierte sin ratio ni prima
  function precioFicha(d, tk) {
    const f = d.fichas[tk], pf = d.precios[tk + '@ficha'];
    let pr = d.precios[tk], precio = f.precio, fecha = f.fecha_precio || '', aviso = null, convertido = null;
    // Cotización en la divisa de la ficha (p. ej. TSM: ADR en USD, ficha en TWD → se usa 2330.TW)
    if (pf && isN(pf.precio) && pf.divisa === f.divisa && (!pr || pr.divisa !== f.divisa || (pf.fecha_precio || '') >= (pr.fecha_precio || ''))) pr = pf;
    if (pr && isN(pr.precio) && (pr.fecha_precio || '') >= fecha) {
      if (pr.divisa === f.divisa) { precio = pr.precio; fecha = pr.fecha_precio || ''; }
      else if (MISMO_VALOR[pr.divisa] && MISMO_VALOR[f.divisa]) {   // EUR/USD/CAD: misma acción cotizando en otra moneda (p. ej. CSU: cotiza en CAD, cuentas en USD) → se convierte con el tipo de cambio de la app
        const e = aEur(d, pr.precio, pr.divisa), k = fxPorEur(d, f.divisa);
        if (e != null && k) { precio = e * k; fecha = pr.fecha_precio || ''; convertido = pr.divisa + '→' + f.divisa; }
        else aviso = 'Sin tipo de cambio ' + pr.divisa + '/' + f.divisa + ': el precio automático (' + pr.divisa + ') no se usa y la ficha queda con su último precio. Añade la divisa en Ajustes.';
      } else aviso = 'El precio automático está en ' + pr.divisa + ' y la ficha en ' + f.divisa + ': no se mezclan. Se usa el precio de la ficha (o su cotización «@ficha»); ponlo a mano en ' + f.divisa + '.';   // otras divisas (ADR de TSM, H-share de CATL) valen distinto por ratio/prima: no se convierten
    }
    return { precio, fecha, aviso, convertido };
  }
  /* Matriz de precios de entrada (método FCFA2S): precio máximo en la divisa de la ficha y en la de cotización (p. ej. CSU: USD y CAD) */
  function matrizEntrada(d, tk, rs, mults) {
    const f0 = d.fichas[tk]; if (!f0 || !V.esFC(f0)) return null;
    const pf = precioFicha(d, tk), f = Object.assign({}, f0, { precio: pf.precio }); rs = rs || [0.12, 0.15, 0.18]; mults = mults || [20, 26, 30];
    const q = (d.precios[tk] || {}).divisa, kq = q && q !== f.divisa && MISMO_VALOR[q] ? (fxPorEur(d, q) / fxPorEur(d, f.divisa)) : null;   // unidades de cotización por 1 de la ficha
    const m = V.matrizEntrada(f, rs, mults), filas = rs.map(r => ({ r, celdas: mults.map(x => ({ mult: x, precio: m[r][x], cot: isN(m[r][x]) && kq ? m[r][x] * kq : null })) }));
    return { filas, mults, divisa: f.divisa, cotizacion: kq ? q : null, precio: pf.precio, hor: V.proyectar(f, V.defaults(f).conservador).hor[5] };
  }
  /* ───── Auditoría de divisas de todas las fichas †: ¿el precio que se usa está en la moneda de las cuentas, es reciente y viene de una fuente coherente? ───── */
  function auditoriaDivisas(d, hoy) {
    hoy = hoy || today(); const out = [], fx = d.ajustes && d.ajustes.fx || {};
    Object.keys(d.fichas || {}).forEach(tk => {
      const f = d.fichas[tk]; if (!f || !f.divisa) return; const nombre = f.nombre || tk, add = (nivel, txt) => out.push({ tk, nombre, nivel, txt });
      let p; try { p = precioFicha(d, tk); } catch (e) { add('r', 'No se puede obtener el precio: ' + e.message); return; }
      if (!isN(p.precio) || !(p.precio > 0)) return add('r', 'Sin precio utilizable en ' + f.divisa + '.');
      if (p.aviso) add('y', p.aviso);
      if (p.convertido) { add('i', 'Cotiza en ' + p.convertido.split('→')[0] + ' y la ficha está en ' + f.divisa + ': se convierte con el tipo de Ajustes (' + (fx.fecha || 's/f') + ').'); const dfx = diasDesde(fx.fecha, hoy); if (dfx != null && dfx > 5) add('y', 'El tipo de cambio es de hace ' + dfx + ' días.'); }
      const dp = p.fecha ? diasDesde(p.fecha, hoy) : null;
      if (dp == null) add('y', 'El precio no tiene fecha.'); else if (dp > 4) add('y', 'Precio de hace ' + dp + ' días (' + p.fecha + '): puede no reflejar el mercado.');
      const pa = d.precios[tk], pf = d.precios[tk + '@ficha'];
      if (pa && pa.divisa !== f.divisa && !(pf && pf.divisa === f.divisa) && !p.convertido && !p.aviso) add('y', 'El precio automático está en ' + pa.divisa + ' y la ficha en ' + f.divisa + ' sin cotización «@ficha»: se usa el precio guardado en la ficha.');
      if (pf && pf.divisa !== f.divisa) add('y', 'La cotización «@ficha» está en ' + pf.divisa + ' y la ficha en ' + f.divisa + '.');
    });
    const o = { r: 0, y: 1, i: 2 }; return out.sort((a, b) => o[a.nivel] - o[b.nivel] || a.tk.localeCompare(b.tk));
  }

  /* ───── Múltiplos propios de cada empresa †: sustituyen a los genéricos (15x/15x/9x/11x) cuando hay histórico de precios ───── */
  const ES_INDUSTRIAL = f => !!f && (!f.tipo || f.tipo === 'industrial') && f.metodo !== 'margen_objetivo' && f.metodo !== 'fcfa2s';
  const provisional = f => ES_INDUSTRIAL(f) && !f.mult_hist;
  function proponerMultiplos(d, tk, hist) {
    const f = d.fichas[tk]; if (!ES_INDUSTRIAL(f)) return { tk, motivo: 'no aplica (método distinto)' };
    const e = hist && hist.simbolos && hist.simbolos[tk]; if (!e) return { tk, motivo: 'sin histórico de precios (aún no descargado)' };
    if (e.divisa !== f.divisa) return { tk, motivo: 'el histórico está en ' + e.divisa + ' y la ficha en ' + f.divisa + ': no se mezclan' };
    const r = V.multiplosHistoricos(f, e.cierres, e.splits); if (!r) return { tk, motivo: 'no aplica' };
    if (!r.valido) return { tk, r, motivo: Object.keys(r.descartado || {}).length ? 'múltiplos muy inestables entre años (' + Object.keys(r.descartado).map(k => k + ' ±' + Math.round(r.descartado[k] * 100) + ' %').join(', ') + '): no hay un «de siempre» fiable' : 'datos insuficientes (' + r.anios.length + ' cierres de ejercicio con precio, ' + Math.max(r.n.per, r.n.pfcf) + ' con PER o P/FCF calculables; hacen falta 5)' };
    const alto = ['per', 'pfcf'].filter(k => r.mult[k] > 40); if (alto.length) return { tk, r, motivo: 'el múltiplo histórico es muy alto (' + alto.map(k => k + ' ' + r.mult[k] + 'x').join(', ') + '): no se aplica solo, revísalo a mano' };
    return { tk, r, mult: r.mult };
  }
  /* Aplica a las fichas provisionales (sin mult_hist) las propuestas válidas. Informe antes/después de la rentabilidad a 5 años; se puede deshacer (ajustes.mult_auto). */
  function aplicarMultiplos(d, hist, solo) {
    const rep = []; d.ajustes.mult_auto = d.ajustes.mult_auto || {};
    Object.keys(d.fichas).forEach(tk => {
      if (solo && solo.indexOf(tk) < 0) return; const f = d.fichas[tk]; if (!provisional(f)) return;
      const pr = proponerMultiplos(d, tk, hist); if (!pr.mult) { rep.push({ tk, nombre: f.nombre || tk, aplicado: false, motivo: pr.motivo }); return; }
      const antes = (() => { try { return valoracion(d, tk).ref; } catch (e) { return null; } })();
      f.mult_hist = Object.assign({}, pr.mult); f.mult_hist_auto = { fecha: today(), anios: pr.r.anios, n: pr.r.n, dispersion: pr.r.dispersion, ajustes_split: pr.r.ajustes, fuente: 'cierres anuales (Yahoo) × cifras de la ficha' };
      cache.clear(); const desp = (() => { try { return valoracion(d, tk).ref; } catch (e) { return null; } })();
      d.ajustes.mult_auto[tk] = { fecha: today() }; rep.push({ tk, nombre: f.nombre || tk, aplicado: true, mult: pr.mult, n: pr.r.n, antes: isN(antes) ? antes : null, despues: isN(desp) ? desp : null, dispersion: pr.r.dispersion });
    }); cache.clear(); return rep;
  }
  function deshacerMultiplos(d) { const ks = Object.keys(d.ajustes.mult_auto || {}); ks.forEach(tk => { const f = d.fichas[tk]; if (f && f.mult_hist_auto) { delete f.mult_hist; delete f.mult_hist_auto; } }); d.ajustes.mult_auto = {}; cache.clear(); return ks; }
  /* ───── Calidad de fichas: una sola lectura de lo fiable que es cada valoración, con la acción concreta para mejorarla ─────
     ctx = { hist (precios_anuales.json), sec: (tk,f)=>{doce,nuevo}|null, secEntrada: tk=>entrada de datos/resumen.json|undefined, secListo: bool }
     Cada problema lleva `acc` (código de acción que la interfaz sabe ejecutar) para no tener que ir buscando por pestañas:
       precio · abrir (revisar/completar datos) · multpropios · solofcf · quitarsolofcf · cifras12 (SEC → workflow; sin SEC → IA/manual) · nuevoej */
  const NIVEL_Q = { r: 'poco fiable', y: 'revisar', ok: 'fiable' };
  function distorsion(f) {
    if (!ES_INDUSTRIAL(f) || V.isFin(f) || !f.hist) return null;
    const h = f.hist, n = (h.ventas || []).length, g = (a, j) => (Array.isArray(a) && isN(a[j]) ? a[j] : 0), out = [];
    for (let j = Math.max(0, n - 4); j < n; j++) {
      const ebit = g(h.ebit, j), ni = isN((h.ni_reportado || [])[j]) ? h.ni_reportado[j] : ebit - g(h.intereses, j) - g(h.impuestos, j) - g(h.minoritarios, j) + g(h.otros, j);
      const fcf = isN((h.fco || [])[j]) ? h.fco[j] - g(h.capex, j) - g(h.leases, j) : ebit + g(h.da, j) - g(h.capex, j) - g(h.intereses, j) - g(h.impuestos, j) - g(h.minoritarios, j) - g(h.leases, j);
      out.push({ anio: (f.anios || [])[j], ni, fcf, ebit, ratio: ni > 0 ? fcf / ni : null, niEbit: ebit > 0 ? ni / ebit : null });
    }
    const raros = out.filter(x => x.ratio == null ? (x.fcf > 0 || x.ni <= 0 && x.ebit > 0) : x.ratio < 0.6 || x.ratio > 1.6), baja = out.filter(x => x.niEbit != null && x.niEbit < 0.4);
    const fcfPos = out.length && out[out.length - 1].fcf > 0;
    return { serie: out, raros: raros.length, baja: baja.length, distorsionada: out.length >= 3 && fcfPos && (raros.length >= 2 || baja.length >= 2) };
  }
  function calidadFichas(d, hoy, ctx) {
    hoy = hoy || today(); ctx = ctx || {}; const out = [], aud = auditoriaDivisas(d, hoy).filter(x => x.nivel !== 'i');
    Object.keys(d.fichas || {}).forEach(tk => {
      const f = d.fichas[tk]; if (!f || !V.soportado(f)) return; const est = f.estado || null, iss = [], add = (nivel, cod, txt, acc, accTxt) => iss.push({ nivel, cod, txt, acc: acc || null, accTxt: accTxt || null });
      let v = null; try { v = valoracion(d, tk, hoy); } catch (e) { v = { error: e.message }; }
      /* 1 · datos y precio */
      if (v && v.incompleta) add('r', 'incompleta', 'Ficha incompleta: faltan ' + v.incompleta.join(', ') + '.', 'abrir', 'Completar datos');
      else if (v && v.sinPrecio) add('r', 'sinprecio', 'Sin precio de cotización.', 'precio', 'Poner precio');
      else if (v && v.error) add('r', 'error', v.error, 'abrir', 'Abrir ficha');
      if (v && v.graves) add('r', 'graves', v.graves + ' dato(s) dudoso(s) en la ficha' + (v.avisos && v.avisos[0] ? ': ' + v.avisos[0] : '') + '.', 'abrir', 'Revisar datos');
      if (v && !v.error && v.diasPrecio != null && v.diasPrecio > 7) add('y', 'precioviejo', 'Precio de hace ' + v.diasPrecio + ' días.', 'precio', 'Actualizar precio');
      if (f._borrador) add('y', 'borrador', 'Ficha borrador creada desde informes: sin verificar.', 'abrir', 'Revisar');
      aud.filter(x => x.tk === tk).forEach(x => add(x.nivel === 'r' ? 'r' : 'y', 'divisa', x.txt, 'precio', 'Corregir precio/divisa'));
      /* 2 · múltiplos de salida genéricos */
      if (provisional(f)) {
        const pr = ctx.hist ? proponerMultiplos(d, tk, ctx.hist) : null;
        if (pr && pr.mult) add('y', 'multprov', 'Usa múltiplos genéricos (15x/15x/9x/11x); se pueden calcular propios del histórico.', 'multpropios', 'Calcular múltiplos propios');
        else add('y', 'multprov', 'Usa múltiplos genéricos' + (pr && pr.motivo ? ' (' + pr.motivo + ')' : '') + '. Introduce los tuyos a mano en la ficha.', 'abrir', 'Poner múltiplos a mano');
      }
      /* 3 · contabilidad distorsionada → método de flujo */
      const ds = distorsion(f);
      if (f.solo_fcf) add('i', 'solofcf', 'Método alternativo activo: la salida se valora solo con el flujo de caja (P/FCF).', 'quitarsolofcf', 'Volver al método normal');
      else if (ds && ds.distorsionada) add('i', 'distorsion', 'El beneficio contable no casa con el flujo de caja (' + ds.raros + ' de ' + ds.serie.length + ' años fuera de 0,6–1,6x FCF/beneficio' + (ds.baja >= 2 ? '; beneficio neto muy bajo frente al EBIT' : '') + '): el PER y el EV/EBITDA pueden engañar. Ojo: en el backtest 2021-24 valorar solo con flujo de caja empeoró el acierto (error mediano 64 % frente a 56 %), úsalo solo para contrastar.', 'solofcf', 'Valorar solo con el flujo de caja');
      /* 4 · base de 12 meses (TTM): SEC o, si la empresa no está en la SEC, IA/manual */
      if (!f._borrador && f.anio_base) {
        const fin = f.anio_base + '-' + String(f.mes_cierre || 12).padStart(2, '0') + '-28', mesesDesde = Math.floor((Date.parse(hoy) - Date.parse(fin)) / (30.44 * 864e5));
        const sd = ctx.sec ? ctx.sec(tk, f) : null, doce = sd && sd.doce && isN(sd.doce.dv) ? sd.doce : null;
        const ent = ctx.secEntrada ? ctx.secEntrada(tk) : undefined, enSEC = ent ? !ent.error : false, via = enSEC ? 'sec' : 'ia';
        if (doce) {
          const dif = Math.max(Math.abs(doce.dv), isN(doce.de) ? Math.abs(doce.de) : 0);
          if (dif > 0.15) add('y', 'ttm_difiere', 'Los últimos 12 meses (hasta ' + doce.fin + ', ' + (doce.fuente || 'SEC') + ') se desvían un ' + Math.round(dif * 100) + ' % del último ejercicio: la ficha parte de un año que ya no representa a la empresa.', 'abrir', 'Ver últimos 12 meses');
        } else if (mesesDesde >= 5 && mesesDesde < 30) {
          add('y', 'ttm_falta', 'Sin cifras de 12 meses: la ficha parte del ejercicio ' + f.anio_base + ' (hace ' + mesesDesde + ' meses) y ya hay trimestres publicados. ' + (via === 'sec' ? 'Está en la SEC: se descargan solas.' : ctx.secListo ? 'No está en la SEC: se obtienen con una IA o a mano.' : ''), 'cifras12', via === 'sec' ? 'Traer cifras de la SEC' : 'Cifras con una IA');
        }
        if (sd && sd.nuevo) add('y', 'nuevoej', 'Ya hay un ejercicio ' + sd.nuevo + ' publicado y la ficha parte de ' + f.anio_base + '.', 'nuevoej', 'Añadir el ejercicio ' + sd.nuevo);
      }
      /* 5 · contraste DCF inverso vs rentabilidad por múltiplos */
      if (v && !v.error && isN(v.ref) && !V.isFin(f) && !V.esMO(f)) {
        try {
          const fx = Object.assign({}, f, { precio: v.precio }), dcf = V.dcfInverso(fx, 0.10, 0.03), gE = (V.defaults(fx).conservador || {}).g;
          const ac = V.actuales(fx), fcfDeprimido = ac && isN(ac.pfcf) && isN(ac.per) && ac.per > 0 && ac.pfcf > 2.5 * ac.per;   // inversión récord (capex de IA…): el flujo libre de hoy no representa el beneficio y el DCF inverso exagera el crecimiento exigido
          if (fcfDeprimido) { if (dcf && isN(dcf.g) && isN(gE) && Math.abs(dcf.g - gE) > 0.04) add('i', 'dcf_fcf', 'El DCF inverso por flujo libre no es comparable aquí: hoy paga ' + Math.round(ac.pfcf) + 'x flujo libre frente a ' + Math.round(ac.per) + 'x beneficio (inversión elevada); no se contrasta.', 'abrir', 'Ver ficha'); }
          else if (dcf && isN(dcf.g) && isN(gE)) {
            if (v.ref >= 0.12 && dcf.g - gE > 0.04) add('y', 'dcf', 'Contradicción: por múltiplos rinde un ' + Math.round(v.ref * 100) + ' % pero el precio ya descuenta un crecimiento del ' + Math.round(dcf.g * 100) + ' % (tu escenario: ' + Math.round(gE * 100) + ' %). Revisa si los múltiplos de salida son demasiado altos.', 'abrir', 'Ver DCF inverso');
            else if (v.ref <= 0.05 && gE - dcf.g > 0.04) add('y', 'dcf', 'Contradicción: por múltiplos rinde solo un ' + Math.round(v.ref * 100) + ' % pero el precio solo descuenta un ' + Math.round(dcf.g * 100) + ' % de crecimiento (tu escenario: ' + Math.round(gE * 100) + ' %). Puede que los múltiplos de salida sean demasiado bajos.', 'abrir', 'Ver DCF inverso');
          } else if (dcf && dcf.g == null && v.ref >= 0.12) add('y', 'dcf', 'Contradicción: por múltiplos rinde un ' + Math.round(v.ref * 100) + ' % pero ni con +60 % anual se justifica el precio con flujos.', 'abrir', 'Ver DCF inverso');
        } catch (e) { }
      }
      const nr = iss.filter(x => x.nivel === 'r').length, ny = iss.filter(x => x.nivel === 'y').length, pf = v && isN(v.puntuacion) ? v.puntuacion : 70;
      const score = Math.max(0, Math.min(100, Math.round(pf * 0.5 + (100 - 25 * nr - 8 * ny) * 0.5)));
      const nivel = nr ? 'r' : ny >= 2 || (ny && pf < 60) ? 'y' : 'ok';
      out.push({ tk, nombre: f.nombre || tk, estado: est, nivel, etiqueta: NIVEL_Q[nivel], score, problemas: iss, sumaR: nr, sumaY: ny });
    });
    const orden = { r: 0, y: 1, ok: 2 };
    return out.sort((a, b) => orden[a.nivel] - orden[b.nivel] || a.score - b.score || a.tk.localeCompare(b.tk));
  }
  /* Método alternativo (solo flujo de caja): vista previa y aplicación; siempre reversible */
  function previsualizarSoloFcf(d, tk) {
    const f = d.fichas[tk]; if (!f) return null; const ant = f.solo_fcf; let a = null, b = null;
    try { delete f.solo_fcf; cache.clear(); a = valoracion(d, tk).ref; f.solo_fcf = true; cache.clear(); b = valoracion(d, tk).ref; } catch (e) { }
    if (ant) f.solo_fcf = ant; else delete f.solo_fcf; cache.clear();
    return { antes: isN(a) ? a : null, despues: isN(b) ? b : null, distorsion: distorsion(f) };
  }
  function aplicarSoloFcf(d, tk, activar) { const f = d.fichas[tk]; if (!f) return false; if (activar) { f.solo_fcf = true; f.solo_fcf_fecha = today(); } else { delete f.solo_fcf; delete f.solo_fcf_fecha; } cache.clear(); return true; }
  const cache = new Map();
  /* Contraste entre fuentes: fuentes = [{fuente, valores:[...]}] (un valor por año, o un solo valor) y elegido = lo que se usa.
     Devuelve las diferencias de más de `umbral` (5 % por defecto) entre la fuente más baja y la más alta, y cuántas fuentes respaldan cada dato. */
  function contrastar(fuentes, elegido, umbral) {
    umbral = umbral == null ? 0.05 : umbral; const F = (fuentes || []).filter(x => x && Array.isArray(x.valores)), n = (elegido || []).length, disc = []; let sinContraste = 0;
    for (let i = 0; i < n; i++) {
      const vs = F.map(x => ({ f: String(x.fuente || '?'), v: isN(x.valores[i]) ? x.valores[i] : null })).filter(x => x.v != null);
      if (isN(elegido[i]) && vs.length < 2) { sinContraste++; continue; }
      if (vs.length < 2) continue;
      const mn = vs.reduce((a, b) => (b.v < a.v ? b : a)), mx = vs.reduce((a, b) => (b.v > a.v ? b : a)), base = Math.max(Math.abs(mx.v), Math.abs(mn.v));
      if (base > 0 && (mx.v - mn.v) / base > umbral) disc.push({ i, min: mn, max: mx, dif: (mx.v - mn.v) / base, fuentes: vs });
    }
    return { discrepancias: disc, sinContraste, nFuentes: F.length };
  }
  /* Líneas que el motor necesita y la ficha no tiene (las fichas borrador creadas desde informes solo traen ventas, EBIT, beneficio neto y BPA) */
  const NOM_LINEA = { intereses: 'intereses', impuestos: 'impuestos', da: 'amortización', capex: 'capex', deuda: 'deuda', caja: 'caja' };
  function lineasFaltantes(f) { const h = (f && f.hist) || {}; return Object.keys(NOM_LINEA).filter(k => !Array.isArray(h[k])).map(k => NOM_LINEA[k]); }

  /* ───── Cambiar el ticker de una ficha (p. ej. NRO → NRO.PA): se mueve en TODO lo que lo usa ───── */
  const tickerValido = t => /^[A-Z0-9][A-Z0-9.:\-_ ]{0,24}$/.test(t || '');
  /* Claves con las que buscar en ficheros públicos por ticker (calendario, SEC): el actual, el anterior y el base sin sufijo de bolsa */
  function claves(d, tk) { const f = (d && d.fichas && d.fichas[tk]) || {}; return [tk, f.ticker_anterior, baseTk(tk)].filter((x, i, a) => x && a.indexOf(x) === i); }
  function renombrarTicker(d, viejo, nuevo) {
    nuevo = String(nuevo || '').trim().toUpperCase();
    if (!d.fichas[viejo]) return { ok: false, error: 'No existe la ficha ' + viejo };
    if (!nuevo || nuevo === viejo) return { ok: true, sinCambios: true };
    if (!tickerValido(nuevo)) return { ok: false, error: 'Ticker no válido: usa letras, números, punto, guion o dos puntos (ej. NRO.PA)' };
    if (d.fichas[nuevo] || (d.cribado || {})[nuevo]) return { ok: false, error: 'Ya existe una ficha o una entrada del cribado con el ticker ' + nuevo };
    const c = {};
    const f = d.fichas[viejo]; f.ticker_anterior = f.ticker_anterior || viejo; if (f.ticker != null) f.ticker = nuevo;
    d.fichas[nuevo] = f; delete d.fichas[viejo]; c.ficha = 1;
    ['', '@ficha'].forEach(suf => { if (d.precios && d.precios[viejo + suf]) { const p = d.precios[viejo + suf]; if (p.ticker) p.ticker = nuevo; d.precios[nuevo + suf] = p; delete d.precios[viejo + suf]; c.precios = (c.precios || 0) + 1; } });
    if (d.cribado && d.cribado[viejo]) { const e = d.cribado[viejo]; if (e.ticker != null) e.ticker = nuevo; d.cribado[nuevo] = e; delete d.cribado[viejo]; c.cribado = 1; }
    (d.posiciones || []).forEach(p => { if ((p.ticker || '').trim().toUpperCase() === viejo) { p.ticker = nuevo; c.posiciones = (c.posiciones || 0) + 1; } });
    (d.resultados || []).forEach(r => { if (r.tk === viejo) { r.tk = nuevo; c.resultados = (c.resultados || 0) + 1; } });
    const al = d.ajustes && d.ajustes.alias_informes; if (al && al[viejo] != null) { al[nuevo] = al[viejo]; delete al[viejo]; c.alias = 1; }
    cache.clear && cache.clear();
    return { ok: true, viejo, nuevo, cambios: c };
  }
  function valoracion(d, tk, hoy) {
    const f0 = d.fichas[tk]; if (!f0) return null;
    hoy = hoy || today();
    if (!V.soportado(f0)) return { tk, nombre: f0.nombre, noSoportado: true };
    { const falta = f0._borrador ? lineasFaltantes(f0).filter(x => x !== 'intereses') : []; if (falta.length) return { tk, nombre: f0.nombre || tk, error: 'ficha incompleta: faltan ' + falta.join(', '), incompleta: falta }; }   // un borrador sin deuda/caja/… no se valora (saldría inflada)
    try {
      const pf = precioFicha(d, tk), f = Object.assign({}, f0, { precio: pf.precio });
      if (!(pf.precio > 0)) return { tk, nombre: f0.nombre || tk, divisa: f0.divisa, error: 'sin precio de cotización (revisa el símbolo en simbolos.json y actualiza precios)', sinPrecio: true };
      const ac = ((f.hist || {}).acciones || []).slice(-1)[0];
      if (!(ac > 0) && !V.isFin(f0)) return { tk, nombre: f0.nombre || tk, divisa: f0.divisa, error: 'falta el número de acciones del último ejercicio (edítalo en «Revisar datos»)', sinAcciones: true };
      const esc = Object.assign({}, V.defaults(f).conservador, (f.escenarios || {}).conservador || {});
      const res = V.proyectar(f, esc), ref = res.cagr[5].ref;
      const ent = V.precioEntrada(f, res, d.ajustes.objetivo / 100), max = V.precioEntrada(f, res, d.ajustes.minimo / 100);
      const fi = V.fiabilidad(f, hoy) || {};
      return {
        tk, nombre: f0.nombre || tk, divisa: f0.divisa, precio: pf.precio, fechaPrecio: pf.fecha, diasPrecio: diasDesde(pf.fecha, hoy),
        ref: isN(ref) ? ref : null, entrada: isN(ent) ? ent : null, max: isN(max) ? max : null,
        distEntrada: isN(ent) && ent > 0 ? pf.precio / ent - 1 : null, distMax: isN(max) && max > 0 ? pf.precio / max - 1 : null,
        ciclica: !!f0.ciclica, tipo: f0.tipo || 'industrial', estado: f0.estado || null, fechaDatos: f0.fecha_datos || null,
        puntuacion: fi.puntuacion == null ? null : fi.puntuacion, nivelDatos: fi.nivel || null, graves: fi.graves || 0,
        avisos: (fi.avisos || []).filter(a => a.nivel === 'r').map(a => a.txt)
      };
    } catch (e) { const falta = lineasFaltantes(f0); return { tk, nombre: f0.nombre || tk, error: falta.length ? 'ficha incompleta: faltan ' + falta.join(', ') : e.message, incompleta: falta.length ? falta : undefined }; }
  }

  /* ───── Resultados trimestrales: ¿la empresa va en línea con lo que suponía la valoración? ─────
     doce = {fin:'AAAA-MM-DD' (cierre del último trimestre), dv: ventas 12m / ventas año base − 1, de: EBIT 12m / EBIT año base − 1, basefin?: cierre del año base, deuda_neta?, acciones?}
     Compara el crecimiento real desde el año base con el que el escenario conservador proyectaba para ese mismo periodo, y recalcula la rentabilidad a 5 años partiendo de las cifras de 12 meses
     (mismos supuestos) y, aparte, si el margen de 12 meses se mantuviera. */
  const UMBRAL_DESV = 0.10, UMBRAL_REF = 0.015;
  function revision(d, tk, doce, hoy) {
    const f0 = d.fichas[tk]; if (!f0 || !doce || !V.soportado(f0) || !isN(doce.dv)) return null;
    if (f0._borrador && !V.isFin(f0) && lineasFaltantes(f0).some(x => x !== 'intereses')) return { error: 'ficha incompleta: faltan ' + lineasFaltantes(f0).join(', '), incompleta: true };   // sin deuda/caja/… saldría inflada
    try {
      const pf = precioFicha(d, tk), f = Object.assign({}, f0, { precio: pf.precio });
      const esc = Object.assign({}, V.defaults(f).conservador, (f.escenarios || {}).conservador || {});
      const res = V.proyectar(f, esc), antes = res.cagr[5].ref, h = f.hist, n = h.ventas.length - 1, r0 = res.rows[0];
      const eb0 = h.ebit[n] - ((h.extra && isN(h.extra[n])) ? h.extra[n] : 0), v0 = h.ventas[n];
      const fb = doce.basefin || (f.anio_base + '-12-31');
      const t = Math.max(0, Math.min(1.5, (Date.parse(doce.fin) - Date.parse(fb)) / (365.25 * 864e5)));
      const gv = r0.ventas / v0 - 1, ge = eb0 > 0 && r0.ebit > 0 ? r0.ebit / eb0 - 1 : null;
      const ventasEsp = Math.pow(1 + gv, t) - 1, ebitEsp = ge == null ? null : Math.pow(1 + ge, t) - 1;
      const desvVentas = (1 + doce.dv) / (1 + ventasEsp) - 1, desvEbit = isN(doce.de) && ebitEsp != null && eb0 > 0 ? (1 + doce.de) / (1 + ebitEsp) - 1 : null;
      const f2 = Object.assign({}, f, { escenarios: { conservador: esc }, hist: Object.assign({}, h) });
      const esc1 = (arr, k) => { const a = (arr || []).slice(); if (isN(a[n])) a[n] = a[n] * k; return a; };
      f2.hist.ventas = esc1(h.ventas, 1 + doce.dv); f2.hist.da = esc1(h.da, 1 + doce.dv); f2.hist.capex = esc1(h.capex, 1 + doce.dv);
      if (isN(doce.de) && eb0 > 0) f2.hist.ebit = esc1(h.ebit, 1 + doce.de);
      if (isN(doce.acciones) && doce.acciones > 0) { f2.hist.acciones = (h.acciones || []).slice(); f2.hist.acciones[n] = doce.acciones; }
      if (isN(doce.deuda_neta)) { const cj = isN(last0(h.caja)) ? last0(h.caja) : 0, ls = isN(last0(h.leases_deuda)) ? last0(h.leases_deuda) : 0; f2.hist.deuda = (h.deuda || []).slice(); f2.hist.deuda[n] = doce.deuda_neta + cj - ls; }
      const despues = V.proyectar(f2, esc).cagr[5].ref;
      const m12 = isN(doce.de) && eb0 > 0 ? (eb0 * (1 + doce.de)) / (v0 * (1 + doce.dv)) : null;
      const conMargen = m12 != null && m12 > 0 ? V.proyectar(f2, Object.assign({}, esc, { m: m12 })).cagr[5].ref : null;
      const desv = desvEbit != null ? desvEbit : desvVentas, dr = isN(despues) && isN(antes) ? despues - antes : 0;
      const pos = desv >= UMBRAL_DESV || dr >= UMBRAL_REF, neg = desv <= -UMBRAL_DESV || dr <= -UMBRAL_REF;
      const veredicto = pos && neg ? 'mixto' : pos ? 'mejor' : neg ? 'peor' : 'linea';
      return { tk, antes: isN(antes) ? antes : null, despues: isN(despues) ? despues : null, conMargen: isN(conMargen) ? conMargen : null,
        margenBase: v0 > 0 && eb0 > 0 ? eb0 / v0 : null, margen12: m12, t, ventasEsp, ebitEsp, desvVentas, desvEbit, dv: doce.dv, de: isN(doce.de) ? doce.de : null,
        veredicto, precio: pf.precio, fin: doce.fin };
    } catch (e) { return { tk, error: e.message }; }
  }
  const last0 = a => (a && a.length ? a[a.length - 1] : undefined);
  /* Precio de referencia para la alerta de ±25 %: el de la última revisión hecha o, si no hay, el anotado al crear el registro pendiente */
  function precioRef(d, tk, hoy) {
    const R = (d.resultados || []).filter(r => r.tk === tk), rev = R.filter(r => r.estado === 'revisado' && r.snap && isN(r.snap.precio)).sort((a, b) => (b.revisado || '').localeCompare(a.revisado || ''))[0];
    const ref = rev ? { precio: rev.snap.precio, fecha: rev.revisado } : (R.filter(r => r.estado !== 'revisado' && isN(r.precio_ref)).sort((a, b) => (b.precio_fecha || '').localeCompare(a.precio_fecha || ''))[0] || null);
    if (!ref) return null; const pr = ref.precio_ref != null ? ref.precio_ref : ref.precio, fecha = ref.fecha || ref.precio_fecha || null, f = d.fichas[tk];
    if (!f || !isN(pr) || pr <= 0) return null; const pf = precioFicha(d, tk); if (!isN(pf.precio)) return null;
    const cambio = pf.precio / pr - 1; return { ref: pr, fecha, precio: pf.precio, cambio, alerta: Math.abs(cambio) >= 0.25 };
  }

  /* Moneda en la que cotiza (precio guardado → cribado → ficha); null si no se sabe */
  function divisaCotizacion(d, tk) { const g = x => (x && typeof x === 'string' && /^[A-Za-z]{3}$/.test(x.trim()) ? x.trim().toUpperCase() : null); return g((d.precios[tk] || {}).divisa) || g((d.cribado[tk] || {}).divisa_cotizacion) || g((d.fichas[tk] || {}).divisa) || null; }
  /* ───── Informes anuales: cruza el índice (indice_informes.json) con cartera y watchlist ───── */
  const baseTk = t => (t || '').toUpperCase().split('.')[0];
  /* Cifras puestas a mano o por IA (d.informes_manual[carpeta] = {divisa, metricas:{métrica:{año:valor}}}) superpuestas al CSV: el CSV manda donde tiene dato */
  function mezclarManual(dt, man) {
    if (!man || !man.metricas) return dt;
    const base = dt || {}, ba = (base.anios || []).map(Number), set = new Set(ba);
    Object.keys(man.metricas).forEach(k => Object.keys(man.metricas[k]).forEach(y => set.add(Number(y))));
    const an = Array.from(set).sort((a, b) => a - b), met = {}, ks = new Set(Object.keys(base.metricas || {}).concat(Object.keys(man.metricas)));
    ks.forEach(k => { met[k] = an.map(y => { const i = ba.indexOf(y), v = i >= 0 ? ((base.metricas || {})[k] || [])[i] : null; if (isN(v)) return v; const m = man.metricas[k] && man.metricas[k][y]; return isN(m) ? m : null; }); });
    return Object.assign({}, base, { divisa: base.divisa || man.divisa, anios: an, metricas: met, ia: Object.keys(man.metricas) });
  }
  function informes(d, hoy) {
    const man = d.informes_manual || {}, idx = d.informes && Array.isArray(d.informes.empresas) ? Object.assign({}, d.informes, { empresas: d.informes.empresas.map(e => (man[e.carpeta] ? Object.assign({}, e, { datos: mezclarManual(e.datos, man[e.carpeta]) }) : e)) }) : d.informes, anioHoy = Number((hoy || today()).slice(0, 4));
    if (!idx || !Array.isArray(idx.empresas)) return null;
    const enCartera = new Set(d.posiciones.map(p => tickerDe(d, p)).filter(Boolean));
    const lista = [], usados = new Set();
    const alias = (d.ajustes && d.ajustes.alias_informes) || {};
    const buscar = (tk, nombre) => idx.empresas.findIndex((e, i) => !usados.has(i) && ((tk && alias[tk] && e.carpeta === alias[tk]) || (tk && baseTk(e.ticker) === baseTk(tk)) ||
      (tk && norm(e.nombre).trim() === norm(tk).trim()) ||
      (coreName(e.nombre) && coreName(nombre) && (coreName(nombre) === coreName(e.nombre) || coreName(nombre).indexOf(coreName(e.nombre) + ' ') === 0))));
    const objetivos = [];
    Object.keys(d.fichas).forEach(tk => {
      const f = d.fichas[tk], estado = enCartera.has(tk) ? 'cartera' : f.estado === 'watchlist' ? 'watchlist' : f._borrador ? 'otra' : null;
      if (estado) objetivos.push({ tk, nombre: f.nombre || tk, estado });
    });
    Object.keys(d.cribado || {}).forEach(tk => { if (!d.fichas[tk] && !objetivos.some(o => o.tk === tk) && !d.posiciones.some(p => tickerDe(d, p) === tk)) objetivos.push({ tk, nombre: (d.cribado[tk] || {}).nombre || tk, estado: 'watchlist' }); });
    d.posiciones.forEach(p => { const tk = tickerDe(d, p); if (!tk || !d.fichas[tk]) objetivos.push({ tk: tk || (p.ticker || ''), nombre: p.empresa, estado: 'cartera' }); });
    const sin = [], orden = { cartera: 0, watchlist: 1, otra: 2 };
    /* Una misma empresa puede estar con dos nombres (ficha NRO y watchlist «NEURONES»): comparte la carpeta que ya tiene otra entrada si hay una señal segura (vínculo manual, mismo ticker o mismo nombre completo); el estado que se muestra es el más relevante */
    const mismaCarpeta = o => idx.empresas.findIndex((e, i) => usados.has(i) && ((o.tk && alias[o.tk] && e.carpeta === alias[o.tk]) || (o.tk && baseTk(e.ticker) && baseTk(e.ticker) === baseTk(o.tk)) || (norm(e.nombre).trim() && norm(e.nombre).trim() === norm(o.nombre).trim()) || (coreName(e.nombre) && coreName(e.nombre) === coreName(o.nombre))));
    objetivos.forEach(o => {
      const i = buscar(o.tk, o.nombre);
      if (i < 0) {
        const j = mismaCarpeta(o), ent = j >= 0 && lista.find(x => x.carpeta === idx.empresas[j].carpeta);
        if (ent) { if (orden[o.estado] < orden[ent.estado]) ent.estado = o.estado; ent.alt = (ent.alt || []).concat(o.tk && o.tk !== ent.tk ? [o.tk] : []); return; }
        sin.push(o); return;
      }
      usados.add(i); const e = idx.empresas[i];
      lista.push(Object.assign({ tk: o.tk, estado: o.estado, desactualizado: e.ultimo_anio != null && e.ultimo_anio < anioHoy - 1 }, e));
    });
    idx.empresas.forEach((e, i) => { if (!usados.has(i)) lista.push(Object.assign({ tk: baseTk(e.ticker), estado: 'otra', desactualizado: false }, e)); });
    lista.sort((a, b) => orden[a.estado] - orden[b.estado] || a.nombre.localeCompare(b.nombre));
    sin.sort((a, b) => (orden[a.estado] - orden[b.estado]) || a.nombre.localeCompare(b.nombre));
    return { generado: idx.generado, lista, sin, avisos: Array.isArray(idx.avisos) ? idx.avisos : [] };
  }

  /* ───── Pesos y límites ───── */
  function pesos(d) {
    const filas = d.posiciones.map(p => ({ p, tk: tickerDe(d, p), eur: valorEur(d, p), sector: p.sector || (d.fichas[tickerDe(d, p)] || {}).sector || 'Sin sector' }));
    const total = filas.reduce((s, r) => s + (r.eur || 0), 0);
    const emp = {}, sec = {}, div = {};
    filas.forEach(r => {
      if (r.eur == null) return;
      const k = r.tk || r.p.empresa; emp[k] = (emp[k] || 0) + r.eur; sec[r.sector] = (sec[r.sector] || 0) + r.eur;
      div[r.p.moneda || '?'] = (div[r.p.moneda || '?'] || 0) + r.eur;
    });
    return { filas, total, emp, sec, div };
  }

  /* ───── Dashboard (Inicio) ───── */
  function dashboard(d, hoy) {
    hoy = hoy || today();
    const A = d.ajustes, W = pesos(d), porTk = {};
    W.filas.forEach(r => { const k = r.tk || ('~' + r.p.empresa); (porTk[k] = porTk[k] || { tk: r.tk, nombre: r.p.empresa, eur: 0, filas: [] }); porTk[k].eur += r.eur || 0; porTk[k].filas.push(r); });
    const baratas = [], caras = [], sinFicha = [], sinCalcular = []; let ocultas = 0, refPond = 0, pesoVal = 0, viejos = 0;
    Object.values(porTk).forEach(g => {
      const v = g.tk && d.fichas[g.tk] ? valoracion(d, g.tk, hoy) : null;
      if (!v) { sinFicha.push({ nombre: g.nombre, tk: g.tk, peso: W.total ? g.eur / W.total : null }); return; }
      if (v.noSoportado || v.error || v.ref == null) { sinCalcular.push({ nombre: g.nombre, tk: g.tk, motivo: v.noSoportado ? 'tipo de empresa sin método' : (v.error || 'sin resultado') }); return; }
      const peso = W.total ? g.eur / W.total : null, pr = g.filas[0].p;
      const fila = Object.assign({}, v, { peso, eur: g.eur, brokers: g.filas.map(r => r.p.broker).filter(Boolean), var: variacion(d, pr) });
      refPond += g.eur * v.ref; pesoVal += g.eur;
      if (v.diasPrecio != null && v.diasPrecio > A.dias_precio_viejo) viejos++;
      if (v.ref * 100 >= A.umbral_barata) baratas.push(fila); else if (v.ref * 100 <= A.umbral_cara) caras.push(fila); else ocultas++;
    });
    baratas.sort((a, b) => b.ref - a.ref); caras.sort((a, b) => a.ref - b.ref);
    const watch = [], watchResto = [];
    Object.keys(d.fichas).filter(k => d.fichas[k].estado === 'watchlist').forEach(k => {
      const v = valoracion(d, k, hoy); if (!v || v.noSoportado || v.error) return;
      (v.distEntrada != null && v.distEntrada <= 0 ? watch : watchResto).push(v);
    });
    watch.sort((a, b) => a.distEntrada - b.distEntrada); watchResto.sort((a, b) => (a.distEntrada ?? 9) - (b.distEntrada ?? 9));
    const alertas = [];
    Object.keys(W.emp).forEach(k => { const p = W.emp[k] / W.total * 100; if (p > A.lim_empresa) alertas.push({ tipo: 'empresa', nombre: k, pct: p, lim: A.lim_empresa }); });
    Object.keys(W.sec).forEach(k => { const p = W.sec[k] / W.total * 100; if (p > A.lim_sector) alertas.push({ tipo: 'sector', nombre: k, pct: p, lim: A.lim_sector }); });
    return {
      resumen: { valorEur: W.total, nPos: Object.keys(porTk).length, refPond: pesoVal ? refPond / pesoVal : null, cubierto: W.total ? pesoVal / W.total : null, preciosViejos: viejos },
      baratas, caras, ocultas, watch, watchResto, sinFicha, sinCalcular, alertas, pesos: W
    };
  }

  return { isN, today, clone, nuevoDatos, normalizar, norm, coreName, sameCompany, findExisting, tickerDe, fxPorEur, aEur, precioPos, costeEur, mercadoEur, valorEur, variacion, diasDesde,
    compra, venta, editar, eliminar, borrarMov, reverseMov, precioManual, precioFicha, matrizEntrada, auditoriaDivisas, provisional, promptBusqueda, extraerJSON, aplicarBusqueda, pendientesBusqueda, deshacerBusqueda, promptFase2, proponerMultiplos, aplicarMultiplos, deshacerMultiplos, calidadFichas, distorsion, previsualizarSoloFcf, aplicarSoloFcf, valoracion, renombrarTicker, tickerValido, claves, divisaCotizacion, mezclarManual, contrastar, lineasFaltantes, revision, precioRef, pesos, dashboard, informes, V };
})();
if (typeof module !== 'undefined') module.exports = Logic;
