import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import Company from "../../models/Company";
import { logger } from "../../utils/logger";
import {
  estourouVacuo,
  isVacuoEnabled,
  limiteVacuoSeg
} from "../../helpers/VacuoComercial";
import { horarioDoAmbiente } from "./MetricasAtendimentoService";
import { garantirFilaLivres } from "./FilaLivresService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";

// Rodada da regra das 5h (helpers/VacuoComercial.ts), chamada a cada minuto
// pelo handleTicketTimeouts. Conversa aberta com vendedor em que o cliente
// espera ha mais que o limite (no horario do comercial) volta para
// "aguardando" na fila comum, sem vendedor. Sem chatbot e sem mensagem de
// transferencia para o cliente: ele nem percebe.
export async function devolverConversasNoVacuo(
  companyId: number,
  agora: Date = new Date()
): Promise<number> {
  if (!isVacuoEnabled(companyId)) return 0;
  const fila = await garantirFilaLivres(companyId);
  const horario = horarioDoAmbiente();
  const limite = limiteVacuoSeg();

  // espera = primeira mensagem do cliente depois da ultima resposta humana do
  // vendedor (automatica comeca com ‎ e nao conta como resposta)
  const conversas: Array<{ id: number; esperaDesde: Date | null }> =
    await sequelize.query(
      `
        SELECT t.id,
               (SELECT MIN(m."createdAt") FROM "Messages" m
                 WHERE m."ticketId" = t.id AND m."fromMe" = false
                   AND COALESCE(m."isDeleted", false) = false
                   AND m."createdAt" > COALESCE(
                     (SELECT MAX(r."createdAt") FROM "Messages" r
                       WHERE r."ticketId" = t.id AND r."fromMe" = true
                         AND LEFT(COALESCE(r.body, ''), 1) <> E'\\u200e'),
                     'epoch'::timestamptz)) AS "esperaDesde"
          FROM "Tickets" t
         WHERE t."companyId" = :companyId
           AND t.status = 'open'
           AND t."userId" IS NOT NULL
           AND t."isGroup" = false
           AND COALESCE(t."queueId", 0) <> :filaLivres
      `,
      {
        replacements: { companyId, filaLivres: fila.id },
        type: QueryTypes.SELECT
      }
    );

  let devolvidas = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const c of conversas) {
    const desde = c.esperaDesde ? new Date(c.esperaDesde) : null;
    if (!estourouVacuo(desde, agora, horario, limite)) continue;
    try {
      await UpdateTicketService({
        ticketId: c.id,
        ticketData: { status: "pending", userId: null, queueId: fila.id },
        companyId,
        dontRunChatbot: true
      });
      devolvidas += 1;
      logger.info(
        { ticketId: c.id, esperaDesde: desde },
        "Conversa no vacuo voltou para a fila comum"
      );
    } catch (err) {
      logger.warn(
        { message: err?.message, ticketId: c.id },
        "devolverConversasNoVacuo: falha ao devolver"
      );
    }
  }
  return devolvidas;
}

// todas as empresas ligadas, de 5 em 5 minutos; nunca lanca (roda dentro do
// job de cada minuto)
export async function rodadaDoVacuo(agora: Date = new Date()): Promise<void> {
  if (agora.getMinutes() % 5 !== 0) return;
  try {
    const empresas = await Company.findAll({ attributes: ["id"] });
    // eslint-disable-next-line no-restricted-syntax
    for (const e of empresas) {
      if (isVacuoEnabled(e.id)) await devolverConversasNoVacuo(e.id);
    }
  } catch (err) {
    logger.warn({ message: err?.message }, "rodadaDoVacuo: falha");
  }
}
