import sequelize from "../../database";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import ListMessagesService from "../../services/MessageServices/ListMessagesService";
import ShowTicketService from "../../services/TicketServices/ShowTicketService";

jest.mock("../../services/TicketServices/ShowTicketService", () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock("../../helpers/CheckSettings", () => ({
  GetCompanySetting: jest.fn(async () => "message")
}));

const consultas: string[] = [];
const AMBIENTE = process.env.HISTORICO_CONTATO_COMPANIES;

beforeEach(() => {
  consultas.length = 0;
  process.env.HISTORICO_CONTATO_COMPANIES = "2";
  (ShowTicketService as jest.Mock).mockResolvedValue({
    id: 30,
    contactId: 7,
    companyId: 2,
    isGroup: false
  });
  jest
    .spyOn(Ticket, "findAll")
    .mockResolvedValue([
      { id: 10 },
      { id: 20 },
      { id: 30 }
    ] as unknown as Ticket[]);
  jest
    .spyOn(sequelize, "query")
    .mockImplementation(async (sql: unknown): Promise<any> => {
      consultas.push(String(sql));
      return [];
    });
});

afterEach(() => {
  jest.restoreAllMocks();
  process.env.HISTORICO_CONTATO_COMPANIES = AMBIENTE;
});

describe("ListMessagesService: historico do contato", () => {
  it("traz as mensagens de todas as conversas do contato", async () => {
    const r = await ListMessagesService({ ticketId: "30", companyId: 2 });

    expect(Ticket.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 2, contactId: 7, isGroup: false }
      })
    );
    expect(consultas[0]).toMatch(/"Message"\."ticketId" IN \(10, 20, 30\)/);
    expect(r.historicoContato).toBe(true);
  });

  it("traz fila e numero de cada mensagem para marcar a troca de atendimento", async () => {
    await ListMessagesService({ ticketId: "30", companyId: 2 });

    expect(consultas[0]).toMatch(/AS "ticket\.whatsapp\.name"/);
    expect(consultas[0]).toMatch(/AS "ticket\.queueId"/);
  });

  it("nao filtra pela fila: quem abre ve o que os colegas falaram", async () => {
    await ListMessagesService({
      ticketId: "30",
      companyId: 2,
      queues: [5]
    });

    expect(consultas[0]).not.toMatch(/"Message"\."queueId" IN/);
  });

  it("carregar mais aceita cursor de mensagem de outra conversa do contato", async () => {
    const findOne = jest
      .spyOn(Message, "findOne")
      .mockResolvedValue({ createdAt: new Date() } as Message);

    await ListMessagesService({
      ticketId: "30",
      companyId: 2,
      nextId: "abc"
    });

    expect(findOne.mock.calls[0][0].where).toMatchObject({
      id: "abc",
      companyId: 2,
      ticketId: [10, 20, 30]
    });
  });

  it("grupo continua so com a propria conversa", async () => {
    (ShowTicketService as jest.Mock).mockResolvedValue({
      id: 30,
      contactId: 7,
      companyId: 2,
      isGroup: true
    });
    const r = await ListMessagesService({ ticketId: "30", companyId: 2 });

    expect(Ticket.findAll).not.toHaveBeenCalled();
    expect(r.historicoContato).toBe(false);
  });

  it("empresa fora da lista (suporte) continua igual, com o filtro de fila", async () => {
    (ShowTicketService as jest.Mock).mockResolvedValue({
      id: 30,
      contactId: 7,
      companyId: 1,
      isGroup: false
    });
    const r = await ListMessagesService({
      ticketId: "30",
      companyId: 1,
      queues: [5]
    });

    expect(Ticket.findAll).not.toHaveBeenCalled();
    expect(consultas[0]).toMatch(/"Message"\."ticketId" = '30'/);
    expect(consultas[0]).toMatch(/"Message"\."queueId" IN \(5\)/);
    expect(consultas[0]).not.toMatch(/AS "ticket\.whatsapp\.name"/);
    expect(r.historicoContato).toBe(false);
  });
});
