import AppError from "../errors/AppError";
import Queue from "../models/Queue";
import Ticket from "../models/Ticket";
import User from "../models/User";
import Whatsapp from "../models/Whatsapp";
import { logger } from "../utils/logger";

interface Request {
  companyId: number;
  userId?: number;
  queueId?: number;
  whatsappId?: number;
  contactId?: number;
}

/**
 * Decide por qual conexao (numero) uma conversa iniciada pela plataforma deve
 * sair. Antes tudo saia pela conexao padrao da empresa, entao uma conversa nova
 * aberta por um atendente saia do numero de outro atendente.
 *
 * Ordem de decisao:
 * 1. conexao informada explicitamente (validada: mesma empresa e conectada)
 * 2. conexao da ultima conversa desse atendente com esse contato
 * 3. conexao ligada a fila escolhida
 * 4. conexao ligada a alguma fila do atendente
 * 5. conexao padrao da empresa (comportamento antigo, registrado em log)
 *
 * Quando mais de uma conexao serve, prefere a marcada como padrao e depois a
 * primeira em ordem de nome.
 */
const GetUserWhatsApp = async ({
  companyId,
  userId,
  queueId,
  whatsappId,
  contactId
}: Request): Promise<Whatsapp> => {
  if (whatsappId) {
    const whatsapp = await Whatsapp.findByPk(whatsappId);

    if (!whatsapp || whatsapp.companyId !== companyId) {
      throw new AppError("ERR_NO_WAPP_FOUND", 404);
    }

    if (whatsapp.status !== "CONNECTED") {
      throw new AppError("ERR_WAPP_NOT_CONNECTED", 400);
    }

    return whatsapp;
  }

  const connected = await Whatsapp.findAll({
    where: { companyId, channel: "whatsapp", status: "CONNECTED" },
    include: [{ model: Queue, as: "queues", attributes: ["id"] }],
    order: [["name", "ASC"]]
  });

  const pick = (candidates: Whatsapp[]): Whatsapp | undefined => {
    if (candidates.length === 0) return undefined;
    if (candidates.length > 1) {
      logger.warn(
        {
          companyId,
          userId,
          queueId,
          candidates: candidates.map(w => w.name)
        },
        "GetUserWhatsApp: mais de uma conexao serve para esta conversa"
      );
    }
    return candidates.find(w => w.isDefault) || candidates[0];
  };

  const linkedTo = (queueIds: number[]): Whatsapp[] =>
    connected.filter(w => (w.queues || []).some(q => queueIds.includes(q.id)));

  // o numero que esse atendente ja usou com esse contato e o melhor sinal
  if (contactId && userId) {
    const lastTicket = await Ticket.findOne({
      where: { companyId, contactId, userId },
      order: [["updatedAt", "DESC"]],
      attributes: ["whatsappId"]
    });
    const previous = connected.find(w => w.id === lastTicket?.whatsappId);
    if (previous) return previous;
  }

  if (queueId) {
    const byQueue = pick(linkedTo([queueId]));
    if (byQueue) return byQueue;
  }

  if (userId) {
    const user = await User.findByPk(userId, {
      include: [{ model: Queue, as: "queues", attributes: ["id"] }]
    });
    const userQueueIds = (user?.queues || []).map(q => q.id);
    if (userQueueIds.length > 0) {
      const byUser = pick(linkedTo(userQueueIds));
      if (byUser) return byUser;
    }
  }

  // comportamento antigo: conexao padrao da empresa, ou qualquer uma conectada
  const fallback = connected.find(w => w.isDefault) || connected[0];

  if (!fallback) {
    throw new AppError("ERR_NO_DEF_WAPP_FOUND");
  }

  logger.warn(
    { companyId, userId, queueId, whatsapp: fallback.name },
    "GetUserWhatsApp: nenhuma conexao ligada ao atendente ou fila, usando a padrao da empresa"
  );

  return fallback;
};

export default GetUserWhatsApp;
