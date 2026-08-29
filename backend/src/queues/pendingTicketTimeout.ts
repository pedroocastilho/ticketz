import { subMinutes } from "date-fns";
import { Op } from "sequelize";
import Ticket from "../models/Ticket";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import { logger } from "../utils/logger";

/**
 * Fecha automaticamente os tickets que ficaram parados na aba "Aguardando".
 *
 * As outras tres rotinas de timeout deixam um buraco: `handleNoQueueTimeout` so
 * pega pendente **sem fila**, `handleChatbotTicketTimeout` so pega pendente de
 * chatbot e `handleOpenTicketTimeout` so pega ticket **em atendimento**. Um
 * pendente que ja tem fila e nao esta em chatbot nao era alcancado por nenhuma
 * delas e ficava na tela para sempre, obrigando quem supervisiona a fila a
 * finalizar na mao todo dia.
 *
 * Grupos ficam de fora, no mesmo criterio de `handleChatbotTicketTimeout`.
 */
export async function handlePendingTicketTimeout(
  companyId: number,
  timeout: number
): Promise<void> {
  if (!timeout) {
    return;
  }

  logger.trace({ companyId, timeout }, "handlePendingTicketTimeout: entering");

  const tickets = await Ticket.findAll({
    where: {
      status: "pending",
      companyId,
      isGroup: false,
      updatedAt: {
        [Op.lt]: subMinutes(new Date(), timeout)
      }
    }
  });

  logger.debug(
    { companyId, expiredCount: tickets.length },
    "handlePendingTicketTimeout -> tickets"
  );

  // eslint-disable-next-line no-restricted-syntax
  for (const ticket of tickets) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await UpdateTicketService({
        ticketId: ticket.id,
        ticketData: {
          status: "closed",
          queueId: ticket.queueId,
          userId: ticket.userId
        },
        companyId
      });
    } catch (err) {
      // um ticket problematico nao pode impedir o fechamento dos demais
      logger.warn(
        { err, companyId, ticketId: ticket.id },
        "handlePendingTicketTimeout -> failed to close ticket"
      );
    }
  }

  logger.trace({ companyId, timeout }, "handlePendingTicketTimeout: exiting");
}

export default handlePendingTicketTimeout;
