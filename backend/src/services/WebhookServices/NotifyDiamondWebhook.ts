import axios from "axios";
import { logger } from "../../utils/logger";

interface Request {
  number: string;
  body?: string;
  // true quando quem escreveu foi um atendente pelo painel (nao o cliente)
  atendente?: boolean;
}

// subconjunto do process.env que interessa aqui; o indice de string e o que
// deixa passar o process.env inteiro sem o TypeScript reclamar
interface WebhookEnv {
  DIAMOND_WEBHOOK_URL?: string;
  DIAMOND_WEBHOOK_TOKEN?: string;
  [key: string]: string | undefined;
}

// tempo maximo esperando a API do Diamond; acima disso desiste e segue o
// atendimento normal, o webhook nunca pode segurar a conversa
const TIMEOUT_MS = 5000;

// O webhook so existe se as duas variaveis estiverem no .env-backend da VPS.
// Sem elas o recurso fica desligado, sem precisar de tela nem de migration.
export const isDiamondWebhookEnabled = (
  env: WebhookEnv = process.env
): boolean => !!env.DIAMOND_WEBHOOK_URL && !!env.DIAMOND_WEBHOOK_TOKEN;

// Repassa para a API do Diamond Agentes a mensagem recebida do cliente e, com
// atendente = true, a resposta que um atendente mandou pelo painel. Com a
// segunda o agente de onboarding sabe que uma pessoa assumiu a conversa e para
// de mandar mensagem para aquele cliente (antes os dois falavam ao mesmo tempo).
// Fire-and-forget: falha vira log e devolve false, nunca lanca. Nao ha
// retentativa nem fila de proposito — se isso virar problema, entra no Bull.
const NotifyDiamondWebhook = async (
  { number, body, atendente = false }: Request,
  env: WebhookEnv = process.env
): Promise<boolean> => {
  if (!isDiamondWebhookEnabled(env)) {
    return false;
  }

  try {
    await axios.post(
      env.DIAMOND_WEBHOOK_URL,
      atendente
        ? { number, body: body || "", fromMe: true, atendente: true }
        : { number, body: body || "", fromMe: false },
      {
        headers: { "x-webhook-token": env.DIAMOND_WEBHOOK_TOKEN },
        timeout: TIMEOUT_MS
      }
    );
    return true;
  } catch (err) {
    logger.warn(
      { message: err?.message, number },
      "NotifyDiamondWebhook: falha ao repassar mensagem"
    );
    return false;
  }
};

export default NotifyDiamondWebhook;
