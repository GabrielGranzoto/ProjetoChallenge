/* ==========================================================================
   JOVI SCORE — simulador do Cam Assist para a galeria
   Gera as notas de luz, nitidez e composição das fotos de exemplo a partir
   do score geral. Não há análise real de imagem.
   ========================================================================== */

const JoviScore = (() => {
  const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));

  // Detalhes simulados e estáveis (sempre iguais para o mesmo id).
  // O `id` gera uma pequena variação (-4 a +4) em torno do score geral, para as
  // três barras não ficarem idênticas. Sem Math.random, o valor não muda a cada abertura.
  function detalhesSimulados(score, id) {
    let h = 0;
    for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 17;
    const v = (h % 9) - 4;
    return {
      luz: clamp(score + v),
      nitidez: clamp(score - v),
      composicao: clamp(Math.round(score + v * 0.5)),
    };
  }

  return { detalhesSimulados };
})();
