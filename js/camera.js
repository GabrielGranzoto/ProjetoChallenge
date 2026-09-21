/* ==========================================================================
   JOVI CAMERA — interações da tela da câmera (index.html)
   Depende de js/icons.js (ícones) e js/store.js (JoviStore, memória compartilhada).

   O que este arquivo controla:
   - Botão IA (sparkles)  -> liga/desliga o Context Mode do JOVI Modes, que escolhe o
                             preset sozinho pelos gatilhos (local, horário, luz)
   - Barra de modos       -> Noite, Retrato, Comida, Foto, Vídeo, Pro (troca o preset)
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

// Perfil de cada cena de exemplo: nível de luz que os "sensores" leriam, nota base da foto
// (0 a 100) e o nome do contexto usado na Galeria (ver MOCK_FOTOS em js/gallery.js)
const PERFIL_CENA = {
  Paisagem: { luz: 'alta',  notaBase: 90, contextoGaleria: 'Paisagem' },
  Noite:    { luz: 'baixa', notaBase: 76, contextoGaleria: 'Noturno' },
  Retrato:  { luz: 'média', notaBase: 84, contextoGaleria: 'Pessoas' },
  Comida:   { luz: 'média', notaBase: 88, contextoGaleria: 'Comida' },
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
  preset: 'Automático', // preset escolhido no chip do visor ("Automático" = a IA decide)
  presetsUsuario: [],  // presets de js/presets-exemplo.js ou criados em pages/modes.html
  presetAnunciado: null, // último preset que a IA anunciou, para avisar só quando mudar
  desfazerIA: {},      // o que o Cam Assist mudou: { modo|hdr|preset: { de, para } }
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

const limitar = (v, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(v)));

/* ---------- Visor: filtro do preset, HDR, zoom e espelho ---------- */

// Dados (ajustes) do preset em uso, vindos do JOVI Modes. Só vale com o Context Mode ligado.
function presetDados() {
  if (!state.contextMode) return null;
  const nome = presetAtivo();
  return state.presetsUsuario.find((p) => p.nome === nome) || null;
}

// Atalho usado pelo código da câmera real: refaz filtro e zoom/espelho de uma vez.
// O cálculo do filtro em si está em calcularFiltro() (motor de efeitos, mais abaixo).
function atualizarVisor() {
  atualizarEfeitos();
  atualizarTransform();
  return calcularFiltro();
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
  if (ia) return ia.preset.nome;
  // Sem gatilho que combine: em Foto o preset acompanha a cena detectada (câmera real
  // ou cenas de exemplo); fora disso vale o preset do modo.
  if (state.modo === 'Foto' && (state.simulador || state.real)) return state.cena;
  return PRESET_POR_MODO[state.modo];
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
  JoviStore.salvarContexto(state.contextMode); // o JOVI Modes lê o mesmo valor
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
  // Fonte principal: o JoviStore (localStorage), que guarda entre visitas e é o mesmo
  // que a Galeria e o Modes usam. O sessionStorage fica como ponte da mesma aba, e os
  // presets de exemplo são o último recurso.
  let salvos = null;
  try { salvos = JoviStore.carregarPresets(); } catch (e) { /* store indisponível */ }
  if (!Array.isArray(salvos) || !salvos.length) {
    try { salvos = JSON.parse(sessionStorage.getItem(CHAVE_PRESETS)); } catch (e) { /* idem */ }
  }
  state.presetsUsuario = Array.isArray(salvos) && salvos.length ? salvos : PRESETS_EXEMPLO;

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
  return captura;
}



// Clarão branco rápido + aviso. A foto é guardada e aparece na Galeria.
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

  const foto = registrarCaptura();
  tocarObturador();
  const extra = state.res200 ? ' · 200MP' : '';
  mostrarAviso(foto ? `Foto salva · Score ${foto.score}${extra}` : `Foto salva${extra}`, 1600);
  vibrar(30);
}

// A miniatura da galeria recebe a cena com os mesmos efeitos do visor, como se fosse
// a foto recém-tirada, e dá um pulinho confirmando que ela entrou na galeria.
function atualizarMiniatura() {
  const thumb = $('gallery-thumb');
  if (!thumb) return; // a miniatura some se o arquivo da imagem não existir

  // Primeiro a foto de verdade guardada no JoviStore (é ela que a Galeria mostra).
  const ultima = JoviStore.lerCapturas()[0];
  if (ultima) {
    thumb.src = ultima.src;
    thumb.style.filter = '';   // o filtro já está embutido na imagem capturada
    thumb.style.transform = '';
  } else {
    // Nada capturado ainda: espelha o visor. Sem simulador o visor não tem imagem.
    if (!state.simulador) return;
    thumb.src = $('scene-img').getAttribute('src');
    thumb.style.filter = $('scene-img').style.filter;
    thumb.style.transform = state.frontal ? 'scaleX(-1)' : '';
  }

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

/* ---------- Cam Assist: cena e sugestões ---------- */

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
    (state.simulador || state.real) &&
    !iaNoComando() &&
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
  atualizarPreset();  // a IA reavalia o preset (local e luz vêm da cena) e refaz os efeitos
  atualizarPro();     // ISO, velocidade e EV também mudam com a cena

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
  atualizarPreset(); // ligar o simulador dá à IA local e luz para decidir; refaz os efeitos
  atualizarPro();
  atualizarSugestao();
}

function alternarSimulador() {
  state.simulador = !state.simulador;
  atualizarSimulador();
  if (state.simulador) definirCena(state.cena); // a IA "analisa" a cena que acabou de aparecer
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
function calcularFiltro() {
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

  return filtro;
}

// Aplica no visor o filtro calculado acima: vale para a cena de exemplo e para o vídeo
// da câmera real.
function atualizarEfeitos() {
  const filtro = calcularFiltro();
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
  atualizarVisor();
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
  atualizarVisor();
  mostrarAviso(state.aura ? 'Aura Light ligada · luz suave' : 'Aura Light desligada');
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
  mostrarAviso(state.flash ? 'Flash ligado · dispara na foto' : 'Flash desligado');
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
    atualizarEfeitos();
    mostrarAviso('200MP desligado (só funciona em 1x)');
  } else {
    mostrarAviso(`Zoom ${zoom}x`);
  }

  atualizarVisor();
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
async function alternarFlip() {
  state.frontal = !state.frontal;
  // Na câmera real, inverter o lado exige reabrir o stream na outra lente.
  if (state.real) await iniciarCameraReal();
  trocarIcone(
    $('btn-flip'),
    'switch-camera',
    state.frontal ? 'w-6 h-6 text-amber-400' : 'w-6 h-6 text-white'
  );
  marcarBotao($('btn-flip'), state.frontal);
  atualizarVisor();
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
  carregarPresetsSalvos(); // presets do JoviStore / modes.html / exemplos

  // Suaviza a mudança de zoom e dos efeitos (filtros) do visor
  ['camera-feed', 'scene-img'].forEach((id) => {
    $(id).style.transition = 'transform 0.3s ease, filter 0.4s ease';
  });

  // O que o JOVI Modes e o Cam Assist já guardaram nas visitas anteriores
  state.contextMode = JoviStore.carregarContexto();
  carregarAprendizado();

  $('btn-ai').addEventListener('click', alternarContext);
  $('btn-hdr').addEventListener('click', alternarHdr);
  $('btn-res').addEventListener('click', alternarRes200);
  $('btn-aura').addEventListener('click', alternarAura);
  $('btn-scene').addEventListener('click', trocarCena);
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

  // Botão dos 3 pontos (direita): menu com temporizador, câmera real e atalhos
  $('btn-more').addEventListener('click', abrirMais);
  $('more-close').addEventListener('click', fecharMais);
  $('more-overlay').addEventListener('click', fecharMais);
  $('opt-timer').addEventListener('click', alternarTemporizador);
  $('opt-som').addEventListener('click', alternarSom);
  $('opt-sim').addEventListener('click', alternarSimulador);
  $('opt-cam').addEventListener('click', alternarCameraReal);
  $('opt-reset').addEventListener('click', zerarAprendizado);
  $('btn-flip').addEventListener('click', alternarFlip);
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
