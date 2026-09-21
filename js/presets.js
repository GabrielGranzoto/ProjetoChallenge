/* ==========================================================================
   JOVI MODES — lista e criação de presets (simulador; dados guardados no navegador via js/store.js)
   Formato de um preset:
   { id, nome, contexto, ativo, usos, ultimoUso (dias atrás ou null),
     gatilhos: { local: {ativo, texto}, horario: {ativo, de, ate}, luz: {ativo, nivel} },
     ajustes:  { exposicao, saturacao, contraste } }

   Como o arquivo está organizado:
   1. Dados e estado     -> o objeto `state` (os presets vêm de js/store.js)
   2. Textos de apoio    -> resumos exibidos nos cards
   3. Renderização       -> montam a lista de presets e o cabeçalho
   4. Painel             -> formulário de criar/editar (bottom sheet)
   5. Eventos (init)     -> ligam cliques e campos às funções acima

   Fluxo: uma ação altera o `state` e chama `render()`, que redesenha a tela.
   No MER, cada preset corresponde à entidade PRESET; os gatilhos, a CONTEXTO_DETECCAO
   e `usos`/`ultimoUso`, a HISTORICO_USO_PRESET.
   ========================================================================== */

// Tipos de cena disponíveis e o ícone de cada um (ver js/icons.js)
const CONTEXTOS = {
  Comida:        { icone: 'utensils' },
  Paisagem:      { icone: 'mountain' },
  Retrato:       { icone: 'user' },
  Noite:         { icone: 'moon' },
  Personalizado: { icone: 'sliders-horizontal' },
};

const NIVEIS_LUZ = { baixa: 'Luz baixa', media: 'Luz média', alta: 'Luz alta' };

// Valores iniciais dos sliders ao criar um preset novo
const AJUSTES_PADRAO = { exposicao: 0, saturacao: 50, contraste: 50 };

// Estado único da tela. Tudo que aparece é desenhado a partir daqui.
const state = {
  presets: JoviStore.carregarPresets(),     // presets de exemplo (ou os já salvos); novos entram no início
  contextoAtivo: JoviStore.carregarContexto(), // chave geral "Context Mode"
  editandoId: null,     // id do preset no painel (null = criando novo)
  contextoForm: 'Comida', // tipo de cena selecionado no painel
};

// Atalhos: pegar elemento por id e escrever "1 preset" / "2 presets"
const $ = (id) => document.getElementById(id);
const plural = (n, s) => `${n} ${s}${n === 1 ? '' : 's'}`;

// Neutraliza HTML digitado pelo usuário (ex.: "<b>") antes de inserir com innerHTML,
// evitando que o nome do preset quebre a página.
function escapar(txt) {
  const d = document.createElement('div');
  d.textContent = txt;
  return d.innerHTML;
}

/* ---------- Textos de apoio ---------- */

// Linha de gatilhos do card, ex.: "Restaurantes · 11:30–14:30 · Luz baixa"
function resumoGatilhos(p) {
  const g = p.gatilhos;
  const partes = [];
  if (g.local.ativo) partes.push(g.local.texto || 'Local');
  if (g.horario.ativo) partes.push(`${g.horario.de}–${g.horario.ate}`);
  if (g.luz.ativo) partes.push(NIVEIS_LUZ[g.luz.nivel]);
  return partes.length ? partes.join(' · ') : 'Ativação manual';
}

// Histórico de uso do card, ex.: "24 usos · último hoje"
function textoUso(p) {
  if (!p.usos) return 'Nunca usado';
  const quando = p.ultimoUso === 0 ? 'hoje' : p.ultimoUso === 1 ? 'ontem' : `há ${p.ultimoUso} dias`;
  return `${plural(p.usos, 'uso')} · último ${quando}`;
}

const formatarExposicao = (v) => (v > 0 ? `+${v}` : `${v}`) + ' EV';

/* ---------- Renderização ---------- */

// Atualiza o cabeçalho (contagem) e o card do Context Mode
function renderResumo() {
  // Grava a cada mudança: a câmera lê os mesmos presets e o mesmo Context Mode
  JoviStore.salvarPresets(state.presets);
  JoviStore.salvarContexto(state.contextoAtivo);
  const ativos = state.presets.filter((p) => p.ativo).length;
  $('modes-count').textContent = `${plural(state.presets.length, 'preset')} · ${plural(ativos, 'ativo')}`;
  $('context-toggle').checked = state.contextoAtivo;
  $('context-status').textContent = state.contextoAtivo
    ? 'Ligado. A câmera troca de preset sozinha conforme local, horário e luz.'
    : 'Desligado. Você escolhe o preset manualmente na câmera.';
}

// HTML de um card de preset. A área da esquerda abre a edição (data-editar);
// a chave da direita liga/desliga o preset (data-toggle). A chave é um checkbox
// escondido (`peer sr-only`) e o <span> ao lado muda de cor com `peer-checked`.
function card(p) {
  const icone = (CONTEXTOS[p.contexto] || CONTEXTOS.Personalizado).icone;
  return `
    <article class="flex items-center gap-3 rounded-2xl bg-neutral-900 p-3.5">
      <button data-editar="${p.id}" class="flex-1 min-w-0 flex items-center gap-3 text-left active:opacity-75 transition">
        <span class="w-11 h-11 rounded-full bg-neutral-800 flex items-center justify-center shrink-0">
          <i data-lucide="${icone}" class="w-5 h-5 text-amber-400"></i>
        </span>
        <span class="min-w-0">
          <span class="block text-sm font-semibold truncate">${escapar(p.nome)}</span>
          <span class="block text-xs text-neutral-400 truncate">${escapar(resumoGatilhos(p))}</span>
          <span class="block text-[11px] text-neutral-500 mt-0.5">${textoUso(p)}</span>
        </span>
      </button>
      <label class="relative inline-flex shrink-0 cursor-pointer">
        <input type="checkbox" data-toggle="${p.id}" class="peer sr-only" aria-label="Ativar ${escapar(p.nome)}" ${p.ativo ? 'checked' : ''}>
        <span class="w-11 h-6 rounded-full bg-neutral-700 transition peer-checked:bg-amber-400 peer-focus-visible:ring-2 peer-focus-visible:ring-white
                     after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5"></span>
      </label>
    </article>`;
}

// Redesenha a lista. Com o Context Mode desligado, a lista fica esmaecida.
function renderLista() {
  $('list').innerHTML = state.presets.map(card).join('');
  $('list').classList.toggle('opacity-50', !state.contextoAtivo);
  $('empty').classList.toggle('hidden', state.presets.length > 0);
  lucide.createIcons();
}

function render() {
  renderResumo();
  renderLista();
}

/* ---------- Painel de criação / edição ---------- */

// Botões de tipo de cena do painel; o selecionado (state.contextoForm) fica em amber
function renderContextos() {
  $('f-contexto').innerHTML = Object.entries(CONTEXTOS).map(([nome, c]) => {
    const ativo = nome === state.contextoForm;
    return `
      <button type="button" data-contexto="${nome}" aria-label="${nome}" aria-pressed="${ativo}"
              class="flex flex-col items-center gap-1.5 rounded-xl py-2.5 text-[10px] transition ${
                ativo ? 'bg-amber-400 text-black font-semibold' : 'bg-neutral-800 text-neutral-300'
              }">
        <i data-lucide="${c.icone}" class="w-5 h-5"></i>
        <span class="truncate max-w-full px-0.5">${nome === 'Personalizado' ? 'Outro' : nome}</span>
      </button>`;
  }).join('');
  lucide.createIcons();
}

// Mostra o valor atual ao lado de cada slider
function atualizarValores() {
  $('v-exposicao').textContent = formatarExposicao(Number($('f-exposicao').value));
  $('v-saturacao').textContent = $('f-saturacao').value;
  $('v-contraste').textContent = $('f-contraste').value;
}

// Os campos de cada gatilho (local, horário, luz) só aparecem com a chave ligada
function mostrarGrupo(chk, grupo) {
  $(grupo).classList.toggle('hidden', !$(chk).checked);
}

function atualizarGrupos() {
  mostrarGrupo('t-local', 'g-local');
  mostrarGrupo('t-horario', 'g-horario');
  mostrarGrupo('t-luz', 'g-luz');
}

// Copia os dados de um preset (ou os valores padrão) para os campos do painel
function preencherFormulario(p) {
  $('f-nome').value = p.nome;
  state.contextoForm = p.contexto;

  $('t-local').checked = p.gatilhos.local.ativo;
  $('f-local').value = p.gatilhos.local.texto;
  $('t-horario').checked = p.gatilhos.horario.ativo;
  $('f-de').value = p.gatilhos.horario.de;
  $('f-ate').value = p.gatilhos.horario.ate;
  $('t-luz').checked = p.gatilhos.luz.ativo;
  $('f-luz').value = p.gatilhos.luz.nivel;

  $('f-exposicao').value = p.ajustes.exposicao;
  $('f-saturacao').value = p.ajustes.saturacao;
  $('f-contraste').value = p.ajustes.contraste;

  $('f-erro').classList.add('hidden');
  atualizarGrupos();
  atualizarValores();
  renderContextos();
}

// Abre o painel. Com `id` edita um preset existente; com null cria um novo.
// Não damos foco automático no nome para o teclado do celular não cobrir o formulário.
function abrirPainel(id) {
  state.editandoId = id;
  const existente = state.presets.find((p) => p.id === id);

  preencherFormulario(existente || {
    nome: '',
    contexto: 'Comida',
    gatilhos: {
      local: { ativo: false, texto: '' },
      horario: { ativo: false, de: '08:00', ate: '18:00' },
      luz: { ativo: false, nivel: 'media' },
    },
    ajustes: { ...AJUSTES_PADRAO },
  });

  $('sheet-title').textContent = existente ? 'Editar preset' : 'Novo preset';
  $('btn-delete').classList.toggle('hidden', !existente);
  $('sheet').classList.remove('hidden');
  document.body.classList.add('overflow-hidden');
}

function fecharPainel() {
  $('sheet').classList.add('hidden');
  document.body.classList.remove('overflow-hidden');
  state.editandoId = null;
}

// Faz o caminho inverso: lê os campos do painel e devolve um objeto no formato do preset
function lerFormulario() {
  return {
    nome: $('f-nome').value.trim(),
    contexto: state.contextoForm,
    gatilhos: {
      local: { ativo: $('t-local').checked, texto: $('f-local').value.trim() },
      horario: { ativo: $('t-horario').checked, de: $('f-de').value, ate: $('f-ate').value },
      luz: { ativo: $('t-luz').checked, nivel: $('f-luz').value },
    },
    ajustes: {
      exposicao: Number($('f-exposicao').value),
      saturacao: Number($('f-saturacao').value),
      contraste: Number($('f-contraste').value),
    },
  };
}

// Valida o nome e grava: atualiza o preset existente ou cria um novo (sem usos ainda)
function salvarPreset() {
  const dados = lerFormulario();
  if (!dados.nome) {
    $('f-erro').classList.remove('hidden');
    $('f-nome').focus();
    return;
  }

  const existente = state.presets.find((p) => p.id === state.editandoId);
  if (existente) {
    Object.assign(existente, dados);
    toast('Preset atualizado');
  } else {
    state.presets.unshift({
      id: 'p' + Date.now(), ativo: true, usos: 0, ultimoUso: null, ...dados,
    });
    toast('Preset criado');
  }
  fecharPainel();
  render();
}

function excluirPreset() {
  state.presets = state.presets.filter((p) => p.id !== state.editandoId);
  fecharPainel();
  render();
  toast('Preset excluído');
}

/* ---------- Aviso ---------- */

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2500);
}

/* ---------- Eventos ---------- */

// Liga os eventos. A lista usa "delegação": um único listener no container,
// pois os cards são recriados a cada render.
function init() {
  $('btn-new').addEventListener('click', () => abrirPainel(null));

  $('list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-editar]');
    if (b) abrirPainel(b.dataset.editar);
  });

  $('list').addEventListener('change', (e) => {
    const chk = e.target.closest('[data-toggle]');
    if (!chk) return;
    const p = state.presets.find((x) => x.id === chk.dataset.toggle);
    if (p) { p.ativo = chk.checked; renderResumo(); }
  });

  $('context-toggle').addEventListener('change', (e) => {
    state.contextoAtivo = e.target.checked;
    render();
  });

  $('f-contexto').addEventListener('click', (e) => {
    const b = e.target.closest('[data-contexto]');
    if (b) { state.contextoForm = b.dataset.contexto; renderContextos(); }
  });

  ['t-local', 't-horario', 't-luz'].forEach((id) => $(id).addEventListener('change', atualizarGrupos));
  ['f-exposicao', 'f-saturacao', 'f-contraste'].forEach((id) => $(id).addEventListener('input', atualizarValores));
  $('f-nome').addEventListener('input', () => $('f-erro').classList.add('hidden'));

  $('btn-save').addEventListener('click', salvarPreset);
  $('btn-delete').addEventListener('click', excluirPreset);
  $('sheet-close').addEventListener('click', fecharPainel);
  $('sheet-overlay').addEventListener('click', fecharPainel);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharPainel(); });

  render();
}

init();
