import { Op } from "sequelize";
import Contact from "../../models/Contact";
import ContactTag from "../../models/ContactTag";
import Tag from "../../models/Tag";
import { chaveEtiqueta } from "../../helpers/EtiquetaEtapa";
import { websocketUpdateContact } from "../ContactServices/UpdateContactService";
import { normalizarNumero, variantesDoNumero } from "./AbrirConversaCrmService";

// CRM -> Ticketz: etiqueta no CONTATO (nao na conversa), ex. "Comprou na live"
// (07/11/2026, Francisco: vendedor vendendo para quem ja comprou na live). A
// etiqueta do contato aparece em todas as conversas dele, de qualquer numero,
// inclusive as que ainda vao abrir. Nao e etiqueta de etapa (kanban 0): nao tira
// nada da conversa e nao avisa o CRM. So marca contato que ja existe: criar
// contato daqui poderia duplicar (o WhatsApp manda o numero sem o 9 em DDD > 30);
// quem ainda nao falou e marcado pelo n8n na primeira mensagem.

export const COR_ETIQUETA_CONTATO = "#2e7d32";

// contatos que ainda nao tem a etiqueta
export const contatosSemEtiqueta = (
  contatos: Array<{ id: number; tags?: Array<{ id: number }> }>,
  tagId: number
): number[] =>
  contatos
    .filter(c => !(c.tags || []).some(t => Number(t.id) === Number(tagId)))
    .map(c => c.id);

// acha a etiqueta pelo nome (sem ligar para acento e maiuscula) ou cria fora do
// kanban; etiqueta que ja existia fica como estava
const garantirEtiquetaDeContato = async (
  companyId: number,
  nome: string
): Promise<Tag> => {
  const chave = chaveEtiqueta(nome);
  const daEmpresa = await Tag.findAll({ where: { companyId } });
  const achada = daEmpresa.find(t => chaveEtiqueta(t.name) === chave);
  if (achada) return achada;
  return Tag.create({
    companyId,
    name: nome,
    color: COR_ETIQUETA_CONTATO,
    kanban: 0
  });
};

export async function etiquetarContatoPorNumero({
  companyId,
  numero,
  etiqueta
}: {
  companyId: number;
  numero: string;
  etiqueta: string;
}): Promise<{ contatos: number; marcados: number }> {
  const digitos = normalizarNumero(numero);
  if (digitos.length < 8) return { contatos: 0, marcados: 0 };
  const contatos = await Contact.findAll({
    where: {
      companyId,
      isGroup: false,
      number: { [Op.in]: variantesDoNumero(digitos) }
    },
    include: ["tags"]
  });
  if (!contatos.length) return { contatos: 0, marcados: 0 };
  const tag = await garantirEtiquetaDeContato(companyId, etiqueta);
  const faltam = contatosSemEtiqueta(contatos, tag.id);
  // eslint-disable-next-line no-restricted-syntax
  for (const contactId of faltam) {
    await ContactTag.findOrCreate({
      where: { contactId, tagId: tag.id },
      defaults: { contactId, tagId: tag.id }
    });
    const atualizado = await Contact.findByPk(contactId, {
      include: ["tags", "extraInfo"]
    });
    if (atualizado) websocketUpdateContact(atualizado);
  }
  return { contatos: contatos.length, marcados: faltam.length };
}
