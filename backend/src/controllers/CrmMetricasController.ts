import { Request, Response } from "express";
import { DateTime } from "luxon";
import { Op } from "sequelize";
import { acessoCrmLiberado } from "../helpers/CrmWebhookToken";
import Contact from "../models/Contact";
import {
  normalizarNumero,
  variantesDoNumero
} from "../services/CrmServices/AbrirConversaCrmService";
import MetricasAtendimentoService, {
  horarioDoAmbiente
} from "../services/CrmServices/MetricasAtendimentoService";

// GET /crm/metricas-atendimento?companyId=2&de=2026-10-01&ate=2026-10-15
// Header x-webhook-token = CRM_WEBHOOK_TOKEN (o mesmo token do aviso ao CRM).
// So responde para as empresas de CRM_WEBHOOK_COMPANIES: o suporte fica de
// fora mesmo com o token certo.

// periodo maximo por chamada (o painel pede no maximo o mes)
const MAX_DIAS = 62;

const dataValida = (valor: unknown): valor is string =>
  typeof valor === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(valor) &&
  DateTime.fromISO(valor).isValid;

export const metricasAtendimento = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const companyId = Number(req.query.companyId);

  if (!acessoCrmLiberado(req.header("x-webhook-token"), companyId)) {
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

// POST /crm/metricas-atendimento  { companyId, de, ate, numeros: ["5511..."] }
// As mesmas metricas, mas so das conversas com esses numeros (painel do
// Formulario Jessica no CRM, 2026-10-29). Numero com DDI; BR casa com e sem o
// nono digito. A resposta traz tambem conversasPorContato (contato x conexao x
// dia) para o CRM contar quantos leads conversaram.
const MAX_NUMEROS = 5000;

export const contatosDosNumeros = (numeros: unknown[]): string[] => [
  ...new Set(
    numeros
      .map(n => normalizarNumero(String(n ?? "")))
      .filter(d => d.length >= 8)
      .flatMap(variantesDoNumero)
  )
];

export const metricasAtendimentoPorNumeros = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const corpo = req.body || {};
  const companyId = Number(corpo.companyId);

  if (!acessoCrmLiberado(req.header("x-webhook-token"), companyId)) {
    return res.status(403).json({ error: "ERR_FORBIDDEN" });
  }

  const horario = horarioDoAmbiente();
  const hoje = DateTime.now().setZone(horario.timezone).toISODate();
  const de = corpo.de ?? hoje;
  const ate = corpo.ate ?? de;
  if (!dataValida(de) || !dataValida(ate) || de > ate) {
    return res.status(400).json({ error: "ERR_INVALID_PERIOD" });
  }
  if (
    DateTime.fromISO(ate).diff(DateTime.fromISO(de), "days").days > MAX_DIAS
  ) {
    return res.status(400).json({ error: "ERR_PERIOD_TOO_LONG" });
  }
  if (!Array.isArray(corpo.numeros) || corpo.numeros.length > MAX_NUMEROS) {
    return res.status(400).json({ error: "ERR_INVALID_NUMBERS" });
  }

  const variantes = contatosDosNumeros(corpo.numeros);
  const contatos = variantes.length
    ? (
        await Contact.findAll({
          where: { companyId, number: { [Op.in]: variantes } },
          attributes: ["id"]
        })
      ).map(c => c.id)
    : [];

  const resultado = await MetricasAtendimentoService({
    companyId,
    de,
    ate,
    horario,
    contatos
  });

  return res
    .status(200)
    .json({ ...resultado, contatosAchados: contatos.length });
};
