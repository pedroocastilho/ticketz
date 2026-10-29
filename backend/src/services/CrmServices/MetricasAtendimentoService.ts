import { QueryTypes } from "sequelize";
import { DateTime } from "luxon";
import sequelize from "../../database";
import { OpenHoursData } from "../../helpers/checkOpenHours";
import { logger } from "../../utils/logger";
import {
  calcularMetricasAtendimento,
  MensagemMetrica,
  ResultadoMetricas,
  TicketMetrica
} from "./calcularMetricasAtendimento";

// Busca as mensagens da empresa e calcula as metricas de atendimento (ver
// calcularMetricasAtendimento). Chamado pelo n8n do CRM a cada poucos minutos.

// Horario de atendimento do comercial: 8h as 19h, segunda a sabado. Trocar
// sem nova versao: CRM_METRICAS_HORARIO com o JSON no formato OpenHoursData
// (o mesmo do horario das filas).
export const HORARIO_PADRAO: OpenHoursData = {
  timezone: "America/Sao_Paulo",
  weeklyRules: [
    {
      days: ["mon", "tue", "wed", "thu", "fri", "sat"],
      hours: [{ from: "08:00", to: "19:00" }]
    }
  ],
  overrides: []
};

export const horarioDoAmbiente = (
  valor: string | undefined = process.env.CRM_METRICAS_HORARIO
): OpenHoursData => {
  if (!valor) return HORARIO_PADRAO;
  try {
    const horario = JSON.parse(valor);
    if (horario?.timezone && Array.isArray(horario.weeklyRules)) {
      return { overrides: [], ...horario };
    }
  } catch {
    // cai no padrao abaixo
  }
  logger.warn("CRM_METRICAS_HORARIO invalido, usando 8h-19h seg-sab");
  return HORARIO_PADRAO;
};

// contexto antes do periodo: saber se a mensagem do cliente abriu espera nova
// ou continua uma ja aberta
const DIAS_DE_CONTEXTO = 7;

type Request = {
  companyId: number;
  de: string;
  ate: string;
  agora?: Date;
  horario?: OpenHoursData;
  // so as conversas destes contatos (painel do Formulario Jessica, 2026-10-29);
  // sem a lista = a empresa toda
  contatos?: number[];
};

export type Conexao = { id: number; name: string };

// um contato que conversou num dia, por conexao (so quando a lista de contatos
// e pedida): o CRM conta quantos leads tiveram conversa no periodo
export type ConversaDoContato = {
  contatoId: number;
  conexaoId: number;
  data: string;
};

// dias (no fuso do horario) em que cada contato trocou mensagem, por conexao
export function conversasPorContato(
  mensagens: MensagemMetrica[],
  tickets: Array<{ id: number; whatsappId: number; contactId: number }>,
  de: string,
  ate: string,
  fuso: string
): ConversaDoContato[] {
  const ticket = new Map(tickets.map(t => [t.id, t]));
  const vistos = new Map<string, ConversaDoContato>();
  mensagens
    .filter(m => !m.automatica)
    .forEach(m => {
      const t = ticket.get(m.ticketId);
      if (!t) return;
      const data = DateTime.fromJSDate(m.createdAt).setZone(fuso).toISODate();
      if (data < de || data > ate) return;
      const chave = `${t.contactId}|${t.whatsappId}|${data}`;
      if (!vistos.has(chave)) {
        vistos.set(chave, {
          contatoId: t.contactId,
          conexaoId: t.whatsappId,
          data
        });
      }
    });
  return [...vistos.values()];
}

const MetricasAtendimentoService = async ({
  companyId,
  de,
  ate,
  agora = new Date(),
  horario = horarioDoAmbiente(),
  contatos
}: Request): Promise<
  ResultadoMetricas & {
    conexoes: Conexao[];
    conversasPorContato?: ConversaDoContato[];
  }
> => {
  const inicioPeriodo = DateTime.fromISO(de, { zone: horario.timezone })
    .startOf("day")
    .toJSDate();
  // "aguardando agora" olha os ultimos 7 dias mesmo com periodo curto
  const seteDiasAtras = new Date(agora.getTime() - 7 * 86400 * 1000);
  const inicioBusca = new Date(
    Math.min(inicioPeriodo.getTime(), seteDiasAtras.getTime()) -
      DIAS_DE_CONTEXTO * 86400 * 1000
  );

  const linhas: Array<{
    ticketId: number;
    fromMe: boolean;
    createdAt: Date;
    automatica: boolean;
  }> =
    contatos && !contatos.length
      ? []
      : await sequelize.query(
          `
      SELECT m."ticketId", m."fromMe", m."createdAt",
             (LEFT(COALESCE(m.body, ''), 1) = E'\\u200e') AS automatica
        FROM "Messages" m
        JOIN "Tickets" t ON t.id = m."ticketId"
       WHERE m."companyId" = :companyId
         AND m."createdAt" >= :inicioBusca
         AND t."isGroup" = false
         AND t."whatsappId" IS NOT NULL
         AND COALESCE(m."isDeleted", false) = false
         AND COALESCE(m."mediaType", '') <> 'reactionMessage'
         ${contatos ? `AND t."contactId" IN (:contatos)` : ""}
    `,
          {
            replacements: { companyId, inicioBusca, contatos: contatos || [] },
            type: QueryTypes.SELECT
          }
        );

  const ids = [...new Set(linhas.map(l => l.ticketId))];

  type LinhaTicket = {
    id: number;
    whatsappId: number;
    contactId: number;
    status: string;
    primeiraMsgEm: Date;
  };
  const linhasTicket: LinhaTicket[] = ids.length
    ? await sequelize.query<LinhaTicket>(
        `
            SELECT t.id, t."whatsappId", t."contactId", t.status,
                   (SELECT MIN(m2."createdAt") FROM "Messages" m2
                     WHERE m2."ticketId" = t.id) AS "primeiraMsgEm"
              FROM "Tickets" t
             WHERE t.id IN (:ids)
          `,
        { replacements: { ids }, type: QueryTypes.SELECT }
      )
    : [];
  const tickets: TicketMetrica[] = linhasTicket.map(t => ({
    id: t.id,
    whatsappId: t.whatsappId,
    status: t.status,
    primeiraMsgEm: new Date(t.primeiraMsgEm)
  }));

  const conexoes: Conexao[] = await sequelize.query(
    `SELECT id, name FROM "Whatsapps" WHERE "companyId" = :companyId ORDER BY id`,
    { replacements: { companyId }, type: QueryTypes.SELECT }
  );

  const mensagens: MensagemMetrica[] = linhas.map(l => ({
    ticketId: l.ticketId,
    fromMe: !!l.fromMe,
    createdAt: new Date(l.createdAt),
    automatica: !!l.automatica
  }));

  return {
    ...calcularMetricasAtendimento(mensagens, tickets, {
      de,
      ate,
      agora,
      horario
    }),
    conexoes,
    ...(contatos
      ? {
          conversasPorContato: conversasPorContato(
            mensagens,
            linhasTicket.map(t => ({
              id: Number(t.id),
              whatsappId: Number(t.whatsappId),
              contactId: Number(t.contactId)
            })),
            de,
            ate,
            horario.timezone
          )
        }
      : {})
  };
};

export default MetricasAtendimentoService;
