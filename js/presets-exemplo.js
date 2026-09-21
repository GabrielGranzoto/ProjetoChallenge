/* ==========================================================================
   PRESETS DE EXEMPLO — usados pela câmera (index.html) e por pages/modes.html
   Ficam num arquivo só para as duas telas partirem da mesma lista. Sem isso, a câmera
   não conheceria os gatilhos dos presets antes de o usuário abrir o modes.html.

   Formato de um preset:
   { id, nome, contexto, ativo, usos, ultimoUso (dias atrás ou null),
     gatilhos: { local: {ativo, texto}, horario: {ativo, de, ate}, luz: {ativo, nivel} },
     ajustes:  { exposicao, saturacao, contraste } }
   ========================================================================== */

const PRESETS_EXEMPLO = [
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
