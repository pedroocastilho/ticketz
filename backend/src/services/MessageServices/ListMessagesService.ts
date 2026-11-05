import { FindOptions, Op } from "sequelize";
import AppError from "../../errors/AppError";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import ShowTicketService from "../TicketServices/ShowTicketService";
import Queue from "../../models/Queue";
import Whatsapp from "../../models/Whatsapp";
import { GetCompanySetting } from "../../helpers/CheckSettings";
import { isHistoricoContatoEnabled } from "../../helpers/HistoricoContato";

interface Request {
  ticketId: string;
  companyId: number;
  nextId?: string;
  queues?: number[];
  minUpdatedAt?: string;
}

interface Response {
  messages: Message[];
  ticket: Ticket;
  count: number | null;
  hasMore: boolean;
  nextId: string | null;
  historicoContato: boolean;
}

const ListMessagesService = async ({
  nextId,
  ticketId,
  companyId,
  queues = [],
  minUpdatedAt
}: Request): Promise<Response> => {
  const ticket = await ShowTicketService(ticketId, companyId);

  if (!ticket) {
    throw new AppError("ERR_NO_TICKET_FOUND", 404);
  }

  const limit = 100;

  // comercial: abrir a conversa mostra tudo o que ja se falou com essa pessoa, em
  // qualquer numero (helpers/HistoricoContato.ts)
  const historicoContato =
    !ticket.isGroup && isHistoricoContatoEnabled(companyId);
  const conversasDoContato: number[] = historicoContato
    ? (
        await Ticket.findAll({
          where: { companyId, contactId: ticket.contactId, isGroup: false },
          attributes: ["id"]
        })
      ).map(conversa => conversa.id)
    : [];
  const filtroConversa = historicoContato
    ? { [Op.in]: conversasDoContato }
    : ticketId;

  const options: FindOptions = {
    where: {
      ticketId: filtroConversa,
      companyId,
      mediaType: {
        [Op.or]: {
          [Op.ne]: "reactionMessage",
          [Op.is]: null
        }
      }
    }
  };

  if (
    !historicoContato &&
    queues.length > 0 &&
    (await GetCompanySetting(companyId, "messageVisibility", "message")) ===
      "message"
  ) {
    options.where["queueId"] = {
      [Op.or]: {
        [Op.in]: queues,
        [Op.eq]: null
      }
    };
  }

  if (minUpdatedAt) {
    const parsedMinUpdatedAt = new Date(minUpdatedAt);

    if (Number.isNaN(parsedMinUpdatedAt.getTime())) {
      throw new AppError("ERR_INVALID_MIN_UPDATED_AT", 400);
    }

    options.where["updatedAt"] = {
      [Op.gte]: parsedMinUpdatedAt
    };
  } else if (nextId) {
    const cursorMessage = await Message.findOne({
      where: {
        id: nextId,
        ticketId: historicoContato ? conversasDoContato : ticketId,
        companyId
      },
      attributes: ["id", "createdAt"]
    });

    if (!cursorMessage) {
      throw new AppError("ERR_MESSAGE_NOT_FOUND", 404);
    }

    options.where["createdAt"] = {
      [Op.lt]: cursorMessage.createdAt
    };
  }

  const messages = await Message.findAll({
    ...options,
    limit: limit + 1,
    include: [
      "contact",
      {
        model: Message,
        as: "quotedMsg",
        include: ["contact"],
        where: {
          companyId: ticket.companyId
        },
        required: false
      },
      {
        model: Message,
        as: "replies",
        where: {
          ticketId: historicoContato ? conversasDoContato : ticket.id
        },
        include: ["contact"],
        required: false
      },
      {
        model: Queue,
        as: "queue"
      },
      ...(historicoContato
        ? [
            {
              model: Ticket,
              as: "ticket",
              attributes: ["id", "queueId"],
              required: false,
              include: [
                {
                  model: Whatsapp,
                  as: "whatsapp",
                  attributes: ["id", "name"],
                  required: false
                }
              ]
            }
          ]
        : [])
    ],
    order: [["createdAt", "DESC"]]
  });

  const hasMore = messages.length > limit;
  const visibleMessages = hasMore ? messages.slice(0, limit) : messages;
  const oldestMessage = visibleMessages[visibleMessages.length - 1];

  return {
    messages: visibleMessages.reverse(),
    ticket,
    count: null,
    hasMore,
    nextId: hasMore && oldestMessage ? oldestMessage.id : null,
    historicoContato
  };
};

export default ListMessagesService;
