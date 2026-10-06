import axios from "axios";
import { logger } from "../../utils/logger";

// Aviso para o CRM (Magnus/Twenty, via n8n) de que chegou mensagem numa
// conversa: o CRM cria o lead com dono = vendedor dono do numero e guarda o
// link da conversa no negocio.
//
// So vale para as empresas listadas em CRM_WEBHOOK_COMPANIES (ids separados
// por virgula). Sem URL, token ou lista o recurso fica desligado: o suporte,
// que esta na mesma instalacao, nunca manda nada para o CRM.

interface Request {
  companyId: number;
  fromMe: boolean;
  body?: string;
  ticket: {
    id: number;
    uuid: string;
    status?: string;
    queueId?: number | null;
    userId?: number | null;
  };
  justCreated: boolean;
  whatsapp: { id: number; name?: string };
  contact: { id?: number; name?: string; number: string };
}

interface WebhookEnv {
  CRM_WEBHOOK_URL?: string;
  CRM_WEBHOOK_TOKEN?: string;
  CRM_WEBHOOK_COMPANIES?: string;
  [key: string]: string | undefined;
}

// o n8n responde na hora (responseMode onReceived); 5 s e folga de sobra
const TIMEOUT_MS = 5000;

const empresasLigadas = (env: WebhookEnv): number[] =>
  String(env.CRM_WEBHOOK_COMPANIES || "")
    .split(",")
    .map(s => Number(s.trim()))
    .filter(n => Number.isInteger(n) && n > 0);

export const isCrmWebhookEnabledFor = (
  companyId: number,
  env: WebhookEnv = process.env
): boolean =>
  !!env.CRM_WEBHOOK_URL &&
  !!env.CRM_WEBHOOK_TOKEN &&
  empresasLigadas(env).includes(Number(companyId));

// Fire-and-forget: falha vira log e devolve false, nunca lanca. O atendimento
// nao pode esperar nem quebrar por causa do CRM.
const NotifyCrmWebhook = async (
  data: Request,
  env: WebhookEnv = process.env
): Promise<boolean> => {
  if (!isCrmWebhookEnabledFor(data.companyId, env)) {
    return false;
  }

  const payload = {
    evento: "mensagem",
    companyId: data.companyId,
    fromMe: !!data.fromMe,
    body: data.body || "",
    ticket: {
      id: data.ticket.id,
      uuid: data.ticket.uuid,
      status: data.ticket.status || null,
      queueId: data.ticket.queueId ?? null,
      userId: data.ticket.userId ?? null,
      justCreated: !!data.justCreated
    },
    whatsapp: { id: data.whatsapp.id, name: data.whatsapp.name || "" },
    contact: {
      id: data.contact.id ?? null,
      name: data.contact.name || "",
      number: data.contact.number
    }
  };

  try {
    await axios.post(env.CRM_WEBHOOK_URL, payload, {
      headers: { "x-webhook-token": env.CRM_WEBHOOK_TOKEN },
      timeout: TIMEOUT_MS
    });
    return true;
  } catch (err) {
    logger.warn(
      { message: err?.message, ticketId: data.ticket.id },
      "NotifyCrmWebhook: falha ao avisar o CRM"
    );
    return false;
  }
};

export default NotifyCrmWebhook;
