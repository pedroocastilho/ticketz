/**
 * Preenche waitTimeBusiness e serviceTimeBusiness dos atendimentos antigos
 * com o expediente configurado hoje nas filas (ou na empresa).
 * Idempotente: pode rodar quantas vezes precisar.
 *
 * Na VPS: docker compose exec backend node dist/scripts/recalculateBusinessTimes.js
 */
import { Op } from "sequelize";
import sequelize from "../database";
import TicketTraking from "../models/TicketTraking";
import Ticket from "../models/Ticket";
import Queue from "../models/Queue";
import Company from "../models/Company";
import {
  refreshBusinessTimes,
  scheduleForTicket
} from "../helpers/businessSeconds";

const BATCH = 500;

async function run(): Promise<void> {
  await sequelize.authenticate();

  let lastId = 0;
  let processed = 0;

  for (;;) {
    const rows = await TicketTraking.findAll({
      where: { id: { [Op.gt]: lastId }, startedAt: { [Op.not]: null } },
      order: [["id", "ASC"]],
      limit: BATCH
    });
    if (rows.length === 0) {
      break;
    }

    const ticketIds = [...new Set(rows.map(r => r.ticketId))];

    const tickets = await Ticket.findAll({
      where: { id: ticketIds },
      attributes: ["id", "queueId", "companyId"],
      include: [
        { model: Queue, attributes: ["id", "schedules"] },
        { model: Company, attributes: ["id", "schedules"] }
      ]
    });
    const byId = new Map(tickets.map(t => [t.id, t]));

    // eslint-disable-next-line no-restricted-syntax
    for (const row of rows) {
      refreshBusinessTimes(row, scheduleForTicket(byId.get(row.ticketId)));
      // silent: nao mexe em updatedAt

      await row.save({
        fields: ["waitTimeBusiness", "serviceTimeBusiness"],
        silent: true
      });
      processed += 1;
    }

    lastId = rows[rows.length - 1].id;
    console.log(`processados ${processed}`);
  }

  console.log(`concluido: ${processed} atendimentos recalculados`);
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
