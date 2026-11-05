// Historico do contato no comercial: as mensagens podem vir de varias conversas
// (cada numero e uma) e de varias filas (cada vendedor tem a sua). Aqui fica onde
// marcar a troca de atendimento e o texto da marca.

// indices das mensagens que comecam outro atendimento. Mensagem sem fila (antes do
// primeiro atendente) nao conta como troca. Sem nenhuma troca: conjunto vazio, a
// conversa fica igual a de sempre, sem marca nenhuma.
export const indicesDeTroca = mensagens => {
  const trocas = [];
  let conversaAtual = null;
  let filaAtual = null;

  mensagens.forEach((mensagem, indice) => {
    const outraConversa = indice > 0 && mensagem.ticketId !== conversaAtual;
    const outraFila =
      !outraConversa &&
      indice > 0 &&
      !!mensagem.queueId &&
      !!filaAtual &&
      mensagem.queueId !== filaAtual;

    if (outraConversa || outraFila) trocas.push(indice);
    if (outraConversa) filaAtual = null;
    conversaAtual = mensagem.ticketId;
    filaAtual = mensagem.queueId || filaAtual;
  });

  return new Set(trocas.length ? [0, ...trocas] : []);
};

// O numero guardado e o atual da conversa: se ela mudou de fila depois desta
// mensagem, ele pode nao ser o numero daquela hora. Nesse caso, mostra so a fila.
export const rotuloDaTroca = mensagem => {
  const fila = mensagem.queue?.name;
  const numero =
    mensagem.ticket?.queueId === mensagem.queueId
      ? mensagem.ticket?.whatsapp?.name
      : null;
  const partes = [fila, numero].filter(Boolean);
  return partes.length
    ? `Atendimento: ${partes.join(" · ")}`
    : "Atendimento anterior";
};

export const ehDeOutraConversa = (mensagem, conversaAberta) =>
  Number(mensagem.ticketId) !== Number(conversaAberta);
