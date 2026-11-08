import { Op, QueryTypes } from "sequelize";
import sequelize from "../../database";
import Company from "../../models/Company";
import { logger } from "../../utils/logger";
import Tag from "../../models/Tag";
import { chaveEtiqueta } from "../../helpers/EtiquetaEtapa";
import {
  estourouVacuo,
  etiquetaVacuo,
  isVacuoEnabled,
  limiteVacuoSeg,
  respondidaDepois,
  decidirSaidaDaLivres,
  etiquetasForaDoVacuo
} from "../../helpers/VacuoComercial";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import Queue from "../../models/Queue";
import User from "../../models/User";
import { horarioDoAmbiente } from "./MetricasAtendimentoService";
import { garantirFilaLivres } from "./FilaLivresService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";

// ultima resposta humana do time ao cliente da conversa t, em qualquer conversa dele
const ULTIMA_RESPOSTA_DO_CONTATO = `SELECT MAX(r."createdAt") FROM "Messages" r
                       JOIN "Tickets" rt ON rt.id = r."ticketId"
                      WHERE rt."contactId" = t."contactId"
                        AND rt."companyId" = t."companyId"
                        AND r."fromMe" = true
                        AND COALESCE(r."mediaType", '') <> 'reactionMessage'
                        AND LEFT(COALESCE(r.body, ''), 1) <> E'\\u200e'`;

// ids das etiquetas de VACUO_ETIQUETA_FORA nesta empresa (sem acento/maiuscula)
async function idsForaDoVacuo(companyId: number): Promise<number[]> {
  const chaves = etiquetasForaDoVacuo().map(chaveEtiqueta);
  if (!chaves.length) return [];
  return (
    await Tag.findAll({ where: { companyId }, attributes: ["id", "name"] })
  )
    .filter(t => chaves.includes(chaveEtiqueta(t.name)))
    .map(t => t.id);
}

// o cliente da conversa t tem etiqueta de quem ja comprou: no contato ou em
// qualquer conversa dele
const JA_COMPROU = `(EXISTS (SELECT 1 FROM "ContactTags" cf
                     WHERE cf."contactId" = t."contactId" AND cf."tagId" IN (:fora))
                OR EXISTS (SELECT 1 FROM "TicketTags" tf
                     JOIN "Tickets" tx ON tx.id = tf."ticketId"
                     WHERE tx."contactId" = t."contactId"
                       AND tx."companyId" = t."companyId"
                       AND tf."tagId" IN (:fora)))`;

// Rodada da regra do vacuo (helpers/VacuoComercial.ts), chamada a cada minuto
// pelo handleTicketTimeouts. Conversa aberta com vendedor em que o cliente
// espera ha mais que o limite (no horario do comercial) volta para
// "aguardando" na fila comum, sem vendedor. Sem chatbot e sem mensagem de
// transferencia para o cliente: ele nem percebe.
export async function devolverConversasNoVacuo(
  companyId: number,
  agora: Date = new Date()
): Promise<number> {
  if (!isVacuoEnabled(companyId)) return 0;
  const fila = await garantirFilaLivres(companyId);
  const horario = horarioDoAmbiente();
  const limite = limiteVacuoSeg();

  // VACUO_ETIQUETA: so contatos com essa etiqueta (sem acento/maiuscula). A
  // etiqueta ainda nao existe na empresa = ninguem vai para a fila Livres.
  const etiqueta = etiquetaVacuo();
  let etiquetas: number[] | null = null;
  if (etiqueta) {
    const chave = chaveEtiqueta(etiqueta);
    etiquetas = (
      await Tag.findAll({ where: { companyId }, attributes: ["id", "name"] })
    )
      .filter(t => chaveEtiqueta(t.name) === chave)
      .map(t => t.id);
    if (!etiquetas.length) return 0;
  }
  const fora = await idsForaDoVacuo(companyId);

  // espera = primeira mensagem do cliente NESTA conversa depois da ultima resposta
  // humana do time em QUALQUER conversa do mesmo cliente (08/11/2026: o cliente que
  // escreveu no numero de um e foi respondido pelo numero de outro, ou numa conversa
  // nova, esta sendo atendido). Automatica comeca com ‎ e nao conta como resposta;
  // reacao (emoji) nao conta nem como mensagem do cliente nem como resposta.
  const conversas: Array<{ id: number; esperaDesde: Date | null }> =
    await sequelize.query(
      `
        SELECT t.id,
               (SELECT MIN(m."createdAt") FROM "Messages" m
                 WHERE m."ticketId" = t.id AND m."fromMe" = false
                   AND COALESCE(m."isDeleted", false) = false
                   AND COALESCE(m."mediaType", '') <> 'reactionMessage'
                   AND m."createdAt" > COALESCE(
                     (${ULTIMA_RESPOSTA_DO_CONTATO}),
                     'epoch'::timestamptz)) AS "esperaDesde"
          FROM "Tickets" t
         WHERE t."companyId" = :companyId
           AND t.status = 'open'
           AND t."userId" IS NOT NULL
           AND t."isGroup" = false
           AND COALESCE(t."queueId", 0) <> :filaLivres
           ${
             etiquetas
               ? `AND EXISTS (SELECT 1 FROM "ContactTags" ct
                           WHERE ct."contactId" = t."contactId"
                             AND ct."tagId" IN (:etiquetas))`
               : ""
           }
           ${fora.length ? `AND NOT ${JA_COMPROU}` : ""}
      `,
      {
        replacements: {
          companyId,
          filaLivres: fila.id,
          etiquetas: etiquetas || [0],
          fora: fora.length ? fora : [0]
        },
        type: QueryTypes.SELECT
      }
    );

  let devolvidas = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const c of conversas) {
    const desde = c.esperaDesde ? new Date(c.esperaDesde) : null;
    if (!estourouVacuo(desde, agora, horario, limite)) continue;
    try {
      await UpdateTicketService({
        ticketId: c.id,
        ticketData: { status: "pending", userId: null, queueId: fila.id },
        companyId,
        dontRunChatbot: true
      });
      devolvidas += 1;
      logger.info(
        { ticketId: c.id, esperaDesde: desde },
        "Conversa no vacuo voltou para a fila comum"
      );
    } catch (err) {
      logger.warn(
        { message: err?.message, ticketId: c.id },
        "devolverConversasNoVacuo: falha ao devolver"
      );
    }
  }
  return devolvidas;
}

// Conversa parada na fila Livres (ninguem puxou) cujo cliente ja foi respondido
// (ou ja comprou: etiqueta de VACUO_ETIQUETA_FORA)
// depois da ultima mensagem dele nela (pelo dono no celular, numa conversa nova ou
// por outro numero): sai da fila Livres para ninguem puxar quem ja esta sendo
// atendido (08/11/2026, Pedro). Volta para o dono do numero, na fila dele, e a
// contagem recomeca do zero. Se o dono ja tem outra conversa aberta com esse
// cliente no mesmo numero, esta e repetida: fecha sem mandar nada ao cliente.
// O CRM nao troca o dono (nao e "puxar").
export async function tirarDaLivresQuemFoiRespondido(
  companyId: number
): Promise<number> {
  if (!isVacuoEnabled(companyId)) return 0;
  const fila = await garantirFilaLivres(companyId);
  const fora = await idsForaDoVacuo(companyId);
  const paradas: Array<{
    id: number;
    contactId: number;
    whatsappId: number | null;
    ultimaDoCliente: Date | null;
    ultimaResposta: Date | null;
    jaComprou: boolean;
  }> = await sequelize.query(
    `
      SELECT t.id, t."contactId", t."whatsappId",
             ${fora.length ? JA_COMPROU : "false"} AS "jaComprou",
             (SELECT MAX(m."createdAt") FROM "Messages" m
               WHERE m."ticketId" = t.id AND m."fromMe" = false
                 AND COALESCE(m."isDeleted", false) = false
                 AND COALESCE(m."mediaType", '') <> 'reactionMessage') AS "ultimaDoCliente",
             (${ULTIMA_RESPOSTA_DO_CONTATO}) AS "ultimaResposta"
        FROM "Tickets" t
       WHERE t."companyId" = :companyId
         AND t.status = 'pending'
         AND t."userId" IS NULL
         AND t."isGroup" = false
         AND t."queueId" = :filaLivres
    `,
    {
      replacements: {
        companyId,
        filaLivres: fila.id,
        fora: fora.length ? fora : [0]
      },
      type: QueryTypes.SELECT
    }
  );

  let tiradas = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const c of paradas) {
    const cliente = c.ultimaDoCliente ? new Date(c.ultimaDoCliente) : null;
    const resposta = c.ultimaResposta ? new Date(c.ultimaResposta) : null;
    // so busca o resto (dono, outra conversa) de quem ja foi respondido
    if (
      !c.whatsappId ||
      (!c.jaComprou && !respondidaDepois(cliente, resposta))
    ) {
      continue;
    }
    try {
      const outra = await Ticket.findOne({
        where: {
          companyId,
          contactId: c.contactId,
          whatsappId: c.whatsappId,
          status: "open",
          id: { [Op.ne]: c.id }
        },
        attributes: ["id"]
      });
      const whatsapp = await Whatsapp.findByPk(c.whatsappId, {
        include: [{ model: Queue, as: "queues", attributes: ["id"] }]
      });
      const filaDoNumero =
        (whatsapp?.queues || []).find(q => q.id !== fila.id)?.id || null;
      // dono do numero = o unico vendedor (perfil user) da fila ligada ao numero
      const vendedores = filaDoNumero
        ? await User.findAll({
            where: { companyId, profile: "user" },
            attributes: ["id"],
            include: [
              {
                model: Queue,
                as: "queues",
                where: { id: filaDoNumero },
                attributes: [],
                required: true
              }
            ]
          })
        : [];
      const decisao = decidirSaidaDaLivres({
        ultimaDoCliente: cliente,
        ultimaResposta: resposta,
        outraAbertaNoNumero: !!outra,
        donoDoNumero: vendedores.length === 1 ? vendedores[0].id : null,
        filaDoNumero,
        jaComprou: !!c.jaComprou
      });
      if (decisao.acao === "nada") continue;
      await UpdateTicketService({
        ticketId: c.id,
        ticketData:
          decisao.acao === "fechar"
            ? { status: "closed", justClose: true }
            : {
                status: "open",
                userId: decisao.userId,
                queueId: decisao.queueId
              },
        companyId,
        dontRunChatbot: true,
        semAvisarCrm: true
      });
      tiradas += 1;
      logger.info(
        {
          ticketId: c.id,
          acao: decisao.acao,
          ultimaDoCliente: cliente,
          ultimaResposta: resposta
        },
        "Conversa ja respondida saiu da fila Livres"
      );
    } catch (err) {
      logger.warn(
        { message: err?.message, ticketId: c.id },
        "tirarDaLivresQuemFoiRespondido: falha"
      );
    }
  }
  return tiradas;
}

// todas as empresas ligadas: quem ja foi respondido sai da fila Livres a cada
// minuto; quem esta no vacuo vai para ela de 5 em 5 minutos. Nunca lanca (roda
// dentro do job de cada minuto)
export async function rodadaDoVacuo(agora: Date = new Date()): Promise<void> {
  try {
    const empresas = (await Company.findAll({ attributes: ["id"] })).filter(e =>
      isVacuoEnabled(e.id)
    );
    // eslint-disable-next-line no-restricted-syntax
    for (const e of empresas) await tirarDaLivresQuemFoiRespondido(e.id);
    if (agora.getMinutes() % 5 !== 0) return;
    // eslint-disable-next-line no-restricted-syntax
    for (const e of empresas) await devolverConversasNoVacuo(e.id);
  } catch (err) {
    logger.warn({ message: err?.message }, "rodadaDoVacuo: falha");
  }
}
