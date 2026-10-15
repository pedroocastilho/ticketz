import Contact from "../../models/Contact";
import Tag from "../../models/Tag";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import { logger } from "../../utils/logger";
import NotifyCrmWebhook, { isCrmWebhookEnabledFor } from "./NotifyCrmWebhook";

// Avisa o CRM que as etiquetas de uma conversa mudaram (evento "etiqueta").
// Vai sempre a lista completa atual, juntando as etiquetas da conversa e as do
// contato (o tagsMode da empresa decide onde o vendedor marca). O CRM usa para
// gravar origem e produto no card ou tirar do funil com "Nao e lead".
//
// Recebe a conversa ou, quando a etiqueta foi marcada no contato, o contato
// (vale a conversa mais recente dele). Nunca lanca: o CRM nao pode quebrar a
// tela de etiquetas.
interface Request {
  companyId: number;
  ticketId?: number;
  contactId?: number;
}

const NotifyCrmTagsChanged = async ({
  companyId,
  ticketId,
  contactId
}: Request): Promise<boolean> => {
  if (!isCrmWebhookEnabledFor(companyId)) {
    return false;
  }

  try {
    const include = [
      { model: Tag, as: "tags", attributes: ["name"] },
      {
        model: Contact,
        as: "contact",
        attributes: ["id", "name", "number", "isGroup"],
        include: [{ model: Tag, as: "tags", attributes: ["name"] }]
      },
      { model: Whatsapp, as: "whatsapp", attributes: ["id", "name"] }
    ];

    const ticket = ticketId
      ? await Ticket.findOne({ where: { id: ticketId, companyId }, include })
      : await Ticket.findOne({
          where: { contactId, companyId },
          order: [["updatedAt", "DESC"]],
          include
        });

    if (!ticket || !ticket.contact || ticket.contact.isGroup) {
      return false;
    }

    const nomes = [
      ...(ticket.tags || []).map(t => t.name),
      ...(ticket.contact.tags || []).map(t => t.name)
    ];
    const etiquetas = [...new Set(nomes.filter(Boolean))];

    return await NotifyCrmWebhook({
      evento: "etiqueta",
      companyId,
      etiquetas,
      ticket: {
        id: ticket.id,
        uuid: ticket.uuid,
        status: ticket.status,
        queueId: ticket.queueId,
        userId: ticket.userId
      },
      whatsapp: {
        id: ticket.whatsapp?.id ?? ticket.whatsappId,
        name: ticket.whatsapp?.name
      },
      contact: {
        id: ticket.contact.id,
        name: ticket.contact.name,
        number: ticket.contact.number
      }
    });
  } catch (err) {
    logger.warn(
      { message: err?.message, ticketId, contactId },
      "NotifyCrmTagsChanged: falha ao montar o aviso de etiquetas"
    );
    return false;
  }
};

export default NotifyCrmTagsChanged;
