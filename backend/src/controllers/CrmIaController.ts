import { Request, Response } from "express";
import { acessoCrmLiberado } from "../helpers/CrmWebhookToken";
import { camposNotaIa } from "../services/CrmServices/notaIaContato";
import GravarNotaIaService from "../services/CrmServices/GravarNotaIaService";

// POST /crm/ia-contato  (cerebro dos Diamond Agentes, Inteligencia Comercial)
// { companyId, contactId, nota: 0-100, temperatura: quente|morno|frio,
//   proximoPasso?, resumo?, analisadoEm? (ISO) }
// Mesma protecao das leituras do CRM: x-webhook-token = CRM_WEBHOOK_TOKEN e
// so as empresas de CRM_WEBHOOK_COMPANIES. So mexe nos campos "... IA".
export const gravarIaContato = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const corpo = (
    req.body && typeof req.body === "object" ? req.body : {}
  ) as Record<string, unknown>;
  const companyId = Number(corpo.companyId);
  if (!acessoCrmLiberado(req.header("x-webhook-token"), companyId)) {
    return res.status(403).json({ error: "ERR_FORBIDDEN" });
  }

  const contactId = Number(corpo.contactId);
  const campos = camposNotaIa({
    nota: corpo.nota,
    temperatura: corpo.temperatura,
    proximoPasso: corpo.proximoPasso,
    resumo: corpo.resumo,
    analisadoEm: corpo.analisadoEm
  });
  if (!Number.isInteger(contactId) || contactId <= 0 || !campos) {
    return res.status(400).json({ error: "ERR_INVALID_PARAMS" });
  }

  const ok = await GravarNotaIaService({ companyId, contactId, campos });
  if (!ok) return res.status(404).json({ error: "ERR_NOT_FOUND" });
  return res.status(200).json({ ok: true });
};
