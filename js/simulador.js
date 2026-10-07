/* =========================================================
   Simulador de interés compuesto · Pibank Perú
   Todo se calcula en el navegador. Modelo:
   - La TREA es una tasa efectiva anual: se convierte a su tasa mensual
     equivalente im = (1 + TREA)^(1/12) − 1 (S/ 1,000 a 5% x 12 meses = S/ 1,050;
     coincide con «Fórmulas y ejemplos» de la Cuenta Soles con n = 30 días).
   - Los aportes mensuales entran al final de cada mes. No hay retiros. Sin ITF.
   - «Intereses por tu dinero» = interés simple anual (TREA × años) de cada depósito
     (un depósito con menos de un año aún no tiene interés sobre interés).
     «Intereses de tus intereses» = todo lo ganado por encima de eso.
   ========================================================= */
(function () {
  'use strict';

  // TREA vigente de la Cuenta Soles Pibank según su tarifario. Si cambia, actualizar también
  // el 5% escrito en index.html (hero, pasos, FAQ, cierre y legales).
  const TREA_PIBANK = 5;

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- Formatos (Perú: S/ 1,050.00) ---------- */
  const NB = ' ';
  const f0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  const f1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
  const f2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fMonto = { format: n => (Number.isInteger(n) ? f0 : f2).format(n) }; // 1,000 · 200.50 · 1,500.75
  const soles = (n, dec = 0) => 'S/' + NB + (dec ? f2.format(n) : f0.format(Math.round(n) || 0));
  // Para lectores de pantalla: «S/» se leería «S barra» y la coma de miles como decimal.
  const solesVoz = n => (Math.round(n) || 0) + ' soles';
  const solesDato = n => (Number.isInteger(n) ? soles(n) : soles(n, 2)); // montos que tecleó la persona
  function solesCorto(n) {
    const corto = x => new Intl.NumberFormat('en-US', { maximumFractionDigits: x < 10 ? 1 : 0 }).format(x);
    if (n >= 1e6) return 'S/' + NB + corto(n / 1e6) + NB + 'M';
    if (n >= 1e3) return 'S/' + NB + corto(n / 1e3) + NB + 'mil';
    return soles(n);
  }
  const anios = n => n + (n === 1 ? ' año' : ' años');
  const tasaTexto = t => String(+t.toFixed(2)) + '%';

  /* ---------- Motor de cálculo ---------- */
  function simular(p) {
    const r = Math.max(0, p.trea) / 100;
    const im = Math.pow(1 + r, 1 / 12) - 1;
    const meses = Math.round(p.anios) * 12;
    const filas = [];
    let saldo = p.inicial, aportes = p.inicial, sumaSimple = 0;
    let saldoPrev = saldo, aportesPrev = aportes;
    for (let m = 1; m <= meses; m++) {
      saldo = saldo * (1 + im) + p.mensual;
      aportes += p.mensual;
      // Los aportes hechos hasta el mes m tienen antigüedades 0..m-1 meses: se suma la nueva (m-1).
      const k = m - 1;
      sumaSimple += k >= 12 ? r * k / 12 : Math.pow(1 + r, k / 12) - 1;
      if (m % 12 === 0) {
        const anio = m / 12;
        const intereses = saldo - aportes;
        const simple = Math.min(intereses, p.inicial * r * anio + p.mensual * sumaSimple);
        filas.push({
          anio, saldo, aportes, intereses, simple,
          ii: Math.max(0, intereses - simple),
          interesAnio: (saldo - saldoPrev) - (aportes - aportesPrev)
        });
        saldoPrev = saldo; aportesPrev = aportes;
      }
    }
    return filas;
  }
  const finalDe = p => simular(p).slice(-1)[0];

  // Cifras visibles que cuadran entre sí: se redondean saldo y aportes, y el resto se deriva
  // (Lo que pusiste + Intereses por tu dinero + Intereses de tus intereses = Saldo).
  function visibles(f) {
    const saldo = Math.round(f.saldo), aportes = Math.round(f.aportes);
    const intereses = Math.max(0, saldo - aportes);
    const ii = Math.min(Math.round(f.ii), intereses);
    return { saldo, aportes, intereses, ii, simple: intereses - ii };
  }

  /* ---------- Utilidades de interfaz ---------- */
  function pintarRango(el) {
    const min = +el.min, max = +el.max, v = clamp(+el.value, min, max);
    el.style.setProperty('--p', ((v - min) / ((max - min) || 1) * 100) + '%');
  }
  function animarNumero(el, hasta, fmt, dur) {
    fmt = fmt || soles; dur = dur || 650;
    const desde = el.dataset.v !== undefined ? +el.dataset.v : NaN;
    el.dataset.v = hasta;
    cancelAnimationFrame(el._raf); clearTimeout(el._to);
    if (reducido || !isFinite(desde) || desde === hasta) { el.textContent = fmt(hasta); return; }
    const t0 = performance.now();
    const paso = t => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(desde + (hasta - desde) * e);
      if (k < 1) el._raf = requestAnimationFrame(paso);
    };
    el._raf = requestAnimationFrame(paso);
    // Respaldo: si la pestaña está oculta (rAF en pausa) igual queda el valor final.
    el._to = setTimeout(() => { if (+el.dataset.v === hasta) el.textContent = fmt(hasta); }, dur + 120);
  }
  // Regiones vivas con espera: anuncian el valor final, no cada paso de un slider.
  const vivo = (() => {
    const t = {};
    return (id, texto, ms) => {
      clearTimeout(t[id]);
      t[id] = setTimeout(() => { const el = document.getElementById(id); if (el) el.textContent = texto; }, ms == null ? 700 : ms);
    };
  })();
  function aviso(texto) {
    const a = $('#aviso');
    a.textContent = '';
    requestAnimationFrame(() => { a.textContent = texto; });
    clearTimeout(a._t); a._t = setTimeout(() => { a.textContent = ''; }, 2600);
  }
  function alVerse(el, fn, opciones) {
    if (!el) return;
    if (!('IntersectionObserver' in window)) { fn(); return; }
    const io = new IntersectionObserver((ents) => {
      if (ents.some(e => e.isIntersecting)) { io.disconnect(); fn(); }
    }, opciones || { threshold: 0.25 });
    io.observe(el);
  }

  /* =========================================================
     HERO · S/ 100 al mes a 10, 20 o 30 años
     ========================================================= */
  function iniciarHero() {
    const chips = $$('.hero-pastilla .chip');
    const monto = $('#hpMonto');
    function render(n) {
      const f = visibles(finalDe({ inicial: 0, mensual: 100, trea: TREA_PIBANK, anios: n }));
      animarNumero(monto, f.saldo);
      $('#hpAportes').textContent = soles(f.aportes);
      $('#hpIntereses').textContent = soles(f.intereses);
      $('#hpBarraAp').style.width = (f.aportes / f.saldo * 100).toFixed(1) + '%';
      chips.forEach(c => c.setAttribute('aria-pressed', String(+c.dataset.anios === n)));
      return f;
    }
    chips.forEach(c => c.addEventListener('click', () => {
      const n = +c.dataset.anios, f = render(n);
      vivo('hpVivo', 'En ' + anios(n) + ' tendrías ' + solesVoz(f.saldo) + '. Tú pones ' + solesVoz(f.aportes) + ' y los intereses ' + solesVoz(f.intereses) + '.', 300);
    }));
    monto.dataset.v = '';
    render(30);
  }

  /* =========================================================
     LABORATORIO · S/ 1,000 al 5% año por año
     ========================================================= */
  function iniciarLab() {
    const DEP = 1000, R = TREA_PIBANK / 100, MAX = 30;
    const rango = $('#labRango'), play = $('#labPlay');
    const barras = $('.lab-barras');
    const tope = DEP * Math.pow(1 + R, MAX) * 1.04;
    let timer = null;

    function render(n) {
      const comp = DEP * Math.pow(1 + R, n);
      const simple = DEP + DEP * R * n;
      const ii = comp - simple;
      const alto = Math.max(160, barras.clientHeight - 84);
      const px = v => (v / tope * alto).toFixed(1) + 'px';
      $('#labS1').style.height = px(DEP);
      $('#labS2').style.height = px(DEP * R * n);
      $('#labC1').style.height = px(DEP);
      $('#labC2').style.height = px(DEP * R * n);
      $('#labC3').style.height = px(ii);
      $('#labSimpleV').textContent = soles(simple, 2);
      $('#labCompV').textContent = soles(comp, 2);
      $('#labDif').textContent = soles(ii, 2);
      $('#labAnio').textContent = n;
      $('#labFormula').innerHTML = 'S/' + NB + '1,000 × 1.05<sup>' + n + '</sup> = ' + soles(comp, 2);

      let t;
      if (n === 0) {
        t = 'Depositas S/' + NB + '1,000. Todavía no has ganado intereses.';
      } else if (n === 1) {
        t = 'Ganas ' + soles(50, 2) + ', el 5% de tus S/' + NB + '1,000. En el primer año, el interés simple y el compuesto dan lo mismo.';
      } else {
        const intAnio = DEP * Math.pow(1 + R, n - 1) * R;
        const previos = DEP * Math.pow(1 + R, n - 1) - DEP;
        t = 'Este año ganas ' + soles(intAnio, 2) + ': ' + soles(50, 2) + ' por tus S/' + NB + '1,000 y <span class="ii">' +
            soles(intAnio - 50, 2) + '</span> por los ' + soles(previos, 2) + ' de intereses que ya tenías.';
        if (n === MAX) t += ' Tu dinero ya se multiplicó por ' + f1.format(comp / DEP) + '.';
      }
      $('#labTexto').innerHTML = t;
      rango.value = n; pintarRango(rango);
      rango.setAttribute('aria-valuetext', 'Año ' + n);
    }
    function parar(anunciar) {
      clearInterval(timer); timer = null;
      play.classList.remove('reproduciendo');
      play.setAttribute('aria-label', 'Reproducir: avanzar año por año');
      if (anunciar) vivo('labVivo', $('#labTexto').textContent, 150);
    }
    function reproducir(hasta, ms, anunciar) {
      play.classList.add('reproduciendo'); play.setAttribute('aria-label', 'Pausar');
      timer = setInterval(() => {
        const n = +rango.value + 1;
        render(n);
        if (n >= hasta) parar(anunciar !== false);
      }, ms);
    }
    play.addEventListener('click', () => {
      if (timer) { parar(true); return; }
      if (+rango.value >= MAX) render(0);
      reproducir(MAX, reducido ? 250 : 420);
    });
    rango.addEventListener('input', () => { if (timer) parar(false); render(+rango.value); vivo('labVivo', $('#labTexto').textContent, 600); });
    window.addEventListener('resize', () => render(+rango.value));
    render(0);

    // Intro: avanza sola hasta el año 10 cuando las BARRAS están a la vista (en móvil van
    // debajo del texto) y siguen visibles 250 ms después (no se dispara al pasar con un ancla).
    function arrancarIntro() {
      if (timer || +rango.value !== 0) return; // la persona ya interactuó
      if (reducido) { render(10); return; }
      reproducir(10, 300, false);
    }
    (function vigilar() {
      alVerse(barras, () => setTimeout(() => {
        const r = barras.getBoundingClientRect();
        if (r.top < innerHeight && r.bottom > 0) arrancarIntro(); else vigilar();
      }, 250), { threshold: 0.6 });
    })();
  }

  /* =========================================================
     SIMULADOR
     ========================================================= */
  function escalones(tramos) {
    const out = [];
    tramos.forEach(([desde, hasta, paso]) => {
      for (let v = desde; v <= hasta + 1e-9; v += paso) if (!out.length || v > out[out.length - 1]) out.push(v);
    });
    return out;
  }
  const PASOS_INICIAL = escalones([[0, 1000, 100], [1000, 5000, 250], [5000, 20000, 500], [20000, 50000, 1000], [50000, 100000, 2500], [100000, 200000, 5000]]);
  const PASOS_MENSUAL = escalones([[0, 300, 10], [300, 1000, 25], [1000, 3000, 50], [3000, 5000, 100], [5000, 10000, 250]]);
  const cercano = (arr, v) => arr.reduce((mej, x, i) => (Math.abs(x - v) < Math.abs(arr[mej] - v) ? i : mej), 0);
  const LIMITES = { inicial: [0, 10000000], mensual: [0, 1000000], trea: [0, 12], anios: [1, 40] };
  const ESCENARIOS = {
    emergencia: { inicial: 500, mensual: 150, trea: TREA_PIBANK, anios: 3 },
    estudios: { inicial: 1000, mensual: 200, trea: TREA_PIBANK, anios: 15 },
    jubilacion: { inicial: 2000, mensual: 300, trea: TREA_PIBANK, anios: 35 },
    unico: { inicial: 10000, mensual: 0, trea: TREA_PIBANK, anios: 20 }
  };
  const ICONO_IDEA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z" fill="none" stroke="#FFDC00" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // Montos: 1,500.75 · 200,50 · 1.000 · 1.000,50 · 1500
  function leerMonto(s) {
    let t = String(s).replace(/[^\d.,]/g, '');
    if (/^\d{1,3}(,\d{3})+(\.\d*)?$/.test(t)) t = t.replace(/,/g, '');
    else if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    else t = t.replace(/,/g, '');
    const n = parseFloat(t);
    return isFinite(n) ? n : 0;
  }
  function leerTasa(s) { const n = parseFloat(String(s).replace(',', '.').replace(/[^\d.]/g, '')); return isFinite(n) ? n : 0; }

  function iniciarSimulador() {
    const estado = { inicial: 1000, mensual: 200, trea: TREA_PIBANK, anios: 30 };
    const el = {
      fInicial: $('#fInicial'), rInicial: $('#rInicial'),
      fMensual: $('#fMensual'), rMensual: $('#rMensual'),
      fTrea: $('#fTrea'), rTrea: $('#rTrea'),
      rAnios: $('#rAnios'), oAnios: $('#oAnios'),
      grafico: $('#grafico'), tip: $('#graficoTip')
    };
    el.rInicial.max = PASOS_INICIAL.length - 1;
    el.rMensual.max = PASOS_MENSUAL.length - 1;

    // Valores compartidos por enlace (?inicial=&mensual=&trea=&anios=)
    try {
      const q = new URLSearchParams(location.search);
      ['inicial', 'mensual', 'trea', 'anios'].forEach(k => {
        if (!q.has(k)) return;
        const v = parseFloat(q.get(k));
        if (isFinite(v)) estado[k] = clamp(k === 'anios' ? Math.round(v) : v, LIMITES[k][0], LIMITES[k][1]);
      });
    } catch (e) { /* sin parámetros */ }

    /* ----- Textos de ayuda (con avisos temporales mientras se escribe) ----- */
    const AYUDA_BASE = { hInicial: $('#hInicial').textContent, hMensual: $('#hMensual').textContent };
    function ayudaTrea() {
      return estado.trea === TREA_PIBANK
        ? 'La Cuenta Soles Pibank paga 5% TREA. Puedes probar otras tasas solo como ejemplo, para comparar.'
        : 'Tasa hipotética, solo para comparar. La Cuenta Soles Pibank paga 5% TREA.';
    }
    function avisar(id, texto) {
      const p = document.getElementById(id);
      p.textContent = texto || (id === 'hTrea' ? ayudaTrea() : AYUDA_BASE[id]);
      p.classList.toggle('alerta', !!texto);
    }
    function avisarMonto(id, bruto, max, textoMax) {
      if (/^\s*-/.test(bruto)) avisar(id, 'Solo se pueden simular montos positivos.');
      else if (leerMonto(bruto) > max) avisar(id, textoMax);
      else avisar(id, null);
    }

    let urlLista = false;
    function sincronizar(origen) {
      if (origen !== 'fInicial') el.fInicial.value = fMonto.format(estado.inicial);
      if (origen !== 'fMensual') el.fMensual.value = fMonto.format(estado.mensual);
      if (origen !== 'fTrea') el.fTrea.value = String(+estado.trea.toFixed(2));
      if (origen !== 'rInicial') el.rInicial.value = cercano(PASOS_INICIAL, estado.inicial);
      if (origen !== 'rMensual') el.rMensual.value = cercano(PASOS_MENSUAL, estado.mensual);
      if (origen !== 'rTrea') el.rTrea.value = estado.trea;
      el.rAnios.value = estado.anios;
      el.rInicial.setAttribute('aria-valuetext', solesVoz(estado.inicial));
      el.rMensual.setAttribute('aria-valuetext', solesVoz(estado.mensual));
      el.rTrea.setAttribute('aria-valuetext', tasaTexto(estado.trea));
      el.rAnios.setAttribute('aria-valuetext', anios(estado.anios));
      el.oAnios.textContent = anios(estado.anios);
      if (!$('#hTrea').classList.contains('alerta')) avisar('hTrea', null);
      [el.rInicial, el.rMensual, el.rTrea, el.rAnios].forEach(pintarRango);
    }
    function soltarEscenario() { $$('[data-escenario]').forEach(c => c.setAttribute('aria-pressed', 'false')); }
    function cambio(origen) { urlLista = true; if (origen !== 'escenario') soltarEscenario(); sincronizar(origen); render(); }

    el.fInicial.addEventListener('input', () => {
      avisarMonto('hInicial', el.fInicial.value, LIMITES.inicial[1], 'El máximo para simular es S/ 10,000,000. Usamos ese monto.');
      estado.inicial = /^\s*-/.test(el.fInicial.value) ? 0 : clamp(leerMonto(el.fInicial.value), ...LIMITES.inicial); cambio('fInicial');
    });
    el.fMensual.addEventListener('input', () => {
      avisarMonto('hMensual', el.fMensual.value, LIMITES.mensual[1], 'El máximo para simular es S/ 1,000,000 al mes. Usamos ese monto.');
      estado.mensual = /^\s*-/.test(el.fMensual.value) ? 0 : clamp(leerMonto(el.fMensual.value), ...LIMITES.mensual); cambio('fMensual');
    });
    el.fTrea.addEventListener('input', () => {
      const neg = /^\s*-/.test(el.fTrea.value);
      const t = neg ? 0 : leerTasa(el.fTrea.value);
      avisar('hTrea', neg ? 'Solo se pueden simular tasas positivas.' : t > LIMITES.trea[1] ? 'El máximo para simular es 12%. Usamos esa tasa.' : null);
      estado.trea = clamp(t, ...LIMITES.trea); cambio('fTrea');
    });
    [el.fInicial, el.fMensual, el.fTrea].forEach(i => {
      i.addEventListener('blur', () => { ['hInicial', 'hMensual', 'hTrea'].forEach(id => avisar(id, null)); sincronizar(); });
      i.addEventListener('focus', () => i.select());
      i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); i.blur(); } });
    });
    el.rInicial.addEventListener('input', () => { estado.inicial = PASOS_INICIAL[+el.rInicial.value]; cambio('rInicial'); });
    el.rMensual.addEventListener('input', () => { estado.mensual = PASOS_MENSUAL[+el.rMensual.value]; cambio('rMensual'); });
    el.rTrea.addEventListener('input', () => { estado.trea = +(+el.rTrea.value).toFixed(1); cambio('rTrea'); });
    el.rAnios.addEventListener('input', () => { estado.anios = +el.rAnios.value; cambio('rAnios'); });
    $('#btnTreaPibank').addEventListener('click', () => {
      if (estado.trea === TREA_PIBANK) { sincronizar(); return; }
      estado.trea = TREA_PIBANK; cambio();
    });
    $('#simForm').addEventListener('submit', e => e.preventDefault());
    $$('[data-escenario]').forEach(c => c.addEventListener('click', () => {
      Object.assign(estado, ESCENARIOS[c.dataset.escenario]);
      soltarEscenario(); c.setAttribute('aria-pressed', 'true');
      cambio('escenario');
    }));

    /* ----- Resultado ----- */
    let filas = [];
    let animarGrafico = false;
    function render() {
      filas = simular(estado);
      const u = filas[filas.length - 1];
      const v = visibles(u);
      const hipotetica = estado.trea !== TREA_PIBANK;
      $('#resAnios').textContent = anios(estado.anios);
      const tasaFrase = hipotetica ? 'una tasa hipotética de ' + tasaTexto(estado.trea) : tasaTexto(estado.trea) + ' TREA';
      $('#resTasa').textContent = tasaFrase;
      $('#resHipo').hidden = !hipotetica;
      $('#resHipo').textContent = hipotetica ? 'Solo para comparar: no corresponde a un producto de Pibank. La Cuenta Soles Pibank paga 5% TREA.' : '';
      $('#miniTasa').textContent = hipotetica ? ' (tasa hipotética ' + tasaTexto(estado.trea) + ')' : '';
      $('#resCta').textContent = hipotetica ? 'Conoce la Cuenta Soles (5% TREA)' : 'Abre tu Cuenta Soles';

      const montoEl = $('#resSaldo');
      montoEl.textContent = soles(v.saldo);
      montoEl.classList.toggle('largo', montoEl.textContent.length > 11);
      montoEl.classList.toggle('muy-largo', montoEl.textContent.length > 14);
      const mult = u.aportes > 0 ? u.saldo / u.aportes : 0;
      const fMult = mult >= 100 ? f0 : mult >= 2 ? f1 : f2;
      $('#resMult').textContent = 'Tu dinero ×' + fMult.format(mult);
      $('#resMult').hidden = !(v.intereses > 0 && mult >= 1.005);
      $('#resAportes').textContent = soles(v.aportes);
      $('#resSimple').textContent = soles(v.simple);
      $('#resII').textContent = soles(v.ii);
      $('#resInteres').textContent = soles(v.intereses);
      $('#resPct').textContent = v.saldo > 0 && v.intereses > 0
        ? '(el ' + clamp(Math.round(v.intereses / v.saldo * 100), 1, 99) + '% de tu saldo final)' : '';
      $('#insights').innerHTML = generarInsights(u).map(t => '<li>' + ICONO_IDEA + '<span>' + t + '</span></li>').join('');
      $('#miniSaldo').textContent = soles(v.saldo);
      $('#miniAnios').textContent = anios(estado.anios);
      if (urlLista) {
        const alertas = $$('.campo-ayuda.alerta').map(p => p.textContent).join(' ');
        vivo('simVivo', (alertas ? alertas + ' ' : '') + 'En ' + anios(estado.anios) + ', con ' + tasaFrase + ', tendrías ' + solesVoz(v.saldo) +
          '. Pusiste ' + solesVoz(v.aportes) + ' y ' + solesVoz(v.ii) + ' son intereses de tus intereses.', 900);
      }
      dibujar(animarGrafico);
      animarGrafico = false;
      renderTabla();
      guardarEnUrl();
    }

    function generarInsights(u) {
      const out = [];
      if (u.saldo <= 0) return out;
      if (estado.trea <= 0) {
        out.push('Con 0% de interés tu dinero no crecería: solo se acumularía lo que depositas.');
        return out;
      }
      if (estado.anios < 2) out.push('Con 1 año, los intereses de tus intereses todavía no aparecen. Prueba con 10 o 20 años para ver la diferencia.');
      if (estado.anios >= 6 && u.intereses > 0) {
        const corte = Math.round(estado.anios * 2 / 3), ultimos = estado.anios - corte;
        const pct = (u.intereses - filas[corte - 1].intereses) / u.intereses * 100;
        // Solo si de verdad se concentran al final (no cuando el reparto es casi lineal)
        if (pct >= ultimos / estado.anios * 100 + 10) {
          out.push(pct > 50
            ? 'En los últimos <strong>' + anios(ultimos) + '</strong> ganarías más intereses que en los ' + corte + ' años anteriores juntos: el <strong>' + Math.round(pct) + '%</strong> del total.'
            : 'El <strong>' + Math.round(pct) + '%</strong> de tus intereses llegaría en los últimos ' + anios(ultimos) + ' de tus ' + estado.anios + '.');
        }
      }
      if (estado.mensual > 0) {
        const anual = estado.mensual * 12;
        const cruce = simular(Object.assign({}, estado, { anios: 60 })).find(f => f.interesAnio > anual);
        if (cruce && cruce.anio === estado.anios && cruce.anio > 1) {
          out.push('En el año <strong>' + cruce.anio + '</strong>, el último de tu plan, los intereses del año ya pondrían más que tú: superarían los ' + solesDato(anual) + ' que ahorras al año.');
        } else if (cruce && cruce.anio <= estado.anios) {
          out.push('Desde ' + (cruce.anio === 1 ? 'el primer año' : 'el año <strong>' + cruce.anio + '</strong>') +
            ', los intereses de cada año pondrían más que tú: superarían los ' + solesDato(anual) + ' que ahorras al año.');
        } else if (cruce) {
          out.push('A este ritmo, desde el año <strong>' + cruce.anio + '</strong> los intereses de cada año pondrían más que tú (más de ' + solesDato(anual) + ' al año).');
        }
      } else if (estado.inicial > 0) {
        const dup = Math.log(2) / Math.log(1 + estado.trea / 100);
        out.push(dup > 60 ? 'A esta tasa, tu dinero tardaría más de 60 años en duplicarse.'
          : 'Sin agregar nada más, tu dinero se duplicaría en unos <strong>' + f1.format(dup) + ' años</strong>.');
      }
      if (estado.anios <= 30) {
        const vHoy = visibles(u), vMas = visibles(finalDe(Object.assign({}, estado, { anios: estado.anios + 10 })));
        if (vMas.ii > vHoy.ii) {
          out.push((estado.mensual > 0 ? 'Si sigues ahorrando ' + solesDato(estado.mensual) + ' al mes <strong>10 años más</strong>'
            : 'Si dejas tu dinero <strong>10 años más</strong>') +
            ', tus «intereses de tus intereses» pasarían de ' + soles(vHoy.ii) + ' a <strong>' + soles(vMas.ii) + '</strong>.');
        }
      }
      return out.slice(0, 3);
    }

    /* ----- Gráfico de barras apiladas (SVG propio, se recorre como un slider) ----- */
    let geo = null, sel = -1, ultimoAncho = 0;
    function escala(max, n) {
      if (max <= 0) return { tope: 1, paso: 1 };
      const bruto = max / (n || 4), mag = Math.pow(10, Math.floor(Math.log10(bruto))), norm = bruto / mag;
      const paso = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
      return { paso, tope: Math.ceil(max / paso - 1e-9) * paso };
    }
    const topeRedondo = (x, y, w, h, r) =>
      'M' + x.toFixed(2) + ',' + (y + h).toFixed(2) + 'V' + (y + r).toFixed(2) + 'Q' + x.toFixed(2) + ',' + y.toFixed(2) + ' ' + (x + r).toFixed(2) + ',' + y.toFixed(2) +
      'H' + (x + w - r).toFixed(2) + 'Q' + (x + w).toFixed(2) + ',' + y.toFixed(2) + ' ' + (x + w).toFixed(2) + ',' + (y + r).toFixed(2) + 'V' + (y + h).toFixed(2) + 'Z';

    function dibujar(animar) {
      const cont = el.grafico;
      const W = Math.max(240, Math.round(cont.clientWidth));
      ultimoAncho = W;
      $$('svg, .grafico-vacio', cont).forEach(n => n.remove());
      el.tip.hidden = true; sel = -1;
      const u = filas[filas.length - 1];
      if (!filas.length || u.saldo <= 0) {
        geo = null;
        cont.insertAdjacentHTML('beforeend', '<div class="grafico-vacio">Ingresa un monto inicial o un aporte mensual para ver cómo crece tu dinero.</div>');
        $('#graficoResumen').textContent = 'Sin datos para graficar.';
        cont.removeAttribute('aria-valuetext');
        return;
      }
      const H = W < 520 ? 250 : 310;
      const esc = escala(Math.max.apply(null, filas.map(f => f.saldo)), 4);
      const m = { t: 12, r: 4, b: 30, l: Math.max(W < 520 ? 54 : 66, solesCorto(esc.tope).length * 7 + 12) };
      const iw = W - m.l - m.r, ih = H - m.t - m.b;
      const n = filas.length, banda = iw / n;
      const bw = Math.max(2, Math.min(32, banda * (n > 24 ? 0.72 : 0.6)));
      const y = v => m.t + ih - v / esc.tope * ih;
      let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" height="' + H + '" aria-hidden="true" focusable="false"' + (animar && !reducido ? ' class="g-anim"' : '') + '>';
      for (let v = 0; v <= esc.tope + esc.paso * 1e-6; v += esc.paso) {
        const yy = y(v).toFixed(1);
        s += '<line class="g-linea" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + yy + '" y2="' + yy + '"/>' +
             '<text class="g-eje" x="' + (m.l - 10) + '" y="' + (+yy + 4) + '" text-anchor="end">' + (v === 0 ? 'S/' + NB + '0' : solesCorto(v)) + '</text>';
      }
      s += '<rect class="g-foco" id="gFoco" x="0" y="' + m.t + '" width="' + banda.toFixed(2) + '" height="' + ih + '" rx="6" visibility="hidden"/>';
      filas.forEach((f, i) => {
        const x = m.l + i * banda + (banda - bw) / 2;
        const segs = [['g-aportes', f.aportes], ['g-simple', f.simple], ['g-ii', f.ii]].filter(z => z[1] / esc.tope * ih > 0.05);
        let base = m.t + ih;
        s += '<g class="g-barra" style="--i:' + i + '">';
        segs.forEach((z, j) => {
          const h = z[1] / esc.tope * ih, top = base - h;
          s += j === segs.length - 1
            ? '<path class="' + z[0] + '" d="' + topeRedondo(x, top, bw, h, Math.min(4, bw / 2, h)) + '"/>'
            : '<rect class="' + z[0] + '" x="' + x.toFixed(2) + '" y="' + top.toFixed(2) + '" width="' + bw.toFixed(2) + '" height="' + h.toFixed(2) + '"/>';
          base = top;
        });
        s += '</g>';
      });
      const salto = n <= 12 ? 1 : n <= 20 ? 2 : 5;
      filas.forEach((f, i) => {
        if (f.anio % salto === 0 || (f.anio === 1 && salto === 5)) {
          s += '<text class="g-eje" x="' + (m.l + i * banda + banda / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + f.anio + '</text>';
        }
      });
      s += '</svg>';
      cont.insertAdjacentHTML('afterbegin', s);
      geo = { W, H, m, banda, n, y };
      const v = visibles(u);
      $('#graficoResumen').textContent = 'Gráfico de barras de ' + anios(n) + '. Al final tendrías ' + solesVoz(v.saldo) + ': ' +
        solesVoz(v.aportes) + ' que pusiste, ' + solesVoz(v.simple) + ' de intereses por tu dinero y ' + solesVoz(v.ii) + ' de intereses de tus intereses.';
      cont.setAttribute('aria-valuemax', n);
      cont.setAttribute('aria-valuenow', n);
      cont.setAttribute('aria-valuetext', 'Año ' + n + ': saldo ' + solesVoz(v.saldo));
    }

    function seleccionar(i) {
      const foco = $('#gFoco', el.grafico);
      if (!geo || !foco) return;
      sel = i;
      if (i < 0) { foco.setAttribute('visibility', 'hidden'); el.tip.hidden = true; return; }
      const f = filas[i], v = visibles(f);
      const ganado = v.intereses - (i > 0 ? visibles(filas[i - 1]).intereses : 0);
      foco.setAttribute('x', (geo.m.l + i * geo.banda).toFixed(2));
      foco.setAttribute('visibility', 'visible');
      el.tip.innerHTML = '<b>Año ' + f.anio + '</b>' +
        '<div><span><i style="background:var(--g-aportes)"></i>Lo que pusiste</span><span>' + soles(v.aportes) + '</span></div>' +
        '<div><span><i style="background:var(--g-simple)"></i>Intereses por tu dinero</span><span>' + soles(v.simple) + '</span></div>' +
        '<div><span><i style="background:var(--amarillo)"></i>Intereses de tus intereses</span><span>' + soles(v.ii) + '</span></div>' +
        '<div class="tip-saldo"><span>Saldo</span><span>' + soles(v.saldo) + '</span></div>' +
        '<div><span>Ganado ese año</span><span>' + soles(ganado) + '</span></div>';
      el.tip.hidden = false;
      const svg = $('svg', el.grafico);
      const k = svg.getBoundingClientRect().width / geo.W;
      const cx = (geo.m.l + i * geo.banda + geo.banda / 2) * k;
      const tw = el.tip.offsetWidth, th = el.tip.offsetHeight;
      const ancho = el.grafico.clientWidth;
      let left, top;
      if (ancho < 480) {
        // En móvil no cabe al lado de la barra: va encima del gráfico (el dedo tapa lo de abajo)
        left = Math.max(0, (ancho - tw) / 2);
        const techo = $('.cabecera').getBoundingClientRect().bottom + 8 - el.grafico.getBoundingClientRect().top;
        top = -th - 8;
        if (top < techo) top = techo + th <= geo.H * k * 0.55 ? techo : geo.H * k + 8; // si no cabe arriba: bajo la cabecera o debajo del gráfico
      } else {
        left = cx + 14;
        if (left + tw > ancho) left = cx - tw - 14;
        left = clamp(left, 0, Math.max(0, ancho - tw));
        top = clamp(geo.y(f.saldo) * k - th / 2, -8, geo.H * k - th);
      }
      el.tip.style.left = left + 'px';
      el.tip.style.top = top + 'px';
      el.grafico.setAttribute('aria-valuenow', f.anio);
      el.grafico.setAttribute('aria-valuetext', 'Año ' + f.anio + ': saldo ' + solesVoz(v.saldo) + '; ' + solesVoz(v.ii) + ' son intereses de tus intereses');
    }
    function indiceDesdeEvento(e) {
      const svg = $('svg', el.grafico);
      if (!geo || !svg) return -1;
      const r = svg.getBoundingClientRect();
      const px = (e.clientX - r.left) * (geo.W / r.width);
      if (px < geo.m.l - 4) return -1;
      return clamp(Math.floor((px - geo.m.l) / geo.banda), 0, geo.n - 1);
    }
    el.grafico.addEventListener('pointermove', e => { const i = indiceDesdeEvento(e); if (i !== sel) seleccionar(i); });
    el.grafico.addEventListener('pointerdown', e => seleccionar(indiceDesdeEvento(e)));
    el.grafico.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') seleccionar(-1); });
    el.grafico.addEventListener('keydown', e => {
      if (!geo) return;
      const pasos = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 };
      if (e.key in pasos) { e.preventDefault(); seleccionar(clamp((sel < 0 ? geo.n - 1 : sel) + pasos[e.key], 0, geo.n - 1)); }
      else if (e.key === 'Home') { e.preventDefault(); seleccionar(0); }
      else if (e.key === 'End') { e.preventDefault(); seleccionar(geo.n - 1); }
      else if (e.key === 'Escape') seleccionar(-1);
    });
    el.grafico.addEventListener('blur', () => seleccionar(-1));
    document.addEventListener('pointerdown', e => { if (!el.grafico.contains(e.target)) seleccionar(-1); });

    if ('ResizeObserver' in window) {
      let pendiente = 0;
      new ResizeObserver(() => {
        cancelAnimationFrame(pendiente);
        pendiente = requestAnimationFrame(() => { if (Math.round(el.grafico.clientWidth) !== ultimoAncho) dibujar(false); });
      }).observe(el.grafico);
    } else {
      window.addEventListener('resize', () => dibujar(false));
    }
    alVerse(el.grafico, () => { if (!reducido) dibujar(true); }, { threshold: 0.3 });

    /* ----- Tabla año por año (cifras que cuadran por fila y por columna) ----- */
    function renderTabla() {
      let acumPrev = 0;
      $('#tablaCuerpo').innerHTML = filas.map(f => {
        const v = visibles(f), delAnio = v.intereses - acumPrev;
        acumPrev = v.intereses;
        return '<tr' + (f.anio % 5 === 0 || f.anio === filas.length ? ' class="hito"' : '') + '><td>' + f.anio + '</td><td>' +
          soles(v.aportes) + '</td><td>' + soles(delAnio) + '</td><td>' + soles(v.ii) + '</td><td>' + soles(v.saldo) + '</td></tr>';
      }).join('');
    }

    /* ----- Resumen flotante en móvil: visible mientras se edita el formulario ----- */
    const mini = $('#simMini');
    mini.hidden = false;
    let formVisible = false, resVisible = false;
    function actualizarMini() {
      const ocultar = !formVisible || resVisible;
      mini.classList.toggle('oculto', ocultar);
      mini.tabIndex = ocultar ? -1 : 0;
      mini.setAttribute('aria-hidden', String(ocultar));
    }
    actualizarMini();
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { formVisible = e.isIntersecting; actualizarMini(); }).observe($('#simForm'));
      new IntersectionObserver(([e]) => { resVisible = e.isIntersecting; actualizarMini(); }, { threshold: 0.2 }).observe($('.res-cab'));
    }
    mini.addEventListener('click', () => {
      const destino = $('.res-cab');
      destino.tabIndex = -1;
      destino.scrollIntoView({ behavior: reducido ? 'auto' : 'smooth', block: 'start' });
      destino.focus({ preventScroll: true });
    });

    /* ----- URL para compartir (sin borrar utm_*, gclid ni fbclid de la URL de llegada) ----- */
    let tUrl = 0;
    function consulta() {
      return '?inicial=' + +estado.inicial.toFixed(2) + '&mensual=' + +estado.mensual.toFixed(2) + '&trea=' + +estado.trea.toFixed(2) + '&anios=' + estado.anios;
    }
    function guardarEnUrl() {
      if (!urlLista) return; // no se toca la URL hasta que la persona cambie algo
      clearTimeout(tUrl);
      tUrl = setTimeout(() => {
        try {
          const q = new URLSearchParams(location.search);
          q.set('inicial', +estado.inicial.toFixed(2));
          q.set('mensual', +estado.mensual.toFixed(2));
          q.set('trea', +estado.trea.toFixed(2));
          q.set('anios', estado.anios);
          history.replaceState(null, '', '?' + q.toString() + location.hash);
        } catch (e) { /* file:// */ }
      }, 300);
    }
    $('#btnCompartir').addEventListener('click', () => {
      const url = location.href.split('?')[0].split('#')[0] + consulta() + '#simulador';
      const ok = () => aviso('Enlace copiado. Compártelo con quien quieras.');
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(url).then(ok, () => copiarRespaldo(url) && ok());
      } else if (copiarRespaldo(url)) ok();
    });
    function copiarRespaldo(texto) {
      const t = document.createElement('textarea');
      t.value = texto; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      t.remove();
      if (!ok) aviso('No se pudo copiar. Copia la dirección de tu navegador.');
      return ok;
    }

    sincronizar();
    render();
    // API mínima para pruebas desde la consola
    window.PibankSimulador = { simular, visibles, estado, render: () => { sincronizar(); render(); } };
  }

  /* =========================================================
     LARGO PLAZO
     ========================================================= */
  function iniciarLargoPlazo() {
    const R = TREA_PIBANK / 100;
    // Macetas: S/ 1,000 en el año 1, 10 y 30
    $('#mt1').textContent = soles(1000 * (1 + R));
    $('#mt10').textContent = soles(1000 * Math.pow(1 + R, 10));
    $('#mt30').textContent = soles(1000 * Math.pow(1 + R, 30));

    // Décadas: S/ 100 al mes durante 40 años
    const d = simular({ inicial: 0, mensual: 100, trea: TREA_PIBANK, anios: 40 });
    const dec = [10, 20, 30, 40].map((a, i) => ({
      ap: d[a - 1].aportes - (i ? d[a - 11].aportes : 0),
      int: d[a - 1].intereses - (i ? d[a - 11].intereses : 0),
      nombre: i === 0 ? 'Años 1–10' : 'Años ' + (a - 9) + '–' + a
    }));
    const max = Math.max.apply(null, dec.map(x => Math.max(x.ap, x.int))) * 1.12;
    const cont = $('#decadas');
    const aporteDec = dec[0].ap;
    cont.innerHTML = dec.map(x =>
      '<div class="decada"><div class="decada-barra" data-h="' + (x.int / max * 100).toFixed(2) + '"><span>' + solesCorto(x.int) + '</span></div>' +
      '<p class="decada-nombre">' + x.nombre + '</p></div>').join('') +
      '<div class="decadas-ref" style="bottom:0"><span>Tu aporte<b class="ref-monto">: ' + solesCorto(aporteDec) + '</b></span></div>';
    cont.setAttribute('role', 'img');
    cont.setAttribute('aria-label', 'Intereses ganados por década ahorrando 100 soles al mes, frente a tu aporte de ' + solesVoz(aporteDec) + ' por década: ' +
      dec.map(x => x.nombre + ', ' + solesVoz(x.int) + ' de intereses').join('; ') + '.');
    const mostrar = () => {
      $$('.decada-barra', cont).forEach(b => { b.style.height = b.dataset.h + '%'; });
      $('.decadas-ref', cont).style.bottom = (aporteDec / max * 100).toFixed(2) + '%';
    };
    if (reducido) mostrar(); else alVerse(cont, mostrar, { threshold: 0.4 });
    const supera = dec.findIndex(x => x.int > x.ap);
    const ordinales = ['primera', 'segunda', 'tercera', 'cuarta'];
    $('#decRemate').innerHTML = (supera >= 0 ? 'Desde la ' + ordinales[supera] + ' década, los intereses ya pondrían más que tú. ' : '') +
      'En la última ganarías <strong>' + soles(dec[3].int) + '</strong>: ' + Math.round(dec[3].int / dec[0].int) +
      ' veces lo de la primera, con el mismo esfuerzo.';

    // Regla del 72 (solo tasas iguales o menores a la de Pibank)
    const chips72 = $$('[data-tasa]');
    function render72(t) {
      const aprox = 72 / t, exacto = Math.log(2) / Math.log(1 + t / 100);
      $('#r72Anios').textContent = f1.format(aprox);
      $('#r72Cuenta').textContent = '72 ÷ ' + t + ' = ' + f1.format(aprox) + ' · cálculo exacto: ' + f1.format(exacto) + ' años';
      let html = '<div class="lt-eje"></div>';
      for (let k = 1; k * exacto <= 40; k++) {
        html += '<div class="lt-hito" style="left:' + (k * exacto / 40 * 100).toFixed(2) + '%"><i></i><b>×' + Math.pow(2, k) + '</b></div>';
      }
      html += '<span class="lt-marca" style="left:0">Hoy</span><span class="lt-marca" style="right:0">40 años</span>';
      $('#r72Linea').innerHTML = html;
      $('#r72Nota').innerHTML = 'Al ' + t + '%, en 40 años, S/' + NB + '1,000 se convertirían en <strong>' + soles(1000 * Math.pow(1 + t / 100, 40)) + '</strong>.' +
        (t !== TREA_PIBANK ? ' Es una tasa hipotética, solo para comparar.' : '');
      chips72.forEach(c => c.setAttribute('aria-pressed', String(+c.dataset.tasa === t)));
    }
    chips72.forEach(c => c.addEventListener('click', () => render72(+c.dataset.tasa)));
    render72(TREA_PIBANK);

    // El costo de esperar: Lucía vs Diego
    const BASE = { inicial: 0, mensual: 200, trea: TREA_PIBANK };
    const lucia = visibles(finalDe(Object.assign({ anios: 35 }, BASE)));
    $('#lAportes').textContent = soles(lucia.aportes);
    $('#lSaldo').textContent = soles(lucia.saldo);
    $('#lBarra').style.width = '100%';
    const rEsp = $('#rEspera');
    function renderEspera(n) {
      const diego = visibles(finalDe(Object.assign({ anios: 35 - n }, BASE)));
      $('#oEspera').textContent = anios(n);
      $('#dEdad').textContent = 'empieza a los ' + (25 + n);
      $('#dAportes').textContent = soles(diego.aportes);
      $('#dSaldo').textContent = soles(diego.saldo);
      $('#dBarra').style.width = (diego.saldo / lucia.saldo * 100).toFixed(1) + '%';
      $('#esperaRemate').innerHTML = 'Diego pondría ' + soles(lucia.aportes - diego.aportes) + ' menos que Lucía, pero a los 60 tendría <strong>' +
        soles(lucia.saldo - diego.saldo) + ' menos</strong>. Ese es el costo de esperar ' + anios(n) + '.';
      rEsp.setAttribute('aria-valuetext', anios(n) + ' después que Lucía');
      pintarRango(rEsp);
      return diego;
    }
    rEsp.addEventListener('input', () => {
      const diego = renderEspera(+rEsp.value);
      vivo('esperaVivo', 'Si Diego espera ' + anios(+rEsp.value) + ', a los 60 tendría ' + solesVoz(diego.saldo) + ', ' + solesVoz(lucia.saldo - diego.saldo) + ' menos que Lucía.', 800);
    });
    renderEspera(+rEsp.value);

    // Clave 1: S/ 50 al mes desde hoy vs S/ 100 al mes empezando 10 años después (misma fecha final)
    const k50 = visibles(finalDe({ inicial: 0, mensual: 50, trea: TREA_PIBANK, anios: 30 }));
    const k100 = visibles(finalDe({ inicial: 0, mensual: 100, trea: TREA_PIBANK, anios: 20 }));
    $('#k50').textContent = soles(k50.saldo);
    $('#k100').textContent = soles(k100.saldo);
    $('#kDif').textContent = soles(k100.aportes - k50.aportes);

    // FAQ inflación: S/ 100 al mes por 30 años, deflactado al 2% anual
    const nominal = visibles(finalDe({ inicial: 0, mensual: 100, trea: TREA_PIBANK, anios: 30 })).saldo;
    $('#infNominal').textContent = soles(nominal);
    $('#infReal').textContent = soles(Math.round(nominal / Math.pow(1.02, 30) / 1000) * 1000);
  }

  /* =========================================================
     Navegación activa y revelado
     ========================================================= */
  function iniciarNavegacion() {
    const links = $$('.nav a');
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(ents => {
      ents.forEach(e => {
        if (!e.isIntersecting) return;
        links.forEach(a => a.classList.toggle('activo', a.getAttribute('href') === '#' + e.target.id));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    [$('.hero'), ...['que-es', 'simulador', 'largo-plazo', 'claves', 'preguntas'].map(id => document.getElementById(id)), $('.cierre')]
      .forEach(s => { if (s) io.observe(s); });
  }
  function iniciarRevelado() {
    if (reducido || !('IntersectionObserver' in window)) return;
    const objetivos = $$('.pasos .paso, .comparacion, .lab, .macetas, .tarjeta, .espera, .claves li, .cierre-pastilla, .cierre-foto');
    const io = new IntersectionObserver(ents => {
      ents.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    objetivos.forEach((o, i) => {
      if (o.getBoundingClientRect().top < window.innerHeight) return; // ya visible al cargar
      o.classList.add('revelar');
      o.style.transitionDelay = (o.matches('.paso, .claves li') ? (i % 3) * 90 : 0) + 'ms';
      io.observe(o);
    });
  }

  iniciarHero();
  iniciarLab();
  iniciarSimulador();
  iniciarLargoPlazo();
  iniciarNavegacion();
  iniciarRevelado();
})();
