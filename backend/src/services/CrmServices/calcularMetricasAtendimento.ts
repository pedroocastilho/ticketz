import { DateTime } from "luxon";
import { OpenHoursData } from "../../helpers/checkOpenHours";
import { businessSecondsBetween } from "../../helpers/businessSeconds";

// Metricas de atendimento por conexao (= numero do vendedor) e por dia, para
// os paineis do CRM. Funcao pura: recebe as mensagens ja buscadas e devolve os
// numeros, sem tocar no banco.
//
// Regras:
//   - "espera" comeca na mensagem do cliente que chega quando nao havia espera
//     aberta e termina na proxima resposta humana do vendedor. O tempo conta
//     so dentro do horario de atendimento (businessSecondsBetween);
//   - mensagem nossa automatica (saudacao, fora do expediente, chatbot) nao e
//     resposta: tem o marcador invisivel do Ticketz ou sai poucos segundos
//     depois da do cliente, rapido demais para ser gente;
//   - cada espera, conversa e mensagem conta no dia em que comecou (fuso do
//     horario de atendimento). Resposta no dia seguinte ainda conta como
//     respondida no dia em que o cliente escreveu;
//   - "atendimento" (2026-10-29, painel do comercial): em cada conversa e dia
//     em que o cliente escreveu e o vendedor respondeu (humano), o tempo da
//     primeira a ultima dessas mensagens do dia, so dentro do horario.

export type MensagemMetrica = {
  ticketId: number;
  fromMe: boolean;
  createdAt: Date;
  // body comeca com o marcador invisivel das mensagens de bot (‎)
  automatica?: boolean;
};

export type TicketMetrica = {
  id: number;
  whatsappId: number;
  status: string;
  // primeira mensagem da conversa inteira (pode ser anterior ao periodo)
  primeiraMsgEm: Date;
};

export type EsperaAberta = {
  ticketId: number;
  desde: string;
  esperaSeg: number;
};

export type MetricaDia = {
  data: string;
  conexaoId: number;
  conversasRecebidas: number;
  conversasRespondidas: number;
  conversasSemResposta: number;
  conversasIniciadasVendedor: number;
  mensagensRecebidas: number;
  mensagensEnviadas: number;
  // primeira resposta = espera aberta pela mensagem que comecou a conversa
  primeiraRespostaQtd: number;
  primeiraRespostaSomaSeg: number;
  primeiraRespostaMediaSeg: number | null;
  // todas as esperas respondidas ao longo das conversas
  respostaQtd: number;
  respostaSomaSeg: number;
  respostaMediaSeg: number | null;
  // conversa x dia com cliente e vendedor: da primeira a ultima mensagem
  atendimentoQtd: number;
  atendimentoSomaSeg: number;
  atendimentoMediaSeg: number | null;
};

export type MetricaAgora = {
  conexaoId: number;
  aguardando: number;
  maiorEsperaSeg: number;
  esperas: EsperaAberta[];
};

export type ResultadoMetricas = {
  de: string;
  ate: string;
  geradoEm: string;
  dias: MetricaDia[];
  agora: MetricaAgora[];
};

type Opcoes = {
  de: string;
  ate: string;
  agora: Date;
  horario: OpenHoursData;
};

// resposta nossa mais rapida que isso depois do cliente e automatica
export const LIMITE_AUTOMATICA_MS = 10 * 1000;

// conversa sem resposta ha mais tempo que isso nao entra em "aguardando agora"
// (conversa abandonada nao e atraso do vendedor)
const JANELA_AGUARDANDO_MS = 7 * 24 * 60 * 60 * 1000;

// lista de espera aberta devolvida por conexao (as mais antigas primeiro)
const MAX_ESPERAS = 20;

const novaMetrica = (data: string, conexaoId: number): MetricaDia => ({
  data,
  conexaoId,
  conversasRecebidas: 0,
  conversasRespondidas: 0,
  conversasSemResposta: 0,
  conversasIniciadasVendedor: 0,
  mensagensRecebidas: 0,
  mensagensEnviadas: 0,
  primeiraRespostaQtd: 0,
  primeiraRespostaSomaSeg: 0,
  primeiraRespostaMediaSeg: null,
  respostaQtd: 0,
  respostaSomaSeg: 0,
  respostaMediaSeg: null,
  atendimentoQtd: 0,
  atendimentoSomaSeg: 0,
  atendimentoMediaSeg: null
});

const media = (soma: number, qtd: number): number | null =>
  qtd > 0 ? Math.round(soma / qtd) : null;

export function calcularMetricasAtendimento(
  mensagens: MensagemMetrica[],
  tickets: TicketMetrica[],
  { de, ate, agora, horario }: Opcoes
): ResultadoMetricas {
  const fuso = horario.timezone;
  const diaDe = (d: Date) => DateTime.fromJSDate(d).setZone(fuso).toISODate();
  const noPeriodo = (dia: string) => dia >= de && dia <= ate;

  const ticketPorId = new Map(tickets.map(t => [t.id, t]));
  const metricas = new Map<string, MetricaDia>();
  const metrica = (dia: string, conexaoId: number) => {
    const chave = `${dia}|${conexaoId}`;
    if (!metricas.has(chave)) {
      metricas.set(chave, novaMetrica(dia, conexaoId));
    }
    return metricas.get(chave);
  };

  // agrupa por conversa, em ordem de horario
  const porTicket = new Map<number, MensagemMetrica[]>();
  mensagens.forEach(m => {
    if (!ticketPorId.has(m.ticketId)) return;
    if (!porTicket.has(m.ticketId)) porTicket.set(m.ticketId, []);
    porTicket.get(m.ticketId).push(m);
  });

  const agoraPorConexao = new Map<number, MetricaAgora>();

  porTicket.forEach((lista, ticketId) => {
    const ticket = ticketPorId.get(ticketId);
    const conexaoId = ticket.whatsappId;
    lista.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    let esperaDesde: Date | null = null;
    let ultimaDoCliente: Date | null = null;
    // dia -> horario da primeira mensagem do cliente naquele dia
    const primeiraDoClienteNoDia = new Map<string, Date>();
    const respostasHumanas: Date[] = [];
    // dia -> primeira e ultima mensagem (cliente ou vendedor humano) e quem falou
    const conversaNoDia = new Map<
      string,
      { inicio: Date; fim: Date; cliente: boolean; vendedor: boolean }
    >();
    const marcarNoDia = (dia: string, em: Date, doCliente: boolean) => {
      const atual = conversaNoDia.get(dia);
      if (!atual) {
        conversaNoDia.set(dia, {
          inicio: em,
          fim: em,
          cliente: doCliente,
          vendedor: !doCliente
        });
        return;
      }
      atual.fim = em;
      if (doCliente) atual.cliente = true;
      else atual.vendedor = true;
    };

    lista.forEach((m, indice) => {
      const dia = diaDe(m.createdAt);
      // a lista esta em ordem: so a primeira posicao pode abrir a conversa
      const ehPrimeiraDaConversa =
        indice === 0 &&
        m.createdAt.getTime() === ticket.primeiraMsgEm.getTime();

      if (!m.fromMe) {
        if (noPeriodo(dia)) metrica(dia, conexaoId).mensagensRecebidas += 1;
        if (!primeiraDoClienteNoDia.has(dia)) {
          primeiraDoClienteNoDia.set(dia, m.createdAt);
        }
        if (!esperaDesde) esperaDesde = m.createdAt;
        ultimaDoCliente = m.createdAt;
        marcarNoDia(dia, m.createdAt, true);
        return;
      }

      const automatica =
        m.automatica ||
        (!!ultimaDoCliente &&
          !!esperaDesde &&
          m.createdAt.getTime() - ultimaDoCliente.getTime() <
            LIMITE_AUTOMATICA_MS);
      if (automatica) return;

      if (noPeriodo(dia)) {
        metrica(dia, conexaoId).mensagensEnviadas += 1;
        if (ehPrimeiraDaConversa) {
          metrica(dia, conexaoId).conversasIniciadasVendedor += 1;
        }
      }
      respostasHumanas.push(m.createdAt);
      marcarNoDia(dia, m.createdAt, false);

      if (esperaDesde) {
        const diaEspera = diaDe(esperaDesde);
        if (noPeriodo(diaEspera)) {
          const seg = businessSecondsBetween(esperaDesde, m.createdAt, horario);
          const alvo = metrica(diaEspera, conexaoId);
          alvo.respostaQtd += 1;
          alvo.respostaSomaSeg += seg;
          if (esperaDesde.getTime() === ticket.primeiraMsgEm.getTime()) {
            alvo.primeiraRespostaQtd += 1;
            alvo.primeiraRespostaSomaSeg += seg;
          }
        }
        esperaDesde = null;
      }
    });

    // conversas recebidas e respondidas, no dia em que o cliente escreveu
    primeiraDoClienteNoDia.forEach((inicio, dia) => {
      if (!noPeriodo(dia)) return;
      const alvo = metrica(dia, conexaoId);
      alvo.conversasRecebidas += 1;
      if (respostasHumanas.some(r => r.getTime() > inicio.getTime())) {
        alvo.conversasRespondidas += 1;
      } else {
        alvo.conversasSemResposta += 1;
      }
    });

    // tempo de atendimento: conversa x dia em que os dois lados falaram
    conversaNoDia.forEach((c, dia) => {
      if (!noPeriodo(dia) || !c.cliente || !c.vendedor) return;
      const alvo = metrica(dia, conexaoId);
      alvo.atendimentoQtd += 1;
      alvo.atendimentoSomaSeg += businessSecondsBetween(
        c.inicio,
        c.fim,
        horario
      );
    });

    // espera ainda aberta agora
    if (
      esperaDesde &&
      ticket.status !== "closed" &&
      agora.getTime() - esperaDesde.getTime() <= JANELA_AGUARDANDO_MS
    ) {
      if (!agoraPorConexao.has(conexaoId)) {
        agoraPorConexao.set(conexaoId, {
          conexaoId,
          aguardando: 0,
          maiorEsperaSeg: 0,
          esperas: []
        });
      }
      const alvo = agoraPorConexao.get(conexaoId);
      const esperaSeg = businessSecondsBetween(esperaDesde, agora, horario);
      alvo.aguardando += 1;
      alvo.maiorEsperaSeg = Math.max(alvo.maiorEsperaSeg, esperaSeg);
      alvo.esperas.push({
        ticketId,
        desde: esperaDesde.toISOString(),
        esperaSeg
      });
    }
  });

  const dias = [...metricas.values()]
    .map(m => ({
      ...m,
      primeiraRespostaMediaSeg: media(
        m.primeiraRespostaSomaSeg,
        m.primeiraRespostaQtd
      ),
      respostaMediaSeg: media(m.respostaSomaSeg, m.respostaQtd),
      atendimentoMediaSeg: media(m.atendimentoSomaSeg, m.atendimentoQtd)
    }))
    .sort((a, b) =>
      a.data === b.data ? a.conexaoId - b.conexaoId : a.data < b.data ? -1 : 1
    );

  const agoraLista = [...agoraPorConexao.values()]
    .map(a => ({
      ...a,
      esperas: a.esperas
        .sort((x, y) => y.esperaSeg - x.esperaSeg)
        .slice(0, MAX_ESPERAS)
    }))
    .sort((a, b) => a.conexaoId - b.conexaoId);

  return {
    de,
    ate,
    geradoEm: agora.toISOString(),
    dias,
    agora: agoraLista
  };
}
