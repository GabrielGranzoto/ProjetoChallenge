/* ==========================================================================
   JOVI CAMERA — interações da tela da câmera (index.html)
   Simulador: não usa a câmera real (isso é a tarefa do getUserMedia).
   Dados apenas em memória.

   O que este arquivo controla:
   - Botão IA (sparkles)  -> liga/desliga o Context Mode do JOVI Modes, que escolhe o
                             preset sozinho pelos gatilhos (local, horário, luz)
   - Barra de modos       -> Noite, Retrato, Comida, Foto, Vídeo, Pro (troca o preset)
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
  Comida: 'Comida',
  Foto: 'Paisagem',
  Video: 'Vídeo',
  Pro: 'Manual',
};

// Primeira opção da escolha de preset: com "Automático" o Context Mode decide sozinho
// (ver decidirPresetIA). Os demais presets vêm de js/presets-exemplo.js e de
// pages/modes.html (ver listaPresets), e escolher um deles fixa o preset na mão.
const OPCAO_AUTOMATICO = {
  nome: 'Automático', icone: 'sparkles', descricao: 'A IA escolhe conforme o contexto',
};

// O que a câmera "percebe" em cada cena simulada. Como não há GPS nem sensor de luz de
// verdade, a cena faz esse papel: o Context Mode compara isso com os gatilhos dos presets.
const LUZ_POR_CENA = { Paisagem: 'alta', Noite: 'baixa', Retrato: 'media', Comida: 'media' };

// Palavras que, no campo "Local" de um preset, indicam o tipo de lugar de cada cena.
// A comparação ignora maiúsculas e acentos ("Cafés" combina com "cafe").
const LOCAL_POR_CENA = {
  Comida: ['restaurante', 'cafe', 'padaria', 'lanchonete', 'pizzaria', 'bar '],
  Paisagem: ['parque', 'praia', 'montanha', 'trilha', 'jardim', 'natureza'],
  Noite: ['balada', 'show', 'festa', 'rua'],
  Retrato: ['casa', 'evento', 'estudio', 'festa'],
};

// Peso de cada gatilho na decisão: local e luz dizem mais sobre a cena do que a hora.
const PESO_GATILHO = { local: 2, luz: 2, horario: 1 };

// Nota mínima (0 a 1) para a IA ativar um preset sozinha
const NOTA_MINIMA_IA = 0.5;

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
    recomendacao: 'Modo Comida recomendado',
    texto: 'Realça as cores quentes e a saturação do prato',
    confirmacao: 'Modo Comida ativado',
    atendida: () => state.modo === 'Comida',
    aplicar: () => trocarModo('Comida'),
  },
};

// Valores que o modo Pro mostra para cada cena. São os números que uma câmera
// calcularia ali: pouca luz pede ISO alto e velocidade baixa.
const PRO_POR_CENA = {
  Paisagem: { iso: '100', vel: '1/500', ev: '0.0' },
  Noite: { iso: '3200', vel: '1/15', ev: '+0.7' },
  Retrato: { iso: '200', vel: '1/125', ev: '0.0' },
  Comida: { iso: '400', vel: '1/60', ev: '+0.3' },
};

// Níveis de zoom da pílula
const ZOOMS = [1, 2, 5];

// Tempo que o Cam Assist leva para "analisar" uma cena nova (a proposta fala em <500ms)
const TEMPO_ANALISE = 500;

// Estado único da tela. Tudo que aparece é atualizado a partir daqui.
const state = {
  modo: 'Foto',        // modo selecionado na barra inferior
  contextMode: false,  // JOVI Modes ligado ou desligado
  preset: 'Automático', // preset escolhido no chip do visor ("Automático" = a IA decide)
  presetsUsuario: [],  // presets de js/presets-exemplo.js ou criados em pages/modes.html
  presetAnunciado: null, // último preset que a IA anunciou, para avisar só quando mudar
  desfazerIA: {},      // o que o Cam Assist mudou: { modo|hdr|preset: { de, para } } (ver desfazerIA())
  hdr: false,
  res200: false,       // alta resolução 200MP (só funciona em 1x)
  flash: false,
  aura: false,         // Aura Light
  grade: false,
  zoom: 1,             // um dos valores de ZOOMS
  frontal: false,      // câmera frontal (espelha a imagem, como a selfie)
  som: true,           // som do obturador (opção em "Mais opções")
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

// Clique do obturador gerado pelo próprio navegador (Web Audio), sem arquivo de som.
// São dois estalos curtos de ruído filtrado: o espelho que abre e o que fecha.
let audioCtx;
function tocarObturador() {
  if (!state.som) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const estalo = (atraso, duracao, volume) => {
      const amostras = Math.floor(audioCtx.sampleRate * duracao);
      const buffer = audioCtx.createBuffer(1, amostras, audioCtx.sampleRate);
      const dados = buffer.getChannelData(0);
      // Ruído que decai rápido = som seco, mecânico
      for (let i = 0; i < amostras; i++) {
        dados[i] = (Math.random() * 2 - 1) * (1 - i / amostras) ** 8;
      }
      const fonte = audioCtx.createBufferSource();
      fonte.buffer = buffer;
      const filtro = audioCtx.createBiquadFilter();
      filtro.type = 'bandpass';
      filtro.frequency.value = 2400;
      const ganho = audioCtx.createGain();
      ganho.gain.value = volume;
      fonte.connect(filtro).connect(ganho).connect(audioCtx.destination);
      fonte.start(audioCtx.currentTime + atraso);
    };

    estalo(0, 0.03, 0.3);      // abre
    estalo(0.07, 0.045, 0.22); // fecha
  } catch (e) {
    /* navegador sem áudio: a foto sai do mesmo jeito, só sem som */
  }
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

/* ---------- Context Mode: a IA escolhe o preset ---------- */

// Tira maiúsculas e acentos para comparar textos ("Cafés" -> "cafes")
function normalizar(texto) {
  return String(texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// A hora atual está dentro do intervalo do preset? Trata a virada da meia-noite
// (ex.: 19:00 até 05:00 vale das 19h até as 5h do dia seguinte).
function dentroDoHorario(de, ate) {
  if (!de || !ate) return false; // campo de horário deixado em branco
  const agora = new Date();
  const minutos = agora.getHours() * 60 + agora.getMinutes();
  const [h1, m1] = de.split(':').map(Number);
  const [h2, m2] = ate.split(':').map(Number);
  const inicio = h1 * 60 + m1;
  const fim = h2 * 60 + m2;
  return inicio <= fim ? minutos >= inicio && minutos <= fim : minutos >= inicio || minutos <= fim;
}

// Quais gatilhos do preset combinam com o contexto de agora. Local e luz só são
// conhecidos com o simulador ligado (a cena faz o papel de GPS e de sensor de luz).
function gatilhosQueCombinam(preset) {
  const g = preset.gatilhos;
  const combinam = [];

  if (g.horario.ativo && dentroDoHorario(g.horario.de, g.horario.ate)) combinam.push('horario');

  if (state.simulador) {
    if (g.luz.ativo && g.luz.nivel === LUZ_POR_CENA[state.cena]) combinam.push('luz');

    const texto = normalizar(g.local.texto) + ' ';
    if (g.local.ativo && LOCAL_POR_CENA[state.cena].some((palavra) => texto.includes(palavra))) {
      combinam.push('local');
    }
  }
  return combinam;
}

// A decisão da IA. Só vale com o Context Mode ligado e o preset em "Automático" (se o
// usuário escolheu um preset na mão, a IA fica de fora). Cada preset ativo, com algum
// gatilho configurado, recebe uma nota: o peso dos gatilhos que combinam dividido pelo peso
// de todos os que ele configurou. Vence a maior nota, desde que passe de NOTA_MINIMA_IA.
// Devolve { preset, motivos } ou null (nenhum preset combina).
function decidirPresetIA() {
  if (!state.contextMode || state.preset !== 'Automático') return null;

  let melhor = null;
  state.presetsUsuario.forEach((preset) => {
    if (!preset.ativo) return; // o interruptor do card em modes.html tira o preset da IA

    const configurados = Object.keys(PESO_GATILHO).filter((nome) => preset.gatilhos[nome].ativo);
    if (!configurados.length) return; // sem gatilhos, o preset só serve na escolha manual

    const combinam = gatilhosQueCombinam(preset);
    const total = configurados.reduce((soma, nome) => soma + PESO_GATILHO[nome], 0);
    const nota = combinam.reduce((soma, nome) => soma + PESO_GATILHO[nome], 0) / total;

    if (nota >= NOTA_MINIMA_IA && (!melhor || nota > melhor.nota)) {
      melhor = { preset, nota, motivos: combinam };
    }
  });
  return melhor;
}

// A IA só age sozinha quando o Context Mode está ligado E o preset está em "Automático".
// Se o usuário escolheu um preset na mão, quem manda é ele: a IA não aplica nada e o card
// de recomendação volta a aparecer.
function iaNoComando() {
  return state.contextMode && state.preset === 'Automático';
}

// Preset em uso: o escolhido na mão; em "Automático", o que a IA decidiu; e, se a IA não
// achou nenhum que combine, o do modo atual.
function presetAtivo() {
  if (state.preset !== 'Automático') return state.preset;
  const ia = decidirPresetIA();
  return ia ? ia.preset.nome : PRESET_POR_MODO[state.modo];
}

const NOME_GATILHO = { local: 'local', luz: 'luz', horario: 'horário' };

// Texto do chip do visor, ex.: "Preset: Comida · IA (local)". Também avisa quando a IA
// muda de preset por conta própria (nova cena, por exemplo).
function atualizarPreset() {
  const ia = decidirPresetIA();
  let sufixo = '';
  if (state.preset === 'Automático') {
    sufixo = ia ? ` · IA (${ia.motivos.map((m) => NOME_GATILHO[m]).join(' + ')})` : ' · Auto';
  }
  $('badge-preset-nome').textContent = `Preset: ${presetAtivo()}${sufixo}`;

  const escolhido = ia ? ia.preset.nome : null;
  if (escolhido && escolhido !== state.presetAnunciado) {
    mostrarAviso(`IA escolheu ${escolhido} · ${ia.motivos.map((m) => NOME_GATILHO[m]).join(' + ')}`);
  }
  state.presetAnunciado = escolhido;

  atualizarEfeitos(); // trocar modo, preset ou Context Mode muda a aparência do visor
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

// Desliga o que o Cam Assist tinha aplicado. Só desfaz o que continua como a IA deixou:
// se o usuário já mudou o modo ou o HDR por conta própria, essa escolha é respeitada.
// `limparAutomaticas`: ao desligar a IA, cancela também os "Sempre aplicar". Ao trocar de
// cena com a IA ligada, eles continuam valendo.
function desfazerIA(limparAutomaticas = true) {
  const feito = state.desfazerIA;
  state.desfazerIA = {};
  let desfez = false;

  if (feito.hdr && state.hdr === feito.hdr.para) {
    state.hdr = feito.hdr.de;
    destacarBotao($('btn-hdr'), state.hdr);
    desfez = true;
  }
  if (feito.preset && state.preset === feito.preset.para) {
    state.preset = feito.preset.de;
    desfez = true;
  }
  if (feito.modo && state.modo === feito.modo.para) {
    trocarModo(feito.modo.de); // também atualiza o obturador, a régua Pro e os efeitos
    desfez = true;
  }

  // "Sempre aplicar" também é uma ordem para a IA: desligá-la cancela essa escolha,
  // senão a próxima cena ligaria tudo de novo sozinha.
  if (limparAutomaticas) state.automaticas.clear();
  return desfez;
}

function alternarContext() {
  state.contextMode = !state.contextMode;
  const desfez = state.contextMode ? false : desfazerIA();
  atualizarContext();
  mostrarBadgeContext();
  if (desfez) mostrarAviso('Ajustes da IA desfeitos');
  vibrar(15);

  // Ao ligar, a IA já aplica sozinha o que recomendaria para a cena que está no visor
  // (a menos que haja um preset escolhido na mão)
  if (iaNoComando() && state.simulador && !state.analisando) {
    if (!SUGESTOES[state.cena].atendida()) aplicarSugestao(true);
  }
}

/* ---------- Escolha de preset ---------- */

// Os presets criados em pages/modes.html chegam por sessionStorage (chave abaixo). A
// página de presets grava a lista a cada mudança, e a câmera lê aqui. O sessionStorage
// vale só para a aba aberta: é JavaScript puro do navegador, sem biblioteca.
const CHAVE_PRESETS = 'jovi_presets';
const ICONE_CONTEXTO = {
  Comida: 'utensils', Paisagem: 'mountain', Retrato: 'user', Noite: 'moon',
  Personalizado: 'sliders-horizontal',
};

// Lê os presets gravados por modes.html. Se não houver nada gravado (ou o navegador
// bloquear o sessionStorage), usa os presets de exemplo (js/presets-exemplo.js), que já
// trazem os gatilhos que o Context Mode precisa. Se o usuário excluiu todos, a lista fica
// vazia e sobra só o "Automático".
function carregarPresetsSalvos() {
  let salvos = null;
  try {
    salvos = JSON.parse(sessionStorage.getItem(CHAVE_PRESETS));
  } catch (e) {
    /* sem sessionStorage: cai nos exemplos */
  }
  state.presetsUsuario = Array.isArray(salvos) ? salvos : PRESETS_EXEMPLO;

  // Se o preset escolhido foi excluído em modes.html, volta para o automático
  const existe = listaPresets().some((p) => p.nome === state.preset);
  if (!existe) state.preset = 'Automático';
}

// Lista mostrada na escolha de preset: "Automático" + os presets do usuário
function listaPresets() {
  const doUsuario = state.presetsUsuario.map((p) => {
    const g = p.gatilhos;
    const gatilhos = [];
    if (g.local.ativo) gatilhos.push(g.local.texto || 'Local');
    if (g.horario.ativo) gatilhos.push(`${g.horario.de}–${g.horario.ate}`);
    if (g.luz.ativo) gatilhos.push('Luz');
    return {
      nome: p.nome,
      icone: ICONE_CONTEXTO[p.contexto] || ICONE_CONTEXTO.Personalizado,
      descricao: gatilhos.length ? gatilhos.join(' · ') : 'Ativação manual',
    };
  });
  return [OPCAO_AUTOMATICO, ...doUsuario];
}

// Neutraliza HTML digitado pelo usuário (o nome do preset) antes do innerHTML
function escapar(texto) {
  const d = document.createElement('div');
  d.textContent = texto;
  return d.innerHTML;
}

// Efeito visual de um preset. Todo preset vira filtro a partir dos sliders que ele tem em
// modes.html: exposição muda o brilho, saturação e contraste mudam a cor (50 = neutro).
// Se o nome não estiver na lista (ex.: foi excluído), cai na tabela EFEITOS.
function efeitoPreset(nome) {
  const p = state.presetsUsuario.find((x) => x.nome === nome);
  if (!p) return EFEITOS['preset:' + nome] || null;

  const a = p.ajustes;
  const cena = p.contexto === 'Personalizado' ? null : p.contexto; // cena onde rende mais
  return {
    ajuste: {
      brightness: 1 + a.exposicao * 0.15,
      saturate: 0.5 + a.saturacao / 100,
      contrast: 0.5 + a.contraste / 100,
    },
    base: cena ? 0.3 : 1,
    cenas: cena ? { [cena]: 1 } : {},
  };
}

// Desenha a lista de presets; o escolhido fica marcado com um check.
// O botão guarda a posição na lista (e não o nome) para o nome poder ter qualquer caractere.
function renderPresets() {
  $('preset-list').innerHTML = listaPresets().map((p, indice) => {
    const escolhido = p.nome === state.preset;
    return `
      <button data-indice="${indice}" class="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left active:bg-neutral-800 transition">
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

  // Escolher um preset na mão tira a IA do comando: o que ela tinha aplicado sai
  if (nome !== 'Automático') desfazerIA(false);

  atualizarPreset();
  atualizarSugestao();
  fecharPresets();
  mostrarAviso(nome === 'Automático' ? 'Preset automático' : `Preset ${nome}`);
  vibrar(10);

  // Voltar ao "Automático" devolve o comando à IA, que aplica o que recomenda para a cena
  if (iaNoComando() && state.simulador && !state.analisando) {
    if (!SUGESTOES[state.cena].atendida()) aplicarSugestao(true);
  }
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
  atualizarPro();      // a régua ISO/VEL/EV só aparece no modo Pro
  atualizarSugestao(); // a sugestão de modo pode já estar atendida
  vibrar(10);
}

// Régua do modo Pro: aparece só nesse modo e acompanha a cena do visor
function atualizarPro() {
  const ligado = state.modo === 'Pro';
  $('pro-strip').classList.toggle('hidden', !ligado);
  $('pro-strip').classList.toggle('flex', ligado);
  if (!ligado) return;

  const p = (state.simulador && PRO_POR_CENA[state.cena]) || { iso: '100', vel: '1/120', ev: '0.0' };
  $('pro-iso').textContent = p.iso;
  $('pro-vel').textContent = p.vel;
  $('pro-ev').textContent = p.ev;
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

// Com o flash ligado, a cena recebe um clarão antes da foto sair, como numa câmera real.
function capturarFoto() {
  if (!state.flash) {
    registrarFoto();
    return;
  }

  const luz = $('flash-burst');
  luz.classList.replace('opacity-0', 'opacity-70');
  setTimeout(() => luz.classList.replace('opacity-70', 'opacity-0'), 140);
  setTimeout(registrarFoto, 160);
}

// A foto em si: clarão do obturador, som, miniatura da galeria e aviso.
function registrarFoto() {
  const clarao = $('shutter-flash');
  clarao.classList.replace('opacity-0', 'opacity-100');
  setTimeout(() => clarao.classList.replace('opacity-100', 'opacity-0'), 120);

  atualizarMiniatura();
  tocarObturador();
  mostrarAviso(state.res200 ? 'Foto salva · 200MP' : 'Foto salva');
  vibrar(30);
}

// A miniatura da galeria recebe a cena com os mesmos efeitos do visor, como se fosse
// a foto recém-tirada, e dá um pulinho confirmando que ela entrou na galeria.
function atualizarMiniatura() {
  const thumb = $('gallery-thumb');
  if (!thumb) return; // a miniatura some se o arquivo da imagem não existir

  // Com o simulador desligado o visor não tem imagem (a foto de cena está escondida),
  // então não há o que "fotografar". Sem esta checagem a miniatura mostraria a paisagem
  // mesmo com o visor preto.
  if (!state.simulador) return;

  thumb.src = $('scene-img').getAttribute('src');
  thumb.style.filter = $('scene-img').style.filter;
  thumb.style.transform = state.frontal ? 'scaleX(-1)' : '';

  const botao = $('btn-gallery');
  botao.classList.remove('thumb-pop');
  void botao.offsetWidth; // reinicia a animação mesmo em fotos seguidas
  botao.classList.add('thumb-pop');
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

function alternarSom() {
  state.som = !state.som;

  const valor = $('opt-som-valor');
  valor.textContent = state.som ? 'Ligado' : 'Desligado';
  valor.classList.toggle('text-amber-400', state.som);
  valor.classList.toggle('text-neutral-400', !state.som);

  if (state.som) tocarObturador(); // deixa ouvir como ficou
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

// O card aparece só quando há algo a recomendar: o simulador está ligado, a IA não está no
// comando (com ela no comando, aplicar sozinha torna a recomendação redundante), a cena já
// foi analisada, o usuário não fechou no X e a recomendação ainda não está valendo
// (ex.: HDR já ligado).
function atualizarSugestao() {
  const painel = $('ai-suggestion-panel');
  const visivel =
    state.simulador &&
    !iaNoComando() &&
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
  atualizarPreset();  // a IA reavalia o preset (local e luz vêm da cena) e refaz os efeitos
  atualizarPro();     // ISO, velocidade e EV também mudam com a cena

  // Some o card durante a análise e mostra o da nova cena depois
  state.analisando = true;
  atualizarSugestao();
  clearTimeout(timerAnalise);
  timerAnalise = setTimeout(() => {
    state.analisando = false;

    // Com a IA no comando, o que ela mudou na cena anterior sai antes de ela decidir a
    // nova (ex.: o modo Noite não deve ficar numa paisagem de dia).
    if (iaNoComando()) desfazerIA(false);

    // IA no comando: aplica sozinha, sem card. Com um preset escolhido na mão ou o Context
    // Mode desligado, ela não mexe em nada (nem por "Sempre aplicar", que já liga o
    // Context Mode e vale enquanto a IA estiver no comando).
    if (iaNoComando() && !s.atendida()) {
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

  atualizarPreset(); // ligar o simulador dá à IA local e luz para decidir; refaz os efeitos
  atualizarPro();
  atualizarSugestao();
}

function alternarSimulador() {
  state.simulador = !state.simulador;
  atualizarSimulador();
  if (state.simulador) definirCena(state.cena); // a IA "analisa" a cena que acabou de aparecer
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

  // Guarda o que a sugestão mudou (modo, HDR ou preset) para desligar a IA poder desfazer.
  // Se já havia uma mudança da IA registrada, mantém o valor original de antes dela.
  const antes = { modo: state.modo, hdr: state.hdr, preset: state.preset };

  // Aceitar a sugestão devolve o comando à IA: sai o preset escolhido na mão e volta o
  // "Automático". Ele fica registrado abaixo, então desligar a IA restaura o seu preset.
  const tinhaPresetManual = state.preset !== 'Automático';
  state.preset = 'Automático';

  s.aplicar();
  const depois = { modo: state.modo, hdr: state.hdr, preset: state.preset };
  Object.keys(antes).forEach((campo) => {
    if (antes[campo] !== depois[campo] && !state.desfazerIA[campo]) {
      state.desfazerIA[campo] = { de: antes[campo], para: depois[campo] };
    }
  });

  // Aceitar uma sugestão significa que a IA está atuando: liga o Context Mode, para o
  // botão de IA e o chip "Preset: ..." mostrarem isso. (A sugestão de Comida já liga
  // sozinha, então nesse caso o modo já está ligado aqui.)
  if (!state.contextMode) {
    state.contextMode = true;
    atualizarContext();
    mostrarBadgeContext();
  }

  atualizarSugestao();
  const aviso = automatico ? `Cam Assist: ${s.confirmacao}` : s.confirmacao;
  mostrarAviso(tinhaPresetManual ? `${aviso} · preset automático` : aviso);
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

/* ---------- Efeitos do visor ----------
   Como não há câmera real, cada recurso é simulado com filtros CSS na imagem do visor
   (foto da cena simulada e <video>). Cada efeito é um pequeno ajuste; os ativos se
   combinam: brilho, contraste e saturação multiplicam, matiz e sépia somam. */

// Cada efeito tem:
//   ajuste -> a mudança na imagem com força total
//   cenas  -> a força (0 a 1) em cada cena simulada
//   base   -> a força nas cenas que não estão em `cenas`
// O efeito só aparece com força total na cena para a qual o Cam Assist o recomenda
// (ver SUGESTOES). Nas outras fica discreto, como numa câmera de verdade: o modo Noite
// ilumina muito uma foto escura, mas quase não mexe numa paisagem de dia.
// Chaves: "modo:X" (barra inferior), "preset:X" (Context Mode), hdr, aura, res200.
const EFEITOS = {
  'modo:Noite':      { ajuste: { brightness: 1.35, saturate: 0.85, hue: -8 }, base: 0.15, cenas: { Noite: 1 } },
  'modo:Retrato':    { ajuste: { brightness: 1.05, contrast: 0.96, saturate: 1.08 }, base: 0.4, cenas: { Retrato: 1 } },
  'modo:Comida':     { ajuste: { saturate: 1.3, contrast: 1.06, sepia: 0.08 }, base: 0.3, cenas: { Comida: 1 } },
  'modo:Pro':        { ajuste: { contrast: 1.08 }, base: 1, cenas: {} },
  'preset:Comida':   { ajuste: { saturate: 1.3, contrast: 1.06, sepia: 0.08 }, base: 0.3, cenas: { Comida: 1 } },
  'preset:Paisagem': { ajuste: { contrast: 1.1, saturate: 1.2 }, base: 0.3, cenas: { Paisagem: 1 } },
  'preset:Retrato':  { ajuste: { brightness: 1.04, saturate: 1.08 }, base: 0.3, cenas: { Retrato: 1 } },
  'preset:Noite':    { ajuste: { brightness: 1.25, saturate: 0.9 }, base: 0.15, cenas: { Noite: 1 } },
  hdr:               { ajuste: { contrast: 1.15, saturate: 1.12, brightness: 1.04 }, base: 0.5, cenas: { Paisagem: 1, Noite: 0.7 } },
  aura:              { ajuste: { brightness: 1.1 }, base: 0.5, cenas: { Retrato: 1, Noite: 0.9 } },
  res200:            { ajuste: { contrast: 1.05, saturate: 1.04 }, base: 1, cenas: {} }, // + nitidez (SVG)
};

// Força (0 a 1) de um efeito na cena atual. Sem o simulador não há foto para comparar,
// então vale 1.
function intensidade(efeito) {
  if (!state.simulador) return 1;
  return efeito.cenas[state.cena] ?? efeito.base;
}

// Enfraquece um ajuste na proporção da força: 1 mantém tudo, 0 não muda nada.
// "hue" e "sepia" partem de 0; os demais partem de 1 (neutro).
function escalar(ajuste, forca) {
  const resultado = {};
  for (const [campo, valor] of Object.entries(ajuste)) {
    const neutro = campo === 'hue' || campo === 'sepia' ? 0 : 1;
    resultado[campo] = neutro + (valor - neutro) * forca;
  }
  return resultado;
}

// Junta uma lista de efeitos em um só: brilho/contraste/saturação multiplicam,
// matiz e sépia somam. Campos ausentes valem "neutro".
function combinarEfeitos(lista) {
  const total = { brightness: 1, contrast: 1, saturate: 1, hue: 0, sepia: 0 };
  lista.forEach((e) => {
    total.brightness *= e.brightness ?? 1;
    total.contrast *= e.contrast ?? 1;
    total.saturate *= e.saturate ?? 1;
    total.hue += e.hue ?? 0;
    total.sepia += e.sepia ?? 0;
  });
  return total;
}

// Recalcula o filtro do visor a partir do estado. Chamada sempre que HDR, 200MP, Aura,
// modo, preset ou Context Mode mudam.
function atualizarEfeitos() {
  // Quais efeitos estão valendo agora
  const efeitos = [];
  if (EFEITOS['modo:' + state.modo]) efeitos.push(EFEITOS['modo:' + state.modo]);

  // O preset só conta com o Context Mode ligado, e não repete o efeito do próprio modo
  // (ex.: preset Noite dentro do modo Noite já está aplicado em "modo:Noite").
  const preset = presetAtivo();
  const efeitoDoPreset = state.contextMode && preset !== state.modo ? efeitoPreset(preset) : null;
  if (efeitoDoPreset) efeitos.push(efeitoDoPreset);

  if (state.hdr) efeitos.push(EFEITOS.hdr);
  if (state.aura) efeitos.push(EFEITOS.aura);
  if (state.res200) efeitos.push(EFEITOS.res200);

  // Cada efeito entra com a força que tem na cena atual
  const f = combinarEfeitos(efeitos.map((e) => escalar(e.ajuste, intensidade(e))));
  let filtro =
    `brightness(${f.brightness.toFixed(2)}) contrast(${f.contrast.toFixed(2)}) ` +
    `saturate(${f.saturate.toFixed(2)}) hue-rotate(${f.hue}deg) sepia(${f.sepia.toFixed(2)})`;

  // 200MP: filtro SVG de nitidez (definido em index.html) por cima dos demais
  if (state.res200) filtro += ' url(#jovi-sharpen)';

  $('scene-img').style.filter = filtro;
  $('camera-feed').style.filter = filtro;

  // Aura Light: brilho suave nas bordas do visor, como um anel de luz
  $('aura-overlay').classList.toggle('opacity-0', !state.aura);
  $('aura-overlay').classList.toggle('opacity-100', state.aura);
}

/* ---------- Botões da barra superior ---------- */

function alternarHdr() {
  state.hdr = !state.hdr;
  destacarBotao($('btn-hdr'), state.hdr);
  atualizarEfeitos();
  atualizarSugestao();
  mostrarAviso(state.hdr ? 'HDR ligado · mais contraste e detalhe' : 'HDR desligado');
}

// 200MP só funciona em 1x, como na câmera real. Com outro zoom, avisa e não liga.
function alternarRes200() {
  if (!state.res200 && state.zoom !== 1) {
    mostrarAviso('200MP só funciona em 1x');
    return;
  }
  state.res200 = !state.res200;
  destacarBotao($('btn-res'), state.res200);
  atualizarEfeitos();
  mostrarAviso(state.res200 ? '200MP ligado · mais nitidez' : '200MP desligado');
}

// Aura Light: luz de preenchimento suave, antes escondida no menu do flash
function alternarAura() {
  state.aura = !state.aura;
  destacarBotao($('btn-aura'), state.aura);
  atualizarEfeitos();
  mostrarAviso(state.aura ? 'Aura Light ligada · luz suave' : 'Aura Light desligada');
}

function alternarFlash() {
  state.flash = !state.flash;
  trocarIcone(
    $('btn-flash'),
    state.flash ? 'zap' : 'zap-off',
    state.flash ? 'w-5 h-5 text-amber-400' : 'w-5 h-5'
  );
  marcarBotao($('btn-flash'), state.flash);
  mostrarAviso(state.flash ? 'Flash ligado · dispara na foto' : 'Flash desligado');
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
    atualizarEfeitos();
    mostrarAviso('200MP desligado (só funciona em 1x)');
  } else {
    mostrarAviso(`Zoom ${zoom}x`);
  }

  atualizarTransform();
  atualizarZoomPilula();
}

// Zoom e espelho do visor em uma conta só: a câmera frontal inverte o eixo horizontal,
// como no espelho da selfie.
function atualizarTransform() {
  const z = state.zoom;
  const transformacao = `scale(${state.frontal ? -z : z}, ${z})`;
  $('camera-feed').style.transform = transformacao;
  $('scene-img').style.transform = transformacao;
}

// Alterna entre câmera traseira e frontal
function alternarFlip() {
  state.frontal = !state.frontal;
  trocarIcone(
    $('btn-flip'),
    'switch-camera',
    state.frontal ? 'w-6 h-6 text-amber-400' : 'w-6 h-6 text-white'
  );
  marcarBotao($('btn-flip'), state.frontal);
  atualizarTransform();
  mostrarAviso(state.frontal ? 'Câmera frontal' : 'Câmera traseira');
  vibrar(10);
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
  carregarPresetsSalvos(); // presets criados em pages/modes.html, se houver

  // Suaviza a mudança de zoom e dos efeitos (filtros) do visor
  $('camera-feed').style.transition = 'transform 0.3s ease, filter 0.4s ease';
  $('scene-img').style.transition = 'transform 0.3s ease, filter 0.4s ease';

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
    const item = e.target.closest('[data-indice]');
    if (item) escolherPreset(listaPresets()[Number(item.dataset.indice)].nome);
  });

  // Ao voltar de pages/modes.html pelo botão "voltar", o navegador pode reaproveitar esta
  // página sem rodar o init de novo. O pageshow garante que a lista de presets atualize.
  window.addEventListener('pageshow', () => {
    carregarPresetsSalvos();
    atualizarPreset();
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
  $('opt-som').addEventListener('click', alternarSom);
  $('opt-sim').addEventListener('click', alternarSimulador);
  $('btn-flip').addEventListener('click', alternarFlip);
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
