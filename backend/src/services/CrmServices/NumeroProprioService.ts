import { Op } from "sequelize";
import AppError from "../../errors/AppError";
import {
  donoDoNumeroParaUsuario,
  isNumeroProprioEnabled,
  mensagemNumeroDeOutro,
  numeroDeDestino
} from "../../helpers/NumeroProprio";
import { nomeFilaLivres } from "../../helpers/VacuoComercial";
import Queue from "../../models/Queue";
import User from "../../models/User";
import UserQueue from "../../models/UserQueue";
import Whatsapp from "../../models/Whatsapp";
import WhatsappQueue from "../../models/WhatsappQueue";
import { logger } from "../../utils/logger";

// Regras em helpers/NumeroProprio.ts.

// Envio: vendedor so manda mensagem pelo proprio numero
export const conferirNumeroProprio = async ({
  companyId,
  userId,
  whatsappId,
  isGroup,
  ticketId
}: {
  companyId: number;
  userId: number;
  whatsappId: number | null;
  isGroup?: boolean;
  ticketId?: number;
}): Promise<void> => {
  if (!isNumeroProprioEnabled(companyId) || !whatsappId || isGroup) return;
  const user = await User.findByPk(userId, { attributes: ["id", "profile"] });
  if (!user || user.profile !== "user") return;
  const ligacoes = await WhatsappQueue.findAll({ where: { whatsappId } });
  if (!ligacoes.length) return;
  const filasDoNumero = await Queue.findAll({
    where: { companyId, id: { [Op.in]: ligacoes.map(l => l.queueId) } },
    attributes: ["id", "name"],
    order: [["name", "ASC"]]
  });
  const filasDoUsuario = (
    await UserQueue.findAll({ where: { userId }, attributes: ["queueId"] })
  ).map(f => f.queueId);
  const dono = donoDoNumeroParaUsuario({
    filasDoNumero: filasDoNumero.map(f => ({ id: f.id, name: f.name })),
    filasDoUsuario,
    nomeLivres: nomeFilaLivres()
  });
  if (!dono) return;
  logger.info(
    { ticketId, userId, whatsappId, dono },
    "NumeroProprio: envio recusado, conversa no numero de outro vendedor"
  );
  throw new AppError(mensagemNumeroDeOutro(dono), 403);
};

// Transferencia: numero de quem vai atender. Filas alvo = a fila nova (se mudou) ou,
// se so o atendente mudou, as filas de vendedor dele. null = a conversa fica onde esta.
export const numeroDoAtendente = async ({
  companyId,
  filaNova,
  atendenteNovo,
  numeroAtual
}: {
  companyId: number;
  filaNova: number | null;
  atendenteNovo: number | null;
  numeroAtual: number | null;
}): Promise<number | null> => {
  if (!isNumeroProprioEnabled(companyId)) return null;
  const livres = nomeFilaLivres();
  let filasAlvo: number[] = [];
  if (filaNova) {
    const fila = await Queue.findOne({
      where: { id: filaNova, companyId },
      attributes: ["id", "name"]
    });
    if (!fila || fila.name === livres) return null;
    filasAlvo = [fila.id];
  } else if (atendenteNovo) {
    const atendente = await User.findOne({
      where: { id: atendenteNovo, companyId },
      include: [{ model: Queue, as: "queues", attributes: ["id", "name"] }]
    });
    if (!atendente || atendente.profile !== "user") return null;
    filasAlvo = (atendente.queues || [])
      .filter(q => q.name !== livres)
      .map(q => q.id);
  }
  if (!filasAlvo.length) return null;
  const ligacoes = await WhatsappQueue.findAll({
    where: { queueId: { [Op.in]: filasAlvo } }
  });
  if (!ligacoes.length) return null;
  const numeros = await Whatsapp.findAll({
    where: { companyId, id: { [Op.in]: ligacoes.map(l => l.whatsappId) } },
    attributes: ["id", "status"]
  });
  const statusDo = new Map(numeros.map(w => [w.id, w.status]));
  return numeroDeDestino({
    ligacoes: ligacoes
      .filter(l => statusDo.has(l.whatsappId))
      .map(l => ({
        whatsappId: l.whatsappId,
        queueId: l.queueId,
        status: statusDo.get(l.whatsappId)
      })),
    filasAlvo,
    numeroAtual
  });
};
