import Ticket from "../../models/Ticket";
import Queue from "../../models/Queue";
import Company from "../../models/Company";
import TicketTraking from "../../models/TicketTraking";
import {
  refreshBusinessTimes,
  scheduleForTicket
} from "../../helpers/businessSeconds";
import { logger } from "../../utils/logger";

/**
 * Recalcula waitTimeBusiness e serviceTimeBusiness do rastreio com o
 * expediente da fila atual do ticket (ou da empresa). So preenche o
 * objeto; quem chama faz o save(). Nunca lanca: um erro aqui nao pode
 * travar o fluxo de aceitar ou finalizar a conversa.
 */
const RefreshTicketTrakingBusinessTimes = async (
  tracking: TicketTraking
): Promise<void> => {
  try {
    const ticket = await Ticket.findByPk(tracking.ticketId, {
      attributes: ["id", "queueId", "companyId"],
      include: [
        { model: Queue, attributes: ["id", "schedules"] },
        { model: Company, attributes: ["id", "schedules"] }
      ]
    });
    refreshBusinessTimes(tracking, scheduleForTicket(ticket));
  } catch (err) {
    logger.warn(
      { ticketId: tracking.ticketId, message: err?.message },
      "RefreshTicketTrakingBusinessTimes -> could not compute business times"
    );
  }
};

export default RefreshTicketTrakingBusinessTimes;
