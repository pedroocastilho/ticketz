import { timingSafeEqual } from "crypto";
import { isCrmWebhookEnabledFor } from "../services/WebhookServices/NotifyCrmWebhook";

// Protecao das rotas do CRM lidas por fora (n8n, cerebro dos Diamond Agentes):
// header x-webhook-token = CRM_WEBHOOK_TOKEN e empresa listada em
// CRM_WEBHOOK_COMPANIES. O suporte fica de fora mesmo com o token certo.

// comparacao em tempo constante; token vazio nunca confere
export const tokenConfere = (recebido: string, esperado: string): boolean => {
  const a = new TextEncoder().encode(String(recebido || ""));
  const b = new TextEncoder().encode(String(esperado || ""));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
};

export const acessoCrmLiberado = (
  tokenRecebido: string | undefined,
  companyId: number,
  env: NodeJS.ProcessEnv = process.env
): boolean =>
  tokenConfere(tokenRecebido, env.CRM_WEBHOOK_TOKEN) &&
  isCrmWebhookEnabledFor(companyId, env);
