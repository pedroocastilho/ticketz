import Ticket from "../../models/Ticket";
import AutoReplyDispatch from "../../models/AutoReplyDispatch";
import FindMatchingAutoReplyRule from "./FindMatchingAutoReplyRule";
import { autoReplyQueue } from "../../queues/autoReply";
import { logger } from "../../utils/logger";

interface Request {
  ticket: Ticket;
  body: string;
}

// Decide se a mensagem recebida dispara alguma regra de resposta automatica e,
// se disparar, agenda o envio para daqui a alguns segundos.
//
// So dispara enquanto ninguem assumiu a conversa. O registro em
// AutoReplyDispatches e criado aqui, no agendamento, e nao no envio: ele
// funciona como reserva, e a restricao unica (ticketId, ruleId) garante que a
// mesma regra nao seja agendada duas vezes para a mesma conversa. Se o envio
// acabar cancelado porque a atendente assumiu, a reserva permanece de proposito
// — a partir do momento em que alguem esta cuidando da conversa, o robo nao
// deve voltar a falar nela.
const ScheduleAutoReply = async ({ ticket, body }: Request): Promise<void> => {
  try {
    if (ticket.isGroup || ticket.contact?.isGroup) {
      return;
    }

    if (ticket.status !== "pending" || ticket.userId) {
      return;
    }

    const rule = await FindMatchingAutoReplyRule({
      companyId: ticket.companyId,
      whatsappId: ticket.whatsappId,
      queueId: ticket.queueId,
      body
    });

    if (!rule) {
      return;
    }

    const [, created] = await AutoReplyDispatch.findOrCreate({
      where: { ticketId: ticket.id, ruleId: rule.id },
      defaults: {
        ticketId: ticket.id,
        ruleId: rule.id,
        companyId: ticket.companyId
      }
    } as any);

    if (!created) {
      return;
    }

    await autoReplyQueue.add(
      "SendAutoReply",
      {
        ticketId: ticket.id,
        ruleId: rule.id,
        companyId: ticket.companyId
      },
      {
        delay: Math.max(0, rule.delaySeconds || 0) * 1000,
        removeOnComplete: true,
        removeOnFail: true
      }
    );

    logger.info(
      {
        ticketId: ticket.id,
        ruleId: rule.id,
        delaySeconds: rule.delaySeconds
      },
      "AutoReply agendado"
    );
  } catch (error) {
    // nunca deixar a automacao atrapalhar o recebimento da mensagem do cliente
    logger.error(
      { ticketId: ticket?.id, message: error?.message },
      "AutoReply: falha ao agendar"
    );
  }
};

export default ScheduleAutoReply;
