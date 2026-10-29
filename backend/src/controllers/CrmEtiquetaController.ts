import { Request, Response } from "express";
import { acessoCrmLiberado } from "../helpers/CrmWebhookToken";
import { isEtiquetaEtapaEnabled } from "../helpers/EtiquetaEtapa";
import { etiquetaEtapaPorNumero } from "../services/CrmServices/EtiquetaEtapaService";

// POST /crm/etiqueta-etapa  { companyId, numero, etiqueta, aceitas: [...] }
// O cartao mudou de coluna no CRM: a conversa do numero ganha a etiqueta de
// etapa dessa coluna (e perde a anterior). "aceitas" = outras etiquetas que
// valem a mesma coluna (se a conversa ja tem uma, nada muda). Mesmo token das
// metricas (x-webhook-token = CRM_WEBHOOK_TOKEN).
export const etiquetaEtapa = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const corpo = req.body || {};
  const companyId = Number(corpo.companyId);

  if (!acessoCrmLiberado(req.header("x-webhook-token"), companyId)) {
    return res.status(403).json({ error: "ERR_FORBIDDEN" });
  }
  if (!isEtiquetaEtapaEnabled(companyId)) {
    return res.status(200).json({ ignorado: "etiquetas de etapa desligadas" });
  }
  const etiqueta = String(corpo.etiqueta || "").trim();
  const numero = String(corpo.numero || "");
  if (!etiqueta || etiqueta.length > 40 || !numero) {
    return res.status(400).json({ error: "ERR_INVALID_DATA" });
  }
  const aceitas = Array.isArray(corpo.aceitas)
    ? corpo.aceitas.map(String).slice(0, 20)
    : [];

  const r = await etiquetaEtapaPorNumero({
    companyId,
    numero,
    etiqueta,
    aceitas
  });
  return res.status(200).json(r);
};
