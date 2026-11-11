import { Request, Response } from "express";
import { Mutex } from "async-mutex";
import { getIO } from "../libs/socket";
import Ticket from "../models/Ticket";

import CreateTicketService from "../services/TicketServices/CreateTicketService";
import { conferirTravaDono, isTravaDonoEnabled } from "../services/CrmServices/TravaDonoService";
import Contact from "../models/Contact";
import DeleteTicketService from "../services/TicketServices/DeleteTicketService";
import ListTicketsService from "../services/TicketServices/ListTicketsService";
import ShowTicketUUIDService from "../services/TicketServices/ShowTicketFromUUIDService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import ListTicketsServiceKanban from "../services/TicketServices/ListTicketsServiceKanban";

type IndexQuery = {
  isSearch?: string;
  searchParam: string;
  pageNumber?: string;
  nextUpdatedAt?: string;
  nextTicketId?: string;
  status: string;
  groups: string;
  date: string;
  updatedAt?: string;
  minUpdatedAt?: string;
  showAll: string;
  withUnreadMessages: string;
  notClosed: string;
  semResposta?: string;
  all: string;
  queueIds: string;
  contactId: string;
  tags: string;
  users: string;
};

interface TicketData {
  contactId: number;
  status: string;
  queueId: number;
  userId: number;
  whatsappId?: number;
}

const updateMutex = new Mutex();

export const index = async (req: Request, res: Response): Promise<Response> => {
  const {
    nextUpdatedAt,
    nextTicketId,
    status,
    groups,
    date,
    updatedAt,
    minUpdatedAt,
    isSearch,
    searchParam,
    showAll,
    queueIds: queueIdsStringified,
    contactId,
    tags: tagIdsStringified,
    users: userIdsStringified,
    withUnreadMessages,
    notClosed,
    semResposta,
    all
  } = req.query as IndexQuery;

  const userId = req.user.id;
  const { companyId } = req.user;

  let queueIds: number[] = [];
  let tagsIds: number[] = [];
  let usersIds: number[] = [];

  if (queueIdsStringified) {
    queueIds = JSON.parse(queueIdsStringified);
  }

  if (tagIdsStringified) {
    tagsIds = JSON.parse(tagIdsStringified);
  }

  if (userIdsStringified) {
    usersIds = JSON.parse(userIdsStringified);
  }

  const { tickets, count, hasMore } = await ListTicketsService({
    isSearch: isSearch === "true",
    searchParam,
    contactId: Number(contactId) || undefined,
    tags: tagsIds,
    users: usersIds,
    nextUpdatedAt,
    nextTicketId,
    status,
    groups,
    date,
    updatedAt,
    minUpdatedAt,
    showAll,
    userId,
    queueIds,
    withUnreadMessages,
    notClosed: !!notClosed,
    semResposta: semResposta === "true",
    all: !!all,
    companyId
  });

  return res.status(200).json({
    tickets,
    count,
    hasMore
  });
};

export const kanban = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const {
    pageNumber,
    status,
    date,
    updatedAt,
    searchParam,
    showAll,
    queueIds: queueIdsStringified,
    tags: tagIdsStringified,
    users: userIdsStringified,
    withUnreadMessages
  } = req.query as IndexQuery;

  const userId = req.user.id;
  const { companyId } = req.user;

  let queueIds: number[] = [];
  let tagsIds: number[] = [];
  let usersIds: number[] = [];

  if (queueIdsStringified) {
    queueIds = JSON.parse(queueIdsStringified);
  }

  if (tagIdsStringified) {
    tagsIds = JSON.parse(tagIdsStringified);
  }

  if (userIdsStringified) {
    usersIds = JSON.parse(userIdsStringified);
  }

  const { tickets, count, hasMore } = await ListTicketsServiceKanban({
    searchParam,
    tags: tagsIds,
    users: usersIds,
    pageNumber,
    status,
    date,
    updatedAt,
    showAll,
    userId,
    queueIds,
    withUnreadMessages,
    companyId
  });

  return res.status(200).json({ tickets, count, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { contactId, userId, queueId, whatsappId }: TicketData = req.body;
  const { companyId } = req.user;

  // Nova conversa: vendedor nao comeca conversa com lead de outro vendedor
  if (req.user.profile === "user" && isTravaDonoEnabled(companyId)) {
    const contato = await Contact.findOne({
      where: { id: contactId, companyId },
      attributes: ["number", "isGroup"]
    });
    if (contato && !contato.isGroup) {
      await conferirTravaDono({
        companyId,
        userId: Number(req.user.id),
        numero: contato.number
      });
    }
  }

  const ticket = await CreateTicketService({
    contactId,
    userId,
    companyId,
    queueId,
    whatsappId
  });

  const io = getIO();
  io.to(`company-${companyId}-${ticket.status}`)
    .to(`queue-${ticket.queueId}-${ticket.status}`)
    .emit(`company-${companyId}-ticket`, {
      action: "update",
      ticket
    });

  return res.status(200).json(ticket);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const { companyId } = req.user;

  const contact = await ShowTicketService(ticketId, companyId);

  return res.status(200).json(contact);
};

export const showFromUUID = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { uuid } = req.params;

  const ticket: Ticket = await ShowTicketUUIDService(uuid);

  return res.status(200).json(ticket);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;

  const { ticket } = await updateMutex.runExclusive(async () => {
    const result = await UpdateTicketService({
      ticketData: req.body,
      ticketId: Number.parseInt(ticketId, 10),
      reqUserId: Number(req.user.id)
    });
    return result;
  });

  return res.status(200).json(ticket);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;
  const { companyId } = req.user;

  await ShowTicketService(ticketId, companyId);

  const ticket = await DeleteTicketService(ticketId);

  const io = getIO();
  io.to(ticketId)
    .to(`company-${companyId}-${ticket.status}`)
    .to(`company-${companyId}-notification`)
    .to(`queue-${ticket.queueId}-${ticket.status}`)
    .to(`queue-${ticket.queueId}-notification`)
    .emit(`company-${companyId}-ticket`, {
      action: "delete",
      ticketId: +ticketId
    });

  return res.status(200).json({ message: "ticket deleted" });
};
