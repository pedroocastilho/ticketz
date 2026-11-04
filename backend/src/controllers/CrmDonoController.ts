import { Request, Response } from "express";
import { acessoCrmLiberado } from "../helpers/CrmWebhookToken";
import Whatsapp from "../models/Whatsapp";
import ConversaParaDonoService from "../services/CrmServices/ConversaParaDonoService";

// Rotas lidas pelo n8n (mesmo token das metricas: x-webhook-token = CRM_WEBHOOK_TOKEN).

// POST /crm/conversa-para-dono { companyId, uuid, conexaoDestino }
// Lead com dono mandou mensagem no numero de outro vendedor: a conversa vai para o dono.
export const conversaParaDono = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const corpo = req.body || {};
  const companyId = Number(corpo.companyId);
  if (!acessoCrmLiberado(req.header("x-webhook-token"), companyId)) {
    return res.status(403).json({ error: "ERR_FORBIDDEN" });
  }
  const uuid = String(corpo.uuid || "");
  const conexaoDestino = Number(corpo.conexaoDestino);
  if (!uuid || !Number.isInteger(conexaoDestino) || conexaoDestino <= 0) {
    return res.status(400).json({ error: "ERR_INVALID_DATA" });
  }
  const r = await ConversaParaDonoService({ companyId, uuid, conexaoDestino });
  return res.status(200).json(r);
};

// GET /crm/numeros?companyId=2
// Conexoes da empresa com o status e o numero pareado (rodizio do link e divisao de leads).
export const numeros = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const companyId = Number(req.query.companyId);
  if (!acessoCrmLiberado(req.header("x-webhook-token"), companyId)) {
    return res.status(403).json({ error: "ERR_FORBIDDEN" });
  }
  const conexoes = await Whatsapp.findAll({
    where: { companyId },
    attributes: ["id", "name", "status", "pairedNumber"]
  });
  return res.status(200).json({
    conexoes: conexoes.map(w => ({
      id: w.id,
      name: w.name,
      status: w.status,
      numero: w.pairedNumber || null
    }))
  });
};
