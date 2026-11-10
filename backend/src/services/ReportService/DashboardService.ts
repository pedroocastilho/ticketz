import { Op, fn, col, WhereOptions, literal, QueryTypes } from "sequelize";
import Ticket from "../../models/Ticket";
import Queue from "../../models/Queue";
import { GetCompanySetting } from "../../helpers/CheckSettings";
import User from "../../models/User";
import TicketTraking from "../../models/TicketTraking";
import sequelize from "../../database";
import {
  sqlSessaoOnline,
  toleranciaOnlineMin
} from "../../helpers/OnlineTolerancia";
import {
  listCounterSerie,
  TicketCounterSeries
} from "../CounterServices/ListCounterSerie";
import {
  GestorPainel,
  gestoresComercial,
  isPainelComercial,
  metricasDoPeriodo,
  somarContagens,
  somarTempos,
  vendedoresDoPainel
} from "./PainelComercial";

type TicketTrackingStatistics = {
  avgWaitTime: number;
  avgServiceTime: number;
  totalClosed: number;
  newContacts: number;
  // so no painel do comercial: contagens pelas mensagens (o dia inteiro)
  conversasAtendidas?: number;
  mensagensEnviadas?: number;
  // taxa de resposta do vendedor (2026-11-09, pedido da Bia)
  conversasRecebidas?: number;
  conversasRespondidas?: number;
  conversasSemResposta?: number;
  taxaResposta?: number | null;
};

export type DashboardDateRange = {
  date_from?: string;
  date_to?: string;
  hour_from?: string;
  hour_to?: string;
  tz?: string;
  // ids de usuario escondidos pelo olho, separados por virgula (2026-11-02):
  // os totais do painel somam so quem esta visivel
  ocultos?: string;
};

export const idsOcultos = (valor: unknown): number[] =>
  String(valor || "")
    .split(",")
    .map(s => Number(s.trim()))
    .filter(n => Number.isInteger(n) && n > 0);

// conversa (Ticket/TicketTraking) de usuario oculto nao entra nos totais
const semOcultos = (ocultos: number[]) =>
  ocultos.length
    ? { [Op.or]: [{ userId: null }, { userId: { [Op.notIn]: ocultos } }] }
    : {};

type TicketsStatisticsData = {
  ticketCounters: {
    create: TicketCounterSeries;
    accept: TicketCounterSeries;
    transfer: TicketCounterSeries;
    close: TicketCounterSeries;
  };
  ticketStatistics: {
    avgWaitTime: number;
    avgServiceTime: number;
    totalClosed: number;
  };
};

type UserStatistics = {
  id: number;
  name: string;
  avgWaitTime: number;
  avgServiceTime: number;
  totalTickets: number;
  openTickets: number;
  closedTickets: number;
  averageRating: number;
  online: boolean;
};

type UserReportData = {
  start: string;
  end: string;
  userReport: UserStatistics[];
  // so no painel do comercial (PainelComercial.ts)
  gestores?: GestorPainel[];
};

export async function calculateTicketStatistics(
  companyId: number,
  start: Date,
  end: Date,
  ocultos: number[] = []
): Promise<TicketTrackingStatistics> {
  const ticketStatistics = (await TicketTraking.findOne({
    attributes: [
      // medias contando so o expediente (ver helpers/businessSeconds.ts)
      [fn("AVG", col("waitTimeBusiness")), "avgWaitTime"],
      [fn("AVG", col("serviceTimeBusiness")), "avgServiceTime"],
      [fn("COUNT", col("id")), "totalClosed"]
    ],
    where: {
      companyId,
      createdAt: {
        [Op.between]: [start, end]
      },
      finishedAt: {
        [Op.between]: [start, end]
      },
      ...semOcultos(ocultos)
    },
    raw: true
  })) as unknown as TicketTrackingStatistics;

  // force to numbers
  ticketStatistics.avgWaitTime = Number(ticketStatistics.avgWaitTime) || null;
  ticketStatistics.avgServiceTime =
    Number(ticketStatistics.avgServiceTime) || null;
  ticketStatistics.totalClosed = Number(ticketStatistics.totalClosed) || null;

  const countContactsQuery = `
  SELECT COUNT(*) AS count FROM (SELECT FROM (
    SELECT 
        t.id AS "ticketId",
        t."contactId",
        c."createdAt"
    FROM 
        "TicketTraking" tt
    JOIN 
        "Tickets" t ON tt."ticketId" = t.id
    JOIN 
        "Contacts" c ON t."contactId" = c.id
    WHERE 
        (tt."createdAt" BETWEEN :startDate AND :endDate)
        AND (tt."companyId" = :companyId)
        AND (tt."finishedAt" BETWEEN :startDate AND :endDate)
        AND (c."createdAt" BETWEEN :startDate AND :endDate)
        AND (tt."userId" IS NULL OR tt."userId" NOT IN (:ocultos))
  ) counters_list GROUP BY "contactId") counters_totals
  `;

  const newContacts = (await sequelize.query(countContactsQuery, {
    replacements: {
      companyId,
      startDate: start,
      endDate: end,
      ocultos: ocultos.length ? ocultos : [0]
    },
    type: QueryTypes.SELECT
  })) as unknown as [{ count: number }];

  ticketStatistics.newContacts = Number(newContacts[0]?.count) || null;

  // comercial: tempos medidos pelas mensagens dos vendedores (PainelComercial.ts)
  if (isPainelComercial(companyId)) {
    const vendedores = (await vendedoresDoPainel(companyId)).filter(
      v => !ocultos.includes(v.id)
    );
    const dias = await metricasDoPeriodo(companyId, start, end);
    const conexoes = vendedores.flatMap(v => v.conexoes);
    const tempos = somarTempos(dias, conexoes);
    ticketStatistics.avgWaitTime = tempos.esperaSeg;
    ticketStatistics.avgServiceTime = tempos.atendimentoSeg;
    // no comercial ninguem finaliza conversa: "resolvidos" e "novos contatos"
    // ficavam zerados; o painel mostra estas no lugar
    const contagens = somarContagens(dias, conexoes);
    ticketStatistics.conversasAtendidas = contagens.conversasAtendidas;
    ticketStatistics.mensagensEnviadas = contagens.mensagensEnviadas;
    ticketStatistics.conversasRecebidas = contagens.conversasRecebidas;
    ticketStatistics.conversasRespondidas = contagens.conversasRespondidas;
    ticketStatistics.conversasSemResposta = contagens.conversasSemResposta;
    ticketStatistics.taxaResposta = contagens.taxaResposta;
  }

  return ticketStatistics;
}

export async function ticketsStatusSummary(
  companyId: number,
  ocultos: number[] = []
) {
  const where: WhereOptions<Ticket> = {
    companyId,
    status: {
      [Op.or]: ["open", "pending"]
    }
  };
  if (ocultos.length) {
    // comercial: as conversas no numero de quem esta oculto tambem saem
    // (aguardando nao tem dono, mas e do numero do vendedor)
    const conexoes = isPainelComercial(companyId)
      ? (await vendedoresDoPainel(companyId))
          .filter(v => ocultos.includes(v.id))
          .flatMap(v => v.conexoes)
      : [];
    Object.assign(where, {
      [Op.and]: [
        semOcultos(ocultos),
        ...(conexoes.length
          ? [
              {
                [Op.or]: [
                  { whatsappId: null },
                  { whatsappId: { [Op.notIn]: conexoes } }
                ]
              }
            ]
          : [])
      ]
    });
  }

  const groupsEnabled =
    (await GetCompanySetting(companyId, "groupsTab", "disabled")) === "enabled";

  if (groupsEnabled) {
    where.isGroup = false;
  }

  const ticketsSummary = await Ticket.findAll({
    attributes: ["status", "queueId", [fn("COUNT", "*"), "count"]],
    where,
    include: [
      {
        model: Queue,
        attributes: ["id", "name", "color"],
        required: false
      }
    ],
    group: ["status", "queueId", "queue.id", "queue.name"]
  });

  return ticketsSummary;
}

export async function usersStatusSummary(companyId) {
  // comercial: quem saiu ha poucos minutos (trocou de pagina no CRM) continua online (helpers/OnlineTolerancia.ts)
  const onlineSql = sqlSessaoOnline(
    `"UserSocketSessions"`,
    toleranciaOnlineMin(companyId)
  );
  // comercial: so os vendedores do painel (sem quem saiu do time e sem gestores)
  const soVendedores = isPainelComercial(companyId)
    ? { id: { [Op.in]: (await vendedoresDoPainel(companyId)).map(v => v.id) } }
    : {};
  const usersSummary = await User.findAll({
    attributes: [
      "id",
      "name",
      [
        literal(`(
          SELECT COUNT(*)
          FROM "UserSocketSessions"
          WHERE "UserSocketSessions"."userId" = "User"."id"
            AND ${onlineSql}
        ) > 0`),
        "online"
      ],
      [fn("COUNT", col("tickets.id")), "openTicketsCount"]
    ],
    // contas admin (gestao) nao atendem: so atendentes e supervisores na tabela
    where: {
      companyId,
      profile: { [Op.ne]: "admin" },
      ...soVendedores
    },
    include: [
      {
        model: Ticket,
        as: "tickets",
        attributes: [],
        where: {
          status: "open"
        },
        required: false
      }
    ],
    group: ["User.id"]
  });

  return usersSummary;
}

export async function userReport(companyId: number, start: Date, end: Date) {
  const onlineSql = sqlSessaoOnline(
    `"UserSocketSessions"`,
    toleranciaOnlineMin(companyId)
  );
  // comercial: so vendedor com fila, com os tempos medidos pelas mensagens
  const comercial = isPainelComercial(companyId);
  const vendedores = comercial ? await vendedoresDoPainel(companyId) : [];
  const soVendedores = comercial
    ? { id: { [Op.in]: vendedores.map(v => v.id) } }
    : {};
  const result = await User.findAll({
    attributes: [
      "id",
      "name",
      [
        fn("AVG", col("tickets.ticketTrakings.waitTimeBusiness")),
        "avgWaitTime"
      ],
      [
        fn("AVG", col("tickets.ticketTrakings.serviceTimeBusiness")),
        "avgServiceTime"
      ],
      [fn("COUNT", col("tickets.id")), "totalTickets"],
      [
        literal(`(
          SELECT COUNT(*)
          FROM "TicketTraking" AS tt
          JOIN "Tickets" AS t ON tt."ticketId" = t.id
          WHERE t."userId" = "User"."id"
            AND tt."startedAt" < :endDate
            AND (tt."finishedAt" > :endDate OR tt."finishedAt" IS NULL)
        )`),
        "openTickets"
      ],
      [
        literal(`(
          SELECT COUNT(*)
          FROM "TicketTraking" AS tt
          JOIN "Tickets" AS t ON tt."ticketId" = t.id
          WHERE t."userId" = "User"."id"
            AND tt."finishedAt" BETWEEN :startDate AND :endDate
        )`),
        "closedTickets"
      ],
      [
        literal(`(
          SELECT AVG("rate")
          FROM "UserRatings"
          WHERE "UserRatings"."userId" = "User"."id"
            AND "UserRatings"."createdAt" BETWEEN :startDate AND :endDate
        )`),
        "averageRating"
      ],
      [
        literal(`(
          SELECT COUNT(*)>0
          FROM "UserSocketSessions"
          WHERE "UserSocketSessions"."userId" = "User"."id"
            AND ${onlineSql}
        )`),
        "online"
      ]
    ],
    // contas admin (gestao) nao atendem: so atendentes e supervisores na tabela
    where: {
      companyId,
      profile: { [Op.ne]: "admin" },
      ...soVendedores
    },
    include: [
      {
        model: Ticket,
        as: "tickets",
        attributes: [],
        required: false,
        include: [
          {
            model: TicketTraking,
            as: "ticketTrakings",
            attributes: [],
            where: {
              [Op.or]: [
                {
                  startedAt: { [Op.between]: [start, end] }
                },
                {
                  finishedAt: { [Op.between]: [start, end] }
                },
                {
                  startedAt: { [Op.lt]: end },
                  finishedAt: { [Op.gt]: end }
                },
                {
                  startedAt: { [Op.lt]: end },
                  finishedAt: null
                }
              ]
            }
          }
        ]
      }
    ],
    replacements: {
      startDate: start,
      endDate: end
    },
    group: ["User.id"]
  });

  if (!comercial) {
    return result as unknown[] as UserStatistics[];
  }
  const dias = await metricasDoPeriodo(companyId, start, end);
  return result.map(r => {
    const linha = r.get({ plain: true }) as unknown as UserStatistics;
    const vendedor = vendedores.find(v => v.id === Number(linha.id));
    const conexoes = vendedor ? vendedor.conexoes : [];
    const tempos = somarTempos(dias, conexoes);
    return {
      ...linha,
      ...somarContagens(dias, conexoes),
      avgWaitTime: tempos.esperaSeg,
      avgServiceTime: tempos.atendimentoSeg
    };
  });
}

export async function statusSummaryService(
  companyId: number,
  ocultos: number[] = []
) {
  return {
    ticketsStatusSummary: await ticketsStatusSummary(companyId, ocultos),
    usersStatusSummary: await usersStatusSummary(companyId)
  };
}

export async function ticketsStatisticsService(
  companyId: number,
  params: DashboardDateRange
): Promise<TicketsStatisticsData> {
  let start: Date;
  let end = new Date();
  const tz = params.tz || "Z";

  if (params.date_from && params.date_to) {
    start = new Date(
      `${params.date_from}T${params?.hour_from || "00:00:00"}${tz}`
    );
    end = new Date(`${params.date_to}T${params?.hour_to || "23:59:59"}${tz}`);
  } else {
    throw new Error("Invalid date range");
  }

  return {
    ticketCounters: {
      create: await listCounterSerie(companyId, "ticket-create", start, end),
      accept: await listCounterSerie(companyId, "ticket-accept", start, end),
      transfer: await listCounterSerie(
        companyId,
        "ticket-transfer",
        start,
        end
      ),
      close: await listCounterSerie(companyId, "ticket-close", start, end)
    },
    ticketStatistics: await calculateTicketStatistics(
      companyId,
      start,
      end,
      idsOcultos(params.ocultos)
    )
  };
}

export async function usersReportService(
  companyId: number,
  params: DashboardDateRange
): Promise<UserReportData> {
  let start: Date;
  let end = new Date();
  const tz = params.tz || "Z";

  if (params.date_from && params.date_to) {
    start = new Date(`${params.date_from}T00:00:00${tz}`);
    end = new Date(`${params.date_to}T23:59:59${tz}`);
  } else {
    throw new Error("Invalid date range");
  }

  return {
    start: params.date_from,
    end: params.date_to,
    userReport: await userReport(companyId, start, end),
    ...(isPainelComercial(companyId)
      ? { gestores: await gestoresComercial(companyId, start, end) }
      : {})
  };
}
