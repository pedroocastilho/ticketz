import Contact from "../../models/Contact";
import ContactCustomField from "../../models/ContactCustomField";
import { websocketUpdateContact } from "../ContactServices/UpdateContactService";

// Grava (ou atualiza) os campos da IA no contato e avisa as telas abertas pelo
// socket de contato, com as informacoes adicionais junto: a lista de
// atendimentos troca a etiqueta na hora. Os outros campos do contato ficam.
// Devolve false quando o contato nao e da empresa.
const GravarNotaIaService = async ({
  companyId,
  contactId,
  campos
}: {
  companyId: number;
  contactId: number;
  campos: { name: string; value: string }[];
}): Promise<boolean> => {
  const contato = await Contact.findOne({
    where: { id: contactId, companyId },
    attributes: ["id"]
  });
  if (!contato) return false;

  // um campo por nome: atualiza o que existe, cria o que falta
  await Promise.all(
    campos.map(async campo => {
      const existente = await ContactCustomField.findOne({
        where: { contactId, name: campo.name }
      });
      if (!existente) {
        await ContactCustomField.create({
          contactId,
          name: campo.name,
          value: campo.value
        });
      } else if (existente.value !== campo.value) {
        await existente.update({ value: campo.value });
      }
    })
  );

  const atualizado = await Contact.findByPk(contactId, {
    include: ["extraInfo", "tags"]
  });
  if (atualizado) websocketUpdateContact(atualizado);
  return true;
};

export default GravarNotaIaService;
