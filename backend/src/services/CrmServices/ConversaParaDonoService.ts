import { Op } from "sequelize";
import CheckContactOpenTickets from "../../helpers/CheckContactOpenTickets";
import { nomeFilaLivres } from "../../helpers/VacuoComercial";
import { getIO } from "../../libs/socket";
import Message from "../../models/Message";
import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import WhatsappQueue from "../../models/WhatsappQueue";
import ShowTicketService from "../TicketServices/ShowTicketService";
import UpdateTicketService, {
  websocketUpdateTicket
} from "../TicketServices/UpdateTicketService";

// O lead ja tem dono no CRM e mandou mensagem no numero de OUTRO vendedor (o link
// de rodizio nao sabe quem clicou). O n8n pede para a conversa ir para o numero e a
// fila do dono. Nada e enviado ao cliente: quem responde e o dono, pelo numero dele,
// com o historico inteiro.
//   - sem conversa viva no numero do dono: a propria conversa muda de numero e fila;
//   - com conversa viva la (o Ticketz nao aceita duas do mesmo contato no mesmo
//     numero, e e o caso de o cliente insistir no numero errado): as mensagens passam
//     para a conversa do dono e esta fecha, sem mensagem de encerramento.
// Numero do dono desconectado: nao move (a conversa nao sairia); o CRM mostra o aviso.

interface ConversaLike {
  isGroup?: boolean;
  status?: string;
  whatsappId?: number;
}

interface EntradaDecisao {
  ticket: ConversaLike | null;
  conexaoDestino: number;
  statusDestino: string | null;
  filaDestino: number | null;
  temConversaViva: boolean;
}

export type Decisao =
  | { acao: "nada"; motivo: string }
  | { acao: "mover" }
  | { acao: "juntar" };

export const decidirConversaParaDono = ({
  ticket,
  conexaoDestino,
  statusDestino,
  filaDestino,
  temConversaViva
}: EntradaDecisao): Decisao => {
  if (!ticket) return { acao: "nada", motivo: "conversa nao encontrada" };
  if (ticket.isGroup) return { acao: "nada", motivo: "grupo nao muda de numero" };
  if (ticket.status === "closed") {
    return { acao: "nada", motivo: "conversa fechada" };
  }
  if (ticket.whatsappId === conexaoDestino) {
    return { acao: "nada", motivo: "ja esta no numero do dono" };
  }
  if (!statusDestino) return { acao: "nada", motivo: "numero do dono nao existe" };
  if (statusDestino !== "CONNECTED") {
    return { acao: "nada", motivo: "numero do dono desconectado" };
  }
  if (!filaDestino) return { acao: "nada", motivo: "numero do dono sem fila" };
  return temConversaViva ? { acao: "juntar" } : { acao: "mover" };
};

// fila de vendedor ligada a conexao (a fila comum "Livres" nao serve de destino)
const filaDaConexao = async (
  whatsappId: number,
  companyId: number
): Promise<number | null> => {
  const ligacoes = await WhatsappQueue.findAll({ where: { whatsappId } });
  if (!ligacoes.length) return null;
  const fila = await Queue.findOne({
    where: {
      companyId,
      id: { [Op.in]: ligacoes.map(l => l.queueId) },
      name: { [Op.ne]: nomeFilaLivres() }
    },
    attributes: ["id"]
  });
  return fila ? fila.id : null;
};

interface Pedido {
  companyId: number;
  uuid: string;
  conexaoDestino: number;
}

interface Resposta {
  movida: boolean;
  juntou?: boolean;
  motivo?: string;
  uuid?: string;
}

const ConversaParaDonoService = async ({
  companyId,
  uuid,
  conexaoDestino
}: Pedido): Promise<Resposta> => {
  const ticket = await Ticket.findOne({ where: { uuid, companyId } });
  const destino = await Whatsapp.findOne({
    where: { id: conexaoDestino, companyId },
    attributes: ["id", "status"]
  });
  const filaDestino = destino
    ? await filaDaConexao(destino.id, companyId)
    : null;
  const viva =
    ticket && destino
      ? await CheckContactOpenTickets(ticket.contactId, destino.id, true)
      : null;

  const decisao = decidirConversaParaDono({
    ticket,
    conexaoDestino,
    statusDestino: destino ? destino.status : null,
    filaDestino,
    temConversaViva: !!viva
  });
  if (decisao.acao === "nada") {
    return { movida: false, motivo: decisao.motivo };
  }

  if (decisao.acao === "mover") {
    await UpdateTicketService({
      ticketId: ticket.id,
      ticketData: {
        status: "pending",
        userId: null,
        queueId: filaDestino,
        whatsappId: destino.id
      },
      companyId,
      dontRunChatbot: true
    });
    return { movida: true, uuid: ticket.uuid };
  }

  // juntar: as mensagens vao para a conversa do dono e esta fecha (direto, sem o
  // UpdateTicketService, que mandaria mensagem de encerramento ao cliente)
  const { status: statusAntigo, userId: donoAntigo, queueId: filaAntiga } = ticket;
  await Message.update(
    { ticketId: viva.id },
    { where: { ticketId: ticket.id, companyId } }
  );
  await viva.update({
    lastMessage: ticket.lastMessage,
    unreadMessages: (viva.unreadMessages || 0) + (ticket.unreadMessages || 0)
  });
  await ticket.update({ status: "closed", unreadMessages: 0 });

  getIO()
    .to(`company-${companyId}-${statusAntigo}`)
    .to(`queue-${filaAntiga}-${statusAntigo}`)
    .to(`user-${donoAntigo}`)
    .emit(`company-${companyId}-ticket`, {
      action: "removeFromList",
      ticketId: ticket.id
    });
  websocketUpdateTicket(await ShowTicketService(viva.id, companyId));

  return { movida: true, juntou: true, uuid: viva.uuid };
};

export default ConversaParaDonoService;
