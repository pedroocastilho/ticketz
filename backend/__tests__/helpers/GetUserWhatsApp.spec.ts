/**
 * Testes do helper que decide por qual conexao (numero) uma conversa
 * iniciada pela plataforma deve sair. O bug original: toda conversa nova
 * saia pela conexao padrao da empresa, mesmo quando o atendente trabalhava
 * em outro numero.
 */
jest.mock("../../src/models/Whatsapp", () => ({
  __esModule: true,
  default: { findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn() }
}));
jest.mock("../../src/models/User", () => ({
  __esModule: true,
  default: { findByPk: jest.fn() }
}));
jest.mock("../../src/models/Ticket", () => ({
  __esModule: true,
  default: { findOne: jest.fn() }
}));
jest.mock("../../src/utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

import Whatsapp from "../../src/models/Whatsapp";
import User from "../../src/models/User";
import Ticket from "../../src/models/Ticket";
import GetUserWhatsApp from "../../src/helpers/GetUserWhatsApp";

const mockedWhatsapp = Whatsapp as unknown as {
  findAll: jest.Mock;
  findByPk: jest.Mock;
  findOne: jest.Mock;
};
const mockedUser = User as unknown as { findByPk: jest.Mock };
const mockedTicket = Ticket as unknown as { findOne: jest.Mock };

// conexoes: Brenda (padrao, fila 1) e Alberto (fila 2)
const brenda = {
  id: 1,
  name: "Brenda",
  companyId: 1,
  status: "CONNECTED",
  channel: "whatsapp",
  isDefault: true,
  queues: [{ id: 1 }]
};
const alberto = {
  id: 2,
  name: "Alberto",
  companyId: 1,
  status: "CONNECTED",
  channel: "whatsapp",
  isDefault: false,
  queues: [{ id: 2 }]
};

describe("GetUserWhatsApp", () => {
  beforeEach(() => {
    mockedWhatsapp.findAll.mockResolvedValue([brenda, alberto]);
    mockedWhatsapp.findByPk.mockReset();
    mockedUser.findByPk.mockReset();
    mockedTicket.findOne.mockReset();
  });

  it("reaproveita o numero da ultima conversa do atendente com o contato", async () => {
    mockedTicket.findOne.mockResolvedValue({ whatsappId: 2 });

    const result = await GetUserWhatsApp({
      companyId: 1,
      userId: 10,
      contactId: 55,
      queueId: 1
    });

    expect(result.id).toBe(2);
  });

  it("ignora a ultima conversa se aquele numero esta desconectado", async () => {
    mockedTicket.findOne.mockResolvedValue({ whatsappId: 999 });

    const result = await GetUserWhatsApp({
      companyId: 1,
      userId: 10,
      contactId: 55,
      queueId: 2
    });

    expect(result.id).toBe(2);
  });

  it("usa a conexao informada explicitamente quando ela esta conectada", async () => {
    mockedWhatsapp.findByPk.mockResolvedValue(alberto);

    const result = await GetUserWhatsApp({
      companyId: 1,
      userId: 10,
      whatsappId: 2
    });

    expect(result.id).toBe(2);
  });

  it("recusa conexao explicita de outra empresa", async () => {
    mockedWhatsapp.findByPk.mockResolvedValue({ ...alberto, companyId: 99 });

    await expect(
      GetUserWhatsApp({ companyId: 1, userId: 10, whatsappId: 2 })
    ).rejects.toMatchObject({ message: "ERR_NO_WAPP_FOUND" });
  });

  it("recusa conexao explicita desconectada", async () => {
    mockedWhatsapp.findByPk.mockResolvedValue({
      ...alberto,
      status: "DISCONNECTED"
    });

    await expect(
      GetUserWhatsApp({ companyId: 1, userId: 10, whatsappId: 2 })
    ).rejects.toMatchObject({ message: "ERR_WAPP_NOT_CONNECTED" });
  });

  it("escolhe a conexao ligada a fila escolhida, nao a padrao da empresa", async () => {
    const result = await GetUserWhatsApp({
      companyId: 1,
      userId: 10,
      queueId: 2
    });

    expect(result.id).toBe(2);
  });

  it("sem fila, escolhe a conexao ligada as filas do atendente", async () => {
    mockedUser.findByPk.mockResolvedValue({ id: 10, queues: [{ id: 2 }] });

    const result = await GetUserWhatsApp({ companyId: 1, userId: 10 });

    expect(result.id).toBe(2);
  });

  it("entre varias conexoes da mesma fila, prefere a padrao", async () => {
    const outra = { ...alberto, id: 3, name: "Outra", queues: [{ id: 1 }] };
    mockedWhatsapp.findAll.mockResolvedValue([outra, brenda]);

    const result = await GetUserWhatsApp({
      companyId: 1,
      userId: 10,
      queueId: 1
    });

    expect(result.id).toBe(1);
  });

  it("cai na conexao padrao da empresa quando nada liga o atendente a um numero", async () => {
    mockedUser.findByPk.mockResolvedValue({ id: 10, queues: [] });

    const result = await GetUserWhatsApp({ companyId: 1, userId: 10 });

    expect(result.id).toBe(1);
  });

  it("falha quando nao ha nenhuma conexao conectada", async () => {
    mockedWhatsapp.findAll.mockResolvedValue([]);
    mockedUser.findByPk.mockResolvedValue({ id: 10, queues: [] });

    await expect(
      GetUserWhatsApp({ companyId: 1, userId: 10 })
    ).rejects.toMatchObject({ message: "ERR_NO_DEF_WAPP_FOUND" });
  });
});
