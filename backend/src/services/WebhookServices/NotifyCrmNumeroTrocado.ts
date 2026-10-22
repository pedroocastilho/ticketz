import axios from "axios";
import { logger } from "../../utils/logger";
import { isCrmWebhookEnabledFor } from "./NotifyCrmWebhook";

// Aviso para o CRM de que uma conexao voltou com OUTRO numero de WhatsApp
// (evento "troca_numero"): o vendedor trocou de chip/celular pela tela "Meu
// numero". O CRM cria uma tarefa para a gestao. Mesmo webhook, token e lista
// de empresas do NotifyCrmWebhook.

interface Request {
  companyId: number;
  whatsapp: { id: number; name?: string };
  numeroAnterior: string;
  numeroNovo: string;
  // quem pediu a conexao pela tela (ultimos 30 min); null = nao se sabe
  pedidoPor: { id: number; name: string } | null;
}

interface WebhookEnv {
  CRM_WEBHOOK_URL?: string;
  CRM_WEBHOOK_TOKEN?: string;
  CRM_WEBHOOK_COMPANIES?: string;
  [key: string]: string | undefined;
}

const TIMEOUT_MS = 5000;

// Fire-and-forget: falha vira log e devolve false, nunca lanca.
const NotifyCrmNumeroTrocado = async (
  data: Request,
  env: WebhookEnv = process.env
): Promise<boolean> => {
  if (!isCrmWebhookEnabledFor(data.companyId, env)) {
    return false;
  }

  const payload = {
    evento: "troca_numero",
    companyId: data.companyId,
    whatsapp: { id: data.whatsapp.id, name: data.whatsapp.name || "" },
    numeroAnterior: data.numeroAnterior,
    numeroNovo: data.numeroNovo,
    pedidoPor: data.pedidoPor
      ? { id: data.pedidoPor.id, name: data.pedidoPor.name }
      : null,
    trocadoEm: new Date().toISOString()
  };

  try {
    await axios.post(env.CRM_WEBHOOK_URL, payload, {
      headers: { "x-webhook-token": env.CRM_WEBHOOK_TOKEN },
      timeout: TIMEOUT_MS
    });
    return true;
  } catch (err) {
    logger.warn(
      { message: err?.message, whatsappId: data.whatsapp.id },
      "NotifyCrmNumeroTrocado: falha ao avisar o CRM"
    );
    return false;
  }
};

export default NotifyCrmNumeroTrocado;
