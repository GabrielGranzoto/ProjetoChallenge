/* ==========================================================================
   JOVI CAMERA — interações da tela da câmera (index.html)
   Depende de js/icons.js (ícones) e js/store.js (JoviStore, memória compartilhada).

   O que este arquivo controla:
   - Botão IA (sparkles)  -> liga/desliga o Context Mode do JOVI Modes
   - Barra de modos       -> Noite, Retrato, Foto, Vídeo, Pro (troca o preset)
   - Obturador            -> clarão em foto (a foto vai para a Galeria, com score); vídeo grava/para
   - HDR, 200MP, flash, Aura Light, grade -> chaves liga/desliga
   - Zoom                 -> pílula 1x / 2 / 5
   - Cena simulada        -> botão troca a foto do visor (Paisagem, Noite, Retrato, Comida)
   - Cam Assist           -> card de sugestão por cena; aprende com o que o usuário faz
   - Câmera real          -> opcional (menu "Mais opções" ou botão "Usar minha câmera")
   - Feedback ao usuário  -> aviso central, anel de foco, contador, chip de IA com o tempo medido

   Como a "IA" funciona nesta demonstração:
   - Cenas de exemplo: cada foto de images/ tem um perfil (luz, nota base) e o Cam Assist
     "analisa" por um tempo curto e variável, e mostra o tempo medido no chip do visor.
   - Câmera real: o vídeo é reduzido a 32x24 pixels e lemos luz, cor e contraste (leitura de
     verdade, feita no próprio aparelho). A classificação em Paisagem/Noite/Retrato/Comida é uma
     heurística simples, e o botão de cena permite forçar uma categoria para a demonstração.
   Nada é enviado para servidor. Em produção, o modelo da JOVI rodaria na NPU do aparelho.

   Ligação com o MER: cada preset é a entidade PRESET; a cena lida (luz, hora) é o CONTEXTO_DETECCAO;
   o card do Cam Assist é a SUGESTAO_USO; a foto salva é FOTO + SCORE_FOTO; e o contador de usos do
   preset é o HISTORICO_USO_PRESET. Tudo isso fica guardado no navegador via js/store.js.

   Fluxo: cada ação altera o `state` e chama a função que atualiza a tela.
   ========================================================================== */

// Preset que cada modo ativa quando o Context Mode está ligado.
// Em "Foto" o preset segue a cena detectada (ver presetAtivo()).
const PRESET_POR_MODO = {
  Noite: 'Noite',
  Retrato: 'Retrato',
  Foto: 'Paisagem',
  Video: 'Vídeo',
  Pro: 'Manual',
};

// Opção fixa da lista de presets. As demais vêm dos presets criados em pages/modes.html.
const PRESET_AUTOMATICO = { nome: 'Automático', icone: 'sparkles', descricao: 'A câmera escolhe conforme a cena e o modo' };

// Ícone de cada tipo de preset (o mesmo do JOVI Modes)
const ICONE_CONTEXTO = {
  Comida: 'utensils',
  Paisagem: 'mountain',
  Retrato: 'user',
  Noite: 'moon',
  Personalizado: 'sliders-horizontal',
};

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

// Perfil de cada cena de exemplo: nível de luz que os "sensores" leriam, nota base da foto
// (0 a 100) e o nome do contexto usado na Galeria (ver MOCK_FOTOS em js/gallery.js)
const PERFIL_CENA = {
  Paisagem: { luz: 'alta',  notaBase: 90, contextoGaleria: 'Paisagem' },
  Noite:    { luz: 'baixa', notaBase: 76, contextoGaleria: 'Noturno' },
  Retrato:  { luz: 'média', notaBase: 84, contextoGaleria: 'Pessoas' },
  Comida:   { luz: 'média', notaBase: 88, contextoGaleria: 'Comida' },
};

// Níveis de zoom da pílula
const ZOOMS = [1, 2, 5];

// Nas cenas de exemplo a análise leva um tempo curto e variável (a proposta fala em <500ms).
// O tempo mostrado no chip é medido de verdade entre a troca de cena e a sugestão aparecer.
const LATENCIA_SIMULADA = { min: 180, max: 360 };

// Quantas respostas iguais seguidas o Cam Assist precisa para aprender uma preferência
const LIMITE_APRENDIZADO = 3;

// Câmera real: de quanto em quanto tempo a cena é analisada (ms) e quantas leituras iguais
// seguidas são necessárias para mudar de cena (evita a sugestão piscar)
const INTERVALO_LEITURA = 1000;
const LEITURAS_PARA_MUDAR = 2;

// Estado único da tela. Tudo que aparece é atualizado a partir daqui.
const state = {
  modo: 'Foto',        // modo selecionado na barra inferior
  contextMode: true,   // JOVI Modes ligado ou desligado (vem do JoviStore)
  preset: 'Automático', // preset escolhido no chip do visor
  hdr: false,
  res200: false,       // alta resolução 200MP (só funciona em 1x)
  flash: false,
  aura: false,         // Aura Light
  grade: false,
  zoom: 1,             // um dos valores de ZOOMS
  gravando: false,     // só usado no modo Vídeo
  segundos: 0,         // tempo de gravação
  simulador: true,     // cenas de exemplo no visor (desligável em "Mais opções")
  cena: 'Paisagem',    // cena atual no visor (ver SUGESTOES)
  luz: 'alta',         // nível de luz lido na cena
  analisando: false,   // true enquanto o Cam Assist "analisa" a cena nova
  tempoAnalise: null,  // ms medidos da última análise
  dispensadas: new Set(), // cenas cuja sugestão o usuário fechou no X (só nesta visita)
  automaticas: new Set(), // cenas em que o usuário escolheu "Sempre aplicar" (guardado)
  silenciadas: new Set(), // cenas que o usuário ignorou várias vezes (guardado)
  temporizador: 0,     // segundos de espera antes da foto (0 = desligado)
  real: false,         // true = câmera do aparelho ligada
  stream: null,        // MediaStream da câmera real
  frontal: false,      // câmera frontal (espelha a imagem)
  roteiro: false,      // câmera real: demonstração guiada ligada
  cenaManual: null,    // câmera real: categoria forçada pelo botão de cena (null = automático)
  candidata: null,     // câmera real: categoria vista na última leitura
  leiturasIguais: 0,   //   e quantas leituras seguidas foram iguais
  ultimaLeitura: null, // câmera real: dados da última leitura (luz, nitidez)
};

// Opções do temporizador, na ordem em que o menu "Mais opções" alterna
const TEMPORIZADORES = [0, 3, 10];

// Guardam os temporizadores para poder cancelá-los depois
let timerGravacao;
let timerAviso;
let timerBadgeContext;
let timerAnalise;
let timerLeitura;
let timerContagem = null; // contagem regressiva do temporizador (null = parado)

// Atalho: pegar elemento por id
const $ = (id) => document.getElementById(id);

/* ---------- Auxiliares ---------- */

// Troca o ícone de um botão. O ícone vira <svg>, então é preciso recriar o <i>
// e pedir para ele desenhar de novo (ver js/icons.js).
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
function mostrarAviso(texto, duracao = 1200) {
  const aviso = $('cam-toast');
  aviso.textContent = texto;
  aviso.classList.replace('opacity-0', 'opacity-100');

  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => aviso.classList.replace('opacity-100', 'opacity-0'), duracao);
}

// Vibração curta no celular (ignorada onde não é suportada, como no computador)
function vibrar(ms) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

const limitar = (v, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(v)));

/* ---------- Visor: filtro do preset, HDR, zoom e espelho ---------- */

// Dados (ajustes) do preset em uso, vindos do JOVI Modes. Só vale com o Context Mode ligado.
function presetDados() {
  if (!state.contextMode) return null;
  const nome = presetAtivo();
  return JoviStore.carregarPresets().find((p) => p.ativo && p.nome === nome) || null;
}

// Junta preset, HDR, Aura Light e modo em um único filtro CSS aplicado ao visor.
// É o que faz a IA ser visível: aplicar HDR, Noite ou um preset muda a imagem na hora.
function calcularFiltro() {
  let brilho = 1;
  let satur = 1;
  let contraste = 1;

  const p = presetDados();
  if (p) {
    brilho += p.ajustes.exposicao * 0.12;
    satur = p.ajustes.saturacao / 50;
    contraste = p.ajustes.contraste / 50;
  }
  if (state.hdr) { contraste *= 1.08; satur *= 1.1; }
  if (state.aura) brilho *= 1.05;
  if (state.modo === 'Noite') { brilho *= 1.25; contraste *= 1.05; }
  if (state.modo === 'Retrato') satur *= 1.05;

  return `brightness(${brilho.toFixed(2)}) saturate(${satur.toFixed(2)}) contrast(${contraste.toFixed(2)})`;
}

// Aplica filtro, zoom e espelhamento (câmera frontal) na cena de exemplo e no vídeo
function atualizarVisor() {
  const filtro = calcularFiltro();
  const transformacao = `scale(${state.zoom})${state.frontal ? ' scaleX(-1)' : ''}`;
  ['scene-img', 'camera-feed'].forEach((id) => {
    $(id).style.filter = filtro;
    $(id).style.transform = transformacao;
  });
  return filtro;
}

/* ---------- Context Mode e badges ---------- */

// Atualiza o chip de preset e o botão IA conforme o Context Mode
function atualizarContext() {
  const ligado = state.contextMode;

  // Chip do preset: só aparece com o Context Mode ligado
  $('badge-preset').classList.toggle('hidden', !ligado);
  $('badge-preset').classList.toggle('flex', ligado);

  // Botão IA fica com o degradê da IA quando ligado (classe .ai-on em css/styles.css)
  $('btn-ai').classList.toggle('ai-on', ligado);
  marcarBotao($('btn-ai'), ligado);

  atualizarPreset();
  atualizarSugestao(); // a sugestão de preset pode já estar atendida
}

// Preset em uso. Escolhido pelo usuário ou, em "Automático":
// Noite e Retrato seguem o modo; em Foto, o Context Mode acompanha a cena detectada.
function presetAtivo() {
  if (state.preset !== 'Automático') return state.preset;
  if (state.modo === 'Foto' && (state.simulador || state.real)) return state.cena;
  return PRESET_POR_MODO[state.modo];
}

// Texto do chip do visor, ex.: "Preset: Paisagem · Auto". Também refaz o filtro do visor.
function atualizarPreset() {
  const auto = state.preset === 'Automático' ? ' · Auto' : '';
  $('badge-preset-nome').textContent = `Preset: ${presetAtivo()}${auto}`;
  atualizarVisor();
}

// Aviso passageiro "Context Mode: ON/OFF": aparece ~2s e some, para não poluir o visor
function mostrarBadgeContext() {
  const ligado = state.contextMode;
  const badge = $('badge-context');

  badge.className =
    'flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold ' +
    (ligado
      ? 'ai-gradient text-white border-transparent'
      : 'bg-black/60 text-neutral-200 border-white/20');
  $('badge-context-dot').className =
    'w-2 h-2 rounded-full ' + (ligado ? 'bg-white animate-pulse' : 'bg-neutral-400');
  $('badge-context-texto').textContent = `Context Mode: ${ligado ? 'ON' : 'OFF'}`;

  clearTimeout(timerBadgeContext);
  timerBadgeContext = setTimeout(() => badge.classList.replace('flex', 'hidden'), 2000);
}

function alternarContext() {
  state.contextMode = !state.contextMode;
  JoviStore.salvarContexto(state.contextMode); // o JOVI Modes lê o mesmo valor
  atualizarContext();
  mostrarBadgeContext();
  vibrar(15);
}

/* ---------- Escolha de preset ---------- */

// Lista de presets: "Automático" + os presets ativos criados no JOVI Modes
function listaPresets() {
  const doModes = JoviStore.carregarPresets()
    .filter((p) => p.ativo)
    .map((p) => ({
      nome: p.nome,
      icone: ICONE_CONTEXTO[p.contexto] || ICONE_CONTEXTO.Personalizado,
      descricao: `Exposição ${p.ajustes.exposicao > 0 ? '+' : ''}${p.ajustes.exposicao} EV · saturação ${p.ajustes.saturacao}`,
    }));
  return [PRESET_AUTOMATICO, ...doModes];
}

// Escapa texto digitado pelo usuário (nome do preset) antes de colocar no HTML
function escapar(txt) {
  const d = document.createElement('div');
  d.textContent = txt;
  return d.innerHTML;
}

// Desenha a lista de presets; o escolhido fica marcado com um check
function renderPresets() {
  $('preset-list').innerHTML = listaPresets().map((p) => {
    const escolhido = p.nome === state.preset;
    return `
      <button data-preset="${escapar(p.nome)}" class="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left active:bg-neutral-800 transition">
        <span class="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center shrink-0">
          <i data-lucide="${p.icone}" class="w-5 h-5 ${escolhido ? 'text-amber-400' : 'text-neutral-300'}"></i>
        </span>
        <span class="flex-1 min-w-0">
          <span class="block text-sm font-medium">${escapar(p.nome)}</span>
          <span class="block text-xs text-neutral-400">${escapar(p.descricao)}</span>
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

/* ---------- Captura: a foto vai para a Galeria com score de IA ---------- */

// Copia o que o visor mostra (com o filtro aplicado) para uma miniatura de até 480px.
// Retorna null quando o navegador bloqueia a leitura da imagem (acontece ao abrir o
// index.html direto do computador, em file://). Aí guardamos só o caminho do arquivo.
function capturarImagem(filtro) {
  try {
    const fonte = state.real ? $('camera-feed') : $('scene-img');
    const largura = state.real ? fonte.videoWidth : fonte.naturalWidth;
    const altura = state.real ? fonte.videoHeight : fonte.naturalHeight;
    if (!largura || !altura) return null;

    const escala = Math.min(1, 480 / largura);
    const c = document.createElement('canvas');
    c.width = Math.round(largura * escala);
    c.height = Math.round(altura * escala);
    const ctx = c.getContext('2d');
    ctx.filter = filtro;
    if (state.real && state.frontal) { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(fonte, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.72);
  } catch (e) {
    return null;
  }
}

// Score da foto (0 a 100). Nas cenas de exemplo parte da nota base da cena; na câmera real,
// usa a luz e a nitidez medidas do vídeo. Aplicar a recomendação certa (HDR na paisagem,
// Modo Noite no escuro...) e usar um preset dá bônus; ignorar a sugestão de noite custa nota.
function calcularScore() {
  let score;
  let detalhes;

  if (state.real && state.ultimaLeitura) {
    const q = state.ultimaLeitura;
    const luz = limitar(100 - Math.abs(q.luma - 120) * 0.8);
    const nitidez = limitar(35 + q.nitidez * 0.9);
    detalhes = { luz, nitidez, composicao: 72 };
    score = luz * 0.4 + nitidez * 0.4 + 72 * 0.2;
  } else {
    score = PERFIL_CENA[state.cena].notaBase;
  }

  if (SUGESTOES[state.cena].atendida()) score += 4;
  else if (state.cena === 'Noite') score -= 8;   // cena escura sem o modo Noite sai mal
  if (state.modo === 'Noite' && state.cena !== 'Noite') score -= 6; // modo Noite de dia estoura a foto
  if (presetDados()) score += 2;

  return { score: limitar(score, 40, 99), detalhes };
}

// Guarda a foto no JoviStore (a Galeria lê de lá) e soma um uso ao preset aplicado
function registrarCaptura() {
  if (!state.simulador && !state.real) return null; // sem imagem no visor, não há o que guardar

  const filtro = calcularFiltro();
  const src = capturarImagem(filtro) || (state.real ? null : SUGESTOES[state.cena].imagem);
  if (!src) return null;

  const { score, detalhes } = calcularScore();
  const preset = presetDados();
  const captura = {
    id: 'c' + Date.now(),
    src,
    ts: Date.now(),
    modo: state.modo === 'Pro' ? 'Foto' : state.modo,
    contexto: PERFIL_CENA[state.cena].contextoGaleria,
    preset: preset ? preset.nome : 'Automático',
    score,
    detalhes,
  };
  JoviStore.adicionarCaptura(captura);
  if (preset) JoviStore.registrarUsoPreset(preset.id); // entra no histórico de uso do preset
  atualizarMiniatura();
  const mini = $('gallery-thumb');
  if (mini) { mini.classList.remove('pop'); void mini.offsetWidth; mini.classList.add('pop'); }
  return captura;
}

// A miniatura do botão da galeria mostra a última foto tirada
function atualizarMiniatura() {
  const ultima = JoviStore.lerCapturas()[0];
  const img = $('gallery-thumb');
  if (!img) return;
  img.onerror = () => img.remove();
  if (ultima) img.src = ultima.src;
}

// Clarão branco rápido + aviso. A foto é guardada e aparece na Galeria.
function capturarFoto() {
  const clarao = $('shutter-flash');
  clarao.classList.replace('opacity-0', 'opacity-100');
  setTimeout(() => clarao.classList.replace('opacity-100', 'opacity-0'), 120);

  const foto = registrarCaptura();
  mostrarAviso(foto ? `Foto salva · Score ${foto.score}` : 'Foto salva', 1600);
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

/* ---------- Cam Assist: cena e sugestões ---------- */

// Escreve no card o texto da sugestão da cena atual
function preencherSugestao() {
  const s = SUGESTOES[state.cena];
  $('ai-card-titulo').textContent = s.titulo;
  $('ai-card-recomendacao').textContent = s.recomendacao;
  $('ai-card-texto').textContent = s.texto;
}

// O card aparece só quando há algo a recomendar: há imagem no visor (cenas de exemplo ou câmera
// real), a cena já foi analisada, o usuário não fechou no X nem silenciou essa sugestão, e a
// recomendação ainda não está valendo (ex.: HDR já ligado).
function atualizarSugestao() {
  const painel = $('ai-suggestion-panel');
  const visivel =
    (state.simulador || state.real) &&
    !state.analisando &&
    !state.dispensadas.has(state.cena) &&
    !state.silenciadas.has(state.cena) &&
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

// Chip do visor: o que a IA detectou, em quanto tempo e com que luz
function atualizarChip() {
  const chip = $('ia-chip');
  const ativo = state.simulador || state.real;
  chip.classList.toggle('hidden', !ativo);
  if (!ativo) return;

  chip.textContent = state.analisando || state.tempoAnalise === null
    ? 'IA · analisando cena…'
    : `IA · ${state.cena} · ${state.tempoAnalise} ms · luz ${state.luz}${state.real ? ' · câmera real' : ''}`;
}

// Linha de varredura no visor enquanto a IA analisa
function mostrarVarredura(ligada) {
  $('scan-line').classList.toggle('hidden', !ligada);
}

// Ícone do botão de cena: câmera real em modo automático mostra o "scan"; senão, o da cena atual
function atualizarIconeCena() {
  const automatico = state.real && state.cenaManual === null;
  trocarIcone($('btn-scene'), automatico ? 'scan' : SUGESTOES[state.cena].icone, 'w-5 h-5 text-white');
}

// Define a cena e faz o Cam Assist "analisar" ela. Mede o tempo entre a troca e a sugestão.
// `real` = veio da câmera real (a leitura já foi feita, sem espera artificial) e `inicio` é o
// instante em que a leitura começou.
function definirCena(nome, { real = false, inicio = performance.now() } = {}) {
  state.cena = nome;
  const s = SUGESTOES[nome];

  if (!real) $('scene-img').src = s.imagem;
  if (!state.real) state.luz = PERFIL_CENA[nome].luz;
  atualizarIconeCena();
  preencherSugestao();
  atualizarPreset(); // em Foto + Context Mode, o preset acompanha a cena

  // Some o card durante a análise e mostra o da nova cena depois
  state.analisando = true;
  mostrarVarredura(true);
  atualizarChip();
  atualizarSugestao();

  const espera = real
    ? 0
    : LATENCIA_SIMULADA.min + Math.round(Math.random() * (LATENCIA_SIMULADA.max - LATENCIA_SIMULADA.min));

  clearTimeout(timerAnalise);
  timerAnalise = setTimeout(() => {
    state.analisando = false;
    state.tempoAnalise = Math.round(performance.now() - inicio);
    mostrarVarredura(false);
    atualizarChip();

    // "Sempre aplicar": aplica sozinho, sem nem mostrar o card
    if (state.automaticas.has(nome) && !s.atendida()) {
      aplicarSugestao(true);
    } else {
      atualizarSugestao();
    }
  }, espera);
}

// Liga/desliga as cenas de exemplo: mostra ou esconde a foto de cena, o botão de trocar
// cena, o chip e o card do Cam Assist. Com a câmera real ligada, a cena de exemplo fica escondida.
function atualizarSimulador() {
  const ligado = state.simulador;
  $('scene-img').classList.toggle('hidden', !ligado || state.real);
  $('btn-scene').classList.toggle('hidden', !ligado && !state.real);

  const valor = $('opt-sim-valor');
  valor.textContent = ligado ? 'Ligado' : 'Desligado';
  valor.classList.toggle('text-amber-400', ligado);
  valor.classList.toggle('text-neutral-400', !ligado);

  atualizarChip();
  atualizarSugestao();
}

function alternarSimulador() {
  state.simulador = !state.simulador;
  atualizarSimulador();
  mostrarAviso(state.simulador ? 'Cenas de exemplo ligadas' : 'Cenas de exemplo desligadas');
}

// Demonstração guiada: com a câmera real ligada, as cenas alternam sozinhas a cada poucos
// segundos, sem reconhecer nada de verdade. O filtro e as sugestões aparecem sobre o vídeo real.
const INTERVALO_ROTEIRO = 6000;
let timerRoteiro = null;

function pararRoteiro() {
  clearInterval(timerRoteiro);
  timerRoteiro = null;
  state.roteiro = false;
}

function iniciarRoteiro() {
  pararRoteiro();
  state.roteiro = true;
  const passo = () => {
    if (!state.real || !state.roteiro) return;
    const i = CENAS.indexOf(state.cenaManual);
    state.cenaManual = CENAS[(i + 1) % CENAS.length];
    definirCena(state.cenaManual, { real: true });
  };
  state.cenaManual = CENAS[0];
  definirCena(CENAS[0], { real: true });
  timerRoteiro = setInterval(passo, INTERVALO_ROTEIRO);
}

// Botão de cena. Nas cenas de exemplo, troca a foto do visor. Na câmera real, alterna entre
// "Auto" (a leitura do vídeo decide) e uma categoria forçada, para a demonstração não depender
// do que a lente está vendo.
function trocarCena() {
  if (state.real) {
    // Ciclo: Roteiro (troca sozinha) -> Auto (lê o vídeo) -> cada cena forçada -> Roteiro
    const opcoes = ['roteiro', null, ...CENAS];
    const atual = state.roteiro ? 'roteiro' : state.cenaManual;
    const proxima = opcoes[(opcoes.indexOf(atual) + 1) % opcoes.length];
    pararRoteiro();
    state.cenaManual = proxima === 'roteiro' ? CENAS[0] : proxima;
    if (proxima === 'roteiro') {
      iniciarRoteiro();
      mostrarAviso('Demonstração guiada: cenas alternam sozinhas');
    } else if (proxima) {
      definirCena(proxima, { real: true });
      mostrarAviso(`Cena simulada: ${proxima}`);
    } else {
      state.candidata = null;
      state.leiturasIguais = 0;
      atualizarIconeCena();
      mostrarAviso('Detecção automática pela câmera');
      lerCameraReal(true);
    }
    vibrar(10);
    return;
  }

  const proxima = CENAS[(CENAS.indexOf(state.cena) + 1) % CENAS.length];
  definirCena(proxima);
  mostrarAviso(`Cena: ${proxima}`);
  vibrar(10);
}

/* ---------- Cam Assist: aprendizado (guardado no JoviStore) ---------- */

// Lê o que já foi aprendido sobre uma cena
function lerAprendizado(cena) {
  const todos = JoviStore.carregarAprendizado();
  return { aceitou: 0, ignorou: 0, seqAceitou: 0, seqIgnorou: 0, auto: false, silenciado: false, ...(todos[cena] || {}) };
}

function gravarAprendizado(cena, dados) {
  const todos = JoviStore.carregarAprendizado();
  todos[cena] = dados;
  JoviStore.salvarAprendizado(todos);
}

// Registra a resposta do usuário. Três aceites seguidos: passa a aplicar sozinho.
// Três "ignorar" seguidos: para de sugerir essa cena.
function aprender(cena, resposta) {
  const a = lerAprendizado(cena);

  if (resposta === 'aceitou') {
    a.aceitou++; a.seqAceitou++; a.seqIgnorou = 0; a.silenciado = false;
    if (a.seqAceitou >= LIMITE_APRENDIZADO && !a.auto) {
      a.auto = true;
      state.automaticas.add(cena);
      state.silenciadas.delete(cena);
      mostrarAviso(`Aprendi: vou aplicar ${cena} automaticamente`, 2200);
    }
  } else {
    a.ignorou++; a.seqIgnorou++; a.seqAceitou = 0;
    if (a.seqIgnorou >= LIMITE_APRENDIZADO && !a.silenciado) {
      a.silenciado = true;
      state.silenciadas.add(cena);
      mostrarAviso(`Aprendi: não vou mais sugerir ${cena}`, 2200);
    }
  }
  gravarAprendizado(cena, a);
}

// Carrega o aprendizado guardado para os conjuntos usados na tela
function carregarAprendizado() {
  const todos = JoviStore.carregarAprendizado();
  state.automaticas = new Set(Object.keys(todos).filter((c) => todos[c].auto));
  state.silenciadas = new Set(Object.keys(todos).filter((c) => todos[c].silenciado));
  state.dispensadas = new Set();
}

function zerarAprendizado() {
  JoviStore.zerarAprendizado();
  carregarAprendizado();
  atualizarSugestao();
  fecharMais();
  mostrarAviso('Aprendizado da IA zerado');
}

// "Aplicar": ativa o que o Cam Assist recomendou, em um toque
function aplicarSugestao(automatico = false) {
  const s = SUGESTOES[state.cena];
  s.aplicar();
  atualizarSugestao();
  mostrarAviso(automatico ? `Cam Assist: ${s.confirmacao}` : s.confirmacao);
  if (!automatico) aprender(state.cena, 'aceitou');
  vibrar(15);
}

// "Sempre aplicar": guarda a escolha para esta cena e aplica agora
function aplicarSempre() {
  const cena = state.cena;
  const a = lerAprendizado(cena);
  a.auto = true; a.silenciado = false; a.aceitou++;
  gravarAprendizado(cena, a);
  state.automaticas.add(cena);
  state.silenciadas.delete(cena);

  aplicarSugestao(true);
  mostrarAviso(`${SUGESTOES[cena].confirmacao} · automático`);
}

function dispensarSugestao() {
  state.dispensadas.add(state.cena);
  aprender(state.cena, 'ignorou');
  atualizarSugestao();
}

/* ---------- Câmera real (opcional) ---------- */

// Lê o vídeo reduzido a 32x24 pixels: luz média, cor, contraste e nitidez (energia das bordas).
// É uma leitura de verdade feita no aparelho, sem enviar nada para lugar nenhum.
function lerQuadro() {
  const video = $('camera-feed');
  if (!video.videoWidth) return null;

  const c = lerQuadro.canvas || (lerQuadro.canvas = document.createElement('canvas'));
  c.width = 32; c.height = 24;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, 32, 24);
  const px = ctx.getImageData(0, 0, 32, 24).data;

  const n = 32 * 24;
  const cinza = new Float32Array(n);
  let r = 0, g = 0, b = 0, soma = 0, topo = 0, base = 0;
  for (let i = 0; i < n; i++) {
    const R = px[i * 4], G = px[i * 4 + 1], B = px[i * 4 + 2];
    const y = 0.299 * R + 0.587 * G + 0.114 * B;
    cinza[i] = y;
    r += R; g += G; b += B; soma += y;
    if (i < n / 2) topo += y; else base += y;
  }

  let borda = 0, variancia = 0;
  const media = soma / n;
  for (let i = 0; i < n; i++) {
    variancia += (cinza[i] - media) ** 2;
    if (i % 32) borda += Math.abs(cinza[i] - cinza[i - 1]);
  }

  return {
    luma: media,
    r: r / n, g: g / n, b: b / n,
    contraste: Math.sqrt(variancia / n),
    topoMaisClaro: topo > base,
    nitidez: Math.min(100, (borda / n) * 6),
  };
}

// Regras simples, escritas para a demonstração (não é reconhecimento de imagem de verdade):
// muito escuro = Noite; tom quente e vivo = Comida; claro com céu/verde no alto = Paisagem;
// o resto = Retrato.
function classificarQuadro(q) {
  if (q.luma < 55) return 'Noite';
  const quente = q.r - q.b;
  if (quente > 35 && q.luma > 60 && q.luma < 190) return 'Comida';
  const frio = (q.g + q.b) / 2 - q.r;
  if (q.luma > 130 && (frio > 12 || (q.topoMaisClaro && q.contraste > 45))) return 'Paisagem';
  return 'Retrato';
}

const nivelDeLuz = (luma) => (luma < 55 ? 'baixa' : luma < 150 ? 'média' : 'alta');

// Um ciclo de leitura da câmera real. Só muda de cena depois de leituras iguais seguidas.
function lerCameraReal(imediato = false) {
  if (!state.real) return;
  const inicio = performance.now();
  const q = lerQuadro();
  if (!q) return;

  state.ultimaLeitura = q;
  if (state.cenaManual) return; // cena forçada pelo botão: a leitura só alimenta o score

  const categoria = classificarQuadro(q);
  state.leiturasIguais = categoria === state.candidata ? state.leiturasIguais + 1 : 1;
  state.candidata = categoria;

  state.luz = nivelDeLuz(q.luma);
  if (categoria !== state.cena && (imediato || state.leiturasIguais >= LEITURAS_PARA_MUDAR)) {
    definirCena(categoria, { real: true, inicio });
  } else {
    atualizarChip();
  }
}

// Liga a câmera do aparelho e joga o vídeo no visor. Precisa de https ou localhost e de permissão.
async function iniciarCameraReal() {
  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    mostrarAviso('A câmera precisa de https ou localhost. Usando cenas de exemplo.', 3000);
    return false;
  }

  try {
    pararCameraReal();
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.frontal ? 'user' : 'environment', width: { ideal: 1280 } },
      audio: false,
    });
    const video = $('camera-feed');
    video.srcObject = state.stream;
    await video.play();

    state.real = true;
    state.cenaManual = null;
    state.candidata = null;
    state.leiturasIguais = 0;
    atualizarModoCamera();

    clearInterval(timerLeitura);
    timerLeitura = setInterval(() => lerCameraReal(), INTERVALO_LEITURA);
    iniciarRoteiro(); // demonstração guiada por padrão; o botão de cena muda o modo
    mostrarAviso('Câmera ligada');
    return true;
  } catch (e) {
    state.real = false;
    const motivo = e && e.name === 'NotAllowedError' ? 'Permissão da câmera negada'
      : e && e.name === 'NotFoundError' ? 'Nenhuma câmera encontrada'
      : 'Não foi possível abrir a câmera';
    mostrarAviso(`${motivo}. Usando cenas de exemplo.`, 3000);
    atualizarModoCamera();
    return false;
  }
}

function pararCameraReal() {
  clearInterval(timerLeitura);
  pararRoteiro();
  if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
  state.stream = null;
}

function voltarParaCenas() {
  pararCameraReal();
  state.real = false;
  state.cenaManual = null;
  state.ultimaLeitura = null;
  atualizarModoCamera();
  definirCena(state.cena);
}

// Atualiza tudo que depende de a câmera real estar ligada ou não
function atualizarModoCamera() {
  $('camera-feed').classList.toggle('hidden', !state.real);
  $('cam-invite').classList.toggle('hidden', state.real);

  const valor = $('opt-cam-valor');
  valor.textContent = state.real ? 'Ligada' : 'Desligada';
  valor.classList.toggle('text-amber-400', state.real);
  valor.classList.toggle('text-neutral-400', !state.real);

  atualizarIconeCena();
  atualizarSimulador();
  atualizarPreset();
}

async function alternarCameraReal() {
  fecharMais();
  if (state.real) {
    voltarParaCenas();
    mostrarAviso('Cenas de exemplo');
  } else {
    await iniciarCameraReal();
  }
}

// Botão de inverter câmera: na câmera real troca frontal/traseira; nas cenas de exemplo só espelha
async function alternarLado() {
  state.frontal = !state.frontal;
  if (state.real) await iniciarCameraReal();
  atualizarVisor();
  mostrarAviso(state.frontal ? 'Câmera frontal' : 'Câmera traseira');
  vibrar(10);
}

/* ---------- Botões da barra superior ---------- */

function alternarHdr() {
  state.hdr = !state.hdr;
  destacarBotao($('btn-hdr'), state.hdr);
  atualizarVisor();
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
  atualizarVisor();
  mostrarAviso(state.aura ? 'Aura Light ligada' : 'Aura Light desligada');
}

async function alternarFlash() {
  state.flash = !state.flash;
  trocarIcone(
    $('btn-flash'),
    state.flash ? 'zap' : 'zap-off',
    state.flash ? 'w-5 h-5 text-amber-400' : 'w-5 h-5'
  );
  marcarBotao($('btn-flash'), state.flash);

  // Em celulares com lanterna, liga o flash de verdade; nos demais é só o estado do botão
  if (state.real && state.stream) {
    try { await state.stream.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: state.flash }] }); } catch (e) { /* sem lanterna */ }
  }
  mostrarAviso(state.flash ? 'Flash ligado' : 'Flash desligado');
}

function alternarGrade() {
  state.grade = !state.grade;
  $('grid-overlay').classList.toggle('hidden', !state.grade);
  trocarIcone($('btn-grid'), 'grid', state.grade ? 'w-5 h-5 text-amber-400' : 'w-5 h-5');
  marcarBotao($('btn-grid'), state.grade);
  mostrarAviso(state.grade ? 'Grade ligada' : 'Grade desligada');
}

// Escolhe o zoom na pílula. O zoom é aplicado com scale no <video> e na cena de exemplo.
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

  atualizarVisor();
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
  // Suaviza a mudança de zoom e do filtro dos presets
  ['camera-feed', 'scene-img'].forEach((id) => {
    $(id).style.transition = 'transform 0.3s ease, filter 0.35s ease';
  });

  // O que o JOVI Modes e o Cam Assist já guardaram nas visitas anteriores
  state.contextMode = JoviStore.carregarContexto();
  carregarAprendizado();

  $('btn-ai').addEventListener('click', alternarContext);
  $('btn-hdr').addEventListener('click', alternarHdr);
  $('btn-res').addEventListener('click', alternarRes200);
  $('btn-aura').addEventListener('click', alternarAura);
  $('btn-scene').addEventListener('click', trocarCena);
  $('btn-flip').addEventListener('click', alternarLado);
  $('cam-invite').addEventListener('click', alternarCameraReal);

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

  // Botão dos 3 pontos (direita): menu com temporizador, câmera real e atalhos
  $('btn-more').addEventListener('click', abrirMais);
  $('more-close').addEventListener('click', fecharMais);
  $('more-overlay').addEventListener('click', fecharMais);
  $('opt-timer').addEventListener('click', alternarTemporizador);
  $('opt-sim').addEventListener('click', alternarSimulador);
  $('opt-cam').addEventListener('click', alternarCameraReal);
  $('opt-reset').addEventListener('click', zerarAprendizado);
  $('btn-flash').addEventListener('click', alternarFlash);
  $('btn-grid').addEventListener('click', alternarGrade);
  $('btn-shutter').addEventListener('click', acionarObturador);

  // Tocar no visor mostra o anel de foco. Os botões e badges ficam por cima
  // dele, então tocar neles não dispara isso.
  $('camera-feed').addEventListener('click', focarEm);
  $('scene-img').parentElement.addEventListener('click', (e) => {
    if (e.target === $('scene-img') || e.target === $('scene-img').parentElement) focarEm(e);
  });

  // Delegação: um listener na barra de modos em vez de um por aba
  document.querySelector('.modes-scroll').addEventListener('click', (e) => {
    const aba = e.target.closest('.mode-tab');
    if (aba) trocarModo(aba.dataset.mode);
  });

  // Ao sair da página, para a gravação e desliga a câmera
  window.addEventListener('pagehide', () => { pararGravacao(); pararCameraReal(); });

  atualizarContext();
  atualizarObturador();
  atualizarZoomPilula();
  atualizarMiniatura();
  atualizarModoCamera();
  definirCena(state.cena); // o Cam Assist já começa analisando a cena, sem precisar ligar nada
}

init();
