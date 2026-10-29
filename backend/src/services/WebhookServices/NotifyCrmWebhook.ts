import axios from "axios";
import { logger } from "../../utils/logger";

// Aviso para o CRM (Magnus/Twenty, via n8n) do que acontece numa conversa:
//   - evento "mensagem": mensagem do cliente (o CRM cria o lead com dono =
//     vendedor dono do numero e guarda o link da conversa) e resposta do
//     vendedor, pelo painel ou pelo celular (o CRM anda o card);
//   - evento "etiqueta": as etiquetas da conversa mudaram (o CRM grava origem,
//     produto ou tira do funil com "Nao e lead"; etiqueta de etapa anda os
//     cartoes). Vai a lista completa atual;
//   - evento "dono": vendedor puxou da fila comum uma conversa que ficou 5h sem
//     resposta (VacuoComercial.ts); o CRM passa os cartoes para ele.
//
// So vale para as empresas listadas em CRM_WEBHOOK_COMPANIES (ids separados
// por virgula). Sem URL, token ou lista o recurso fica desligado: o suporte,
// que esta na mesma instalacao, nunca manda nada para o CRM.

interface Request {
  // "dono": vendedor puxou a conversa da fila comum (5h sem resposta); o CRM
  // passa os cartoes abertos da pessoa para o dono do numero novo
  evento?: "mensagem" | "etiqueta" | "dono";
  companyId: number;
  fromMe?: boolean;
  // hora da mensagem (o CRM usa para os carimbos; padrao = agora)
  messageAt?: Date | number | null;
  // evento "etiqueta": nomes das etiquetas que a conversa tem agora
  etiquetas?: string[];
  body?: string;
  ticket: {
    id: number;
    uuid: string;
    status?: string;
    queueId?: number | null;
    userId?: number | null;
  };
  justCreated?: boolean;
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

// Resposta do vendedor so conta se aconteceu agora (10 min de folga para o
// atraso de entrega). Mensagem antiga reenviada na reconexao fica de fora.
const JANELA_RECENTE_MS = 10 * 60 * 1000;

export const isRecentMessage = (
  messageAtMs: number,
  agoraMs: number = Date.now()
): boolean =>
  Number.isFinite(messageAtMs) && agoraMs - messageAtMs <= JANELA_RECENTE_MS;

// Fire-and-forget: falha vira log e devolve false, nunca lanca. O atendimento
// nao pode esperar nem quebrar por causa do CRM.
const NotifyCrmWebhook = async (
  data: Request,
  env: WebhookEnv = process.env
): Promise<boolean> => {
  if (!isCrmWebhookEnabledFor(data.companyId, env)) {
    return false;
  }

  const momento =
    data.messageAt instanceof Date
      ? data.messageAt
      : new Date(data.messageAt ? Number(data.messageAt) : Date.now());
  const payload = {
    evento: data.evento || "mensagem",
    companyId: data.companyId,
    fromMe: !!data.fromMe,
    body: data.body || "",
    messageAt: Number.isNaN(momento.getTime())
      ? new Date().toISOString()
      : momento.toISOString(),
    etiquetas: data.etiquetas || [],
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
