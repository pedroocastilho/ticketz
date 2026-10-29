import AppError from "../../errors/AppError";
import { GetCompanySetting } from "../../helpers/CheckSettings";
import Contact from "../../models/Contact";
import ContactTag from "../../models/ContactTag";
import Tag from "../../models/Tag";
import Ticket from "../../models/Ticket";
import TicketTag from "../../models/TicketTag";
import ShowContactService from "../ContactServices/ShowContactService";
import { websocketUpdateContact } from "../ContactServices/UpdateContactService";
import ShowTicketService from "../TicketServices/ShowTicketService";
import { websocketUpdateTicket } from "../TicketServices/UpdateTicketService";
import NotifyCrmTagsChanged from "../WebhookServices/NotifyCrmTagsChanged";
import {
  isEtiquetaEtapaEnabled,
  umaEtapaSo
} from "../../helpers/EtiquetaEtapa";

// comercial (ETIQUETA_ETAPA_COMPANIES): uma etiqueta de etapa por vez; marcar
// outra tira a anterior (o kanban de cada etiqueta vem do banco, nao da tela)
const comUmaEtapaSo = async (
  companyId: number,
  tags: Tag[],
  anteriores: number[]
): Promise<Tag[]> => {
  if (!isEtiquetaEtapaEnabled(companyId) || !tags.length) return tags;
  const doBanco = await Tag.findAll({
    where: { id: tags.map(t => t.id), companyId }
  });
  const kanban = new Map(doBanco.map(t => [t.id, t.kanban]));
  const ficam = umaEtapaSo(
    tags.map(t => ({ id: t.id, name: t.name, kanban: kanban.get(t.id) })),
    anteriores
  ).map(t => t.id);
  return tags.filter(t => ficam.includes(t.id));
};

interface Request {
  tags: Tag[];
  ticketId?: number;
  contactId?: number;
  companyId?: number;
}

const SyncTicketTags = async ({
  tags: tagsDaTela,
  ticketId,
  companyId
}: Request): Promise<Ticket | null> => {
  let tags = tagsDaTela;
  const ticket = await ShowTicketService(ticketId);
  const tagsMode = await GetCompanySetting(companyId, "tagsMode", "ticket");

  if (["ticket", "both"].includes(tagsMode)) {
    const anteriores = (await TicketTag.findAll({ where: { ticketId } })).map(
      t => t.tagId
    );
    tags = await comUmaEtapaSo(ticket.companyId, tags, anteriores);
    const tagList = tags.map(t => ({ tagId: t.id, ticketId }));
    await TicketTag.destroy({ where: { ticketId } });
    await TicketTag.bulkCreate(tagList);
  } else if (tagsMode === "contact") {
    const tagList = tags.map(t => ({
      tagId: t.id,
      contactId: ticket.contactId
    }));
    await ContactTag.destroy({ where: { contactId: ticket.contactId } });
    await ContactTag.bulkCreate(tagList);
  }

  await ticket.reload();
  websocketUpdateTicket(ticket);
  NotifyCrmTagsChanged({ companyId: ticket.companyId, ticketId: ticket.id });

  return ticket;
};

const SyncContactTags = async ({
  tags,
  contactId,
  companyId
}: Request): Promise<Contact | null> => {
  const tagsMode = await GetCompanySetting(companyId, "tagsMode", "ticket");

  if (!["contact", "both"].includes(tagsMode)) {
    throw new AppError("ERR_INVALID_TAGMODE", 400);
  }

  const contact = await ShowContactService(contactId);

  const tagList = tags.map(t => ({ tagId: t.id, contactId }));

  await ContactTag.destroy({ where: { contactId } });
  await ContactTag.bulkCreate(tagList);

  await contact.reload();
  websocketUpdateContact(contact);
  NotifyCrmTagsChanged({ companyId: contact.companyId, contactId: contact.id });

  return contact;
};

const SyncTags = async (req: Request): Promise<Ticket | Contact> => {
  if (req.ticketId) {
    return SyncTicketTags(req);
  }

  if (req.contactId) {
    return SyncContactTags(req);
  }

  throw new AppError("ERR_NO_TICKET_OR_CONTACT", 400);
};

export default SyncTags;
