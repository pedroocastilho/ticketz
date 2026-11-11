import axios from "axios";
import { logger } from "../../utils/logger";

// Aviso para a aba Reembolsos do CRM (Magnus/Twenty, via n8n) das mensagens da
// Ouvidoria (11/11/2026, pedido do Francisco: metricas de reversao de reembolso
// da Kaylane). A Ouvidoria fica na conta do suporte, que NAO esta em
// CRM_WEBHOOK_COMPANIES de proposito (senao toda conversa do suporte viraria
// lead do comercial). Aqui a chave e por CONEXAO: so as conexoes listadas em
// OUVIDORIA_CONEXOES (ids separados por virgula) avisam, e para uma URL propria
// (OUVIDORIA_WEBHOOK_URL), com o mesmo token do CRM (CRM_WEBHOOK_TOKEN).
// Sem URL, token ou lista o recurso fica desligado. Mesmo formato do evento
// "mensagem" do NotifyCrmWebhook, sem o texto.

interface Request {
  companyId: number;
  fromMe?: boolean;
  messageAt?: Date | number | null;
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

interface OuvidoriaEnv {
  OUVIDORIA_WEBHOOK_URL?: string;
  OUVIDORIA_CONEXOES?: string;
  CRM_WEBHOOK_TOKEN?: string;
  [key: string]: string | undefined;
}

// o n8n responde na hora (responseMode onReceived); 5 s e folga de sobra
const TIMEOUT_MS = 5000;

export const isOuvidoriaConexao = (
  whatsappId: number,
  env: OuvidoriaEnv = process.env
): boolean =>
  !!env.OUVIDORIA_WEBHOOK_URL &&
  !!env.CRM_WEBHOOK_TOKEN &&
  String(env.OUVIDORIA_CONEXOES || "")
    .split(",")
    .map(s => Number(s.trim()))
    .filter(n => Number.isInteger(n) && n > 0)
    .includes(Number(whatsappId));

// Fire-and-forget: falha vira log e devolve false, nunca lanca. O atendimento
// nao pode esperar nem quebrar por causa do CRM. O texto da mensagem NAO vai:
// o CRM so precisa saber quem falou e quando.
const NotifyOuvidoriaWebhook = async (
  data: Request,
  env: OuvidoriaEnv = process.env
): Promise<boolean> => {
  if (!isOuvidoriaConexao(data.whatsapp.id, env)) {
    return false;
  }

  const momento =
    data.messageAt instanceof Date
      ? data.messageAt
      : new Date(data.messageAt ? Number(data.messageAt) : Date.now());
  const payload = {
    evento: "mensagem",
    companyId: data.companyId,
    fromMe: !!data.fromMe,
    messageAt: Number.isNaN(momento.getTime())
      ? new Date().toISOString()
      : momento.toISOString(),
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
    await axios.post(env.OUVIDORIA_WEBHOOK_URL, payload, {
      headers: { "x-webhook-token": env.CRM_WEBHOOK_TOKEN },
      timeout: TIMEOUT_MS
    });
    return true;
  } catch (err) {
    logger.warn(
      { message: err?.message, ticketId: data.ticket.id },
      "NotifyOuvidoriaWebhook: falha ao avisar o CRM"
    );
    return false;
  }
};

export default NotifyOuvidoriaWebhook;
