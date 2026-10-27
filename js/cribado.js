/* Cribado de calidad (checklist value de «El arte de invertir», módulos 3, 4, 5, 8 y 12).
   El motor (reglas, umbrales y veredicto) es el de la checklist original, extraído sin cambios; no depende de Claude ni de internet.
   Recibe un objeto de datos `d` (ver Cribado.CAMPOS) y devuelve criterios en verde/ámbar/rojo y el veredicto. */
const Cribado = (function () {
  const isN = v => typeof v === 'number' && isFinite(v);
  const N = v => (isN(v) ? v : null);
  const B = v => (v === true || v === false ? v : null);
  const up = (v, g, y) => (v >= g ? 'g' : v >= y ? 'y' : 'r');
  const dn = (v, g, y) => (v <= g ? 'g' : v <= y ? 'y' : 'r');
  const worse = s => ({ g: 'y', y: 'r', r: 'r' }[s] || s);
  const f = (v, d = 1) =>
    isN(v) ? v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
  const pc = (v, d = 1) => (isN(v) ? f(v, d) + ' %' : '—');
  const xx = (v, d = 1) => (isN(v) ? f(v, d) + 'x' : '—');
  const sg = v => (v >= 0 ? '+' : '−') + f(Math.abs(v), 0) + ' %';
  const nivel = s => ({ verde: 'g', amarillo: 'y', rojo: 'r' }[String(s || '').toLowerCase()] || null);
  const K = (id, bloque, nombre, estado, valor, regla, fuente, nota) => ({
    id, bloque, nombre, estado, valor, regla, fuente, nota: nota || ''
  });
  const NS = (id, bloque, nombre, regla, fuente, nota) =>
    K(id, bloque, nombre, 'n', 'Sin dato', regla, fuente, nota);

  const DEFAULTS = { precio: null, Y: 5.24, fx: 1.15, aplicarTipos: false, capOverride: null };

  /* ───────── Bloque A ───────── */
  function bloqueA(d, cic) {
    const out = [];
    const q = d.cualitativo || {};
    // A1
    let e = N(d.ebit_cagr_10y), per = '10 años';
    if (e == null && N(d.ebit_cagr_5y) != null) { e = d.ebit_cagr_5y; per = '5 años'; }
    out.push(e == null
      ? NS('A1', 'A', 'Crecimiento del EBIT', '🟢 ≥7 % · 🟡 3–7 % · 🔴 <3 %', 'M4 · punto 1 · umbrales †')
      : K('A1', 'A', 'Crecimiento del EBIT (CAGR)', up(e, 7, 3), pc(e) + ' · ' + per,
          '🟢 ≥7 % · 🟡 3–7 % · 🔴 <3 %', 'M4 · punto 1 · umbrales †',
          'Lo que importa de verdad es el BPA (A5); aquí se mira que el negocio crezca por dentro.'));
    // A2
    const roic = N(d.roic);
    out.push(roic == null
      ? NS('A2', 'A', 'ROIC', '🟢 ≥20 % · 🟡 12–20 % · 🔴 <12 %', 'M4 · punto 2')
      : K('A2', 'A', 'ROIC', up(roic, 20, 12), pc(roic), '🟢 ≥20 % · 🟡 12–20 % · 🔴 <12 %', 'M4 · punto 2',
          'El profesor: lo habitual es 8–12, 20 es bueno.'));
    // A3
    const m = N(d.margen_ebit), pico = N(d.margen_ebit_pico_10y);
    if (m == null) out.push(NS('A3', 'A', 'Margen EBIT', '🟢 ≥20 % · 🟡 10–20 % · 🔴 <10 %', 'M4 · punto 3'));
    else {
      let s = up(m, 20, 10), nota = 'Ojo con distribuidores de alta rotación (Walmart): ahí manda el ROIC.';
      if (pico != null && pico > 0 && m < 0.7 * pico) { s = worse(s); nota = 'Margen >30 % por debajo de su máximo de 10 años (' + pc(pico) + '): baja un nivel (caso Figeac).'; }
      out.push(K('A3', 'A', 'Margen EBIT y estabilidad', s, pc(m) + (pico != null ? ' · pico ' + pc(pico) : ''),
        '🟢 ≥20 % · 🟡 10–20 % · 🔴 <10 %; baja un nivel si cae >30 % desde máximos', 'M4 · punto 3', nota));
    }
    // A4
    const a = N(d.acciones_cagr_10y);
    out.push(a == null
      ? NS('A4', 'A', 'Evolución del nº de acciones', '🟢 ≤−1 %/año · 🟡 −1 a +1 % · 🔴 >+1 %', 'M4 · punto 4')
      : K('A4', 'A', 'Evolución del nº de acciones diluidas', dn(a, -1, 1), (a > 0 ? '+' : '') + pc(a) + ' anual',
          '🟢 ≤−1 % anual (recompras) · 🟡 −1 a +1 % · 🔴 >+1 % (dilución)', 'M3 y M4 · punto 4 · umbrales †',
          'La dilución destruye BPA (Santander, Telefónica).'));
    // A5
    const g = N(d.bpa_cagr_10y) != null ? d.bpa_cagr_10y : N(d.bpa_cagr_5y), neg = N(d.bpa_anios_negativos_10y);
    if (g == null) out.push(NS('A5', 'A', 'BPA: crecimiento y predecibilidad', '🟢 ≥10 % sin pérdidas · 🟡 5–10 % · 🔴 <5 %', 'M3 y M4 · punto 5'));
    else {
      const s = g >= 10 && (neg || 0) === 0 ? 'g' : g >= 5 && (neg || 0) <= 1 ? 'y' : 'r';
      const pcg = N(d.precio_cagr_10y);
      out.push(K('A5', 'A', 'BPA: crecimiento y predecibilidad', s,
        pc(g) + ' anual' + (neg != null ? ' · ' + neg + ' año(s) con pérdidas' : ''),
        '🟢 ≥10 % sin años de pérdidas · 🟡 5–10 % (≤1 año malo) · 🔴 <5 % o irregular', 'M3 y M4 · punto 5 · umbrales †',
        (pcg != null ? 'Bolsa a 10 años: ' + pc(pcg) + ' anual. ' : '') + 'Retorno ≈ crecimiento BPA + cambio de múltiplo + dividendo.'));
    }
    // A6
    const cr = d.crisis;
    if (!cr || N(cr.caida_ebit_pct) == null) out.push(NS('A6', 'A', 'Resistencia en crisis', '🟢 caída de beneficio ≤1,5× la de ventas · 🔴 pérdidas o >3×', 'M4 · punto 6 · umbrales †'));
    else {
      const cv = N(cr.caida_ventas_pct), ce = cr.caida_ebit_pct;
      let s, txt;
      if (cr.perdidas === true) { s = 'r'; txt = 'Pérdidas en crisis'; }
      else if (ce <= 0) { s = 'g'; txt = 'EBIT no cayó'; }
      else if (cv == null || cv <= 1) { s = dn(ce, 10, 30); txt = 'EBIT −' + f(ce, 0) + ' % con ventas casi planas'; }
      else { const r = ce / cv; s = dn(r, 1.5, 3); txt = 'Ventas −' + f(cv, 0) + ' % → EBIT −' + f(ce, 0) + ' % (' + xx(r) + ')'; }
      out.push(K('A6', 'A', 'Resistencia en crisis (2008/2020)', s, txt,
        '🟢 caída de EBIT ≤1,5× la de ventas · 🟡 ≤3× · 🔴 pérdidas o >3×', 'M4 · punto 6 · umbrales †',
        'Ejemplo del curso: BMW 2020, ventas −5 % y EBIT −35 %.'));
    }
    // A7
    if (d.es_banco_inmobiliaria === true) out.push(K('A7', 'A', 'Deuda neta / EBITDA', 'n', 'No aplica', 'Bancos e inmobiliarias: módulo específico', 'M8 · paso 2'));
    else {
      const de = N(d.deuda_neta_ebitda);
      if (de == null) out.push(NS('A7', 'A', 'Deuda neta / EBITDA', 'Estable: 🟢 <2x · 🟡 2–4x · 🔴 >4x. Cíclica: 🟢 <1x · 🟡 1–2x · 🔴 >2x', 'M4 · punto 8 · M8 · paso 2'));
      else {
        const esC = cic === 'si';
        let s = de < 0 ? 'g' : esC ? dn(de, 0.99, 2) : dn(de, 1.99, 4);
        let nota = esC ? 'Tratada como cíclica (máximo 2x).' : 'Estable: hasta 3–4x, más es peligroso incluso en estables.';
        if (d.emitio_en_recesion === true) { s = 'r'; nota = 'Tuvo que emitir deuda o acciones en recesión (espiral Figeac).'; }
        if (d.financiera_propia === true) nota += ' Tiene financiera propia: la deuda neta es engañosa (caso BMW).';
        out.push(K('A7', 'A', 'Deuda neta / EBITDA y emisión en recesión', s, de < 0 ? 'Caja neta' : xx(de),
          'Estable: 🟢 <2x · 🟡 2–4x · 🔴 >4x. Cíclica: 🟢 <1x · 🟡 1–2x · 🔴 >2x. Rojo si emitió en recesión', 'M8 · paso 2 · M4 · puntos 6 y 8', nota));
      }
    }
    return out;
  }

  /* ───────── Bloque B ───────── */
  function bloqueB(d, A) {
    const q = d.cualitativo || {};
    const out = [];
    const mot = o => (o && o.motivo ? String(o.motivo) : '');
    // B1
    const b1 = q.b1 ? nivel(q.b1.nivel) : null;
    out.push(b1 ? K('B1', 'B', 'E · Entender el negocio', b1, { g: 'Claro', y: 'Con incertidumbre', r: 'No claro / declive' }[b1],
      '🟢 las 6 preguntas claras y beneficios mayores en 5–10 años · 🟡 incertidumbre relevante · 🔴 no se explica o declive', 'M5 · "E" (6 preguntas)', mot(q.b1))
      : NS('B1', 'B', 'E · Entender el negocio', '🟢 claro · 🟡 con incertidumbre · 🔴 no claro', 'M5 · "E"'));
    // B2
    const p = B(q.b2 ? q.b2.precio_sobre_inflacion : null), m = N(d.margen_ebit);
    if (p == null && m == null) out.push(NS('B2', 'B', 'Poder de fijación de precios', '🟢 precios > inflación y EBIT >15 % · 🟡 uno de los dos · 🔴 ninguno', 'M5 · test clave'));
    else {
      const c = (p === true ? 1 : 0) + (m != null && m >= 15 ? 1 : 0);
      out.push(K('B2', 'B', 'Poder de fijación de precios', c === 2 ? 'g' : c === 1 ? 'y' : 'r',
        (p === true ? 'Sube precios > inflación' : p === false ? 'No sube > inflación' : 'Sin dato de precios') + ' · EBIT ' + pc(m),
        '🟢 precios > inflación y EBIT >15 % · 🟡 solo uno · 🔴 ninguno', 'M5 · test clave de la ventaja', mot(q.b2)));
    }
    // B3
    let b3 = q.b3 ? nivel(q.b3.nivel) : null;
    if (!b3) out.push(NS('B3', 'B', 'V · Moat (ventaja competitiva)', '🟢 fuente con evidencia numérica · 🟡 plausible sin evidencia · 🔴 ninguna', 'M5 · "V" (8–9 fuentes)'));
    else {
      let nota = mot(q.b3);
      const evid = (N(d.margen_ebit) != null && d.margen_ebit >= 15) || (N(d.roic) != null && d.roic >= 15) || (q.b2 && q.b2.precio_sobre_inflacion === true);
      if (b3 === 'g' && !evid) { b3 = 'y'; nota = (nota ? nota + ' ' : '') + 'Se baja a ámbar: no hay evidencia numérica (margen, ROIC o precios).'; }
      const fu = q.b3 && Array.isArray(q.b3.fuentes) && q.b3.fuentes.length ? q.b3.fuentes.join(', ') : '—';
      out.push(K('B3', 'B', 'V · Moat (ventaja competitiva)', b3, 'Fuente: ' + fu,
        '🟢 fuente identificada con evidencia numérica · 🟡 plausible sin evidencia · 🔴 ninguna', 'M5 · "V" (8–9 fuentes)', nota));
    }
    // B4
    const sc = q.b4 ? N(q.b4.score) : null;
    out.push(sc == null ? NS('B4', 'B', 'Calidad del sector (1–10)', '🟢 ≥7 · 🟡 5–6 · 🔴 ≤4', 'M4 · escala de sectores')
      : K('B4', 'B', 'Calidad del sector (1–10)', up(sc, 7, 5), sc + ' / 10', '🟢 ≥7 · 🟡 5–6 · 🔴 ≤4', 'M4 · escala de sectores · cortes †', mot(q.b4)));
    // B5, B6
    const tri = (id, nombre, o, keys, regla, fuente) => {
      if (!o) return NS(id, 'B', nombre, regla, fuente);
      const vals = keys.map(k => B(o[k]));
      if (vals.every(v => v == null)) return NS(id, 'B', nombre, regla, fuente);
      const c = vals.filter(v => v === true).length;
      return K(id, 'B', nombre, c === 3 ? 'g' : c === 2 ? 'y' : 'r', c + ' de 3', regla, fuente, mot(o));
    };
    out.push(tri('B5', '"Dueña de su destino"', q.b5, ['sin_dependencia_externa', 'poco_capital', 'sin_deuda_para_funcionar'],
      '🟢 3 de 3 (sin precios externos, poco capital, sin deuda para funcionar) · 🟡 2 · 🔴 0–1', 'M5 · dependencia de variables externas'));
    out.push(tri('B6', '"Nirvana" de Greenblatt', q.b6, ['reinvierte_alto_retorno', 'expande_margenes', 'sobra_caja'],
      '🟢 3 de 3 (reinvierte con retorno alto, expande márgenes, sobra caja) · 🟡 2 · 🔴 0–1', 'M4 · "Nirvana" de Greenblatt'));
    // B7
    const b7 = q.b7;
    if (!b7 || !b7.ciclicidad) out.push(NS('B7', 'B', 'No cíclica ni de materias primas', '🟢 no · 🟡 parcial · 🔴 cíclica o commodity', 'Tu regla de proyecto · M4'));
    else {
      const s = b7.ciclicidad === 'si' || b7.materias_primas === true ? 'r' : b7.ciclicidad === 'parcial' ? 'y' : 'g';
      out.push(K('B7', 'B', 'No cíclica ni de materias primas', s,
        b7.materias_primas === true ? 'Materias primas' : { no: 'No cíclica', parcial: 'Parcialmente cíclica', si: 'Cíclica' }[b7.ciclicidad] || b7.ciclicidad,
        '🟢 no · 🟡 parte relevante cíclica · 🔴 cíclica o commodity (resta puntos y recorta el techo de valoración)', 'Tu regla de proyecto · M4 · M8', mot(b7)));
    }
    // B8
    const h = N(d.historial_anios);
    out.push(h == null ? NS('B8', 'B', 'Historial cotizando', '🟢 ≥20 años · 🟡 10–20 · 🔴 <10', 'M4 y M5 · "A"')
      : K('B8', 'B', 'Historial cotizando', up(h, 20, 10), f(h, 0) + ' años', '🟢 ≥20 años · 🟡 10–20 · 🔴 <10', 'M4 (principios) · M5 "A"',
          'Poco historial es una de las 3 grandes fuentes de error del profesor.'));
    return out;
  }

  /* ───────── Bloque C ───────── */
  function bloqueC(d, A) {
    const out = [];
    const a4 = A.find(x => x.id === 'A4');
    const ins = N(d.insiders_pct), fam = B(d.control_familiar);
    if (ins == null && fam !== true) out.push(NS('C1', 'C', 'Alineación', '🟢 gestores o fundadores ≥5 % del capital (o control familiar) · 🔴 <5 %', 'M5 · "A" punto 1'));
    else out.push(K('C1', 'C', 'Alineación', (ins != null && ins >= 5) || fam === true ? 'g' : 'r',
      (ins != null ? pc(ins) + ' en manos de gestores/insiders' : 'Sin dato de %') + (fam === true ? ' · control familiar' : ''),
      '🟢 ≥5 % o control familiar · 🔴 <5 %', 'M5 · "A" punto 1 · umbral †', 'El 5 % penaliza a las megacaps: se evalúa con ojo crítico.'));
    const sb = N(d.sbc_fcf_pct);
    if (sb == null && !(a4 && a4.estado === 'r')) out.push(NS('C2', 'C', 'Incentivos sanos', '🟢 stock options <10 % del FCF y sin dilución · 🔴 ≥10 % o dilución', 'M5 · "A" punto 5 · M3'));
    else out.push(K('C2', 'C', 'Incentivos sanos', (sb != null && sb >= 10) || (a4 && a4.estado === 'r') ? 'r' : 'g',
      (sb != null ? 'Stock options = ' + pc(sb) + ' del FCF' : 'Sin dato de SBC') + (a4 && a4.estado === 'r' ? ' · diluye' : ''),
      '🟢 SBC <10 % del FCF y sin dilución · 🔴 ≥10 % o A4 en rojo', 'M5 · "A" (Munger: incentivos) · M3 · umbral †'));
    const dev = B(d.devuelve_capital), po = N(d.payout_fcf_pct), rei = B(d.reinvierte_proyectos), emi = B(d.emite_para_pagar_dividendos), roic = N(d.roic);
    if (dev == null && rei == null && po == null) out.push(NS('C3', 'C', 'Trato al accionista', '🟢 reinvierte con ROIC ≥12 % o devuelve capital cubierto por FCF · 🔴 en otro caso', 'M3 · trato al accionista'));
    else {
      const ok1 = dev === true && (po == null || po <= 100) && emi !== true;
      const ok2 = rei === true && roic != null && roic >= 12;
      out.push(K('C3', 'C', 'Trato al accionista', ok1 || ok2 ? 'g' : 'r',
        ok1 ? 'Devuelve capital' + (po != null ? ' (' + pc(po, 0) + ' del FCF)' : '') : ok2 ? 'Reinvierte con ROIC ' + pc(roic, 0) : emi === true ? 'Emite acciones para pagar dividendos' : 'No cubre o no devuelve',
        '🟢 reinvierte con ROIC ≥12 % o devuelve (dividendo + recompras) cubierto por FCF y sin emitir · 🔴 en otro caso', 'M3 · trato al accionista (Telefónica = mal ejemplo)'));
    }
    const c4 = d.cualitativo && d.cualitativo.c4;
    out.push(K('C4', 'C', 'Credibilidad (hechos frente a palabras)', 'i', 'Revisión manual', 'Sin semáforo: no puntúa', 'M5 · "A" puntos 2–4',
      c4 && c4.borrador ? String(c4.borrador) : 'Compara planes y cartas del CEO de años de crisis con los resultados.'));
    return out;
  }

  /* ───────── Módulo small caps (M12) ───────── */
  function bloqueS(d, tier, cap, A, B_, C) {
    const out = [];
    const v = N(d.volumen_diario_eur_k);
    out.push(v == null ? NS('S1', 'S', 'Liquidez', '🟢 ≥500 k€/día · 🟡 100–500 k€ · 🔴 <100 k€', 'M12 · salida en 1–2 días · umbrales †')
      : K('S1', 'S', 'Liquidez', up(v, 500, 100), f(v, 0) + ' k€/día', '🟢 ≥500 k€/día · 🟡 100–500 k€ · 🔴 <100 k€', 'M12 · el inversor privado sale en 1–2 días · umbrales †'));
    const aj = N(d.bpa_ajuste_pct);
    out.push(aj == null ? NS('S2', 'S', 'Calidad contable', '🟢 ajustes ≤10 % del BPA · 🟡 10–30 % · 🔴 >30 %', 'M12 · gastos excepcionales nublan el beneficio · umbrales †')
      : K('S2', 'S', 'Calidad contable', dn(Math.abs(aj), 10, 30), 'Ajustes = ' + pc(Math.abs(aj), 0) + ' del BPA', '🟢 ≤10 % · 🟡 10–30 % · 🔴 >30 %', 'M12 · gastos excepcionales nublan el beneficio · umbrales †'));
    let vc = N(d.ventas_cagr_5y), pv = '5 años';
    if (vc == null && N(d.ventas_cagr_10y) != null) { vc = d.ventas_cagr_10y; pv = '10 años'; }
    out.push(vc == null ? NS('S3', 'S', 'Crecimiento de ventas', '🟢 15–30 % · 🟡 8–15 % o 30–60 % · 🔴 <8 % o >60 %', 'M12 · Lynch: 15–30 % mejor que 60–70 % · umbrales †')
      : K('S3', 'S', 'Crecimiento de ventas', vc >= 15 && vc <= 30 ? 'g' : (vc >= 8 && vc < 15) || (vc > 30 && vc <= 60) ? 'y' : 'r', pc(vc) + ' · ' + pv,
          '🟢 15–30 % · 🟡 8–15 % o 30–60 % · 🔴 <8 % o >60 %', 'M12 · compounders (Lynch) · umbrales †'));
    const m5 = N(d.margen_ebit_hace_5y), m = N(d.margen_ebit);
    out.push(m5 == null || m == null ? NS('S4', 'S', 'Expansión de márgenes', '🟢 ≥+2 pp en 5 años · 🟡 estable · 🔴 cae >2 pp', 'M12 · palancas: ventas, margen, múltiplo · umbrales †')
      : K('S4', 'S', 'Expansión de márgenes', m - m5 >= 2 ? 'g' : m - m5 >= -2 ? 'y' : 'r', (m - m5 >= 0 ? '+' : '') + f(m - m5, 1) + ' pp (' + pc(m5) + ' → ' + pc(m) + ')',
          '🟢 ≥+2 pp en 5 años · 🟡 entre −2 y +2 · 🔴 cae >2 pp', 'M12 · palancas de los compounders (Nagarro, Middleby) · umbrales †'));
    const sg = d.sede_grupo;
    out.push(!sg ? NS('S6', 'S', 'País y marco legal', '🟢 nórdicos, Francia, Reino Unido, Canadá · 🟡 resto · 🔴 gobernanza débil', 'M12 · geografía')
      : K('S6', 'S', 'País y marco legal', { preferente: 'g', neutral: 'y', riesgo: 'r' }[sg] || 'y', (d.pais_sede || '—'),
          '🟢 nórdicos, Francia, Reino Unido, Canadá · 🟡 resto · 🔴 gobernanza débil', 'M12 · geografía de small caps', 'Evitar small caps de materias primas u oro (promocionales).'));
    const pcg = N(d.precio_cagr_10y);
    out.push(pcg == null ? NS('S9', 'S', 'Continuidad en bolsa', '🟢 ≥10 % anual · 🟡 0–10 % · 🔴 ≤0', 'M12 · apostar a la continuidad · umbrales †')
      : K('S9', 'S', 'Continuidad en bolsa', pcg >= 10 ? 'g' : pcg > 0 ? 'y' : 'r', pc(pcg) + ' anual a 10 años', '🟢 ≥10 % anual · 🟡 0–10 % · 🔴 ≤0', 'M12 · "lateral 10 años casi nunca despega" · umbrales †'));
    out.push(K('S7', 'S', 'Tamaño', 'i', cap != null ? f(cap, 0) + ' M€' : 'Sin dato', 'Informativo', 'M12 · tamaño ideal 100–1.000 M para compounders', cap != null && cap >= 100 && cap <= 1000 ? 'Dentro de la zona ideal de los compounders.' : ''));
    const an = N(d.analistas_n);
    out.push(K('S8', 'S', 'Cobertura de analistas', 'i', an != null ? an + ' analistas' : 'Sin dato', 'Informativo', 'M12 · ineficiencia por poca cobertura', an != null && an <= 5 ? 'Poca cobertura: posible ineficiencia a favor.' : ''));
    return out;
  }

  /* ───────── Bloque D · múltiplo (solo el filtro de M8; la valoración es otro módulo) ───────── */
  function valorar(d, inp, tier, cic, price) {
    const r = { ok: false, criterios: [] };
    const reglas = {
      D1: ['🟢 ≤75 % del techo · 🟡 75–100 % · 🔴 >100 % (no pasa el filtro). Se usa la medida más favorable', 'M8 · rangos máximos (filtro excluyente)'],
      D2: ['Informativo: no puntúa', 'M8 · fórmula de Graham'],
      D3: ['🟢 por debajo de su media · 🟡 hasta +20 % · 🔴 >+20 %', 'M4 · punto 7 · M8']
    };
    const names = { D1: 'Techo de múltiplo (filtro)', D2: 'Cruce con Graham', D3: 'PER frente a su media histórica' };
    const nd = (id, msg) => K(id, 'D', names[id], 'n', msg || 'Falta el precio', reglas[id][0], reglas[id][1]);
    const bpa = N(d.bpa_ttm);
    if (!isN(price) || price <= 0) { ['D1', 'D2', 'D3'].forEach(id => r.criterios.push(nd(id))); return r; }
    if (bpa == null) { ['D1', 'D2', 'D3'].forEach(id => r.criterios.push(nd(id, 'Sin BPA'))); return r; }

    const g = N(d.bpa_cagr_10y) != null ? d.bpa_cagr_10y : N(d.bpa_cagr_5y);
    const gHist = g == null ? null : Math.max(0, Math.min(g, 20));
    const [perMax, evMax] = gHist == null ? [20, 12] : gHist < 5 ? [20, 12] : gHist < 10 ? [25, 14] : [35, 18];
    const mCic = cic === 'si' ? 0.5 : cic === 'parcial' ? 0.6 : 1;
    const mSmall = tier === 'micro' ? 0.8 : tier === 'small' ? 0.9 : 1;
    const mRate = inp.aplicarTipos && inp.Y > 4.4 ? 4.4 / inp.Y : 1;
    const M = mCic * mSmall * mRate;
    const techoPER = perMax * M, techoEV = evMax * M;
    r.techo = { perMax, evMax, mCic, mSmall, mRate, M, techoPER, techoEV };

    const per = bpa > 0 ? price / bpa : null;
    const pfcf = N(d.fcf_por_accion) > 0 ? price / d.fcf_por_accion : null;
    const acc = N(d.acciones_diluidas_m), dn_ = N(d.deuda_neta_m), ebitda = N(d.ebitda_m);
    const evMult = acc != null && dn_ != null && ebitda > 0 && d.es_banco_inmobiliaria !== true && d.financiera_propia !== true ? (price * acc + dn_) / ebitda : null;
    r.per = per; r.pfcf = pfcf; r.evMult = evMult;

    // D1
    const perUse = [per, pfcf].filter(x => isN(x) && x > 0).sort((a, b) => a - b)[0];
    const ratios = [];
    if (isN(perUse)) ratios.push(perUse / techoPER);
    if (isN(evMult)) ratios.push(evMult / techoEV);
    if (!ratios.length) r.criterios.push(nd('D1', 'Sin múltiplos'));
    else {
      const rr = Math.min(...ratios); // M8: el menor entre PER y P/FCF, o EV/EBITDA → el más favorable
      r.ratio = rr;
      r.criterios.push(K('D1', 'D', names.D1, rr <= 0.75 ? 'g' : rr <= 1 ? 'y' : 'r',
        (isN(perUse) ? 'PER/P·FCF ' + xx(perUse) + ' vs techo ' + xx(techoPER) : '') + (isN(evMult) ? (isN(perUse) ? ' · ' : '') + 'EV/EBITDA ' + xx(evMult) + ' vs ' + xx(techoEV) : ''),
        reglas.D1[0], reglas.D1[1],
        'Techo = ' + xx(perMax, 0) + ' (crecimiento ' + (gHist == null ? 'sin dato' : f(gHist, 1) + ' %') + ') × ' + f(M, 2) +
        ' (cíclica ' + f(mCic, 2) + ' · small cap ' + f(mSmall, 2) + ' · tipos ' + f(mRate, 2) + '). Sirve para descartar, no es un precio objetivo: eso es la valoración (M14).'));
    }
    // D2
    const gG = gHist == null ? 0 : gHist;
    const graham = (8.5 + 2 * gG) * (4.4 / inp.Y) * mCic * mSmall;
    r.graham = graham;
    r.criterios.push(K('D2', 'D', names.D2, 'i', 'PER máx. Graham ' + xx(graham), reglas.D2[0], reglas.D2[1], 'PER = (8,5 + 2·g) × 4,4/Y con g = ' + f(gG, 1) + ' % e Y = ' + f(inp.Y, 2) + ' %.'));
    // D3
    const pm = N(d.per_medio_10y);
    if (per == null || pm == null) r.criterios.push(nd('D3', per == null ? 'BPA negativo' : 'Sin PER histórico'));
    else { const q = per / pm; r.criterios.push(K('D3', 'D', names.D3, q <= 1 ? 'g' : q <= 1.2 ? 'y' : 'r', 'PER ' + xx(per) + ' vs media ' + xx(pm) + ' (' + (q >= 1 ? '+' : '') + f((q - 1) * 100, 0) + ' %)', reglas.D3[0], reglas.D3[1])); }
    r.ok = true;
    return r;
  }

  /* ───────── Bloque E · encaje ───────── */
  const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  function posValue(p, fx, priceOverride) {
    const px = isN(p.pa) ? p.pa : isN(priceOverride) ? priceOverride : isN(p.pm) ? p.pm : null;
    if (px == null) return null;
    return (p.q * px) / (p.div === 'USD' ? fx : 1);
  }
  const tok = s => String(s || '').toLowerCase().split(/[\s(,.]/)[0];
  function matchPos(items, d, tk) {
    const t = norm(tk), tn = tok(d.nombre);
    return items.findIndex(p =>
      norm(p.t) === t || (p.alias || []).some(a => norm(a) === t) || (tn.length > 3 && tok(p.n) === tn));
  }
  function encaje(d, inp, pf, price, tk) {
    if (!pf || !Array.isArray(pf.items) || !pf.items.length) return null;
    const fx = pf.fx || inp.fx || 1.15, items = pf.items;
    const idx = matchPos(items, d, tk);
    const vals = items.map((p, i) => posValue(p, fx, i === idx ? price : null));
    const T = vals.reduce((a, v) => a + (v || 0), 0);
    const sin = items.filter((p, i) => vals[i] == null).map(p => p.n);
    const secName = (d.sector_cartera || '').toLowerCase();
    const sector = secName ? items.reduce((a, p, i) => a + (p.sec === secName && vals[i] ? vals[i] : 0), 0) : null;
    const wT = idx >= 0 && vals[idx] != null ? (vals[idx] / T) * 100 : 0;
    const wS = sector != null ? (sector / T) * 100 : null;
    const room1 = 10 - wT, room2 = wS == null ? null : 30 - wS;
    const room = room2 == null ? room1 : Math.min(room1, room2);
    const by = key => { const o = {}; items.forEach((p, i) => { if (vals[i]) o[p[key] || '—'] = (o[p[key] || '—'] || 0) + vals[i]; }); return Object.entries(o).map(([k, v]) => [k, (v / T) * 100]).sort((a, b) => b[1] - a[1]); };
    return { idx, T, wT, wS, room1, room2, room, sector: d.sector_cartera, sin, enCartera: idx >= 0, nombrePos: idx >= 0 ? items[idx].n : null,
      divisas: by('div'), paises: by('pais'), sectores: by('sec'), fx };
  }

  /* ───────── Evaluación completa ───────── */
  function evaluate(d, inp0, pf, tk) {
    const inp = Object.assign({}, DEFAULTS, inp0 || {});
    if (isN(inp.perActual) && inp.perActual > 0 && isN(inp.precio) && inp.precio > 0) d = Object.assign({}, d, { bpa_ttm: inp.precio / inp.perActual });
    const q = d.cualitativo || {};
    const cic = q.b7 && q.b7.ciclicidad ? q.b7.ciclicidad : null;
    const cap = isN(inp.capOverride) ? inp.capOverride : N(d.market_cap_eur_m);
    const tier = cap == null ? null : cap < 300 ? 'micro' : cap < 3000 ? 'small' : 'grande';
    const A = bloqueA(d, cic);
    const Bq = bloqueB(d, A);
    const C = bloqueC(d, A);
    const S = tier === 'micro' || tier === 'small' ? bloqueS(d, tier, cap, A, Bq, C) : [];
    const val = valorar(d, inp, tier, cic, inp.precio);
    const D = val.criterios;

    // filtro del proyecto
    const v5 = N(d.ventas_cagr_5y) != null ? d.ventas_cagr_5y : N(d.ventas_cagr_10y);
    const filtro = v5 == null
      ? K('F0', 'F', 'Ventas a 5 años', 'n', 'Sin dato', 'Si el crecimiento de ventas a 5 años es negativo → descartar', 'Tu regla de proyecto')
      : K('F0', 'F', 'Ventas a 5 años', v5 < 0 ? 'r' : 'g', pc(v5) + ' anual', 'Negativo → descartar directamente', 'Tu regla de proyecto (guardada)',
          N(d.ventas_cagr_5y) == null ? 'Sin dato a 5 años: se usa el de 10 años.' : '');
    const descarte = filtro.estado === 'r';

    // calidad
    const calif = [].concat(A, Bq, C.filter(x => x.id !== 'C4'), S.filter(x => x.id !== 'S7' && x.id !== 'S8'));
    const ev = calif.filter(x => x.estado !== 'n');
    const pts = ev.reduce((a, x) => a + (x.estado === 'g' ? 2 : x.estado === 'y' ? 1 : 0), 0);
    const calidad = ev.length ? (pts / (2 * ev.length)) * 100 : null;
    const cobertura = calif.length ? (ev.length / calif.length) * 100 : 0;
    const calR = calidad == null ? null : Math.round(calidad);
    const bandaC = calR == null ? null : calR >= 75 ? 'alta' : calR >= 55 ? 'media' : 'baja';

    // precio: solo el filtro de M8
    const d1 = D.find(x => x.id === 'D1'), d3 = D.find(x => x.id === 'D3');
    const dsc = [d1, d3].filter(x => x && x.estado !== 'n');
    const ptsD = dsc.reduce((a, x) => a + (x.estado === 'g' ? 2 : x.estado === 'y' ? 1 : 0), 0);
    const precioPct = dsc.length ? (ptsD / (2 * dsc.length)) * 100 : null;

    // perfil a evitar (M12)
    const rojo = id => [].concat(A, Bq, C).some(x => x.id === id && x.estado === 'r');
    const evitar = (tier === 'micro' || tier === 'small') && (rojo('A4') || rojo('B3') || rojo('C2'));

    // veredicto
    const faltaPrecio = !(isN(inp.precio) && inp.precio > 0);
    const faltaBPA = !faltaPrecio && !(N(d.bpa_ttm) > 0);
    let veredicto, tono, sub;
    if (descarte) { veredicto = 'Descartar'; tono = 'r'; sub = 'Incumple tu filtro: las ventas a 5 años caen.'; }
    else if (bandaC == null) { veredicto = 'Sin datos suficientes'; tono = 'n'; sub = 'No hay criterios evaluables.'; }
    else if (bandaC === 'baja') { veredicto = 'Descartar'; tono = 'r'; sub = 'Calidad baja (' + f(calidad, 0) + ' %).'; }
    else if (bandaC === 'media') { veredicto = 'Vigilar'; tono = 'y'; sub = 'Calidad media (' + f(calidad, 0) + ' %): investiga los puntos en rojo antes de seguir.'; }
    else if (faltaPrecio) { veredicto = 'Pasa en calidad · falta el precio'; tono = 'n'; sub = 'Calidad ' + f(calidad, 0) + ' %. Introduce el precio actual para comprobar el techo de múltiplo.'; }
    else if (!d1 || d1.estado === 'n') {
      veredicto = faltaBPA ? 'Pasa en calidad · falta el BPA' : 'Pasa en calidad · múltiplo sin comprobar'; tono = 'n';
      sub = 'Calidad ' + f(calidad, 0) + ' %. ' + (faltaBPA ? 'El precio sí llegó, pero no hay BPA: complétalo (o el PER actual) en "Completar o corregir datos".' : 'Faltan datos para comprobar el techo: revisa "Completar o corregir datos".');
    }
    else if (d1.estado === 'r') { veredicto = 'Vigilar'; tono = 'y'; sub = 'Calidad alta (' + f(calidad, 0) + ' %), pero el múltiplo supera el techo de M8. No pasa el filtro a este precio.'; }
    else { veredicto = 'Pasa el cribado'; tono = 'g'; sub = 'Calidad ' + f(calidad, 0) + ' % y múltiplo dentro del techo de M8. Siguiente paso: valoración (M14).'; }
    const provisional = !descarte && cobertura < 60;

    const perImp = isN(inp.precio) && inp.precio > 0 && N(d.bpa_ttm) > 0 ? inp.precio / d.bpa_ttm : null;
    const enc = encaje(d, inp, pf, inp.precio, tk || d.ticker);
    return { inp, cap, tier, filtro, A, B: Bq, C, S, D, val, calidad, bandaC, cobertura, precioPct, evitar,
      veredicto, tono, sub, provisional, descarte, enc, faltaPrecio, faltaBPA, perImp, nCalif: calif.length, nEval: ev.length };
  }

  return { evaluate, encaje, valorar, posValue, DEFAULTS, f, pc, xx, norm, isN };
})();

/* ───── Prompt para rellenar la ficha de datos con cualquier asistente de IA (opcional; los datos también se pueden escribir a mano) ───── */
Cribado.SECTORES = 'tecnología|comunicación|consumo discrecional|consumo defensivo|salud|financiero|industriales|materiales|utilities|energía|inmobiliario';
Cribado.prompt = function(tk, extra, precio) {
  return [
    'Eres un analista value que rellena una ficha de datos para un screener personal. En esta llamada no puedes buscar en la web: responde con tu mejor conocimiento (llega hasta mediados de 2026).',
    'IMPORTANTE: para una empresa que conozcas, da SIEMPRE tu mejor estimación aproximada de cada cifra: es mucho mejor un valor aproximado que null. Usa null solo si no tienes ni idea del dato (ni aproximada). Apunta en notas_datos qué cifras son aproximadas. Indica en anio_dato el último ejercicio completo del que hablas y en confianza "alta", "media" o "baja" para el conjunto.',
    precio ? 'Precio actual indicado por el usuario: ' + precio + ' (úsalo solo para comprobar que tu BPA es coherente con un PER razonable).' : '',
    'Empresa a analizar (ticker o nombre): ' + tk,
    extra ? 'DATOS APORTADOS POR EL USUARIO (tienen prioridad sobre tu memoria; si los usas, pon origen "datos_aportados"):\n' + extra : '',
    '',
    'Responde ÚNICAMENTE con un objeto JSON válido con este esquema. Porcentajes como número (12.5 = 12,5 %). Importes por acción en la divisa de cotización. Los CAGR y medias son de los últimos 10 años salvo que se indique.',
    '{',
    '"ticker":"","nombre":"","pais_sede":"","sede_grupo":"preferente|neutral|riesgo","bolsa":"","divisa_cotizacion":"EUR|USD|...",',
    '"sector_cartera":"' + Cribado.SECTORES + '","industria":"",',
    '"market_cap_eur_m":n,"volumen_diario_eur_k":n,"analistas_n":n,',
    '"anio_dato":n,"confianza":"alta|media|baja","origen":"estimacion_modelo","notas_datos":["avisos sobre qué datos son dudosos"],',
    '"historial_anios":n,"ventas_cagr_5y":n,"ventas_cagr_10y":n,"ebit_cagr_10y":n,"ebit_cagr_5y":n,',
    '"margen_ebit":n,"margen_ebit_pico_10y":n,"margen_ebit_hace_5y":n,"roic":n,"acciones_cagr_10y":n,',
    '"bpa_ttm":n,"bpa_cagr_10y":n,"bpa_cagr_5y":n,"bpa_anios_negativos_10y":n,"bpa_ajuste_pct":n,"precio_cagr_10y":n,',
    '"deuda_neta_ebitda":n,"deuda_neta_m":n,"ebitda_m":n,"acciones_diluidas_m":n,"fcf_por_accion":n,',
    '"financiera_propia":bool,"es_banco_inmobiliaria":bool,"emitio_en_recesion":bool,',
    '"crisis":{"caida_ventas_pct":n,"caida_ebit_pct":n,"perdidas":bool},',
    '"per_medio_10y":n,',
    '"insiders_pct":n,"control_familiar":bool,"sbc_fcf_pct":n,',
    '"devuelve_capital":bool,"payout_fcf_pct":n,"reinvierte_proyectos":bool,"emite_para_pagar_dividendos":bool,',
    '"cualitativo":{',
    ' "b1":{"nivel":"verde|amarillo|rojo","motivo":"1-2 frases"},',
    ' "b2":{"precio_sobre_inflacion":bool,"motivo":""},',
    ' "b3":{"nivel":"verde|amarillo|rojo","fuentes":["patentes|escala/coste|efecto red|producto crítico y barato|oligopolio|marca|costes de cambio|cultura"],"motivo":""},',
    ' "b4":{"score":n,"motivo":""},',
    ' "b5":{"sin_dependencia_externa":bool,"poco_capital":bool,"sin_deuda_para_funcionar":bool,"motivo":""},',
    ' "b6":{"reinvierte_alto_retorno":bool,"expande_margenes":bool,"sobra_caja":bool,"motivo":""},',
    ' "b7":{"ciclicidad":"no|parcial|si","materias_primas":bool,"motivo":""},',
    ' "c4":{"borrador":"qué sabes de si la directiva cumple lo que promete; di si no lo sabes"}',
    '}}',
    '',
    'Definiciones:',
    '- Si la empresa lleva menos de 10 años cotizando, pon en bpa_cagr_10y y en los demás CAGR el periodo disponible desde su salida a bolsa y dilo en notas_datos. crisis: pon null si la empresa no cotizaba o no existía en 2008-09 ni en 2020.',
    '- historial_anios: años que lleva COTIZANDO en bolsa desde su salida a bolsa (no es la ventana de 10 años: una empresa que cotiza desde 1990 tiene unos 36). roic: ROIC aproximado (NOPAT / capital invertido). deuda_neta_ebitda: negativo si tiene caja neta.',
    '- ventas/EBIT/BPA CAGR: crecimiento anual compuesto. bpa_ttm: BPA diluido de los últimos 12 meses, en divisa de cotización. bpa_ajuste_pct: |BPA ajustado − BPA reportado| / BPA reportado en %.',
    '- acciones_cagr_10y: variación anual de las acciones diluidas (negativa = recompras, positiva = dilución). sede_grupo: "preferente" si la sede es nórdica, Francia, Reino Unido o Canadá; "riesgo" si el marco legal/gobernanza es débil; "neutral" en el resto.',
    '- crisis: la peor caída en 2008-09 o 2020 (caida_* en % positivo = descenso). per_medio_10y: PER medio de los últimos 10 años.',
    '- insiders_pct: % del capital en manos de directivos/fundadores. sbc_fcf_pct: remuneración en acciones (SBC) / flujo de caja libre, en %. payout_fcf_pct: (dividendos + recompras) / FCF, en %.',
    '- b1 (Entender el negocio, método EVVA): verde si se explica con claridad cómo gana dinero y es probable que gane más en 5-10 años; amarillo si hay una incertidumbre relevante (disrupción, un cliente dominante); rojo si no se entiende o va a declive.',
    '- b2: ¿sube precios por encima de la inflación sin perder clientes? b3 (moat): verde = ventaja duradera con evidencia numérica; amarillo = plausible sin evidencia; rojo = ninguna.',
    '- b4: calidad del sector de 1 a 10 con esta escala: gestión de residuos 9; agencias de rating/tarjetas 9-10; material médico 8-9; ciberseguridad, lujo, software, consultoría IT, brokers inmobiliarios, aseguradoras 7-8; defensa/aeroespacial 7; envases 6-7; financieras de préstamos 5-7; farma 5-6; cruceros 5-6; piezas de automóvil 5; automóvil 3-4; bancos 3-4; minería de oro 3; transporte marítimo 1-2; transporte por carretera o aéreo 2-3.',
    '- b5 "dueña de su destino": no depende de precios externos (materias primas), necesita poco capital, no necesita deuda para funcionar. b6 "nirvana" de Greenblatt: reinvierte con retorno alto, expande márgenes al crecer, le sobra caja.',
    '- b7.materias_primas: true SOLO si su producto es una materia prima cuyo precio no controla (minería, petróleo, oro, cereales, metales...). Una marca de consumo o un fabricante para quien las materias primas son un coste NO cuenta como materias primas.',
    '- b7.ciclicidad se decide con lo que pasó en 2008-09 y 2020: "no" si las ventas cayeron menos de un 10 % y el EBIT menos de un 20 % (o crecieron); "parcial" si las ventas cayeron entre un 10 y un 25 % o el EBIT entre un 20 y un 40 %; "si" si cayeron más. Sin ese dato, decide por la naturaleza del negocio (suscripción o consumo básico = no; bienes duraderos, industria pesada, construcción = si).',
    'Devuelve solo el JSON.'
  ].filter(x => x !== '').join('\n');
};

/* ───── Datos cuantitativos calculados desde la ficha de valoración (cuentas de los informes anuales) ─────
   No inventa nada: solo calcula lo que las cuentas permiten y deja vacío el resto (lo cualitativo se rellena a mano o con el prompt). */
Cribado.desdeFicha = function (f, opc) {
  opc = opc || {};
  const isN = Cribado.isN, h = f.hist || {}, an = f.anios || [], n = an.length, o = { notas_datos: [] };
  if (n < 2) return null;
  const serie = k => (h[k] || []).map(v => (isN(v) ? v : null));
  const V = serie('ventas'), E = serie('ebit'), A = serie('acciones'), NI = serie('ni_reportado'), D = serie('deuda'), C = serie('caja'), DA = serie('da'), CX = serie('capex'),
    EQ = serie('equity'), TX = serie('impuestos'), IN = serie('intereses');
  const ult = n - 1, r1 = x => Math.round(x * 10) / 10;
  const cagr = (S, k) => { const a = S[ult - k], b = S[ult]; return k > 0 && ult - k >= 0 && isN(a) && isN(b) && a > 0 && b > 0 ? r1((Math.pow(b / a, 1 / k) - 1) * 100) : null; };
  const span = an[ult] - an[0], k5 = Math.min(5, ult), kMax = ult;
  const set = (k, v) => { if (v != null && isN(v)) o[k] = v; };
  set('ventas_cagr_5y', cagr(V, k5)); if (span >= 9) set('ventas_cagr_10y', cagr(V, kMax));
  set('ebit_cagr_5y', cagr(E, k5)); if (span >= 9) set('ebit_cagr_10y', cagr(E, kMax));
  const mg = V.map((v, i) => (isN(v) && v > 0 && isN(E[i]) ? (E[i] / v) * 100 : null));
  set('margen_ebit', isN(mg[ult]) ? r1(mg[ult]) : null);
  const mgv = mg.filter(isN); if (mgv.length) set('margen_ebit_pico_10y', r1(Math.max(...mgv)));
  if (isN(mg[ult - 5])) set('margen_ebit_hace_5y', r1(mg[ult - 5]));
  // acciones y BPA
  set('acciones_cagr_10y', cagr(A, kMax)); if (isN(A[ult])) set('acciones_diluidas_m', A[ult]);
  const B = NI.map((v, i) => (isN(v) && isN(A[i]) && A[i] > 0 ? v / A[i] : null));
  if (isN(B[ult])) set('bpa_ttm', Math.round(B[ult] * 100) / 100);
  set('bpa_cagr_5y', cagr(B, k5)); if (span >= 9) set('bpa_cagr_10y', cagr(B, kMax));
  set('bpa_anios_negativos_10y', NI.filter(v => isN(v) && v < 0).length);
  // deuda y retorno
  if (isN(D[ult]) && isN(C[ult])) { o.deuda_neta_m = Math.round(D[ult] - C[ult]); }
  if (isN(E[ult]) && isN(DA[ult])) { o.ebitda_m = Math.round(E[ult] + DA[ult]); if (o.ebitda_m > 0 && o.deuda_neta_m != null) o.deuda_neta_ebitda = r1(o.deuda_neta_m / o.ebitda_m); }
  if (isN(E[ult]) && isN(EQ[ult]) && isN(D[ult]) && isN(C[ult])) {
    const base = E[ult] - (IN[ult] || 0), tasa = isN(TX[ult]) && base > 0 ? Math.max(0, Math.min(0.4, TX[ult] / base)) : 0.25, ic = EQ[ult] + D[ult] - C[ult];
    if (ic > 0) { set('roic', r1((E[ult] * (1 - tasa)) / ic * 100)); o.notas_datos.push('ROIC calculado con las cuentas (EBIT·(1−impuestos) / (patrimonio + deuda − caja)); otras definiciones dan cifras distintas.'); }
  }
  if (isN(NI[ult]) && isN(DA[ult]) && isN(CX[ult]) && isN(A[ult]) && A[ult] > 0) { set('fcf_por_accion', Math.round(((NI[ult] + DA[ult] - Math.abs(CX[ult])) / A[ult]) * 100) / 100); o.notas_datos.push('FCF por acción aproximado: beneficio neto + amortizaciones − capex.'); }
  // crisis de 2020 (y 2008 si hubiera datos)
  const i20 = an.indexOf(2020), i19 = an.indexOf(2019);
  if (i20 > 0 && i19 >= 0 && isN(V[i19]) && isN(V[i20]) && isN(E[i19]) && isN(E[i20]) && V[i19] > 0 && E[i19] > 0) {
    o.crisis = { caida_ventas_pct: Math.max(0, r1((1 - V[i20] / V[i19]) * 100)), caida_ebit_pct: Math.max(0, r1((1 - E[i20] / E[i19]) * 100)), perdidas: E[i20] < 0 || (isN(NI[i20]) && NI[i20] < 0) };
    o.notas_datos.push('Crisis: se usa 2020 frente a 2019 (la ficha no recoge 2008-09).');
  }
  if (span < 9) o.notas_datos.push('Los CAGR de «10 años» se calculan con ' + (span) + ' años de cuentas (' + an[0] + '–' + an[ult] + '): la ficha de valoración no llega a diez.');
  if (f.mult_hist && isN(f.mult_hist.per)) set('per_medio_10y', f.mult_hist.per);
  if (f.tipo === 'financiera') o.es_banco_inmobiliaria = true;
  o.ticker = f.ticker; o.nombre = f.nombre; o.divisa_cotizacion = f.divisa; o.anio_dato = f.anio_base || an[ult];
  if (isN(opc.capEur)) set('market_cap_eur_m', Math.round(opc.capEur));
  if (f.sector) o.sector_cartera = String(f.sector).toLowerCase();
  o.origen = 'ficha'; o.confianza = 'media'; o.fecha_datos = f.fecha_datos || null;
  return o;
};
/* Rellena solo los huecos de `d` con `extra` (nunca pisa un dato ya cargado o corregido a mano) */
Cribado.rellenar = function (d, extra) {
  const out = JSON.parse(JSON.stringify(d || {})); let n = 0;
  Object.keys(extra || {}).forEach(k => {
    if (['notas_datos', 'origen', 'confianza', 'fecha_datos'].includes(k)) return;
    if (out[k] == null || out[k] === '') { out[k] = extra[k]; n++; }
    else if (k === 'crisis' && out[k] && typeof out[k] === 'object') { Object.keys(extra[k]).forEach(j => { if (out[k][j] == null) { out[k][j] = extra[k][j]; n++; } }); }
  });
  if (n) { out.notas_datos = (out.notas_datos || []).concat((extra.notas_datos || []).filter(x => !(out.notas_datos || []).includes(x))); }
  return { datos: out, n };
};

/* Campos que acepta el motor (para el editor manual): [ruta, etiqueta, tipo] */
Cribado.CAMPOS = [
  ['Mercado', [['market_cap_eur_m', 'Capitalización (M€)'], ['volumen_diario_eur_k', 'Volumen diario (k€)'], ['analistas_n', 'Nº de analistas'], ['historial_anios', 'Años cotizando']]],
  ['Crecimiento y márgenes', [['ventas_cagr_5y', 'Ventas CAGR 5 años (%)'], ['ventas_cagr_10y', 'Ventas CAGR 10 años (%)'], ['ebit_cagr_5y', 'EBIT CAGR 5 años (%)'], ['ebit_cagr_10y', 'EBIT CAGR 10 años (%)'], ['margen_ebit', 'Margen EBIT (%)'], ['margen_ebit_pico_10y', 'Margen EBIT máximo 10 años (%)'], ['margen_ebit_hace_5y', 'Margen EBIT hace 5 años (%)'], ['roic', 'ROIC (%)']]],
  ['Beneficio y acciones', [['bpa_ttm', 'BPA últimos 12 meses'], ['bpa_cagr_5y', 'BPA CAGR 5 años (%)'], ['bpa_cagr_10y', 'BPA CAGR 10 años (%)'], ['bpa_anios_negativos_10y', 'Años con pérdidas (10 años)'], ['bpa_ajuste_pct', 'Ajuste BPA ajustado/reportado (%)'], ['precio_cagr_10y', 'Cotización CAGR 10 años (%)'], ['acciones_cagr_10y', 'Variación anual de acciones (%)'], ['acciones_diluidas_m', 'Acciones diluidas (M)'], ['per_medio_10y', 'PER medio 10 años'], ['fcf_por_accion', 'FCF por acción']]],
  ['Deuda', [['deuda_neta_m', 'Deuda neta (M)'], ['ebitda_m', 'EBITDA (M)'], ['deuda_neta_ebitda', 'Deuda neta / EBITDA']]],
  ['Administración', [['insiders_pct', '% en manos de gestores'], ['sbc_fcf_pct', 'Remuneración en acciones / FCF (%)'], ['payout_fcf_pct', '(Dividendos + recompras) / FCF (%)']]],
  ['Crisis (peor caída 2008-09 o 2020)', [['crisis.caida_ventas_pct', 'Caída de ventas (%)'], ['crisis.caida_ebit_pct', 'Caída de EBIT (%)']]]
];
Cribado.BOOLS = [['financiera_propia', 'Tiene financiera propia'], ['es_banco_inmobiliaria', 'Banco o inmobiliaria'], ['emitio_en_recesion', 'Emitió deuda/acciones en recesión'], ['control_familiar', 'Control familiar'],
  ['devuelve_capital', 'Devuelve capital al accionista'], ['reinvierte_proyectos', 'Reinvierte en proyectos'], ['emite_para_pagar_dividendos', 'Emite acciones para pagar dividendos'], ['crisis.perdidas', 'Pérdidas en crisis']];
Cribado.SELECTS = [['sede_grupo', 'Sede (M12)', ['preferente', 'neutral', 'riesgo']], ['cualitativo.b1.nivel', 'B1 · Entender el negocio', ['verde', 'amarillo', 'rojo']], ['cualitativo.b3.nivel', 'B3 · Moat', ['verde', 'amarillo', 'rojo']],
  ['cualitativo.b7.ciclicidad', 'B7 · Ciclicidad', ['no', 'parcial', 'si']], ['sector_cartera', 'Sector', Cribado.SECTORES.split('|')]];
Cribado.BOOLS_Q = [['cualitativo.b2.precio_sobre_inflacion', 'B2 · Sube precios por encima de la inflación'], ['cualitativo.b5.sin_dependencia_externa', 'B5 · Sin dependencia de precios externos'], ['cualitativo.b5.poco_capital', 'B5 · Necesita poco capital'], ['cualitativo.b5.sin_deuda_para_funcionar', 'B5 · No necesita deuda para funcionar'],
  ['cualitativo.b6.reinvierte_alto_retorno', 'B6 · Reinvierte con retorno alto'], ['cualitativo.b6.expande_margenes', 'B6 · Expande márgenes'], ['cualitativo.b6.sobra_caja', 'B6 · Le sobra caja'], ['cualitativo.b7.materias_primas', 'B7 · Es de materias primas']];
Cribado.getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
Cribado.setPath = (o, p, v) => { const ks = p.split('.'); let c = o; ks.slice(0, -1).forEach(k => { if (typeof c[k] !== 'object' || c[k] === null) c[k] = {}; c = c[k]; }); if (v === undefined) delete c[ks[ks.length - 1]]; else c[ks[ks.length - 1]] = v; };
if (typeof module !== 'undefined') module.exports = Cribado;
