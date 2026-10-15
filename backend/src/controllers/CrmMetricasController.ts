import { timingSafeEqual } from "crypto";
import { Request, Response } from "express";
import { DateTime } from "luxon";
import { isCrmWebhookEnabledFor } from "../services/WebhookServices/NotifyCrmWebhook";
import MetricasAtendimentoService, {
  horarioDoAmbiente
} from "../services/CrmServices/MetricasAtendimentoService";

// GET /crm/metricas-atendimento?companyId=2&de=2026-10-01&ate=2026-10-15
// Header x-webhook-token = CRM_WEBHOOK_TOKEN (o mesmo token do aviso ao CRM).
// So responde para as empresas de CRM_WEBHOOK_COMPANIES: o suporte fica de
// fora mesmo com o token certo.

// periodo maximo por chamada (o painel pede no maximo o mes)
const MAX_DIAS = 62;

const tokenConfere = (recebido: string, esperado: string): boolean => {
  const a = new TextEncoder().encode(String(recebido || ""));
  const b = new TextEncoder().encode(String(esperado || ""));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
};

const dataValida = (valor: unknown): valor is string =>
  typeof valor === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(valor) &&
  DateTime.fromISO(valor).isValid;

export const metricasAtendimento = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const companyId = Number(req.query.companyId);

  if (
    !tokenConfere(
      req.header("x-webhook-token"),
      process.env.CRM_WEBHOOK_TOKEN
    ) ||
    !isCrmWebhookEnabledFor(companyId)
  ) {
    return res.status(403).json({ error: "ERR_FORBIDDEN" });
  }

  const horario = horarioDoAmbiente();
  const hoje = DateTime.now().setZone(horario.timezone).toISODate();
  const de = req.query.de ?? hoje;
  const ate = req.query.ate ?? de;

  if (!dataValida(de) || !dataValida(ate) || de > ate) {
    return res.status(400).json({ error: "ERR_INVALID_PERIOD" });
  }
  if (
    DateTime.fromISO(ate).diff(DateTime.fromISO(de), "days").days > MAX_DIAS
  ) {
    return res.status(400).json({ error: "ERR_PERIOD_TOO_LONG" });
  }

  const resultado = await MetricasAtendimentoService({
    companyId,
    de,
    ate,
    horario
  });

  return res.status(200).json(resultado);
};
