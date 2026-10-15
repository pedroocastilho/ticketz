import { Op } from "sequelize";
import AppError from "../../errors/AppError";
import CheckContactOpenTickets from "../../helpers/CheckContactOpenTickets";
import GetUserWhatsApp from "../../helpers/GetUserWhatsApp";
import Contact from "../../models/Contact";
import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import { CheckNumberAndCreateContact } from "../WbotServices/CheckNumber";
import CreateTicketService from "../TicketServices/CreateTicketService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";

// Botao "Chamar no WhatsApp" do CRM (Magnus): o link /abrir/<numero> chega aqui
// com o atendente logado e devolve a conversa para a tela abrir.
//   - atendente (perfil user): conversa com a pessoa NO NUMERO DELE (conexao da
//     fila dele). Acha ou cria o contato (validando o numero no WhatsApp pela
//     propria conexao, que devolve o jid certo, com ou sem o nono digito), acha
//     a conversa aberta/pendente nessa conexao ou cria uma nova, ja com ele. A
//     conversa pendente (esperando na fila) ou sem dono passa a ser dele.
//   - admin e supervisor: so abrem a conversa que ja existe (a mais recente
//     com a pessoa); nao criam nada. O supervisor somente leitura nem
//     conseguiria (isAuth recusa POST).

interface Request {
  userId: number;
  companyId: number;
  numero: string;
  nome?: string;
  criar: boolean;
}

interface Response {
  uuid: string;
  criada: boolean;
}

// mesmo criterio do CreateContactService: numero BR com e sem o nono digito
export const variantesDoNumero = (digitos: string): string[] => {
  const lista = [digitos];
  if (digitos.startsWith("55") && digitos.length === 13 && digitos[4] === "9") {
    lista.push(`${digitos.slice(0, 4)}${digitos.slice(5)}`);
  } else if (digitos.startsWith("55") && digitos.length === 12) {
    lista.push(`${digitos.slice(0, 4)}9${digitos.slice(4)}`);
  }
  return lista;
};

// numero vindo do CRM: o link ja traz o DDI (55 no BR); aqui so ficam os
// digitos. Nao da para adivinhar DDI: +1 203 895 3755 tem 11 digitos, como um
// celular BR sem DDI.
export const normalizarNumero = (numero: string): string =>
  String(numero || "").replace(/\D/g, "");

const AbrirConversaCrmService = async ({
  userId,
  companyId,
  numero,
  nome,
  criar
}: Request): Promise<Response> => {
  const digitos = normalizarNumero(numero);
  if (digitos.length < 10 || digitos.length > 15) {
    throw new AppError("ERR_CRM_NUMERO_INVALIDO", 400);
  }

  const user = await User.findByPk(userId, {
    include: [{ model: Queue, as: "queues", attributes: ["id"] }]
  });
  if (!user || user.companyId !== companyId) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
  const filasDoUsuario = (user.queues || []).map(q => q.id);

  let contato = await Contact.findOne({
    where: {
      companyId,
      isGroup: false,
      number: { [Op.in]: variantesDoNumero(digitos) }
    }
  });

  // admin e supervisor: so a conversa que ja existe
  if (!criar || user.profile !== "user") {
    if (!contato) throw new AppError("ERR_CRM_SEM_CONVERSA", 404);
    const where: Record<string, unknown> = {
      companyId,
      contactId: contato.id
    };
    if (user.profile === "user") where.queueId = { [Op.in]: filasDoUsuario };
    const ultima = await Ticket.findOne({
      where,
      order: [["updatedAt", "DESC"]]
    });
    if (!ultima) throw new AppError("ERR_CRM_SEM_CONVERSA", 404);
    return { uuid: ultima.uuid, criada: false };
  }

  if (!filasDoUsuario.length) throw new AppError("ERR_CRM_SEM_FILA", 400);
  const queueId = filasDoUsuario[0];
  // conexao do atendente (a ligada a fila dele); precisa estar conectada
  const whatsapp = await GetUserWhatsApp({ companyId, userId, queueId });

  if (!contato) {
    contato = await CheckNumberAndCreateContact(
      digitos,
      String(nome || "").trim() || digitos,
      companyId,
      whatsapp
    );
    if (!contato) throw new AppError("ERR_WAPP_NOT_CONNECTED", 400);
  }

  const aberta = await CheckContactOpenTickets(contato.id, whatsapp.id, true);
  if (aberta) {
    // esperando na fila ou sem dono: passa a ser dele. Aberta com outro
    // atendente (nao deveria, o numero e dele): so abre.
    if (aberta.status === "pending" || !aberta.userId) {
      await UpdateTicketService({
        ticketData: { status: "open", userId, queueId },
        ticketId: aberta.id,
        companyId
      });
    }
    return { uuid: aberta.uuid, criada: false };
  }

  const nova = await CreateTicketService({
    contactId: contato.id,
    userId,
    queueId,
    companyId,
    whatsappId: whatsapp.id
  });
  return { uuid: nova.uuid, criada: true };
};

export default AbrirConversaCrmService;
