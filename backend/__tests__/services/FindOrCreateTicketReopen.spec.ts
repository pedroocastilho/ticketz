/**
 * Testes da reabertura de conversa numa fila que tem menu de chatbot.
 *
 * O problema original: ao reabrir, o Ticketz volta o ticket para "aguardando"
 * mas nao religa o chatbot nem limpa a fila. Num numero 100% automatizado
 * (sem atendente humano) isso deixava o cliente sem resposta nenhuma: ele
 * usava o bot, a conversa era encerrada, e dias depois escrevia de novo sem
 * receber nem o menu nem um atendente.
 */
jest.mock("../../src/database", () => ({
  __esModule: true,
  default: { transaction: jest.fn(async (cb: any) => cb()) }
}));
jest.mock("../../src/models/Ticket", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), create: jest.fn() }
}));
jest.mock("../../src/models/QueueOption", () => ({
  __esModule: true,
  default: { count: jest.fn() }
}));
jest.mock("../../src/models/Whatsapp", () => ({
  __esModule: true,
  default: { findByPk: jest.fn() }
}));
jest.mock("../../src/models/Queue", () => ({ __esModule: true, default: {} }));
jest.mock("../../src/models/Contact", () => ({
  __esModule: true,
  default: {}
}));
jest.mock("../../src/services/TicketServices/ShowTicketService", () => ({
  __esModule: true,
  default: jest.fn(async (id: number) => ({ id }))
}));
jest.mock(
  "../../src/services/TicketServices/FindOrCreateATicketTrakingService",
  () => ({ __esModule: true, default: jest.fn() })
);
jest.mock("../../src/helpers/CheckSettings", () => ({
  GetCompanySetting: jest.fn()
}));
jest.mock("../../src/services/CounterServices/IncrementCounter", () => ({
  incrementCounter: jest.fn()
}));

import Ticket from "../../src/models/Ticket";
import QueueOption from "../../src/models/QueueOption";
import { GetCompanySetting } from "../../src/helpers/CheckSettings";
import FindOrCreateTicketService from "../../src/services/TicketServices/FindOrCreateTicketService";

const mockedTicket = Ticket as unknown as {
  findOne: jest.Mock;
  create: jest.Mock;
};
const mockedQueueOption = QueueOption as unknown as { count: jest.Mock };
const mockedSetting = GetCompanySetting as unknown as jest.Mock;

const contato = { id: 57, name: "Cliente" } as any;
const CONEXAO = 4;
const EMPRESA = 1;

// ticket fechado dentro da janela de reabertura, na fila 2
const ticketFechado = () => ({
  id: 900,
  queueId: 2,
  whatsappId: CONEXAO,
  userId: 3,
  unreadMessages: 0,
  update: jest.fn()
});

beforeEach(() => {
  jest.clearAllMocks();
  // reabertura ligada (7 dias), como esta em producao
  mockedSetting.mockResolvedValue("10080");
});

describe("reabertura de conversa", () => {
  it("recomeca o bot quando a fila tem menu: zera fila, chatbot e opcao", async () => {
    const alvo = ticketFechado();
    mockedTicket.findOne
      .mockResolvedValueOnce(null) // nenhum ticket aberto
      .mockResolvedValueOnce(alvo); // achou o fechado para reabrir
    mockedQueueOption.count.mockResolvedValue(6); // fila 2 tem menu

    await FindOrCreateTicketService(contato, CONEXAO, EMPRESA);

    expect(mockedQueueOption.count).toHaveBeenCalledWith({
      where: { queueId: 2, parentId: null }
    });
    const gravado = alvo.update.mock.calls[0][0];
    expect(gravado).toMatchObject({
      status: "pending",
      userId: null,
      queueId: null,
      chatbot: false,
      queueOptionId: null
    });
  });

  it("nao mexe na fila quando ela nao tem menu", async () => {
    const alvo = ticketFechado();
    alvo.queueId = 1; // fila da Bia, sem menu
    mockedTicket.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(alvo);
    mockedQueueOption.count.mockResolvedValue(0);

    await FindOrCreateTicketService(contato, CONEXAO, EMPRESA);

    const gravado = alvo.update.mock.calls[0][0];
    expect(gravado).toMatchObject({ status: "pending", userId: null });
    expect(gravado).not.toHaveProperty("queueId");
    expect(gravado).not.toHaveProperty("chatbot");
    expect(gravado).not.toHaveProperty("queueOptionId");
  });

  it("ticket sem fila nao consulta o menu nem quebra", async () => {
    const alvo = ticketFechado();
    alvo.queueId = null;
    mockedTicket.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(alvo);

    await FindOrCreateTicketService(contato, CONEXAO, EMPRESA);

    expect(mockedQueueOption.count).not.toHaveBeenCalled();
    expect(alvo.update.mock.calls[0][0]).not.toHaveProperty("chatbot");
  });

  it("conversa ja aberta nao passa pela reabertura", async () => {
    const aberto = ticketFechado();
    mockedTicket.findOne.mockResolvedValueOnce(aberto);

    await FindOrCreateTicketService(contato, CONEXAO, EMPRESA);

    expect(mockedQueueOption.count).not.toHaveBeenCalled();
    expect(aberto.update).not.toHaveBeenCalled();
  });
});
