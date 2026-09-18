/* ==========================================================================
   JOVI GALLERY
   Depende de js/score.js (JoviScore). Dados apenas em memória (simulador).
   Fotos de exemplo usam gradientes no lugar de imagens.

   Como o arquivo está organizado:
   1. Dados e estado       -> fotos de exemplo e o objeto `state`
   2. Funções auxiliares   -> filtros, agrupamento por dia, melhor da sequência
   3. Renderização         -> montam o HTML na tela a partir do `state`
   4. Visualizador         -> tela cheia com os detalhes da foto
   5. Eventos (init)       -> ligam cliques e digitação às funções acima

   Fluxo: qualquer ação do usuário altera o `state` e chama uma função de
   renderização, que redesenha a tela.
   ========================================================================== */

// Fotos de exemplo. `dias` = quantos dias atrás foi tirada (0 = hoje).
// `img` é o arquivo dentro de images/ (caminho relativo a pages/gallery.html).
// `cor` são as duas cores do gradiente usado enquanto a imagem carrega
// ou se o arquivo não existir.
const MOCK_FOTOS = [
  { id: 'm1', img: '../images/comida-1.jpg',    cor: ['#f59e0b', '#7c2d12'], modo: 'Foto',    contexto: 'Comida',   preset: 'Comida',   score: 94, dias: 0 },
  { id: 'm2', img: '../images/paisagem-1.jpg',  cor: ['#22c55e', '#0c4a6e'], modo: 'Foto',    contexto: 'Paisagem', preset: 'Paisagem', score: 91, dias: 0 },
  { id: 'm3', img: '../images/noite-1.jpg',     cor: ['#1e1b4b', '#6d28d9'], modo: 'Noite',   contexto: 'Noturno',  preset: 'Noite',    score: 78, dias: 1 },
  { id: 'm4', img: '../images/retrato-1.jpg',   cor: ['#f472b6', '#831843'], modo: 'Retrato', contexto: 'Pessoas',  preset: 'Retrato',  score: 88, dias: 1 },
  { id: 'm5', img: '../images/paisagem-2.jpg',  cor: ['#38bdf8', '#1e3a8a'], modo: 'Foto',    contexto: 'Paisagem', preset: 'Paisagem', score: 96, dias: 2 },
  { id: 'm6', img: '../images/comida-2.jpg',    cor: ['#fb923c', '#7f1d1d'], modo: 'Foto',    contexto: 'Comida',   preset: 'Comida',   score: 62, dias: 0 },
  { id: 'm7', img: '../images/noite-2.jpg',     cor: ['#0f172a', '#4c1d95'], modo: 'Noite',   contexto: 'Noturno',  preset: 'Noite',    score: 55, dias: 1 },
  { id: 'm8', img: '../images/retrato-2.jpg',   cor: ['#fde68a', '#b45309'], modo: 'Retrato', contexto: 'Pessoas',  preset: 'Retrato',  score: 84, dias: 5 },
  { id: 'm9', img: '../images/paisagem-3.jpg',  cor: ['#4ade80', '#14532d'], modo: 'Foto',    contexto: 'Paisagem', preset: 'Paisagem', score: 73, dias: 2 },
];

// Nota mínima para uma foto contar como "melhor" (filtro Melhores e selo ★)
const SCORE_MELHOR = 85;

// Estado único da tela. Tudo que aparece é desenhado a partir daqui.
const state = {
  fotos: [],            // lista completa de fotos
  aba: 'fotos',         // 'fotos' | 'albuns'
  filtro: 'Todas',      // 'Todas' | 'Melhores' | nome de um contexto (álbum)
  ordem: 'recentes',    // 'recentes' | 'score'
  busca: '',            // texto da caixa de busca
  abertaId: null,       // id da foto aberta no visualizador (null = fechado)
};

// Atalhos: pegar elemento por id e escrever "1 foto" / "2 fotos"
const $ = (id) => document.getElementById(id);
const plural = (n, s) => `${n} ${s}${n === 1 ? '' : 's'}`;

// Transforma os dados de exemplo em fotos completas (com data e detalhes)
function carregarFotos() {
  return MOCK_FOTOS.map((m) => ({
    ...m,
    data: new Date(Date.now() - m.dias * 86400000).toISOString(),
    detalhes: JoviScore.detalhesSimulados(m.score, m.id),
  }));
}

// Testa cada arquivo de images/. Se existir, passa a usar a foto (`src`) e redesenha;
// se não existir, a foto continua com o gradiente, sem erro visível.
function carregarImagens() {
  state.fotos.forEach((foto) => {
    if (!foto.img) return;
    const teste = new Image();
    teste.onload = () => {
      foto.src = foto.img;
      render();
      // Se o visualizador estiver aberto nessa foto, atualiza a imagem dele também
      if (state.abertaId === foto.id) $('viewer-img').style.backgroundImage = fundo(foto);
    };
    teste.src = foto.img;
  });
}

// Valor de `background-image` da foto: imagem real (src) ou o gradiente de exemplo
function fundo(foto) {
  if (foto.src) return `url("${foto.src}")`;
  const [a, b] = foto.cor || ['#525252', '#171717'];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

// Só a data (AAAA-MM-DD) de uma foto, usada para agrupar por dia
function dia(foto) {
  return foto.data.slice(0, 10);
}

// Título de cada grupo do grid: "Hoje", "Ontem" ou "seg., 12 de set."
function rotuloDia(iso) {
  const hoje = new Date().toISOString().slice(0, 10);
  const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (iso === hoje) return 'Hoje';
  if (iso === ontem) return 'Ontem';
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

// Sequência: fotos do mesmo contexto no mesmo dia. A de maior score é a "melhor".
function melhorDaSequencia(foto) {
  const irmas = state.fotos.filter((f) => f.contexto === foto.contexto && dia(f) === dia(foto));
  const melhor = irmas.reduce((a, b) => (b.score > a.score ? b : a), irmas[0]);
  return { total: irmas.length, melhor };
}

// Aplica filtro (Todas/Melhores/álbum), busca e ordenação sobre a lista completa
function fotosFiltradas() {
  const q = state.busca.trim().toLowerCase();
  const lista = state.fotos.filter((f) => {
    if (state.filtro === 'Melhores' && f.score < SCORE_MELHOR) return false;
    if (state.filtro !== 'Todas' && state.filtro !== 'Melhores' && f.contexto !== state.filtro) return false;
    if (q && !`${f.preset} ${f.contexto} ${f.modo}`.toLowerCase().includes(q)) return false;
    return true;
  });
  return lista.sort((a, b) =>
    state.ordem === 'score' ? b.score - a.score : new Date(b.data) - new Date(a.data)
  );
}

/* ---------- Renderização ---------- */

// Destaca a aba ativa (Fotos/Álbuns) e mostra só a seção correspondente
function renderAbas() {
  document.querySelectorAll('.tab').forEach((t) => {
    const ativa = t.dataset.aba === state.aba;
    t.classList.toggle('border-amber-400', ativa);
    t.classList.toggle('text-white', ativa);
    t.classList.toggle('border-transparent', !ativa);
    t.classList.toggle('text-neutral-400', !ativa);
  });
  $('view-fotos').classList.toggle('hidden', state.aba !== 'fotos');
  $('view-albuns').classList.toggle('hidden', state.aba !== 'albuns');
}

function renderFiltros() {
  $('filters').innerHTML = ['Todas', 'Melhores'].map((f) => {
    const ativo = f === state.filtro;
    return `<button data-filtro="${f}" class="px-4 py-1.5 rounded-full text-sm transition ${
      ativo ? 'bg-white text-black font-medium' : 'bg-neutral-900 text-neutral-300'
    }">${f}</button>`;
  }).join('');
}

// Título e descrição do filtro ativo (acima do grid)
function renderTituloFiltro(qtd) {
  const bar = $('filter-bar');
  if (state.filtro === 'Todas') { bar.classList.add('hidden'); return; }

  if (state.filtro === 'Melhores') {
    $('filter-title').textContent = 'Melhores fotos';
    $('filter-desc').textContent = `${plural(qtd, 'foto')} com score ${SCORE_MELHOR} ou mais`;
  } else {
    $('filter-title').textContent = `Álbum · ${state.filtro}`;
    $('filter-desc').textContent = plural(qtd, 'foto');
  }
  bar.classList.remove('hidden');
}

// HTML de uma miniatura do grid. Mostra ★ nota (se for boa) e o selo de melhor da sequência
function tile(f) {
  const { total, melhor } = melhorDaSequencia(f);
  const ehMelhor = total > 1 && melhor.id === f.id;
  return `
    <button data-id="${f.id}" class="relative aspect-square bg-cover bg-center active:opacity-75 transition"
            style="background-image:${fundo(f)}" aria-label="Abrir foto ${f.preset}">
      ${f.score >= SCORE_MELHOR ? `<span class="tile-label absolute bottom-1 left-1.5 text-[11px] font-medium">★ ${f.score}</span>` : ''}
      ${ehMelhor ? `<span class="absolute top-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px]">Melhor da sequência</span>` : ''}
    </button>`;
}

// Redesenha o grid. Por data: agrupa em seções ("Hoje", "Ontem"...).
// Por score: uma seção só, da maior nota para a menor.
function renderGrid() {
  const lista = fotosFiltradas();
  $('photo-count').textContent = plural(lista.length, 'foto');
  $('empty').classList.toggle('hidden', lista.length > 0);
  renderTituloFiltro(lista.length);

  if (state.ordem === 'score') {
    $('grid').innerHTML = `
      <h3 class="px-4 pt-4 pb-2 text-sm font-medium text-neutral-300">Maior score primeiro</h3>
      <div class="grid grid-cols-3 gap-0.5">${lista.map(tile).join('')}</div>`;
  } else {
    const grupos = {};
    lista.forEach((f) => { (grupos[dia(f)] ||= []).push(f); });
    $('grid').innerHTML = Object.entries(grupos).map(([d, fotos]) => `
      <h3 class="px-4 pt-4 pb-2 text-sm font-medium text-neutral-300 capitalize">${rotuloDia(d)}</h3>
      <div class="grid grid-cols-3 gap-0.5">${fotos.map(tile).join('')}</div>`).join('');
  }

  renderFiltros();
  lucide.createIcons();
}

// Álbuns automáticos: um por contexto detectado
function renderAlbuns() {
  const grupos = {};
  state.fotos.forEach((f) => { (grupos[f.contexto] ||= []).push(f); });

  $('albums').innerHTML = Object.entries(grupos).map(([ctx, fotos]) => {
    const capa = fotos.reduce((a, b) => (b.score > a.score ? b : a), fotos[0]);
    return `
      <button data-album="${ctx}" class="text-left active:opacity-75 transition">
        <span class="block aspect-square rounded-xl bg-cover bg-center" style="background-image:${fundo(capa)}"></span>
        <span class="block mt-2 text-sm font-medium">${ctx}</span>
        <span class="block text-xs text-neutral-400">${plural(fotos.length, 'foto')}</span>
      </button>`;
  }).join('');
}

function render() {
  renderAbas();
  renderAlbuns();
  renderGrid();
}

/* ---------- Visualizador ---------- */

// Dica do Cam Assist (simulada). A primeira regra que se aplicar é a mostrada.
function dica(f, seq) {
  if (seq.total > 1 && seq.melhor.id !== f.id) {
    return `Você tirou ${seq.total} fotos de ${f.contexto} nesse dia. A melhor tem score ${seq.melhor.score}.`;
  }
  const { luz, nitidez } = f.detalhes;
  if (f.contexto === 'Noturno' && luz < 65) return 'Pouca luz detectada. Use o modo Noite e mantenha o aparelho firme.';
  if (nitidez < 60) return 'Nitidez baixa. Estabilize o aparelho ou toque para focar antes de capturar.';
  if (luz < 60) return 'Iluminação fraca. Ative o HDR ou busque mais luz.';
  if (f.score >= SCORE_MELHOR) return 'Ótima composição e iluminação. Está entre as suas melhores fotos.';
  return `Boa foto. O preset "${f.preset}" combina com esse contexto.`;
}

// Preenche uma barra de detalhe (largura em %) e o número ao lado dela
function barra(id, valor) {
  $(id).style.width = `${valor}%`;
  $(id + '-val').textContent = valor;
}

// Abre o visualizador com os dados da foto. O botão "melhor da sequência"
// só aparece quando existe outra foto parecida com nota maior.
function abrirFoto(id) {
  const f = state.fotos.find((x) => x.id === id);
  if (!f) return;
  state.abertaId = id;
  const seq = melhorDaSequencia(f);

  $('viewer-img').style.backgroundImage = fundo(f);
  $('viewer-preset').textContent = `Preset ${f.preset}`;
  $('viewer-context').textContent = `${f.modo} · ${f.contexto}`;
  $('viewer-score').textContent = f.score;
  $('viewer-date').textContent = new Date(f.data).toLocaleDateString('pt-BR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  barra('bar-luz', f.detalhes.luz);
  barra('bar-nitidez', f.detalhes.nitidez);
  barra('bar-comp', f.detalhes.composicao);
  $('viewer-tip').textContent = dica(f, seq);

  const outra = seq.total > 1 && seq.melhor.id !== f.id;
  $('viewer-best').classList.toggle('hidden', !outra);
  $('viewer-best').dataset.id = outra ? seq.melhor.id : '';

  $('viewer').classList.remove('hidden');
}

function fecharFoto() {
  $('viewer').classList.add('hidden');
  state.abertaId = null;
}

function excluirFoto() {
  if (!state.abertaId) return;
  state.fotos = state.fotos.filter((f) => f.id !== state.abertaId);
  fecharFoto();
  render();
}

/* ---------- Avisos ---------- */

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3000);
}

/* ---------- Eventos ---------- */

// Liga os eventos. Usamos "delegação": um único listener no container
// (grid, filtros, álbuns) em vez de um por botão, pois os botões são recriados a cada render.
function init() {
  state.fotos = carregarFotos();

  document.querySelector('header').addEventListener('click', (e) => {
    const aba = e.target.closest('[data-aba]');
    if (aba) { state.aba = aba.dataset.aba; renderAbas(); }
  });

  $('filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filtro]');
    if (b) { state.filtro = b.dataset.filtro; renderGrid(); }
  });

  $('filter-clear').addEventListener('click', () => {
    state.filtro = 'Todas';
    renderGrid();
  });

  $('albums').addEventListener('click', (e) => {
    const b = e.target.closest('[data-album]');
    if (!b) return;
    state.filtro = b.dataset.album;
    state.aba = 'fotos';
    renderAbas();
    renderGrid();
    window.scrollTo(0, 0);
  });

  $('grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) abrirFoto(b.dataset.id);
  });

  $('search').addEventListener('input', (e) => {
    state.busca = e.target.value;
    if (state.busca && state.aba !== 'fotos') { state.aba = 'fotos'; renderAbas(); }
    renderGrid();
  });

  $('btn-sort').addEventListener('click', () => {
    state.ordem = state.ordem === 'recentes' ? 'score' : 'recentes';
    toast(state.ordem === 'score' ? 'Ordenado por score' : 'Ordenado por data');
    renderGrid();
  });

  $('viewer-close').addEventListener('click', fecharFoto);
  $('viewer-delete').addEventListener('click', excluirFoto);
  $('viewer-best').addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.id;
    if (id) abrirFoto(id);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharFoto(); });

  render();
  carregarImagens();
}

init();
