import axios from "axios";
import { Op } from "sequelize";
import AppError from "../../errors/AppError";
import UserQueue from "../../models/UserQueue";
import WhatsappQueue from "../../models/WhatsappQueue";
import { logger } from "../../utils/logger";
import { isCrmWebhookEnabledFor } from "../WebhookServices/NotifyCrmWebhook";
import Whatsapp from "../../models/Whatsapp";
import {
  conversaMovidaHaPouco,
  isTravaEnvioEnabled,
  podeEnviarNaConversa
} from "../../helpers/TravaEnvio";

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

// dono por numero do cliente, guardado 60s: cada mensagem nao pode esperar o CRM
const CACHE_DONO_MS = 60 * 1000;
const cacheDono = new Map<string, { dono: DonoDoLead | null; ate: number }>();

const donoComCache = async (numero: string): Promise<DonoDoLead | null> => {
  const agora = Date.now();
  const guardado = cacheDono.get(numero);
  if (guardado && guardado.ate > agora) return guardado.dono;
  const dono = await consultarDonoDoLead(numero);
  if (cacheDono.size > 5000) cacheDono.clear();
  cacheDono.set(numero, { dono, ate: agora + CACHE_DONO_MS });
  return dono;
};

// a conversa mudou de numero: o dono no CRM vai mudar, esquece o guardado
export const esquecerDonoDoNumero = (
  numero: string | null | undefined
): void => {
  if (numero) cacheDono.delete(String(numero));
};

// Trava de ENVIO (helpers/TravaEnvio.ts): vendedor nao manda mensagem pelo
// Ticketz para lead do lancamento que e de outro vendedor, fora do numero do dono
export const conferirTravaEnvio = async ({
  companyId,
  userId,
  ticket
}: {
  companyId: number;
  userId: number;
  ticket: {
    id: number;
    whatsappId: number | null;
    isGroup?: boolean;
    contact?: { number?: string; isGroup?: boolean } | null;
  };
}): Promise<void> => {
  if (!isTravaDonoEnabled(companyId) || !isTravaEnvioEnabled()) return;
  const numero = ticket.contact?.number;
  if (!numero || ticket.isGroup || ticket.contact?.isGroup) return;
  if (conversaMovidaHaPouco(ticket.id)) return;
  const dono = await donoComCache(numero);
  if (!dono || !dono.conexaoTicketz) return;
  if (dono.conexaoTicketz === ticket.whatsappId) return;
  const conexaoDono = await Whatsapp.findByPk(dono.conexaoTicketz, {
    attributes: ["id", "status", "companyId"]
  });
  const pode = podeEnviarNaConversa({
    temDono: true,
    conexaoDoDono: dono.conexaoTicketz,
    conexaoDaConversa: ticket.whatsappId,
    conexaoDoDonoConectada:
      !!conexaoDono &&
      conexaoDono.companyId === companyId &&
      conexaoDono.status === "CONNECTED",
    usuarioEhDono: await usuarioEhDono(userId, dono.conexaoTicketz),
    movidaHaPouco: false
  });
  if (pode) return;
  logger.info(
    { ticketId: ticket.id, userId, dono: dono.nome },
    "TravaDono: envio recusado, lead de outro vendedor"
  );
  throw new AppError(mensagemLeadDeOutro(dono.nome), 403);
};
