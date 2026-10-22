import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import {
  agruparPorContato,
  ContatoComAtividade,
  LinhaMensagemHistorico,
  LinhaTicketAtividade,
  MensagemHistorico,
  montarMensagemHistorico,
  paginarContatos,
  selecionarMaisRecentes
} from "./conversasCrm";

// Leitura das conversas do comercial para o cerebro dos Diamond Agentes
// (somente leitura). Mesmas regras das metricas do CRM: fora conversa de
// grupo, mensagem apagada e reacao.

type AtividadeRequest = {
  companyId: number;
  desde: Date;
  limite: number;
};

export const ConversasComAtividadeService = async ({
  companyId,
  desde,
  limite
}: AtividadeRequest): Promise<{
  contatos: ContatoComAtividade[];
  proximoCursor: string | null;
}> => {
  // uma linha por ticket com mensagem depois de "desde"; o agrupamento por
  // contato e o corte no limite ficam em conversasCrm
  const linhas = await sequelize.query<LinhaTicketAtividade>(
    `
      SELECT t.id AS "ticketId", t.uuid AS "ticketUuid", t."contactId",
             c.name AS nome, c.number AS numero,
             t."whatsappId", w.name AS "whatsappNome",
             t."userId", u.name AS "userNome",
             a."ultimaMensagemEm", a."ultimaFromMe", a.novas
        FROM (
          SELECT m."ticketId",
                 MAX(m."createdAt") AS "ultimaMensagemEm",
                 (ARRAY_AGG(m."fromMe" ORDER BY m."createdAt" DESC))[1]
                   AS "ultimaFromMe",
                 COUNT(*)::int AS novas
            FROM "Messages" m
           WHERE m."companyId" = :companyId
             AND m."createdAt" > :desde
             AND COALESCE(m."isDeleted", false) = false
             AND COALESCE(m."mediaType", '') <> 'reactionMessage'
           GROUP BY m."ticketId"
        ) a
        JOIN "Tickets" t ON t.id = a."ticketId"
        JOIN "Contacts" c ON c.id = t."contactId"
        LEFT JOIN "Whatsapps" w ON w.id = t."whatsappId"
        LEFT JOIN "Users" u ON u.id = t."userId"
       WHERE t."companyId" = :companyId
         AND t."isGroup" = false
         AND t."whatsappId" IS NOT NULL
    `,
    { replacements: { companyId, desde }, type: QueryTypes.SELECT }
  );

  const contatos = agruparPorContato(
    linhas.map(l => ({
      ...l,
      ultimaMensagemEm: new Date(l.ultimaMensagemEm),
      ultimaFromMe: !!l.ultimaFromMe,
      novas: Number(l.novas)
    }))
  );

  return paginarContatos(contatos, limite);
};

type HistoricoRequest = {
  companyId: number;
  contactId: number;
  desde?: Date | null;
  limite: number;
};

export type HistoricoConversa = {
  contactId: number;
  nome: string | null;
  numero: string | null;
  // havia mensagens mais antigas que ficaram de fora pelo limite
  truncado: boolean;
  mensagens: MensagemHistorico[];
};

// null quando o contato nao e da empresa (o controller responde 404)
export const ConversaHistoricoService = async ({
  companyId,
  contactId,
  desde = null,
  limite
}: HistoricoRequest): Promise<HistoricoConversa | null> => {
  const [contato] = await sequelize.query<{
    id: number;
    name: string | null;
    number: string | null;
  }>(
    `SELECT id, name, number FROM "Contacts"
      WHERE id = :contactId AND "companyId" = :companyId`,
    { replacements: { contactId, companyId }, type: QueryTypes.SELECT }
  );
  if (!contato) return null;

  // pelo contato do ticket (Messages.contactId pode vir vazio nas nossas);
  // busca as mais recentes primeiro e uma a mais para saber se cortou
  const linhas = await sequelize.query<LinhaMensagemHistorico>(
    `
      SELECT m.id, m."fromMe", m.body, m."mediaType", m."mediaUrl",
             m."createdAt", m."ticketId", t."whatsappId"
        FROM "Messages" m
        JOIN "Tickets" t ON t.id = m."ticketId"
       WHERE t."contactId" = :contactId
         AND t."companyId" = :companyId
         AND t."isGroup" = false
         ${desde ? `AND m."createdAt" > :desde` : ""}
         AND COALESCE(m."isDeleted", false) = false
         AND COALESCE(m."mediaType", '') <> 'reactionMessage'
       ORDER BY m."createdAt" DESC, m.id DESC
       LIMIT :limiteBusca
    `,
    {
      replacements: { contactId, companyId, desde, limiteBusca: limite + 1 },
      type: QueryTypes.SELECT
    }
  );

  const { itens, truncado } = selecionarMaisRecentes(
    linhas.map(l => ({ ...l, createdAt: new Date(l.createdAt) })),
    limite
  );

  return {
    contactId: contato.id,
    nome: contato.name,
    numero: contato.number,
    truncado,
    mensagens: itens.map(l => montarMensagemHistorico(l))
  };
};
