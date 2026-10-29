import { Op } from "sequelize";
import Contact from "../../models/Contact";
import Tag from "../../models/Tag";
import Ticket from "../../models/Ticket";
import TicketTag from "../../models/TicketTag";
import { logger } from "../../utils/logger";
import {
  chaveEtiqueta,
  corDaEtiqueta,
  ETIQUETA_EM_ATENDIMENTO,
  isEtiquetaEtapaEnabled,
  precisaTrocar
} from "../../helpers/EtiquetaEtapa";
import { websocketUpdateTicket } from "../TicketServices/UpdateTicketService";
import NotifyCrmTagsChanged from "../WebhookServices/NotifyCrmTagsChanged";
import { normalizarNumero, variantesDoNumero } from "./AbrirConversaCrmService";

// Etiquetas de etapa no banco (regras em helpers/EtiquetaEtapa.ts).

// acha a etiqueta pelo nome (sem ligar para acento e maiuscula) ou cria com o
// kanban ligado; etiqueta que ja existia fica como estava
export async function garantirEtiqueta(
  companyId: number,
  nome: string
): Promise<Tag> {
  const chave = chaveEtiqueta(nome);
  const daEmpresa = await Tag.findAll({ where: { companyId } });
  const achada = daEmpresa.find(t => chaveEtiqueta(t.name) === chave);
  if (achada) return achada;
  return Tag.create({
    companyId,
    name: nome,
    color: corDaEtiqueta(nome),
    kanban: 1
  });
}

const etiquetasDaConversa = async (ticketId: number): Promise<Tag[]> => {
  const ligacoes = await TicketTag.findAll({ where: { ticketId } });
  if (!ligacoes.length) return [];
  return Tag.findAll({
    where: { id: { [Op.in]: ligacoes.map(l => l.tagId) } }
  });
};

// poe a etiqueta de etapa na conversa e tira as outras de etapa. Devolve se
// mudou alguma coisa. Nao avisa o CRM (quem chama decide).
export async function trocarEtapaDaConversa(
  ticket: Ticket,
  etiqueta: Tag,
  aceitas: string[]
): Promise<boolean> {
  const atuais = await etiquetasDaConversa(ticket.id);
  if (!precisaTrocar(atuais, [etiqueta.name, ...aceitas])) return false;
  const tirar = atuais.filter(t => Number(t.kanban) === 1).map(t => t.id);
  if (tirar.length) {
    await TicketTag.destroy({
      where: { ticketId: ticket.id, tagId: { [Op.in]: tirar } }
    });
  }
  await TicketTag.create({ ticketId: ticket.id, tagId: etiqueta.id });
  await ticket.reload();
  websocketUpdateTicket(ticket);
  return true;
}

// CRM -> Ticketz: o cartao mudou de coluna. Vale para as conversas vivas do
// contato (aberta ou aguardando) ou, sem nenhuma, a mais recente. Nao avisa o
// CRM de volta: a coluna ja e essa (senao viraria um vai e vem).
export async function etiquetaEtapaPorNumero({
  companyId,
  numero,
  etiqueta,
  aceitas = []
}: {
  companyId: number;
  numero: string;
  etiqueta: string;
  aceitas?: string[];
}): Promise<{ conversas: number; trocadas: number }> {
  const digitos = normalizarNumero(numero);
  if (digitos.length < 8) return { conversas: 0, trocadas: 0 };
  const contatos = await Contact.findAll({
    where: {
      companyId,
      isGroup: false,
      number: { [Op.in]: variantesDoNumero(digitos) }
    },
    attributes: ["id"]
  });
  if (!contatos.length) return { conversas: 0, trocadas: 0 };
  const ids = contatos.map(c => c.id);
  let conversas = await Ticket.findAll({
    where: {
      companyId,
      contactId: { [Op.in]: ids },
      isGroup: false,
      status: { [Op.in]: ["open", "pending"] }
    }
  });
  if (!conversas.length) {
    const recente = await Ticket.findOne({
      where: { companyId, contactId: { [Op.in]: ids }, isGroup: false },
      order: [["updatedAt", "DESC"]]
    });
    conversas = recente ? [recente] : [];
  }
  if (!conversas.length) return { conversas: 0, trocadas: 0 };
  const tag = await garantirEtiqueta(companyId, etiqueta);
  let trocadas = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const t of conversas) {
    if (await trocarEtapaDaConversa(t, tag, aceitas)) trocadas += 1;
  }
  return { conversas: conversas.length, trocadas };
}

// Ticketz -> CRM: primeira mensagem do vendedor numa conversa sem etiqueta de
// etapa = "Em atendimento" (o CRM anda os cartoes). Nunca lanca.
export async function marcarEmAtendimento(
  ticketId: number,
  companyId: number
): Promise<boolean> {
  if (!isEtiquetaEtapaEnabled(companyId)) return false;
  try {
    const ticket = await Ticket.findOne({ where: { id: ticketId, companyId } });
    if (!ticket || ticket.isGroup) return false;
    const atuais = await etiquetasDaConversa(ticket.id);
    if (atuais.some(t => Number(t.kanban) === 1)) return false;
    const tag = await garantirEtiqueta(companyId, ETIQUETA_EM_ATENDIMENTO);
    await TicketTag.create({ ticketId: ticket.id, tagId: tag.id });
    await ticket.reload();
    websocketUpdateTicket(ticket);
    NotifyCrmTagsChanged({ companyId, ticketId: ticket.id });
    return true;
  } catch (err) {
    logger.warn(
      { message: err?.message, ticketId },
      "marcarEmAtendimento: falha ao marcar a etiqueta"
    );
    return false;
  }
}
