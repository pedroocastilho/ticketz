/**
 * Testes do tratamento da resposta que o atendente manda pelo celular, fora
 * da plataforma. O problema original: a plataforma so espelhava a mensagem,
 * o ticket ficava em "Aguardando" e o contador de nao lidas nunca zerava,
 * entao a supervisao via conversa ja respondida como cliente esperando.
 */
jest.mock("../../src/models/Ticket", () => ({
  __esModule: true,
  default: { findOne: jest.fn() }
}));
jest.mock("../../src/models/User", () => ({
  __esModule: true,
  default: { findAll: jest.fn() }
}));
jest.mock("../../src/models/Queue", () => ({ __esModule: true, default: {} }));
jest.mock("../../src/models/Whatsapp", () => ({
  __esModule: true,
  default: {}
}));
jest.mock("../../src/services/TicketServices/UpdateTicketService", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../src/helpers/SetTicketMessagesAsRead", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../src/utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import Ticket from "../../src/models/Ticket";
import User from "../../src/models/User";
import UpdateTicketService from "../../src/services/TicketServices/UpdateTicketService";
import SetTicketMessagesAsRead from "../../src/helpers/SetTicketMessagesAsRead";
import HandleReplyFromPhone, {
  findPhoneOperator
} from "../../src/helpers/HandleReplyFromPhone";

const mockedTicket = Ticket as unknown as { findOne: jest.Mock };
const mockedUser = User as unknown as { findAll: jest.Mock };
const mockedUpdate = UpdateTicketService as unknown as jest.Mock;
const mockedRead = SetTicketMessagesAsRead as unknown as jest.Mock;

// conexao da Bia, ligada so a fila Suporte (id 1)
const whatsappBia = { id: 5, queues: [{ id: 1 }] } as any;

const bia = { id: 2, name: "Beatriz", profile: "user" };
const brenda = { id: 3, name: "Brenda", profile: "supervisor" };
const pedro = { id: 1, name: "Pedro", profile: "admin" };
const outraAtendente = { id: 7, name: "Outra", profile: "user" };

const makeTicket = (overrides = {}) =>
  ({
    id: 100,
    companyId: 1,
    contactId: 82,
    whatsappId: 5,
    queueId: 1,
    userId: null,
    status: "pending",
    isGroup: false,
    reload: jest.fn().mockResolvedValue(undefined),
    ...overrides
  }) as any;

describe("findPhoneOperator", () => {
  beforeEach(() => {
    mockedTicket.findOne.mockReset();
    mockedUser.findAll.mockReset();
  });

  it("prefere quem atendeu por ultimo esse contato nessa conexao", async () => {
    mockedTicket.findOne.mockResolvedValue({ userId: 3 });
    mockedUser.findAll.mockResolvedValue([bia, brenda, pedro]);

    expect(await findPhoneOperator(makeTicket(), whatsappBia)).toBe(3);
    expect(mockedUser.findAll).not.toHaveBeenCalled();
  });

  it("sem historico, aceita para a unica atendente da fila", async () => {
    mockedTicket.findOne.mockResolvedValue(null);
    mockedUser.findAll.mockResolvedValue([bia, brenda, pedro]);

    expect(await findPhoneOperator(makeTicket(), whatsappBia)).toBe(bia.id);
  });

  it("fila sem perfil usuario: aceita para a unica pessoa nao admin", async () => {
    mockedTicket.findOne.mockResolvedValue(null);
    mockedUser.findAll.mockResolvedValue([brenda, pedro]);

    expect(await findPhoneOperator(makeTicket(), whatsappBia)).toBe(brenda.id);
  });

  it("com duas atendentes na fila nao arrisca", async () => {
    mockedTicket.findOne.mockResolvedValue(null);
    mockedUser.findAll.mockResolvedValue([bia, outraAtendente, brenda]);

    expect(await findPhoneOperator(makeTicket(), whatsappBia)).toBeNull();
  });

  it("conexao com mais de uma fila e sem historico nao arrisca", async () => {
    mockedTicket.findOne.mockResolvedValue(null);

    const result = await findPhoneOperator(makeTicket(), {
      id: 5,
      queues: [{ id: 1 }, { id: 2 }]
    } as any);

    expect(result).toBeNull();
    expect(mockedUser.findAll).not.toHaveBeenCalled();
  });
});

describe("HandleReplyFromPhone", () => {
  beforeEach(() => {
    mockedTicket.findOne.mockReset();
    mockedUser.findAll.mockReset();
    mockedUpdate.mockReset();
    mockedRead.mockReset();
  });

  it("ticket aguardando sem atendente: aceita e zera as nao lidas", async () => {
    mockedTicket.findOne.mockResolvedValue(null);
    mockedUser.findAll.mockResolvedValue([bia, brenda, pedro]);
    const ticket = makeTicket();

    await HandleReplyFromPhone(ticket, whatsappBia);

    expect(mockedUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: 100,
        companyId: 1,
        ticketData: { status: "open", userId: bia.id, queueId: 1 }
      })
    );
    expect(ticket.reload).toHaveBeenCalled();
    expect(mockedRead).toHaveBeenCalledWith(ticket);
  });

  it("ticket novo sem fila herda a fila da conexao ao aceitar", async () => {
    mockedTicket.findOne.mockResolvedValue({ userId: bia.id });
    const ticket = makeTicket({ queueId: null });

    await HandleReplyFromPhone(ticket, whatsappBia);

    expect(mockedUpdate.mock.calls[0][0].ticketData).toEqual({
      status: "open",
      userId: bia.id,
      queueId: 1
    });
  });

  it("ticket ja em atendimento: so zera as nao lidas", async () => {
    const ticket = makeTicket({ status: "open", userId: bia.id });

    await HandleReplyFromPhone(ticket, whatsappBia);

    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(mockedTicket.findOne).not.toHaveBeenCalled();
    expect(mockedRead).toHaveBeenCalledWith(ticket);
  });

  it("aguardando mas ja com atendente: volta para atendimento dessa pessoa", async () => {
    const ticket = makeTicket({ status: "pending", userId: brenda.id });

    await HandleReplyFromPhone(ticket, whatsappBia);

    expect(mockedTicket.findOne).not.toHaveBeenCalled();
    expect(mockedUpdate.mock.calls[0][0].ticketData.userId).toBe(brenda.id);
  });

  it("sem saber para quem aceitar, so zera as nao lidas", async () => {
    mockedTicket.findOne.mockResolvedValue(null);
    mockedUser.findAll.mockResolvedValue([bia, outraAtendente]);
    const ticket = makeTicket();

    await HandleReplyFromPhone(ticket, whatsappBia);

    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(mockedRead).toHaveBeenCalledWith(ticket);
  });

  it("grupo fica de fora", async () => {
    await HandleReplyFromPhone(makeTicket({ isGroup: true }), whatsappBia);

    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(mockedRead).not.toHaveBeenCalled();
  });

  it("erro ao aceitar nao derruba o tratamento da mensagem", async () => {
    mockedTicket.findOne.mockResolvedValue({ userId: bia.id });
    mockedUpdate.mockRejectedValue(new Error("boom"));

    await expect(
      HandleReplyFromPhone(makeTicket(), whatsappBia)
    ).resolves.toBeUndefined();
  });
});
