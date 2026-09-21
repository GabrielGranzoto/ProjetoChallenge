/* ==========================================================================
   JOVI EDITOR — "Editar com IA" da galeria
   Edição feita no próprio navegador, pixel a pixel, sem servidor e sem API.
   A "IA" é uma análise simples do histograma da foto (luz, contraste, cor):
   ela mede a imagem e sugere os ajustes, como um auto-melhorar de verdade.

   Fluxo: abrir(foto) carrega a imagem num canvas reduzido -> cada mudança nos
   controles chama desenhar(), que aplica os ajustes sobre a cópia original ->
   salvar() grava uma NOVA foto (a original nunca é alterada).

   Depende de: js/store.js (JoviStore) e dos elementos do visualizador em
   pages/gallery.html. Se a página for aberta como file://, o navegador bloqueia
   a leitura dos pixels; nesse caso o editor avisa para usar o servidor local.
   ========================================================================== */

const JoviEditor = (() => {
  const LADO_MAX = 900;          // tamanho de trabalho (px do lado maior)
  const LADO_SALVO = 1000;       // tamanho da foto salva
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a = 0, b = 255) => (v < a ? a : v > b ? b : v);

  const PADRAO = { brilho: 0, contraste: 0, saturacao: 0, calor: 0, sombras: 0, nitidez: 0, vinheta: 0, pb: 0 };

  const CONTROLES = [
    ['brilho', 'Brilho', -60, 60],
    ['contraste', 'Contraste', -50, 60],
    ['saturacao', 'Saturação', -100, 100],
    ['calor', 'Calor', -60, 60],
    ['sombras', 'Sombras', 0, 80],
    ['nitidez', 'Nitidez', 0, 100],
    ['vinheta', 'Vinheta', 0, 80],
  ];

  // Filtros rápidos. Cada um é só um conjunto de valores dos mesmos controles.
  const FILTROS = {
    Original: { ...PADRAO },
    Vívido:   { ...PADRAO, contraste: 22, saturacao: 42, brilho: 4, nitidez: 30 },
    Cinema:   { ...PADRAO, contraste: 34, saturacao: -18, calor: -22, sombras: 10, vinheta: 42 },
    Quente:   { ...PADRAO, calor: 38, saturacao: 14, brilho: 4, vinheta: 14 },
    Frio:     { ...PADRAO, calor: -38, saturacao: 8, contraste: 10 },
    'Noite+': { ...PADRAO, brilho: 22, sombras: 55, contraste: 10, saturacao: 12, nitidez: 20 },
    'P&B':    { ...PADRAO, pb: 100, contraste: 30, vinheta: 26 },
  };

  // Ajuste extra por tipo de foto, somado ao resultado do auto-melhorar
  const VIES_CONTEXTO = {
    Comida:   { calor: 12, saturacao: 16, nitidez: 20 },
    Paisagem: { saturacao: 14, contraste: 10, calor: -6, nitidez: 20 },
    Noturno:  { sombras: 22, brilho: 6, nitidez: 12 },
    Pessoas:  { calor: 10, saturacao: 4, nitidez: 6, vinheta: 10 },
  };

  let ed = null; // estado do editor aberto: { foto, base, ctx, params, quadro, ... }

  /* ---------- Carregamento ---------- */

  function carregar(src) {
    return new Promise((ok, erro) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => erro(new Error('imagem'));
      img.src = src;
    });
  }

  function desenharBase(img, lado) {
    const esc = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * esc));
    c.height = Math.max(1, Math.round(img.naturalHeight * esc));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  /* ---------- Processamento de pixels ---------- */

  // Aplica todos os ajustes numa cópia dos pixels originais.
  function processar(origem, saida, p) {
    const src = origem.data;
    const dst = saida.data;
    const w = origem.width;
    const h = origem.height;

    const brilho = p.brilho * 2.2;                       // soma direta em 0..255
    const fc = (1 + p.contraste / 100);                  // fator de contraste
    const sat = 1 + p.saturacao / 100;
    const calor = p.calor * 0.9;
    const sombras = p.sombras / 100;
    const pb = p.pb / 100;
    const vig = p.vinheta / 100;
    const cx = w / 2, cy = h / 2;
    const raioMax = Math.sqrt(cx * cx + cy * cy);

    for (let y = 0, i = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i += 4) {
        let r = src[i], g = src[i + 1], b = src[i + 2];

        // Sombras: levanta só as áreas escuras (curva suave)
        if (sombras > 0) {
          const l0 = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          const peso = (1 - l0) * (1 - l0) * sombras * 90;
          r += peso; g += peso; b += peso;
        }

        r += brilho + calor;
        g += brilho;
        b += brilho - calor;

        r = (r - 128) * fc + 128;
        g = (g - 128) * fc + 128;
        b = (b - 128) * fc + 128;

        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        r = l + (r - l) * sat;
        g = l + (g - l) * sat;
        b = l + (b - l) * sat;

        if (pb > 0) {
          r += (l - r) * pb; g += (l - g) * pb; b += (l - b) * pb;
        }

        if (vig > 0) {
          const dx = x - cx, dy = y - cy;
          const d = Math.sqrt(dx * dx + dy * dy) / raioMax;
          const escuro = 1 - vig * Math.max(0, d - 0.35) * 1.5;
          r *= escuro; g *= escuro; b *= escuro;
        }

        dst[i] = clamp(r); dst[i + 1] = clamp(g); dst[i + 2] = clamp(b); dst[i + 3] = src[i + 3];
      }
    }

    if (p.nitidez > 0) nitidez(saida, p.nitidez / 100);
  }

  // Nitidez: realça a diferença entre cada pixel e a média dos vizinhos (máscara de nitidez)
  function nitidez(img, forca) {
    const { width: w, height: h, data: d } = img;
    const copia = new Uint8ClampedArray(d);
    const k = forca * 1.1;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          const v = copia[i + c];
          const viz = (copia[i + c - 4] + copia[i + c + 4] + copia[i + c - w * 4] + copia[i + c + w * 4]) / 4;
          d[i + c] = clamp(v + (v - viz) * k);
        }
      }
    }
  }

  /* ---------- "IA": análise da imagem ---------- */

  // Mede luz, contraste e cor da foto e devolve os ajustes sugeridos + o que foi encontrado.
  function analisar(dados, contexto) {
    const d = dados.data;
    const hist = new Uint32Array(256);
    let n = 0, somaL = 0, somaS = 0, somaR = 0, somaB = 0;
    for (let i = 0; i < d.length; i += 16) { // amostra 1 a cada 4 pixels
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      hist[l]++; n++; somaL += l; somaR += r; somaB += b;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      somaS += mx === 0 ? 0 : (mx - mn) / mx;
    }
    const pct = (q) => { let a = 0; for (let v = 0; v < 256; v++) { a += hist[v]; if (a >= n * q) return v; } return 255; };
    const p2 = pct(0.02), p98 = pct(0.98);
    const media = somaL / n;
    const sat = somaS / n;
    const calorMedio = (somaR - somaB) / n;
    const amplitude = p98 - p2;
    const escuras = hist.slice(0, 50).reduce((a, b) => a + b, 0) / n;

    const achados = [];
    const p = { ...PADRAO };

    // Luz: aproxima a média de um alvo confortável (~118)
    const faltaLuz = 118 - media;
    p.brilho = Math.round(clamp(faltaLuz * 0.28, -30, 34));
    if (faltaLuz > 18) achados.push('Foto escura');
    else if (faltaLuz < -18) achados.push('Foto clara demais');
    else achados.push('Luz equilibrada');

    // Contraste: se o histograma não usa toda a faixa, abre
    if (amplitude < 190) {
      p.contraste = Math.round(clamp((190 - amplitude) * 0.32, 0, 40));
      achados.push('Contraste baixo');
    }

    // Sombras
    if (escuras > 0.16) {
      p.sombras = Math.round(clamp(escuras * 160, 0, 60));
      achados.push('Sombras fechadas');
    }

    // Cor: cores lavadas ganham saturação; cor demais é contida
    if (sat < 0.34) { p.saturacao = Math.round(clamp((0.34 - sat) * 170, 8, 34)); achados.push('Cores apagadas'); }
    else if (sat > 0.6) { p.saturacao = -8; achados.push('Cores muito fortes'); }

    // Dominante de cor: corrige leve
    if (calorMedio > 34) { p.calor = -10; achados.push('Tom quente demais'); }
    else if (calorMedio < -20) { p.calor = 10; achados.push('Tom frio demais'); }

    p.nitidez = 22;

    // Toque de estilo pelo tipo de foto
    const vies = VIES_CONTEXTO[contexto] || {};
    Object.keys(vies).forEach((k) => { p[k] = Math.round(p[k] + vies[k]); });
    if (contexto) achados.push(`Ajustado para ${contexto.toLowerCase()}`);

    CONTROLES.forEach(([k, , min, max]) => { p[k] = Math.round(clamp(p[k], min, max)); });
    return { params: p, achados };
  }

  // Quanto a edição melhora o score: o auto-melhorar rende mais que ajustes soltos
  function ganhoScore(p, auto) {
    const soma = Math.abs(p.contraste) * 0.12 + Math.abs(p.saturacao) * 0.06 + Math.abs(p.sombras) * 0.1 +
      Math.abs(p.nitidez) * 0.08 + Math.abs(p.brilho) * 0.08 + Math.abs(p.vinheta) * 0.03;
    return Math.round(clamp(soma, 0, auto ? 14 : 9));
  }

  /* ---------- Interface ---------- */

  function montarControles() {
    $('edit-sliders').innerHTML = CONTROLES.map(([k, nome, min, max]) => `
      <label class="flex items-center gap-3 text-xs text-neutral-400">
        <span class="w-20 shrink-0">${nome}</span>
        <input type="range" data-ctl="${k}" min="${min}" max="${max}" value="0" class="edit-range flex-1" aria-label="${nome}">
        <span data-val="${k}" class="w-8 text-right tabular-nums text-neutral-200">0</span>
      </label>`).join('');

    $('edit-filters').innerHTML = Object.keys(FILTROS).map((nome) =>
      `<button data-fx="${nome}" class="edit-chip">${nome}</button>`).join('');
  }

  function atualizarControles() {
    CONTROLES.forEach(([k]) => {
      const inp = document.querySelector(`[data-ctl="${k}"]`);
      inp.value = ed.params[k];
      document.querySelector(`[data-val="${k}"]`).textContent = ed.params[k];
    });
    const alterado = JSON.stringify(ed.params) !== JSON.stringify(PADRAO);
    $('edit-reset').disabled = !alterado;
    $('edit-save').disabled = !alterado;
    const ganho = ganhoScore(ed.params, ed.auto);
    $('edit-score').textContent = alterado ? `${ed.foto.score} → ${Math.min(99, ed.foto.score + ganho)}` : `${ed.foto.score}`;
    $('edit-score').classList.toggle('text-emerald-400', alterado && ganho > 0);
    $('edit-score').classList.toggle('text-amber-400', !(alterado && ganho > 0));
    document.querySelectorAll('[data-fx]').forEach((b) => {
      const alvo = FILTROS[b.dataset.fx];
      b.classList.toggle('active', JSON.stringify(alvo) === JSON.stringify(ed.params));
    });
  }

  let quadro = 0;
  function desenhar() {
    cancelAnimationFrame(quadro);
    quadro = requestAnimationFrame(() => {
      if (!ed) return;
      const saida = ed.saida;
      if (ed.comparando) {
        ed.ctx.putImageData(ed.origem, 0, 0);
      } else {
        processar(ed.origem, saida, ed.params);
        ed.ctx.putImageData(saida, 0, 0);
      }
    });
  }

  function mudar(params, { auto = false } = {}) {
    ed.params = { ...PADRAO, ...params };
    ed.auto = auto;
    atualizarControles();
    desenhar();
  }

  // Animação de "análise" antes de mostrar o resultado da IA
  async function autoMelhorar() {
    if (ed.ocupado) return;
    ed.ocupado = true;
    const botao = $('edit-auto');
    botao.disabled = true;
    const rotulo = botao.querySelector('span');
    const texto = rotulo.textContent;
    rotulo.textContent = 'Analisando a foto...';
    $('edit-scan').classList.remove('hidden');
    $('edit-found').classList.add('hidden');

    const inicio = performance.now();
    const { params, achados } = analisar(ed.origem, ed.foto.contexto);
    const gasto = Math.round(performance.now() - inicio);
    await new Promise((r) => setTimeout(r, 900)); // tempo para a varredura ser vista

    $('edit-scan').classList.add('hidden');
    mudar(params, { auto: true });
    $('edit-found').innerHTML = `<p class="text-[11px] text-neutral-500 mb-1.5">IA analisou em ${gasto} ms e encontrou:</p>
      <div class="flex flex-wrap gap-1.5">${achados.map((a) => `<span class="edit-tag">${a}</span>`).join('')}</div>`;
    $('edit-found').classList.remove('hidden');
    rotulo.textContent = texto;
    botao.disabled = false;
    ed.ocupado = false;
  }

  async function abrir(foto, aoSalvar) {
    if (!foto.src) { avisar('A imagem ainda está carregando'); return; }
    let img;
    try { img = await carregar(foto.src); } catch (e) { avisar('Não foi possível abrir a imagem'); return; }

    const base = desenharBase(img, LADO_MAX);
    const canvas = $('edit-canvas');
    canvas.width = base.width;
    canvas.height = base.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(base, 0, 0);

    let origem;
    try {
      origem = ctx.getImageData(0, 0, base.width, base.height);
    } catch (e) {
      avisar('O navegador bloqueou a edição. Abra o projeto por um servidor local (localhost).');
      return;
    }

    ed = { foto, origem, saida: ctx.createImageData(origem), ctx, params: { ...PADRAO }, auto: false, ocupado: false, comparando: false, aoSalvar };
    $('edit-found').classList.add('hidden');
    $('edit-scan').classList.add('hidden');
    canvas.classList.remove('hidden');
    $('viewer-img').classList.add('opacity-0');
    $('viewer').classList.add('editando');
    atualizarControles();
  }

  function fechar() {
    if (!ed) return;
    ed = null;
    $('edit-canvas').classList.add('hidden');
    $('viewer-img').classList.remove('opacity-0');
    $('viewer').classList.remove('editando');
  }

  // Salva como uma nova foto. A original continua na galeria.
  function salvar() {
    if (!ed) return;
    const escala = Math.min(1, LADO_SALVO / Math.max(ed.origem.width, ed.origem.height));
    const cheio = document.createElement('canvas');
    cheio.width = ed.origem.width;
    cheio.height = ed.origem.height;
    cheio.getContext('2d').putImageData(ed.saida, 0, 0);
    // garante que o último ajuste está desenhado
    processar(ed.origem, ed.saida, ed.params);
    cheio.getContext('2d').putImageData(ed.saida, 0, 0);

    let src;
    try {
      const fim = document.createElement('canvas');
      fim.width = Math.round(cheio.width * escala);
      fim.height = Math.round(cheio.height * escala);
      fim.getContext('2d').drawImage(cheio, 0, 0, fim.width, fim.height);
      src = fim.toDataURL('image/jpeg', 0.82);
    } catch (e) {
      avisar('Não foi possível salvar a foto');
      return;
    }

    const ganho = ganhoScore(ed.params, ed.auto);
    const score = Math.min(99, ed.foto.score + ganho);
    const d = ed.foto.detalhes || {};
    const nova = {
      id: 'c' + Date.now(),
      src,
      ts: Date.now(),
      modo: ed.foto.modo,
      contexto: ed.foto.contexto,
      preset: ed.foto.preset,
      score,
      editada: true,
      detalhes: {
        luz: Math.min(99, (d.luz || score) + Math.round(ganho * 0.8)),
        nitidez: Math.min(99, (d.nitidez || score) + Math.round(ganho * 0.9)),
        composicao: d.composicao || score,
      },
    };
    JoviStore.adicionarCaptura(nova);
    const cb = ed.aoSalvar;
    fechar();
    if (cb) cb(nova.id);
  }

  function avisar(msg) {
    if (typeof toast === 'function') toast(msg);
  }

  /* ---------- Eventos ---------- */

  function init() {
    if (!$('edit-sliders')) return;
    montarControles();

    $('edit-sliders').addEventListener('input', (e) => {
      const k = e.target.dataset.ctl;
      if (!k || !ed) return;
      ed.params[k] = Number(e.target.value);
      ed.auto = false;
      atualizarControles();
      desenhar();
    });

    $('edit-filters').addEventListener('click', (e) => {
      const b = e.target.closest('[data-fx]');
      if (b && ed) { $('edit-found').classList.add('hidden'); mudar(FILTROS[b.dataset.fx]); }
    });

    $('edit-auto').addEventListener('click', autoMelhorar);
    $('edit-reset').addEventListener('click', () => { if (ed) { $('edit-found').classList.add('hidden'); mudar(PADRAO); } });
    $('edit-cancel').addEventListener('click', fechar);
    $('edit-save').addEventListener('click', salvar);

    // Segurar "Comparar" mostra a foto original
    const comparar = (v) => () => { if (ed) { ed.comparando = v; $('edit-badge').classList.toggle('hidden', !v); desenhar(); } };
    const bc = $('edit-compare');
    ['pointerdown'].forEach((ev) => bc.addEventListener(ev, comparar(true)));
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => bc.addEventListener(ev, comparar(false)));
  }

  init();
  return { abrir, fechar, aberto: () => !!ed };
})();
