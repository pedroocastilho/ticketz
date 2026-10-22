import { URLCharEncoder } from "../../helpers/URLCharEncoder";

// Funcoes puras das conversas lidas pelo cerebro dos Diamond Agentes (nota do
// lead, resumo). Recebem as linhas ja buscadas no banco e montam a resposta,
// sem tocar no banco (ver ConversasCrmService).

// marcador invisivel que o Ticketz poe no comeco das mensagens de bot
// (saudacao, fora do expediente, chatbot)
const MARCADOR_AUTOMATICA = "‎";

export const ehMensagemAutomatica = (
  body: string | null | undefined
): boolean => typeof body === "string" && body.startsWith(MARCADOR_AUTOMATICA);

// mesmo resultado do getter mediaUrl do model Message: link absoluto; arquivo
// local vira BACKEND_URL/public/<nome codificado>
export const mediaUrlAbsoluta = (
  valor: string | null | undefined,
  backendUrl: string | undefined = process.env.BACKEND_URL
): string | null => {
  if (!valor) return null;
  return /^https?:\/\//.test(valor)
    ? URLCharEncoder(valor)
    : `${backendUrl}/public/${URLCharEncoder(valor)}`;
};

// le o limite da query: vazio = padrao, acima do maximo = maximo, invalido =
// null (o controller responde 400)
export const lerLimite = (
  valor: unknown,
  padrao: number,
  maximo: number
): number | null => {
  if (valor === undefined || valor === "") return padrao;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1) return null;
  return Math.min(n, maximo);
};

// ---------- conversas com atividade ----------

// uma linha por ticket com mensagem depois de "desde"
export type LinhaTicketAtividade = {
  ticketId: number;
  ticketUuid: string;
  contactId: number;
  nome: string | null;
  numero: string | null;
  whatsappId: number;
  whatsappNome: string | null;
  userId: number | null;
  userNome: string | null;
  ultimaMensagemEm: Date;
  // a ultima mensagem do ticket foi nossa
  ultimaFromMe: boolean;
  // mensagens do ticket depois de "desde"
  novas: number;
};

export type ContatoComAtividade = {
  contactId: number;
  nome: string | null;
  numero: string | null;
  ticketId: number;
  ticketUuid: string;
  whatsappId: number;
  whatsappNome: string | null;
  userId: number | null;
  userNome: string | null;
  ultimaMensagemEm: string;
  ultimaDoCliente: boolean;
  novas: number;
};

// Junta os tickets por contato: os dados do ticket vem do que teve a mensagem
// mais recente, "novas" soma todos os tickets do contato. Saida em ordem de
// ultima mensagem (mais antiga primeiro), empate pelo contactId.
export const agruparPorContato = (
  linhas: LinhaTicketAtividade[]
): ContatoComAtividade[] => {
  const porContato = new Map<
    number,
    { maisRecente: LinhaTicketAtividade; novas: number }
  >();

  linhas.forEach(linha => {
    const atual = porContato.get(linha.contactId);
    if (!atual) {
      porContato.set(linha.contactId, {
        maisRecente: linha,
        novas: linha.novas
      });
      return;
    }
    atual.novas += linha.novas;
    const t = linha.ultimaMensagemEm.getTime();
    const tAtual = atual.maisRecente.ultimaMensagemEm.getTime();
    // empate de horario: fica o ticket mais novo (id maior)
    if (
      t > tAtual ||
      (t === tAtual && linha.ticketId > atual.maisRecente.ticketId)
    ) {
      atual.maisRecente = linha;
    }
  });

  return [...porContato.values()]
    .sort(
      (a, b) =>
        a.maisRecente.ultimaMensagemEm.getTime() -
          b.maisRecente.ultimaMensagemEm.getTime() ||
        a.maisRecente.contactId - b.maisRecente.contactId
    )
    .map(({ maisRecente: m, novas }) => ({
      contactId: m.contactId,
      nome: m.nome,
      numero: m.numero,
      ticketId: m.ticketId,
      ticketUuid: m.ticketUuid,
      whatsappId: m.whatsappId,
      whatsappNome: m.whatsappNome,
      userId: m.userId ?? null,
      userNome: m.userNome ?? null,
      ultimaMensagemEm: m.ultimaMensagemEm.toISOString(),
      ultimaDoCliente: !m.ultimaFromMe,
      novas
    }));
};

// Corta a lista (ja ordenada) no limite. proximoCursor = ultimaMensagemEm do
// ultimo contato devolvido quando houve corte, senao null; o chamador usa
// como o proximo "desde" (exclusivo).
// Para o corte nao perder ninguem, contatos empatados no mesmo horario nunca
// ficam metade em cada pagina: os empatados com o primeiro que ficou de fora
// saem desta pagina e vem na proxima. Se a pagina inteira for de um horario
// so, vao todos os empatados (passa do limite) para o cursor andar.
export const paginarContatos = (
  contatos: ContatoComAtividade[],
  limite: number
): { contatos: ContatoComAtividade[]; proximoCursor: string | null } => {
  if (contatos.length <= limite) {
    return { contatos, proximoCursor: null };
  }

  const horarioDoCorte = contatos[limite].ultimaMensagemEm;
  let fim = limite;
  while (fim > 0 && contatos[fim - 1].ultimaMensagemEm === horarioDoCorte) {
    fim -= 1;
  }
  if (fim === 0) {
    fim = limite;
    while (
      fim < contatos.length &&
      contatos[fim].ultimaMensagemEm === horarioDoCorte
    ) {
      fim += 1;
    }
  }

  const pagina = contatos.slice(0, fim);
  return {
    contatos: pagina,
    proximoCursor:
      fim < contatos.length ? pagina[pagina.length - 1].ultimaMensagemEm : null
  };
};

// ---------- historico de um contato ----------

export type LinhaMensagemHistorico = {
  id: string;
  fromMe: boolean;
  body: string | null;
  mediaType: string | null;
  mediaUrl: string | null;
  createdAt: Date;
  ticketId: number;
  whatsappId: number | null;
};

export type MensagemHistorico = {
  id: string;
  fromMe: boolean;
  body: string | null;
  mediaType: string | null;
  mediaUrl: string | null;
  createdAt: string;
  ticketId: number;
  whatsappId: number | null;
  automatica: boolean;
};

// Fica com as "limite" mensagens mais recentes, devolvidas em ordem de
// envio (mais antiga primeiro). truncado = havia mais antigas de fora.
// Aceita as linhas em qualquer ordem; empate de horario desempata pelo id.
export const selecionarMaisRecentes = <
  T extends { id: string; createdAt: Date }
>(
  linhas: T[],
  limite: number
): { itens: T[]; truncado: boolean } => {
  const ordenadas = [...linhas].sort(
    (a, b) =>
      a.createdAt.getTime() - b.createdAt.getTime() ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
  const truncado = ordenadas.length > limite;
  return {
    itens: truncado ? ordenadas.slice(ordenadas.length - limite) : ordenadas,
    truncado
  };
};

export const montarMensagemHistorico = (
  linha: LinhaMensagemHistorico,
  backendUrl: string | undefined = process.env.BACKEND_URL
): MensagemHistorico => ({
  id: linha.id,
  fromMe: !!linha.fromMe,
  body: linha.body ?? null,
  mediaType: linha.mediaType ?? null,
  mediaUrl: mediaUrlAbsoluta(linha.mediaUrl, backendUrl),
  createdAt: new Date(linha.createdAt).toISOString(),
  ticketId: linha.ticketId,
  whatsappId: linha.whatsappId ?? null,
  automatica: ehMensagemAutomatica(linha.body)
});
