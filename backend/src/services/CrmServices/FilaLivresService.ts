import { Op } from "sequelize";
import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import UserQueue from "../../models/UserQueue";
import Whatsapp from "../../models/Whatsapp";
import WhatsappQueue from "../../models/WhatsappQueue";
import {
  destinoDoVendedor,
  isVacuoEnabled,
  nomeFilaLivres
} from "../../helpers/VacuoComercial";

// Fila comum das conversas no vacuo (regras em helpers/VacuoComercial.ts).

const CORES_FILA_LIVRES = [
  "#ff9800",
  "#ffa726",
  "#fb8c00",
  "#ef6c00",
  "#ffb74d"
];

// acha ou cria a fila comum e garante todos os vendedores nela (perfil user com
// alguma fila ligada a um numero); quem entrar no time depois entra sozinho
export async function garantirFilaLivres(companyId: number): Promise<Queue> {
  const nome = nomeFilaLivres();
  let fila = await Queue.findOne({ where: { companyId, name: nome } });
  if (!fila) {
    // nome e cor da fila sao unicos no Ticketz: usa a primeira cor livre
    const usadas = new Set(
      (await Queue.findAll({ attributes: ["color"] })).map(q =>
        String(q.color || "").toLowerCase()
      )
    );
    const color =
      CORES_FILA_LIVRES.find(c => !usadas.has(c)) ||
      `#${Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, "0")}`;
    fila = await Queue.create({
      companyId,
      name: nome,
      color,
      greetingMessage: ""
    });
  }
  const numeros = await Whatsapp.findAll({
    where: { companyId },
    attributes: ["id"]
  });
  if (!numeros.length) return fila;
  const comNumero = await WhatsappQueue.findAll({
    where: { whatsappId: { [Op.in]: numeros.map(w => w.id) } }
  });
  const filasComNumero = [...new Set(comNumero.map(w => w.queueId))];
  if (!filasComNumero.length) return fila;
  const usuarios = await User.findAll({
    where: { companyId, profile: "user" },
    attributes: ["id"]
  });
  if (!usuarios.length) return fila;
  const vendedores = await UserQueue.findAll({
    where: {
      queueId: { [Op.in]: filasComNumero },
      userId: { [Op.in]: usuarios.map(u => u.id) }
    }
  });
  const jaNaFila = new Set(
    (await UserQueue.findAll({ where: { queueId: fila.id } })).map(
      u => u.userId
    )
  );
  const faltam = [...new Set(vendedores.map(v => v.userId))].filter(
    id => !jaNaFila.has(id)
  );
  if (faltam.length) {
    await UserQueue.bulkCreate(
      faltam.map(userId => ({ userId, queueId: fila.id }))
    );
  }
  return fila;
}

// Vendedor puxando uma conversa da fila comum: devolve o numero e a fila dele
// para a conversa ir junto (UpdateTicketService transfere). null = nao e esse caso.
export async function destinoAoPuxarLivre({
  ticket,
  status,
  userId
}: {
  ticket: Ticket;
  status?: string;
  userId?: number | null;
}): Promise<{ whatsappId: number; queueId: number } | null> {
  if (!isVacuoEnabled(ticket.companyId) || status !== "open" || !userId) {
    return null;
  }
  if (!ticket.queueId) return null;
  const fila = await Queue.findByPk(ticket.queueId, {
    attributes: ["id", "name"]
  });
  if (!fila || fila.name !== nomeFilaLivres()) return null;
  const puxou = await User.findOne({
    where: { id: userId, companyId: ticket.companyId },
    include: [{ model: Queue, as: "queues", attributes: ["id"] }]
  });
  if (!puxou || puxou.profile !== "user") return null;
  const filas = (puxou.queues || [])
    .map(q => q.id)
    .filter(id => id !== fila.id);
  if (!filas.length) return null;
  const ligacoes = await WhatsappQueue.findAll({
    where: { queueId: { [Op.in]: filas } }
  });
  if (!ligacoes.length) return null;
  const numeros = await Whatsapp.findAll({
    where: {
      companyId: ticket.companyId,
      id: { [Op.in]: ligacoes.map(l => l.whatsappId) }
    },
    attributes: ["id", "status"]
  });
  const statusDo = new Map(numeros.map(w => [w.id, w.status]));
  const destino = destinoDoVendedor(
    ligacoes
      .filter(l => statusDo.has(l.whatsappId))
      .map(l => ({
        whatsappId: l.whatsappId,
        queueId: l.queueId,
        status: statusDo.get(l.whatsappId)
      }))
  );
  return destino
    ? { whatsappId: destino.whatsappId, queueId: destino.queueId }
    : null;
}
