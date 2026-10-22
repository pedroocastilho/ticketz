import { Request, Response } from "express";
import { DateTime } from "luxon";
import { acessoCrmLiberado } from "../helpers/CrmWebhookToken";
import { lerLimite } from "../services/CrmServices/conversasCrm";
import {
  ConversaHistoricoService,
  ConversasComAtividadeService
} from "../services/CrmServices/ConversasCrmService";

// Leitura das conversas do comercial pelo cerebro dos Diamond Agentes (nota do
// lead, resumo). Somente leitura. Mesma protecao das metricas do CRM: header
// x-webhook-token = CRM_WEBHOOK_TOKEN e so as empresas de
// CRM_WEBHOOK_COMPANIES.
//
// GET /crm/conversas-com-atividade?companyId=2&desde=<ISO>&limite=200
//   contatos com mensagem depois de "desde" (exclusivo), da ultima mensagem
//   mais antiga para a mais nova. Com proximoCursor, chamar de novo com
//   desde=proximoCursor. Pode repetir contato entre chamadas (horario com
//   fracao de milissegundo): o chamador junta pelo contactId / id da mensagem.
// GET /crm/conversa-historico?companyId=2&contactId=10&desde=<ISO>&limite=400
//   mensagens do contato em todos os tickets da empresa, em ordem de envio;
//   com limite, ficam as mais recentes.

const ATIVIDADE_LIMITE_PADRAO = 200;
const ATIVIDADE_LIMITE_MAX = 500;
const HISTORICO_LIMITE_PADRAO = 400;
const HISTORICO_LIMITE_MAX = 1000;

const lerDataHora = (valor: unknown): Date | null => {
  if (typeof valor !== "string" || !valor) return null;
  const data = DateTime.fromISO(valor);
  return data.isValid ? data.toJSDate() : null;
};

const invalido = (res: Response): Response =>
  res.status(400).json({ error: "ERR_INVALID_PARAMS" });

export const conversasComAtividade = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const companyId = Number(req.query.companyId);
  if (!acessoCrmLiberado(req.header("x-webhook-token"), companyId)) {
    return res.status(403).json({ error: "ERR_FORBIDDEN" });
  }

  const desde = lerDataHora(req.query.desde);
  const limite = lerLimite(
    req.query.limite,
    ATIVIDADE_LIMITE_PADRAO,
    ATIVIDADE_LIMITE_MAX
  );
  if (!desde || !limite) return invalido(res);

  const resultado = await ConversasComAtividadeService({
    companyId,
    desde,
    limite
  });
  return res.status(200).json(resultado);
};

export const conversaHistorico = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const companyId = Number(req.query.companyId);
  if (!acessoCrmLiberado(req.header("x-webhook-token"), companyId)) {
    return res.status(403).json({ error: "ERR_FORBIDDEN" });
  }

  const contactId = Number(req.query.contactId);
  // desde e opcional; se veio, tem que ser data valida
  const temDesde = req.query.desde !== undefined && req.query.desde !== "";
  const desde = temDesde ? lerDataHora(req.query.desde) : null;
  const limite = lerLimite(
    req.query.limite,
    HISTORICO_LIMITE_PADRAO,
    HISTORICO_LIMITE_MAX
  );
  if (
    !Number.isInteger(contactId) ||
    contactId < 1 ||
    (temDesde && !desde) ||
    !limite
  ) {
    return invalido(res);
  }

  const resultado = await ConversaHistoricoService({
    companyId,
    contactId,
    desde,
    limite
  });
  if (!resultado) {
    return res.status(404).json({ error: "ERR_NOT_FOUND" });
  }
  return res.status(200).json(resultado);
};
