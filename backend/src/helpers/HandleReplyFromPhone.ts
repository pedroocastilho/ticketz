import { Op } from "sequelize";
import Queue from "../models/Queue";
import Ticket from "../models/Ticket";
import User from "../models/User";
import Whatsapp from "../models/Whatsapp";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import SetTicketMessagesAsRead from "./SetTicketMessagesAsRead";
import { logger } from "../utils/logger";

/**
 * Descobre quem responde pelo numero quando o atendente manda mensagem pelo
 * celular, fora da plataforma. Sinais, do mais forte para o mais fraco:
 *
 * 1. quem atendeu por ultimo esse contato nessa mesma conexao;
 * 2. a unica atendente (perfil usuario) da fila ligada a conexao;
 * 3. a unica pessoa nao admin da fila ligada a conexao.
 *
 * Em caso de duvida devolve null: e melhor deixar em "Aguardando" do que
 * atribuir a conversa para a pessoa errada.
 */
export const findPhoneOperator = async (
  ticket: Ticket,
  whatsapp: Whatsapp
): Promise<number | null> => {
  const lastTicket = await Ticket.findOne({
    where: {
      companyId: ticket.companyId,
      contactId: ticket.contactId,
      whatsappId: whatsapp.id,
      userId: { [Op.ne]: null },
      id: { [Op.ne]: ticket.id }
    },
    order: [["updatedAt", "DESC"]],
    attributes: ["userId"]
  });

  if (lastTicket?.userId) {
    return lastTicket.userId;
  }

  const queues = whatsapp.queues || [];

  if (queues.length !== 1) {
    logger.debug(
      { ticketId: ticket.id, whatsappId: whatsapp.id, queues: queues.length },
      "HandleReplyFromPhone: conexao sem fila unica, nao aceita sozinho"
    );
    return null;
  }

  const members = await User.findAll({
    where: { companyId: ticket.companyId },
    attributes: ["id", "name", "profile"],
    include: [
      {
        model: Queue,
        as: "queues",
        where: { id: queues[0].id },
        attributes: [],
        required: true
      }
    ]
  });

  const nonAdmins = members.filter(u => u.profile !== "admin");
  const attendants = nonAdmins.filter(u => u.profile === "user");

  if (attendants.length === 1) return attendants[0].id;
  if (nonAdmins.length === 1) return nonAdmins[0].id;

  logger.debug(
    {
      ticketId: ticket.id,
      whatsappId: whatsapp.id,
      candidates: nonAdmins.map(u => u.name)
    },
    "HandleReplyFromPhone: mais de uma pessoa na fila, nao aceita sozinho"
  );

  return null;
};

/**
 * Trata a resposta que o atendente manda pelo aplicativo do WhatsApp no
 * celular, sem passar pela plataforma.
 *
 * Sem isso o Ticketz so espelha a mensagem: o contador de nao lidas continua
 * subindo (so zera quando alguem abre a conversa na tela) e o ticket fica em
 * "Aguardando" para sempre, porque ninguem clicou em aceitar. Quem supervisiona
 * ve conversa ja respondida como se o cliente ainda estivesse esperando, e o
 * fechamento automatico depois congela esse contador no ticket fechado.
 *
 * O que faz:
 * 1. se o ticket ainda nao tem atendente (ou esta em "Aguardando"), aceita
 *    para quem responde por aquele numero, ver `findPhoneOperator`;
 * 2. zera as nao lidas e marca as mensagens do cliente como lidas, igual a
 *    abrir a conversa na tela.
 */
const HandleReplyFromPhone = async (
  ticket: Ticket,
  whatsapp: Whatsapp
): Promise<void> => {
  if (ticket.isGroup) {
    return;
  }

  try {
    if (!ticket.userId || ticket.status === "pending") {
      const userId = ticket.userId || (await findPhoneOperator(ticket, whatsapp));

      if (userId) {
        logger.info(
          { ticketId: ticket.id, userId, whatsappId: whatsapp.id },
          "HandleReplyFromPhone: resposta pelo celular aceitou a conversa"
        );

        await UpdateTicketService({
          ticketId: ticket.id,
          ticketData: {
            status: "open",
            userId,
            queueId: ticket.queueId || whatsapp.queues?.[0]?.id || null
          },
          companyId: ticket.companyId,
          dontRunChatbot: true
        });

        await ticket.reload();
      }
    }

    await SetTicketMessagesAsRead(ticket);
  } catch (err) {
    logger.error(
      { err, ticketId: ticket.id },
      "HandleReplyFromPhone: falha ao tratar resposta pelo celular"
    );
  }
};

export default HandleReplyFromPhone;
