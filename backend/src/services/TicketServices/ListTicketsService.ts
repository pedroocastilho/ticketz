import {
  Op,
  fn,
  where,
  col,
  Filterable,
  Includeable,
  Order,
  WhereOptions
} from "sequelize";
import { startOfDay, endOfDay, parseISO } from "date-fns";

import { intersection } from "lodash";
import AppError from "../../errors/AppError";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Queue from "../../models/Queue";
import User from "../../models/User";
import ShowUserService from "../UserServices/ShowUserService";
import Tag from "../../models/Tag";
import TicketTag from "../../models/TicketTag";
import Whatsapp from "../../models/Whatsapp";
import { GetCompanySetting } from "../../helpers/CheckSettings";
import ContactTag from "../../models/ContactTag";

interface Request {
  isSearch?: boolean;
  searchParam?: string;
  nextUpdatedAt?: string;
  nextTicketId?: string;
  status?: string;
  groups?: string;
  date?: string;
  updatedAt?: string;
  minUpdatedAt?: string;
  showAll?: string;
  userId: string;
  withUnreadMessages?: string;
  notClosed?: boolean;
  semResposta?: boolean;
  all?: boolean;
  queueIds: number[];
  contactId?: number;
  tags: number[];
  users: number[];
  companyId: number;
}

interface Response {
  tickets: Ticket[];
  count: number | null;
  hasMore: boolean;
}

const CONVERSAS_POR_PAGINA = 40;

// horario da conversa em milissegundos, a precisao que a tela conhece: um repasse
// em massa grava centenas de conversas no mesmo instante (185 conversas empatadas
// em 05/11/2026) e o cursor so por horario pulava todas as outras do empate
const horarioDaConversa = () =>
  fn("date_trunc", "milliseconds", col("Ticket.updatedAt"));

const ORDEM_DA_LISTA: Order = [
  [horarioDaConversa(), "DESC"],
  ["id", "DESC"]
];

const depoisDoCursor = (
  horario: Date,
  ticketId: number
): WhereOptions<Ticket> => {
  const maisAntiga = where(horarioDaConversa(), "<", horario as any);
  if (!ticketId) return maisAntiga;
  return {
    [Op.or]: [
      maisAntiga,
      {
        [Op.and]: [
          where(horarioDaConversa(), "=", horario as any),
          { id: { [Op.lt]: ticketId } }
        ]
      }
    ]
  };
};

const ListTicketsService = async ({
  isSearch = false,
  searchParam = "",
  nextUpdatedAt,
  nextTicketId,
  queueIds,
  contactId,
  tags,
  users,
  status,
  groups,
  date,
  updatedAt,
  minUpdatedAt,
  showAll,
  userId,
  withUnreadMessages,
  notClosed,
  semResposta,
  all,
  companyId
}: Request): Promise<Response> => {
  let ticketId: number;

  if (/^\d{8}-\d+$/.test(searchParam)) {
    const parts = searchParam.split("-");
    ticketId = parseInt(parts[1], 10);
  }

  if (Number(searchParam)) {
    ticketId = Number(searchParam);
  }

  if (ticketId) {
    searchParam = "";
  }

  if (
    (searchParam.trim().startsWith('"') && searchParam.trim().endsWith('"')) ||
    (searchParam.trim().startsWith("'") && searchParam.trim().endsWith("'"))
  ) {
    searchParam = searchParam.trim().slice(1, -1);
  }

  const groupsTab =
    !isSearch &&
    (await GetCompanySetting(companyId, "groupsTab", "disabled")) === "enabled";

  const user = await ShowUserService(userId);

  const andedOrs: WhereOptions<Ticket>[] = [
    {
      [Op.or]: [{ userId }, { status: "pending" }]
    }
  ];

  let whereCondition: Filterable["where"] = {
    [Op.and]: andedOrs,
    queueId: {
      [Op.or]: user.profile === "admin" ? [queueIds, null] : [queueIds]
    }
  };

  if (groupsTab) {
    whereCondition.isGroup = groups === "true";
  }
  // o que aparece na lista. Etiquetas e campos do contato multiplicam as linhas da
  // consulta, entao nao podem entrar na escolha da pagina (ver fim do arquivo)
  const includeCondition: Includeable[] = [
    {
      model: Contact,
      as: "contact",
      include: ["tags", "extraInfo"],
      attributes: ["id", "name", "number", "email", "profilePicUrl", "presence"]
    },
    {
      model: Queue,
      as: "queue",
      attributes: ["id", "name", "color"]
    },
    {
      model: User,
      as: "user",
      attributes: ["id", "name"]
    },
    {
      model: Tag,
      as: "tags",
      attributes: ["id", "name", "color"]
    },
    {
      model: Whatsapp,
      as: "whatsapp",
      attributes: ["id", "name"]
    }
  ];

  if (showAll === "true" && user.profile === "admin") {
    andedOrs.length = 0;
    whereCondition = {
      [Op.and]: andedOrs,
      queueId: { [Op.or]: [queueIds, null] }
    };
    if (groupsTab) {
      whereCondition.isGroup = groups === "true";
    }
  }

  // supervisor ve todos os tickets, porem somente das filas as quais pertence
  if (showAll === "true" && user.profile === "supervisor") {
    const supervisorQueueIds = user.queues
      .map(queue => queue.id)
      .filter(queueId => queueIds.includes(queueId));
    andedOrs.length = 0;
    whereCondition = {
      [Op.and]: andedOrs,
      queueId: { [Op.or]: [supervisorQueueIds] }
    };
    if (groupsTab) {
      whereCondition.isGroup = groups === "true";
    }
  }

  if (status) {
    whereCondition = {
      ...whereCondition,
      status
    };
  }

  // so o que o filtro da busca precisa, sem trazer nada desses registros
  let includeDoFiltro: Includeable[] = [];

  if (searchParam) {
    const sanitizedSearchParam = searchParam.toLocaleLowerCase().trim();

    includeDoFiltro = [
      { model: Contact, as: "contact", attributes: [] },
      {
        model: Message,
        as: "messages",
        attributes: [],
        where: {
          body: where(
            fn("LOWER", col("body")),
            "LIKE",
            `%${sanitizedSearchParam}%`
          )
        },
        required: false,
        duplicating: false
      }
    ];

    andedOrs.push({
      [Op.or]: [
        {
          "$contact.name$": where(
            fn("LOWER", col("contact.name")),
            "LIKE",
            `%${sanitizedSearchParam}%`
          )
        },
        { "$contact.number$": { [Op.like]: `%${sanitizedSearchParam}%` } },
        {
          "$message.body$": where(
            fn("LOWER", col("body")),
            "LIKE",
            `%${sanitizedSearchParam}%`
          )
        }
      ]
    });
  }

  if (date) {
    whereCondition = {
      [Op.and]: andedOrs,
      createdAt: {
        [Op.between]: [+startOfDay(parseISO(date)), +endOfDay(parseISO(date))]
      }
    };
  }

  if (updatedAt) {
    whereCondition = {
      [Op.and]: andedOrs,
      updatedAt: {
        [Op.between]: [
          +startOfDay(parseISO(updatedAt)),
          +endOfDay(parseISO(updatedAt))
        ]
      }
    };
  }

  if (withUnreadMessages === "true") {
    whereCondition = {
      ...whereCondition,
      unreadMessages: { [Op.gt]: 0 }
    };
  }

  if (Array.isArray(tags) && tags.length > 0) {
    const ticketsTagFilter: number[][] = [];
    const contactsTagFilter: number[][] = [];
    // eslint-disable-next-line no-restricted-syntax
    for await (const tag of tags) {
      const ticketTags = await TicketTag.findAll({
        where: { tagId: tag }
      });
      if (ticketTags) {
        ticketsTagFilter.push(ticketTags.map(t => t.ticketId));
      }

      const contactTags = await ContactTag.findAll({
        where: { tagId: tag }
      });

      if (contactTags) {
        contactsTagFilter.push(contactTags.map(c => c.contactId));
      }
    }

    const ticketsIntersection: number[] = intersection(...ticketsTagFilter);
    const contactsIntersection: number[] = intersection(...contactsTagFilter);

    andedOrs.push({
      [Op.or]: [
        {
          id: { [Op.in]: ticketsIntersection }
        },
        {
          contactId: { [Op.in]: contactsIntersection }
        }
      ]
    });
  }

  if (contactId) {
    whereCondition = {
      ...whereCondition,
      contactId
    };
  }

  if (ticketId) {
    whereCondition = {
      ...whereCondition,
      id: ticketId
    };
  }

  if (Array.isArray(users) && users.length > 0) {
    const ticketsUserFilter: number[][] = [];
    // eslint-disable-next-line no-restricted-syntax
    for await (const u of users) {
      const ticketUsers = await Ticket.findAll({
        where: { userId: u }
      });
      if (ticketUsers) {
        ticketsUserFilter.push(ticketUsers.map(t => t.id));
      }
    }

    const ticketsIntersection: number[] = intersection(...ticketsUserFilter);

    whereCondition = {
      ...whereCondition,
      id: {
        [Op.in]: ticketsIntersection
      }
    };
  }

  if (!all && nextUpdatedAt) {
    const parsedNextUpdatedAt = new Date(nextUpdatedAt);

    if (Number.isNaN(parsedNextUpdatedAt.getTime())) {
      throw new AppError("ERR_INVALID_NEXT_UPDATED_AT", 400);
    }

    andedOrs.push(depoisDoCursor(parsedNextUpdatedAt, Number(nextTicketId)));
  }

  if (minUpdatedAt) {
    const parsedMinUpdatedAt = new Date(minUpdatedAt);

    if (Number.isNaN(parsedMinUpdatedAt.getTime())) {
      throw new AppError("ERR_INVALID_MIN_UPDATED_AT", 400);
    }

    andedOrs.push({
      updatedAt: { [Op.gte]: parsedMinUpdatedAt }
    });
  }

  if (notClosed) {
    whereCondition = {
      ...whereCondition,
      status: { [Op.ne]: "closed" }
    };
  }

  // filtro "Sem resposta" da aba Atendendo (11/11/2026, Mariana): so as conversas em
  // que a ultima mensagem e do cliente. Fica no fim para nenhum filtro acima apagar
  if (semResposta) {
    whereCondition = {
      ...whereCondition,
      lastMessageFromMe: false
    };
  }

  whereCondition = {
    ...whereCondition,
    companyId
  };

  // O limite precisa contar conversas. Com etiquetas e campos do contato no mesmo
  // SELECT ele contava linhas: cada conversa ocupava ate 10, e as 40 da pagina viravam
  // 5 (fila da Jackeline, 235 conversas, em 05/11/2026). Primeiro escolhe a pagina;
  // depois carrega os dados so dessas conversas. Pede uma a mais para saber se ha outra.
  const pagina = await Ticket.findAll({
    where: whereCondition,
    include: includeDoFiltro,
    attributes: ["id"],
    limit: all ? undefined : CONVERSAS_POR_PAGINA + 1,
    order: ORDEM_DA_LISTA,
    group: searchParam ? ["Ticket.id"] : undefined,
    subQuery: false
  });

  const hasMore = !all && pagina.length > CONVERSAS_POR_PAGINA;
  const ids = (hasMore ? pagina.slice(0, CONVERSAS_POR_PAGINA) : pagina).map(
    ticket => ticket.id
  );

  const tickets = ids.length
    ? await Ticket.findAll({
        where: { id: { [Op.in]: ids } },
        include: includeCondition,
        order: ORDEM_DA_LISTA
      })
    : [];

  return {
    tickets,
    count: null,
    hasMore
  };
};

export default ListTicketsService;
