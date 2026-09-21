/* ==========================================================================
   JOVI SHELL
   Só para telas largas (computador): monta dois painéis ao lado do "celular"
   com informações sobre o projeto e o estado do app ao vivo. Em telas
   pequenas os painéis ficam escondidos pelo CSS e o app ocupa a tela inteira.

   Os números vêm do JoviStore (a mesma memória usada pelas três telas), então
   mudam sozinhos quando você tira uma foto, liga um preset ou o Cam Assist aprende.
   ========================================================================== */

(() => {
  const dispositivo = document.querySelector('.device');
  if (!dispositivo) return;

  const dentroDePages = location.pathname.includes('/pages/');
  const ROTAS = [
    { id: 'camera', nome: 'Câmera', desc: 'Cam Assist em ação', icone: 'camera', href: dentroDePages ? '../index.html' : 'index.html' },
    { id: 'galeria', nome: 'Galeria', desc: 'Fotos, score e edição com IA', icone: 'images', href: dentroDePages ? 'gallery.html' : 'pages/gallery.html' },
    { id: 'modes', nome: 'JOVI Modes', desc: 'Presets e Context Mode', icone: 'layers', href: dentroDePages ? 'modes.html' : 'pages/modes.html' },
  ];
  const atual = location.pathname.includes('gallery') ? 'galeria'
    : location.pathname.includes('modes') ? 'modes' : 'camera';

  const DICAS = {
    camera: [
      ['mountain', 'Botão de cena', 'troca a foto de exemplo e a IA reage.'],
      ['camera', 'Usar minha câmera', 'liga a webcam em modo demonstração.'],
      ['sparkles', 'Aplicar / Sempre', 'o Cam Assist aprende com o que você aceita.'],
    ],
    galeria: [
      ['chevron-right', 'Setas do teclado', '← e → passam de foto.'],
      ['sparkles', 'Editar com IA', 'auto-melhora e filtros na própria foto.'],
      ['eye', 'Comparar', 'segure o botão para ver a original.'],
    ],
    modes: [
      ['layers', 'Presets', 'ative, edite ou crie o seu.'],
      ['sparkles', 'Context Mode', 'liga a troca automática na câmera.'],
      ['clock', 'Gatilhos', 'local, horário e luz decidem o preset.'],
    ],
  };

  const ico = (n, cls = 'w-4 h-4') => `<i data-lucide="${n}" class="${cls}"></i>`;

  const esquerda = `
    <aside class="side" aria-label="Sobre o projeto">
      <div class="side-card">
        <p class="text-xs" style="color:#a78bfa;font-weight:600;letter-spacing:.12em">CHALLENGE FIAP</p>
        <h1 class="side-brand mt-2">JOVI <span>Cam Assist</span></h1>
        <p class="mt-3">A câmera que entende o que você fotografa e sugere o melhor ajuste em um toque. Protótipo de demonstração, sem envio de imagens para servidor.</p>
      </div>
      <div class="side-card">
        <h2>Navegar</h2>
        ${ROTAS.map((r) => `
          <a href="${r.href}" class="side-row side-link ${r.id === atual ? 'atual' : ''}">
            <span class="side-ico">${ico(r.icone)}</span>
            <span><strong style="display:block;font-weight:600;color:#fff">${r.nome}</strong><span style="font-size:.75rem;color:#8a8a8a">${r.desc}</span></span>
          </a>`).join('')}
      </div>
    </aside>`;

  const direita = `
    <aside class="side" aria-label="Estado do app">
      <div class="side-card">
        <h2>Ao vivo</h2>
        <div class="side-stats">
          <div class="side-stat"><span class="side-num" id="sh-fotos">0</span><small>fotos tiradas</small></div>
          <div class="side-stat"><span class="side-num" id="sh-presets">0</span><small>presets ativos</small></div>
          <div class="side-stat"><span class="side-num" id="sh-auto">0</span><small>sugestões automáticas</small></div>
          <div class="side-stat"><span class="side-num" id="sh-ctx" style="font-size:1.1rem;padding-top:5px">-</span><small>Context Mode</small></div>
        </div>
      </div>
      <div class="side-card">
        <h2>Dicas de uso</h2>
        ${DICAS[atual].map(([i, t, d]) => `
          <div class="side-row" style="align-items:flex-start">
            <span class="side-ico">${ico(i)}</span>
            <span><strong style="font-weight:600;color:#fff">${t}</strong><br><span style="font-size:.78rem;color:#8a8a8a">${d}</span></span>
          </div>`).join('')}
      </div>
      <p style="padding:0 6px;font-size:.72rem">Equipe 1TDS · Enzo, Deivid, Gabriel e Daniel</p>
    </aside>`;

  const casca = document.createElement('div');
  casca.className = 'shell';
  dispositivo.parentNode.insertBefore(casca, dispositivo);
  casca.insertAdjacentHTML('beforeend', esquerda);
  casca.appendChild(dispositivo);
  casca.insertAdjacentHTML('beforeend', direita);

  const $ = (id) => document.getElementById(id);
  function atualizar() {
    if (typeof JoviStore === 'undefined') return;
    const capturas = JoviStore.lerCapturas().length;
    const presets = JoviStore.carregarPresets().filter((p) => p.ativo).length;
    const apr = JoviStore.carregarAprendizado();
    const auto = Object.values(apr).filter((a) => a && a.auto).length;
    const ctx = JoviStore.carregarContexto();
    const set = (id, v) => { const el = $(id); if (el && el.textContent !== String(v)) el.textContent = v; };
    set('sh-fotos', capturas);
    set('sh-presets', presets);
    set('sh-auto', auto);
    set('sh-ctx', ctx ? 'Ligado' : 'Desligado');
    const c = $('sh-ctx');
    if (c) c.style.color = ctx ? '#34d399' : '#a3a3a3';
  }
  // Janela menor que o "celular" (880 px de altura)? Encolhe o conjunto todo, sem quebrar o layout.
  const ALTURA = 880, LARGURA = 430;
  function ajustarTamanho() {
    const largo = window.innerWidth >= 768;
    const escala = largo
      ? Math.min(1, (window.innerHeight - 24) / ALTURA, (window.innerWidth - 24) / LARGURA)
      : 1;
    casca.querySelectorAll('.device, .side').forEach((el) => { el.style.zoom = escala < 1 ? String(escala) : ''; });
  }
  ajustarTamanho();
  window.addEventListener('resize', ajustarTamanho);

  atualizar();
  setInterval(atualizar, 1200);
  window.addEventListener('storage', atualizar);
  if (window.JoviIcons) JoviIcons.render();
})();
