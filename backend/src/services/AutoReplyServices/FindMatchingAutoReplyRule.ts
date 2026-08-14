import { Op } from "sequelize";
import AutoReplyRule from "../../models/AutoReplyRule";

// marcas de acento separadas pelo normalize("NFD")
const DIACRITICS = /[\u0300-\u036f]/g;

// minusculas e sem acento, para "REEMBOLSO" e "reembôlso" casarem com "reembolso"
export const normalizeText = (text: string): string =>
  (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS, "");

export const splitKeywords = (keywords: string): string[] =>
  (keywords || "")
    .split(",")
    .map(keyword => normalizeText(keyword).trim())
    .filter(keyword => keyword.length > 0);

// Casamento por substring da palavra cadastrada. Nada de correspondencia
// difusa: as variacoes sao cadastradas na tela, o que e mais previsivel e
// mais facil de corrigir do que um algoritmo adivinhando.
export const matchesKeywords = (keywords: string, body: string): boolean => {
  const normalizedBody = normalizeText(body);

  if (!normalizedBody.trim()) {
    return false;
  }

  return splitKeywords(keywords).some(keyword =>
    normalizedBody.includes(keyword)
  );
};

interface Request {
  companyId: number;
  whatsappId: number;
  queueId?: number | null;
  body: string;
}

// Devolve a primeira regra ativa da empresa que se aplica a essa conexao/fila
// e cujas palavras aparecem na mensagem. Regra sem conexao ou sem fila vale
// para todas.
const FindMatchingAutoReplyRule = async ({
  companyId,
  whatsappId,
  queueId,
  body
}: Request): Promise<AutoReplyRule | null> => {
  if (!normalizeText(body).trim()) {
    return null;
  }

  const rules = await AutoReplyRule.findAll({
    where: {
      companyId,
      active: true,
      whatsappId: { [Op.or]: [null, whatsappId] }
    },
    order: [["id", "ASC"]]
  });

  const applicable = rules.filter(
    rule => !rule.queueId || rule.queueId === queueId
  );

  return applicable.find(rule => matchesKeywords(rule.keywords, body)) || null;
};

export default FindMatchingAutoReplyRule;
