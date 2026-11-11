import sequelize from "../../database";
import Ticket from "../../models/Ticket";
import ListTicketsService from "../../services/TicketServices/ListTicketsService";

jest.mock("../../services/UserServices/ShowUserService", () => ({
  __esModule: true,
  default: jest.fn(async () => ({
    id: 10,
    profile: "supervisor",
    queues: [{ id: 5 }, { id: 6 }]
  }))
}));

jest.mock("../../helpers/CheckSettings", () => ({
  GetCompanySetting: jest.fn(async () => "disabled")
}));

// usa o gerador de SQL real do Sequelize e so troca a ida ao banco: o defeito
// esta justamente no SQL (LIMIT junto com os JOINs de etiquetas)
const consultas: string[] = [];
const respostas: number[][] = [];

const base = {
  userId: "10",
  companyId: 2,
  queueIds: [5],
  tags: [] as number[],
  users: [] as number[],
  status: "open",
  showAll: "true"
};

const ids = (de: number, ate: number): number[] =>
  Array.from({ length: ate - de + 1 }, (_, i) => de + i);

beforeEach(() => {
  consultas.length = 0;
  respostas.length = 0;
  jest
    .spyOn(sequelize, "query")
    .mockImplementation(async (sql: unknown): Promise<any> => {
      consultas.push(String(sql));
      return (respostas.shift() || []).map(id => Ticket.build({ id }));
    });
});

afterEach(() => jest.restoreAllMocks());

describe("ListTicketsService: o limite conta conversas", () => {
  it("escolhe a pagina sem JOIN de etiquetas (40 linhas viravam 5 conversas)", async () => {
    respostas.push(ids(1, 3), ids(1, 3));
    await ListTicketsService(base);

    expect(consultas[0]).toContain("LIMIT 41");
    expect(consultas[0]).not.toMatch(
      /ContactTags|ContactCustomFields|TicketTags/
    );
  });

  it("carrega etiquetas e dados so das conversas escolhidas, sem limite", async () => {
    respostas.push(ids(1, 3), ids(1, 3));
    await ListTicketsService(base);

    expect(consultas[1]).toMatch(/"Ticket"\."id" IN \(1, 2, 3\)/);
    expect(consultas[1]).toMatch(/ContactTags/);
    expect(consultas[1]).toMatch(/TicketTags/);
    expect(consultas[1]).not.toContain("LIMIT");
  });

  it("41 achadas: devolve 40 e avisa que tem mais", async () => {
    respostas.push(ids(1, 41), ids(1, 40));
    const r = await ListTicketsService(base);

    expect(consultas[1]).toMatch(/IN \(1, .* 40\)/);
    expect(consultas[1]).not.toMatch(/IN \(.*\b41\b.*\)/);
    expect(r.tickets).toHaveLength(40);
    expect(r.hasMore).toBe(true);
  });

  it("ultima pagina: nao tem mais", async () => {
    respostas.push(ids(1, 40), ids(1, 40));
    const r = await ListTicketsService(base);

    expect(r.hasMore).toBe(false);
  });

  it("nada achado: nem faz a segunda consulta", async () => {
    respostas.push([]);
    const r = await ListTicketsService(base);

    expect(consultas).toHaveLength(1);
    expect(r).toMatchObject({ tickets: [], hasMore: false });
  });
});

describe("ListTicketsService: carregar mais nao pula conversa com o mesmo horario", () => {
  it("continua pelo id dentro do mesmo milissegundo (repasse em massa)", async () => {
    respostas.push([]);
    await ListTicketsService({
      ...base,
      nextUpdatedAt: "2026-11-02T12:00:00.123Z",
      nextTicketId: "500"
    });

    expect(consultas[0]).toMatch(
      /date_trunc\('milliseconds', "Ticket"\."updatedAt"\) < /
    );
    expect(consultas[0]).toMatch(
      /date_trunc\('milliseconds', "Ticket"\."updatedAt"\) = /
    );
    expect(consultas[0]).toMatch(/"Ticket"\."id" < 500/);
    expect(consultas[0]).toMatch(
      /ORDER BY date_trunc\('milliseconds', "Ticket"\."updatedAt"\) DESC, "Ticket"\."id" DESC/
    );
  });

  it("cursor sem id (aba aberta antes do deploy) segue so pelo horario", async () => {
    respostas.push([]);
    await ListTicketsService({
      ...base,
      nextUpdatedAt: "2026-11-02T12:00:00.123Z"
    });

    expect(consultas[0]).toMatch(
      /date_trunc\('milliseconds', "Ticket"\."updatedAt"\) < /
    );
    expect(consultas[0]).not.toMatch(/"Ticket"\."id" < /);
  });
});

describe("ListTicketsService: filtro Sem resposta (Mariana 11/11)", () => {
  it("ligado: so conversas em que a ultima mensagem e do cliente", async () => {
    respostas.push(ids(1, 2), ids(1, 2));
    await ListTicketsService({ ...base, semResposta: true });

    expect(consultas[0]).toMatch(/"Ticket"\."lastMessageFromMe" = false/);
    expect(consultas[0]).toMatch(/"Ticket"\."status" = 'open'/);
    expect(consultas[0]).toMatch(/"Ticket"\."companyId" = 2/);
  });

  it("vale junto com o filtro de usuario (nao e apagado por ele)", async () => {
    jest
      .spyOn(Ticket, "findAll")
      .mockImplementationOnce(async () => [Ticket.build({ id: 7 })]);
    respostas.push(ids(7, 7), ids(7, 7));
    await ListTicketsService({ ...base, users: [3], semResposta: true });

    expect(consultas[0]).toMatch(/"Ticket"\."lastMessageFromMe" = false/);
    expect(consultas[0]).toMatch(/"Ticket"\."id" IN \(7\)/);
  });

  it("desligado: nao filtra por quem falou por ultimo", async () => {
    respostas.push(ids(1, 2), ids(1, 2));
    await ListTicketsService(base);

    expect(consultas[0]).not.toContain("lastMessageFromMe");
  });
});

describe("ListTicketsService: busca", () => {
  it("varias mensagens achadas na mesma conversa contam uma vez so", async () => {
    respostas.push(ids(1, 2), ids(1, 2));
    await ListTicketsService({
      ...base,
      isSearch: true,
      status: undefined,
      searchParam: "boleto"
    });

    expect(consultas[0]).toContain('GROUP BY "Ticket"."id"');
    expect(consultas[0]).toContain("boleto");
    expect(consultas[0]).toContain("LIMIT 41");
    expect(consultas[0]).not.toMatch(/ContactTags|TicketTags/);
    expect(consultas[1]).not.toContain("boleto");
  });
});
