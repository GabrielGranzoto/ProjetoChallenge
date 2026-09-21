/* ==========================================================================
   JOVI CAMERA — interações da tela da câmera (index.html)
   Simulador: não usa a câmera real (isso é a tarefa do getUserMedia).
   Dados apenas em memória.

   O que este arquivo controla:
   - Botão IA (sparkles)  -> liga/desliga o Context Mode do JOVI Modes
   - Barra de modos       -> Noite, Retrato, Foto, Vídeo, Pro (troca o preset)
   - Obturador            -> clarão em foto; vermelho e "gravar/parar" em vídeo
   - HDR, 200MP, flash, Aura Light, grade -> chaves liga/desliga
   - Zoom                 -> pílula 1x / 2 / 5
   - Cena simulada        -> botão troca a foto do visor (Paisagem, Noite, Retrato, Comida)
   - Cam Assist           -> card de sugestão que muda conforme a cena, com "Aplicar"
   - Feedback ao usuário  -> aviso central, anel de foco, contador de gravação

   Fluxo: cada ação altera o `state` e chama a função que atualiza a tela.
   ========================================================================== */

// Preset que cada modo ativa quando o Context Mode está ligado.
// (No JOVI Modes real, isso viria dos presets criados em pages/modes.html.)
const PRESET_POR_MODO = {
  Noite: 'Noite',
  Retrato: 'Retrato',
  Foto: 'Paisagem',
  Video: 'Vídeo',
  Pro: 'Manual',
};

// Presets que o usuário pode escolher com o Context Mode ligado.
// "Automático" segue o modo da câmera (PRESET_POR_MODO); os outros fixam um preset.
// (No JOVI Modes real, essa lista viria dos presets criados em pages/modes.html.)
const PRESETS = [
  { nome: 'Automático', icone: 'sparkles', descricao: 'A câmera escolhe conforme o modo' },
  { nome: 'Comida', icone: 'utensils', descricao: 'Cores quentes e saturadas' },
  { nome: 'Paisagem', icone: 'mountain', descricao: 'HDR e céu equilibrado' },
  { nome: 'Retrato', icone: 'user', descricao: 'Pele suave e fundo desfocado' },
  { nome: 'Noite', icone: 'moon', descricao: 'Mais luz e menos ruído' },
];

// Cenas que o botão do visor alterna. Como a câmera é simulada, cada cena é uma
// foto de images/ e o Cam Assist "detecta" o que há nela.
// - atendida(): true quando a recomendação já está valendo (o card some)
// - aplicar():  o que o botão "Aplicar" faz, reaproveitando as funções da tela
const CENAS = ['Paisagem', 'Noite', 'Retrato', 'Comida'];

const SUGESTOES = {
  Paisagem: {
    imagem: 'images/paisagem-1.jpg',
    icone: 'mountain',
    titulo: 'Paisagem Detectada',
    recomendacao: 'Modo HDR recomendado',
    texto: 'Ative HDR para capturar mais detalhes em áreas claras e escuras',
    confirmacao: 'HDR ligado',
    atendida: () => state.hdr,
    aplicar: () => { if (!state.hdr) alternarHdr(); },
  },
  Noite: {
    imagem: 'images/noite-1.jpg',
    icone: 'moon',
    titulo: 'Pouca Luz Detectada',
    recomendacao: 'Modo Noite recomendado',
    texto: 'O Modo Noite reduz o ruído e ilumina a cena sem estourar as luzes',
    confirmacao: 'Modo Noite ativado',
    atendida: () => state.modo === 'Noite',
    aplicar: () => trocarModo('Noite'),
  },
  Retrato: {
    imagem: 'images/retrato-1.jpg',
    icone: 'user',
    titulo: 'Pessoa Detectada',
    recomendacao: 'Modo Retrato recomendado',
    texto: 'Desfoca o fundo e suaviza a pele para destacar o rosto',
    confirmacao: 'Modo Retrato ativado',
    atendida: () => state.modo === 'Retrato',
    aplicar: () => trocarModo('Retrato'),
  },
  Comida: {
    imagem: 'images/comida-1.jpg',
    icone: 'utensils',
    titulo: 'Comida Detectada',
    recomendacao: 'Preset Comida recomendado',
    texto: 'Realça as cores quentes e a saturação do prato',
    confirmacao: 'Preset Comida ativado',
    atendida: () => state.contextMode && presetAtivo() === 'Comida',
    aplicar: () => {
      state.preset = 'Comida';
      if (state.contextMode) atualizarPreset(); else alternarContext();
    },
  },
};

// Níveis de zoom da pílula
const ZOOMS = [1, 2, 5];

// Tempo que o Cam Assist leva para "analisar" uma cena nova (a proposta fala em <500ms)
const TEMPO_ANALISE = 500;

// Estado único da tela. Tudo que aparece é atualizado a partir daqui.
const state = {
  modo: 'Foto',        // modo selecionado na barra inferior
  contextMode: false,  // JOVI Modes ligado ou desligado
  preset: 'Automático', // preset escolhido no chip do visor (ver PRESETS)
  hdr: false,
  res200: false,       // alta resolução 200MP (só funciona em 1x)
  flash: false,
  aura: false,         // Aura Light
  grade: false,
  zoom: 1,             // um dos valores de ZOOMS
  gravando: false,     // só usado no modo Vídeo
  segundos: 0,         // tempo de gravação
  simulador: false,    // simulação de cenários (opção em "Mais opções"), desligada por padrão
  cena: 'Paisagem',    // cena simulada no visor (ver SUGESTOES)
  analisando: false,   // true nos 500ms em que o Cam Assist "analisa" a cena nova
  dispensadas: new Set(), // cenas cuja sugestão o usuário fechou no X
  automaticas: new Set(), // cenas em que o usuário escolheu "Sempre aplicar"
  temporizador: 0,     // segundos de espera antes da foto (0 = desligado)
};

// Opções do temporizador, na ordem em que o menu "Mais opções" alterna
const TEMPORIZADORES = [0, 3, 10];

// Guardam os temporizadores para poder cancelá-los depois
let timerGravacao;
let timerAviso;
let timerBadgeContext;
let timerAnalise;
let timerContagem = null; // contagem regressiva do temporizador (null = parado)

// Atalho: pegar elemento por id
const $ = (id) => document.getElementById(id);

/* ---------- Auxiliares ---------- */

// Troca o ícone Lucide de um botão. O Lucide substitui <i> por <svg>, então é
// preciso recriar o <i> e pedir para ele desenhar de novo.
function trocarIcone(botao, nome, classes) {
  botao.innerHTML = `<i data-lucide="${nome}" class="${classes}"></i>`;
  lucide.createIcons();
}

// Marca o botão como ligado/desligado, para o visual e para leitores de tela
function marcarBotao(botao, ativo) {
  botao.setAttribute('aria-pressed', String(ativo));
}

// Liga/desliga o destaque âmbar de um botão redondo da barra superior
function destacarBotao(botao, ativo) {
  botao.classList.toggle('bg-amber-400', ativo);
  botao.classList.toggle('text-black', ativo);
  botao.classList.toggle('bg-black/40', !ativo);
  marcarBotao(botao, ativo);
}

// Aviso rápido no centro do visor. Confirma o que o usuário acabou de fazer.
function mostrarAviso(texto) {
  const aviso = $('cam-toast');
  aviso.textContent = texto;
  aviso.classList.replace('opacity-0', 'opacity-100');

  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => aviso.classList.replace('opacity-100', 'opacity-0'), 1200);
}

// Vibração curta no celular (ignorada onde não é suportada, como no computador)
function vibrar(ms) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

/* ---------- Context Mode e badges ---------- */

// Atualiza o chip de preset e o botão IA conforme o Context Mode
function atualizarContext() {
  const ligado = state.contextMode;

  // Chip do preset: só aparece com o Context Mode ligado
  $('badge-preset').classList.toggle('hidden', !ligado);
  $('badge-preset').classList.toggle('flex', ligado);

  // Botão IA fica violeta quando ligado (classe .ai-on em css/styles.css)
  $('btn-ai').classList.toggle('ai-on', ligado);
  marcarBotao($('btn-ai'), ligado);

  atualizarPreset();
  atualizarSugestao(); // a sugestão de preset pode já estar atendida
}

// Preset em uso: o escolhido pelo usuário ou, em "Automático", o do modo atual
function presetAtivo() {
  return state.preset === 'Automático' ? PRESET_POR_MODO[state.modo] : state.preset;
}

// Texto do chip do visor, ex.: "Preset: Paisagem · Auto"
function atualizarPreset() {
  const auto = state.preset === 'Automático' ? ' · Auto' : '';
  $('badge-preset-nome').textContent = `Preset: ${presetAtivo()}${auto}`;
}

// Aviso passageiro "Context Mode: ON/OFF": aparece ~2s e some, para não poluir o visor
function mostrarBadgeContext() {
  const ligado = state.contextMode;
  const badge = $('badge-context');

  badge.className =
    'flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold ' +
    (ligado
      ? 'ai-bg text-white border-transparent'
      : 'bg-black/60 text-neutral-200 border-white/20');
  $('badge-context-dot').className =
    'w-2 h-2 rounded-full ' + (ligado ? 'bg-white animate-pulse' : 'bg-neutral-400');
  $('badge-context-texto').textContent = `Context Mode: ${ligado ? 'ON' : 'OFF'}`;

  clearTimeout(timerBadgeContext);
  timerBadgeContext = setTimeout(() => badge.classList.replace('flex', 'hidden'), 2000);
}

function alternarContext() {
  state.contextMode = !state.contextMode;
  atualizarContext();
  mostrarBadgeContext();
  vibrar(15);
}

/* ---------- Escolha de preset ---------- */

// Desenha a lista de presets; o escolhido fica marcado com um check
function renderPresets() {
  $('preset-list').innerHTML = PRESETS.map((p) => {
    const escolhido = p.nome === state.preset;
    return `
      <button data-preset="${p.nome}" class="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left active:bg-neutral-800 transition">
        <span class="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center shrink-0">
          <i data-lucide="${p.icone}" class="w-5 h-5 ${escolhido ? 'text-amber-400' : 'text-neutral-300'}"></i>
        </span>
        <span class="flex-1 min-w-0">
          <span class="block text-sm font-medium">${p.nome}</span>
          <span class="block text-xs text-neutral-400">${p.descricao}</span>
        </span>
        ${escolhido ? '<i data-lucide="check" class="w-5 h-5 text-amber-400 shrink-0"></i>' : ''}
      </button>`;
  }).join('');
  lucide.createIcons();
}

function abrirPresets() {
  renderPresets();
  $('preset-sheet').classList.remove('hidden');
}

function fecharPresets() {
  $('preset-sheet').classList.add('hidden');
}

function escolherPreset(nome) {
  state.preset = nome;
  atualizarPreset();
  atualizarSugestao(); // escolher "Comida" já atende à sugestão da cena de comida
  fecharPresets();
  mostrarAviso(nome === 'Automático' ? 'Preset automático' : `Preset ${nome}`);
  vibrar(10);
}

/* ---------- Modos e obturador ---------- */

// Aparência do obturador: branco em foto, vermelho em vídeo.
// Gravando, o miolo encolhe e vira um quadrado arredondado.
function atualizarObturador() {
  const miolo = $('btn-shutter').firstElementChild;
  const video = state.modo === 'Video';

  const cor = video ? 'bg-red-500 ring-red-500' : 'bg-white ring-amber-400';
  const forma = video && state.gravando ? 'scale-50 rounded-lg' : 'rounded-full';
  miolo.className = `w-full h-full ring-4 transition-all duration-200 ${cor} ${forma}`;

  $('btn-shutter').setAttribute(
    'aria-label',
    !video ? 'Tirar foto' : state.gravando ? 'Parar gravação' : 'Iniciar gravação'
  );
}

// Formata segundos como "00:07"
function formatarTempo(total) {
  const min = String(Math.floor(total / 60)).padStart(2, '0');
  const seg = String(total % 60).padStart(2, '0');
  return `${min}:${seg}`;
}

// Começa a gravar: mostra o contador vermelho e conta os segundos
function iniciarGravacao() {
  state.gravando = true;
  state.segundos = 0;
  $('badge-rec-tempo').textContent = formatarTempo(0);
  $('badge-rec').classList.replace('hidden', 'flex');

  timerGravacao = setInterval(() => {
    state.segundos += 1;
    $('badge-rec-tempo').textContent = formatarTempo(state.segundos);
  }, 1000);
}

// Para de gravar: esconde o contador e cancela o temporizador
function pararGravacao() {
  state.gravando = false;
  clearInterval(timerGravacao);
  $('badge-rec').classList.replace('flex', 'hidden');
}

function trocarModo(modo) {
  if (state.gravando) pararGravacao(); // trocar de modo interrompe a gravação
  cancelarContagem();                  // e também a contagem do temporizador
  state.modo = modo;

  document.querySelectorAll('.mode-tab').forEach((aba) => {
    const ativa = aba.dataset.mode === modo;
    aba.classList.toggle('active', ativa);
    // Centraliza a aba escolhida na barra, que rola na horizontal
    if (ativa) aba.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  });

  atualizarPreset();
  atualizarObturador();
  atualizarSugestao(); // a sugestão de modo pode já estar atendida
  vibrar(10);
}

// Foto: clarão branco rápido. Vídeo: começa/para de gravar.
function acionarObturador() {
  if (state.modo === 'Video') {
    if (state.gravando) {
      pararGravacao();
      mostrarAviso(`Vídeo salvo · ${formatarTempo(state.segundos)}`);
    } else {
      iniciarGravacao();
    }
    atualizarObturador();
    vibrar(30);
    return;
  }

  // Tocar no obturador durante a contagem cancela a foto
  if (timerContagem) {
    cancelarContagem();
    mostrarAviso('Foto cancelada');
    return;
  }

  if (state.temporizador > 0) {
    iniciarContagem();
    return;
  }

  capturarFoto();
}

// Clarão branco rápido + aviso. É a "foto" em si, já que a câmera é simulada.
function capturarFoto() {
  const clarao = $('shutter-flash');
  clarao.classList.replace('opacity-0', 'opacity-100');
  setTimeout(() => clarao.classList.replace('opacity-100', 'opacity-0'), 120);
  mostrarAviso('Foto salva');
  vibrar(30);
}

/* ---------- Temporizador ---------- */

// Mostra o número grande no visor, conta de 1 em 1 segundo e tira a foto no fim
function iniciarContagem() {
  let restante = state.temporizador;
  $('countdown-num').textContent = restante;
  $('countdown').classList.replace('hidden', 'flex');

  timerContagem = setInterval(() => {
    restante -= 1;
    if (restante > 0) {
      $('countdown-num').textContent = restante;
      return;
    }
    cancelarContagem();
    capturarFoto();
  }, 1000);
}

// Para a contagem e esconde o número (não faz nada se não houver contagem)
function cancelarContagem() {
  clearInterval(timerContagem);
  timerContagem = null;
  $('countdown').classList.replace('flex', 'hidden');
}

// Cada toque no menu passa para a próxima opção: Desligado -> 3 s -> 10 s -> Desligado
function alternarTemporizador() {
  const proximo = (TEMPORIZADORES.indexOf(state.temporizador) + 1) % TEMPORIZADORES.length;
  state.temporizador = TEMPORIZADORES[proximo];

  const valor = $('opt-timer-valor');
  valor.textContent = state.temporizador ? `${state.temporizador} s` : 'Desligado';
  valor.classList.toggle('text-amber-400', state.temporizador > 0);
  valor.classList.toggle('text-neutral-400', state.temporizador === 0);
}

/* ---------- Menu "Mais opções" ---------- */

function abrirMais() {
  $('more-sheet').classList.remove('hidden');
}

function fecharMais() {
  $('more-sheet').classList.add('hidden');
}

/* ---------- Barra superior e zoom ---------- */

/* ---------- Cam Assist: cena simulada e sugestões ---------- */

// Escreve no card o texto da sugestão da cena atual
function preencherSugestao() {
  const s = SUGESTOES[state.cena];
  $('ai-card-titulo').textContent = s.titulo;
  $('ai-card-recomendacao').textContent = s.recomendacao;
  $('ai-card-texto').textContent = s.texto;
}

// O card aparece só quando há algo a recomendar: o simulador está ligado, a cena já
// foi analisada, o usuário não fechou no X e a recomendação ainda não está valendo
// (ex.: HDR já ligado).
function atualizarSugestao() {
  const painel = $('ai-suggestion-panel');
  const visivel =
    state.simulador &&
    !state.analisando &&
    !state.dispensadas.has(state.cena) &&
    !SUGESTOES[state.cena].atendida();

  const estavaOculto = painel.classList.contains('hidden');
  painel.classList.toggle('hidden', !visivel);

  // Anima só na hora em que o card aparece (o reflow reinicia a animação)
  if (visivel && estavaOculto) {
    painel.classList.remove('card-in');
    void painel.offsetWidth;
    painel.classList.add('card-in');
  }
}

// Troca a foto do visor e faz o Cam Assist "analisar" a nova cena
function definirCena(nome) {
  state.cena = nome;
  const s = SUGESTOES[nome];

  $('scene-img').src = s.imagem;
  trocarIcone($('btn-scene'), s.icone, 'w-5 h-5 text-white');
  preencherSugestao();

  // Some o card durante a análise e mostra o da nova cena depois
  state.analisando = true;
  atualizarSugestao();
  clearTimeout(timerAnalise);
  timerAnalise = setTimeout(() => {
    state.analisando = false;
    // "Sempre aplicar": aplica sozinho, sem nem mostrar o card
    if (state.automaticas.has(nome) && !s.atendida()) {
      aplicarSugestao(true);
    } else {
      atualizarSugestao();
    }
  }, TEMPO_ANALISE);
}

// Liga/desliga o simulador: mostra ou esconde a foto de cena, o botão de trocar
// cena e o card do Cam Assist. Desligado, o visor fica só com a câmera.
function atualizarSimulador() {
  const ligado = state.simulador;
  $('scene-img').classList.toggle('hidden', !ligado);
  $('btn-scene').classList.toggle('hidden', !ligado);

  const valor = $('opt-sim-valor');
  valor.textContent = ligado ? 'Ligado' : 'Desligado';
  valor.classList.toggle('text-amber-400', ligado);
  valor.classList.toggle('text-neutral-400', !ligado);

  atualizarSugestao();
}

function alternarSimulador() {
  state.simulador = !state.simulador;
  atualizarSimulador();
  mostrarAviso(state.simulador ? 'Simulação de cenários ligada' : 'Simulação desligada');
}

function trocarCena() {
  const proxima = CENAS[(CENAS.indexOf(state.cena) + 1) % CENAS.length];
  definirCena(proxima);
  mostrarAviso(`Cena: ${proxima}`);
  vibrar(10);
}

// "Aplicar": ativa o que o Cam Assist recomendou, em um toque
function aplicarSugestao(automatico = false) {
  const s = SUGESTOES[state.cena];
  s.aplicar();
  atualizarSugestao();
  mostrarAviso(automatico ? `Cam Assist: ${s.confirmacao}` : s.confirmacao);
  vibrar(15);
}

// "Sempre aplicar": guarda a escolha para esta cena e aplica agora
function aplicarSempre() {
  state.automaticas.add(state.cena);
  aplicarSugestao();
  mostrarAviso(`${SUGESTOES[state.cena].confirmacao} · automático`);
}

function dispensarSugestao() {
  state.dispensadas.add(state.cena);
  atualizarSugestao();
}

/* ---------- Botões da barra superior ---------- */

function alternarHdr() {
  state.hdr = !state.hdr;
  destacarBotao($('btn-hdr'), state.hdr);
  atualizarSugestao();
  mostrarAviso(state.hdr ? 'HDR ligado' : 'HDR desligado');
}

// 200MP só funciona em 1x, como na câmera real. Com outro zoom, avisa e não liga.
function alternarRes200() {
  if (!state.res200 && state.zoom !== 1) {
    mostrarAviso('200MP só funciona em 1x');
    return;
  }
  state.res200 = !state.res200;
  destacarBotao($('btn-res'), state.res200);
  mostrarAviso(state.res200 ? '200MP ligado' : '200MP desligado');
}

// Aura Light: luz de preenchimento suave, antes escondida no menu do flash
function alternarAura() {
  state.aura = !state.aura;
  destacarBotao($('btn-aura'), state.aura);
  mostrarAviso(state.aura ? 'Aura Light ligada' : 'Aura Light desligada');
}

function alternarFlash() {
  state.flash = !state.flash;
  trocarIcone(
    $('btn-flash'),
    state.flash ? 'zap' : 'zap-off',
    state.flash ? 'w-5 h-5 text-amber-400' : 'w-5 h-5'
  );
  marcarBotao($('btn-flash'), state.flash);
  mostrarAviso(state.flash ? 'Flash ligado' : 'Flash desligado');
}

function alternarGrade() {
  state.grade = !state.grade;
  $('grid-overlay').classList.toggle('hidden', !state.grade);
  trocarIcone($('btn-grid'), 'grid', state.grade ? 'w-5 h-5 text-amber-400' : 'w-5 h-5');
  marcarBotao($('btn-grid'), state.grade);
  mostrarAviso(state.grade ? 'Grade ligada' : 'Grade desligada');
}

// Escolhe o zoom na pílula. O zoom é aplicado com scale no <video> e na cena simulada.
function definirZoom(zoom) {
  state.zoom = zoom;

  // 200MP só funciona em 1x: sair dele desliga a alta resolução
  if (state.res200 && zoom !== 1) {
    state.res200 = false;
    destacarBotao($('btn-res'), false);
    mostrarAviso('200MP desligado (só funciona em 1x)');
  } else {
    mostrarAviso(`Zoom ${zoom}x`);
  }

  $('camera-feed').style.transform = `scale(${zoom})`;
  $('scene-img').style.transform = `scale(${zoom})`;
  atualizarZoomPilula();
}

// Destaca em âmbar o nível de zoom escolhido; o rótulo "x" só aparece no ativo
function atualizarZoomPilula() {
  document.querySelectorAll('.zoom-opt').forEach((botao) => {
    const zoom = Number(botao.dataset.zoom);
    const ativo = zoom === state.zoom;
    botao.textContent = ativo ? `${zoom}x` : String(zoom);
    botao.classList.toggle('bg-black/60', ativo);
    botao.classList.toggle('text-amber-400', ativo);
    botao.classList.toggle('text-white', !ativo);
    botao.setAttribute('aria-pressed', String(ativo));
  });
}

// Anel de foco no ponto tocado. Trocar a classe e forçar um "reflow"
// reinicia a animação mesmo se o usuário tocar várias vezes seguidas.
function focarEm(evento) {
  const visor = $('camera-feed').parentElement;
  const area = visor.getBoundingClientRect();
  const anel = $('focus-ring');

  anel.style.left = `${evento.clientX - area.left}px`;
  anel.style.top = `${evento.clientY - area.top}px`;
  anel.classList.remove('focus-ring');
  void anel.offsetWidth;
  anel.classList.add('focus-ring');
}

/* ---------- Eventos ---------- */

function init() {
  // Suaviza a mudança de zoom
  $('camera-feed').style.transition = 'transform 0.3s ease';
  $('scene-img').style.transition = 'transform 0.3s ease';

  $('btn-ai').addEventListener('click', alternarContext);
  $('btn-hdr').addEventListener('click', alternarHdr);
  $('btn-res').addEventListener('click', alternarRes200);
  $('btn-aura').addEventListener('click', alternarAura);
  $('btn-scene').addEventListener('click', trocarCena);

  // Card do Cam Assist: aplicar, aplicar sempre ou dispensar
  $('btn-apply-ai').addEventListener('click', () => aplicarSugestao());
  $('btn-always-ai').addEventListener('click', aplicarSempre);
  $('btn-dismiss-ai').addEventListener('click', dispensarSugestao);

  // Pílula de zoom: um listener só (delegação)
  $('zoom-pill').addEventListener('click', (e) => {
    const botao = e.target.closest('[data-zoom]');
    if (botao) definirZoom(Number(botao.dataset.zoom));
  });

  // Lista de presets: abre pelo chip do visor e fecha ao escolher, no X, no fundo ou com Esc
  $('badge-preset').addEventListener('click', abrirPresets);
  $('preset-close').addEventListener('click', fecharPresets);
  $('preset-overlay').addEventListener('click', fecharPresets);
  $('preset-list').addEventListener('click', (e) => {
    const item = e.target.closest('[data-preset]');
    if (item) escolherPreset(item.dataset.preset);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { fecharPresets(); fecharMais(); }
  });

  // Botão dos sliders (esquerda da barra de modos): vai para a tela JOVI Modes
  $('btn-settings').addEventListener('click', () => {
    window.location.href = 'pages/modes.html';
  });

  // Botão dos 3 pontos (direita): menu com temporizador e atalhos
  $('btn-more').addEventListener('click', abrirMais);
  $('more-close').addEventListener('click', fecharMais);
  $('more-overlay').addEventListener('click', fecharMais);
  $('opt-timer').addEventListener('click', alternarTemporizador);
  $('opt-sim').addEventListener('click', alternarSimulador);
  $('btn-flash').addEventListener('click', alternarFlash);
  $('btn-grid').addEventListener('click', alternarGrade);
  $('btn-shutter').addEventListener('click', acionarObturador);

  // Tocar no visor (o <video>) mostra o anel de foco. Os botões e badges ficam
  // por cima dele, então tocar neles não dispara isso.
  $('camera-feed').addEventListener('click', focarEm);

  // Delegação: um listener na barra de modos em vez de um por aba
  document.querySelector('.modes-scroll').addEventListener('click', (e) => {
    const aba = e.target.closest('.mode-tab');
    if (aba) trocarModo(aba.dataset.mode);
  });

  atualizarContext();
  atualizarObturador();
  atualizarZoomPilula();
  preencherSugestao();
  atualizarSimulador(); // também mostra ou esconde o card conforme o simulador
}

init();
