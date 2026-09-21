/* ==========================================================================
   JOVI STORE
   Memória compartilhada entre as três telas (Câmera, Galeria e Modes).
   Usa o localStorage do navegador: é o "banco de dados" do simulador.

   O que fica guardado (e a entidade do MER que cada item representa):
   - presets      -> PRESET (mais usos/ultimoUso, que vêm de HISTORICO_USO_PRESET)
   - contexto     -> chave geral "Context Mode" (liga/desliga o JOVI Modes)
   - aprendizado  -> o que o Cam Assist aprendeu com aceitar/ignorar sugestões
                     (base de SUGESTAO_USO)
   - capturas     -> FOTO + SCORE_FOTO (fotos tiradas na câmera, com score de IA)

   Toda leitura e escrita é protegida por try/catch: se o navegador bloquear o
   armazenamento (janela anônima, cota cheia), o app continua funcionando, só
   não lembra entre uma página e outra.
   ========================================================================== */

const JoviStore = (() => {
  const CHAVES = {
    presets: 'jovi.presets',
    contexto: 'jovi.contextoAtivo',
    aprendizado: 'jovi.aprendizado',
    capturas: 'jovi.capturas',
    camera: 'jovi.camera',
  };

  const MAX_CAPTURAS = 12; // fotos com miniatura embutida pesam; guardamos só as últimas

  function ler(chave, padrao) {
    try {
      const bruto = localStorage.getItem(chave);
      return bruto === null ? padrao : JSON.parse(bruto);
    } catch (e) {
      return padrao;
    }
  }

  function gravar(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
      return true;
    } catch (e) {
      return false;
    }
  }

  const clonar = (o) => JSON.parse(JSON.stringify(o));

  // Presets de exemplo. Novos presets criados no Modes entram no início da lista.
  const PRESETS_PADRAO = [
    {
      id: 'p1', nome: 'Comida', contexto: 'Comida', ativo: true, usos: 24, ultimoUso: 0,
      gatilhos: {
        local: { ativo: true, texto: 'Restaurantes' },
        horario: { ativo: true, de: '11:30', ate: '14:30' },
        luz: { ativo: false, nivel: 'media' },
      },
      ajustes: { exposicao: 0.5, saturacao: 70, contraste: 55 },
    },
    {
      id: 'p2', nome: 'Paisagem', contexto: 'Paisagem', ativo: true, usos: 17, ultimoUso: 1,
      gatilhos: {
        local: { ativo: true, texto: 'Parques e praias' },
        horario: { ativo: false, de: '06:00', ate: '09:00' },
        luz: { ativo: true, nivel: 'alta' },
      },
      ajustes: { exposicao: -0.5, saturacao: 65, contraste: 60 },
    },
    {
      id: 'p3', nome: 'Noite', contexto: 'Noite', ativo: true, usos: 9, ultimoUso: 3,
      gatilhos: {
        local: { ativo: false, texto: '' },
        horario: { ativo: true, de: '19:00', ate: '05:00' },
        luz: { ativo: true, nivel: 'baixa' },
      },
      ajustes: { exposicao: 1, saturacao: 45, contraste: 50 },
    },
    {
      id: 'p4', nome: 'Retrato', contexto: 'Retrato', ativo: false, usos: 5, ultimoUso: 8,
      gatilhos: {
        local: { ativo: false, texto: '' },
        horario: { ativo: false, de: '08:00', ate: '18:00' },
        luz: { ativo: false, nivel: 'media' },
      },
      ajustes: { exposicao: 0, saturacao: 50, contraste: 45 },
    },
  ];

  return {
    /* ---------- Presets e Context Mode ---------- */
    carregarPresets: () => ler(CHAVES.presets, clonar(PRESETS_PADRAO)),
    salvarPresets: (lista) => gravar(CHAVES.presets, lista),
    carregarContexto: () => ler(CHAVES.contexto, true),
    salvarContexto: (ligado) => gravar(CHAVES.contexto, !!ligado),

    // Registra um uso do preset (entra em HISTORICO_USO_PRESET): soma 1 uso e marca "hoje"
    registrarUsoPreset(id) {
      const lista = this.carregarPresets();
      const p = lista.find((x) => x.id === id);
      if (!p) return;
      p.usos = (p.usos || 0) + 1;
      p.ultimoUso = 0;
      this.salvarPresets(lista);
    },

    /* ---------- Aprendizado do Cam Assist ---------- */
    // { Paisagem: { aceitou, ignorou, seqAceitou, seqIgnorou, auto, silenciado }, ... }
    carregarAprendizado: () => ler(CHAVES.aprendizado, {}),
    salvarAprendizado: (obj) => gravar(CHAVES.aprendizado, obj),
    zerarAprendizado() {
      try { localStorage.removeItem(CHAVES.aprendizado); } catch (e) { /* sem armazenamento */ }
    },

    /* ---------- Fotos tiradas na câmera ---------- */
    lerCapturas: () => ler(CHAVES.capturas, []),
    adicionarCaptura(captura) {
      const lista = ler(CHAVES.capturas, []);
      lista.unshift(captura);
      lista.length = Math.min(lista.length, MAX_CAPTURAS);
      // Se a cota estourar, tenta de novo com menos fotos
      while (!gravar(CHAVES.capturas, lista) && lista.length > 1) lista.pop();
    },
    removerCaptura(id) {
      gravar(CHAVES.capturas, ler(CHAVES.capturas, []).filter((c) => c.id !== id));
    },

    /* ---------- Preferência de câmera ('demo' | 'real') ---------- */
    carregarCamera: () => ler(CHAVES.camera, 'demo'),
    salvarCamera: (valor) => gravar(CHAVES.camera, valor),
  };
})();
