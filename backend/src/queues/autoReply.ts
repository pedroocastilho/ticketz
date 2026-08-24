import Queue from "bull";
import AutoReplyRule from "../models/AutoReplyRule";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";
import formatBody from "../helpers/Mustache";
import {
  detectTicketLanguage,
  pickLanguageVariant
} from "../helpers/localizeAutoMessage";
import { logger } from "../utils/logger";

const connection = process.env.REDIS_URI || "";

// Fila propria para as respostas automaticas. O atraso vive no Bull e nao num
// setTimeout justamente para sobreviver a reinicializacao do backend.
export const autoReplyQueue = new Queue("AutoReply", connection);

async function handleSendAutoReply(job) {
  const { ticketId, ruleId, companyId } = job.data;

  try {
    const rule = await AutoReplyRule.findByPk(ruleId);

    if (!rule || !rule.active) {
      logger.info({ ticketId, ruleId }, "AutoReply: regra removida ou inativa");
      return;
    }

    const ticket = await ShowTicketService(ticketId, companyId);

    // revalidacao: se a atendente assumiu a conversa durante a espera, o robo
    // fica quieto. E isto que impede a resposta automatica de atropelar ela.
    if (ticket.status !== "pending" || ticket.userId) {
      logger.info(
        { ticketId, ruleId, status: ticket.status, userId: ticket.userId },
        "AutoReply cancelado: conversa ja assumida"
      );
      return;
    }

    await SendWhatsAppMessage({
      body: formatBody(
        pickLanguageVariant(rule.message, await detectTicketLanguage(ticket.id)),
        ticket
      ),
      ticket
    });

    logger.info({ ticketId, ruleId }, "AutoReply enviado");
  } catch (error) {
    // falha na resposta automatica nao pode derrubar o atendimento: fica no log
    logger.error(
      { ticketId, ruleId, message: error?.message },
      "AutoReply: falha ao enviar"
    );
  }
}

export function startAutoReplyProcess(): void {
  autoReplyQueue.process("SendAutoReply", handleSendAutoReply);
  logger.info("AutoReply queue processing started");
}
