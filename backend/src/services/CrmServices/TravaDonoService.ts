import axios from "axios";
import { Op } from "sequelize";
import AppError from "../../errors/AppError";
import UserQueue from "../../models/UserQueue";
import WhatsappQueue from "../../models/WhatsappQueue";
import { logger } from "../../utils/logger";
import { isCrmWebhookEnabledFor } from "../WebhookServices/NotifyCrmWebhook";

// Trava "lead de outro vendedor": ao COMECAR conversa (botao Chamar no WhatsApp do CRM
// ou Nova conversa), o Ticketz pergunta ao CRM quem e o dono. Sendo outro vendedor, nao
// cria a conversa. So COMECAR conversa: abrir uma que ja existe, puxar da fila Livres
// (regra das 5h) e supervisor/admin continuam iguais.
// O CRM fora do ar nao pode parar o comercial: qualquer falha na consulta libera.
// Ligada por CRM_DONO_URL (vazio = desligado) nas empresas de CRM_WEBHOOK_COMPANIES.

interface DonoEnv {
  CRM_DONO_URL?: string;
  CRM_WEBHOOK_TOKEN?: string;
  CRM_WEBHOOK_COMPANIES?: string;
  [key: string]: string | undefined;
}

export interface DonoDoLead {
  nome: string;
  conexaoTicketz: number | null;
}

const TIMEOUT_MS = 2500;

export const isTravaDonoEnabled = (
  companyId: number,
  env: DonoEnv = process.env
): boolean => !!env.CRM_DONO_URL && isCrmWebhookEnabledFor(companyId, env);

export const mensagemLeadDeOutro = (nome: string): string =>
  `Este lead é de ${nome}. Só o dono pode chamar: se precisar assumir, fale com a gestão.`;

export const consultarDonoDoLead = async (
  numero: string,
  env: DonoEnv = process.env
): Promise<DonoDoLead | null> => {
  try {
    const { data } = await axios.get(env.CRM_DONO_URL, {
      params: { numero },
      headers: { "x-webhook-token": env.CRM_WEBHOOK_TOKEN },
      timeout: TIMEOUT_MS
    });
    const dono = data && data.dono;
    if (!dono || !dono.nome) return null;
    const conexao = Number(dono.conexaoTicketz);
    return {
      nome: String(dono.nome),
      conexaoTicketz: Number.isInteger(conexao) && conexao > 0 ? conexao : null
    };
  } catch (err) {
    logger.warn(
      { message: err?.message },
      "TravaDono: consulta ao CRM falhou, conversa liberada"
    );
    return null;
  }
};

// o numero do dono e ligado a alguma fila deste usuario? (= o lead e dele)
const usuarioEhDono = async (
  userId: number,
  conexao: number | null
): Promise<boolean> => {
  if (!conexao) return false;
  const filas = (
    await UserQueue.findAll({ where: { userId }, attributes: ["queueId"] })
  ).map(f => f.queueId);
  if (!filas.length) return false;
  const achou = await WhatsappQueue.findOne({
    where: { whatsappId: conexao, queueId: { [Op.in]: filas } }
  });
  return !!achou;
};

export const conferirTravaDono = async ({
  companyId,
  userId,
  numero
}: {
  companyId: number;
  userId: number;
  numero: string;
}): Promise<void> => {
  if (!isTravaDonoEnabled(companyId)) return;
  const dono = await consultarDonoDoLead(numero);
  if (!dono) return;
  if (await usuarioEhDono(userId, dono.conexaoTicketz)) return;
  throw new AppError(mensagemLeadDeOutro(dono.nome), 403);
};
