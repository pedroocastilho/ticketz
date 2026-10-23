import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";
import Ticket from "../../models/Ticket";
import GetUserWhatsApp from "../../helpers/GetUserWhatsApp";

// models dublados: o teste confere so por qual numero a conversa sai (sem banco)
jest.mock("../../models/User", () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock("../../models/Whatsapp", () => ({ __esModule: true, default: { findAll: jest.fn(), findByPk: jest.fn() } }));
jest.mock("../../models/Ticket", () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock("../../models/Queue", () => ({ __esModule: true, default: {} }));
jest.mock("../../utils/logger", () => ({ logger: { warn: jest.fn(), info: jest.fn() } }));

const userFindByPk = User.findByPk as unknown as jest.Mock;
const findAll = Whatsapp.findAll as unknown as jest.Mock;
const wFindByPk = Whatsapp.findByPk as unknown as jest.Mock;
const ticketFindOne = Ticket.findOne as unknown as jest.Mock;

// cenario de 23/10/2026: Isabela (padrao, fila 6), Jackeline (fila 12), Fellipe (fila 13)
const conexao = (id: number, fila: number, status = "CONNECTED", extra = {}) => ({
  id, name: `Comercial - ${id}`, companyId: 2, status, isDefault: false, queues: [{ id: fila }], ...extra
});
const ISABELA = conexao(9, 6, "CONNECTED", { isDefault: true });
const JACKELINE = conexao(15, 12);
const FELLIPE = conexao(17, 13);
const fellipe = { id: 17, profile: "user", companyId: 2, queues: [{ id: 13 }] };
const admin = { id: 1, profile: "admin", companyId: 2, queues: [] };

const conectadas = (lista: any[]) => findAll.mockResolvedValue(lista.filter(w => w.status === "CONNECTED"));

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CONEXAO_PROPRIA_COMPANIES = "2";
  ticketFindOne.mockResolvedValue(null);
});

afterAll(() => {
  delete process.env.CONEXAO_PROPRIA_COMPANIES;
});

describe("GetUserWhatsApp: vendedor com conexao propria", () => {
  it("numero dele conectado: sai pelo dele", async () => {
    userFindByPk.mockResolvedValue(fellipe);
    conectadas([ISABELA, JACKELINE, FELLIPE]);
    expect((await GetUserWhatsApp({ companyId: 2, userId: 17, queueId: 13 })).id).toBe(17);
  });

  it("numero dele desconectado: erro, nunca o numero padrao nem o de um colega", async () => {
    userFindByPk.mockResolvedValue(fellipe);
    conectadas([ISABELA, JACKELINE]);
    await expect(GetUserWhatsApp({ companyId: 2, userId: 17, queueId: 13 })).rejects.toMatchObject({ message: "ERR_WAPP_NOT_CONNECTED", statusCode: 400 });
  });

  it("ja conversou com o contato pelo numero da colega: nao reaproveita", async () => {
    userFindByPk.mockResolvedValue(fellipe);
    conectadas([ISABELA, FELLIPE]);
    ticketFindOne.mockResolvedValue({ whatsappId: 9 });
    expect((await GetUserWhatsApp({ companyId: 2, userId: 17, contactId: 50 })).id).toBe(17);
    conectadas([ISABELA]);
    await expect(GetUserWhatsApp({ companyId: 2, userId: 17, contactId: 50 })).rejects.toMatchObject({ message: "ERR_WAPP_NOT_CONNECTED" });
  });

  it("fila de outro vendedor informada: nao usa o numero dela", async () => {
    userFindByPk.mockResolvedValue(fellipe);
    conectadas([JACKELINE]);
    await expect(GetUserWhatsApp({ companyId: 2, userId: 17, queueId: 12 })).rejects.toMatchObject({ message: "ERR_WAPP_NOT_CONNECTED" });
  });

  it("conexao de colega escolhida na tela: sem permissao", async () => {
    userFindByPk.mockResolvedValue(fellipe);
    wFindByPk.mockResolvedValue(ISABELA);
    await expect(GetUserWhatsApp({ companyId: 2, userId: 17, whatsappId: 9 })).rejects.toMatchObject({ message: "ERR_NO_PERMISSION", statusCode: 403 });
    wFindByPk.mockResolvedValue(FELLIPE);
    expect((await GetUserWhatsApp({ companyId: 2, userId: 17, whatsappId: 17 })).id).toBe(17);
  });
});

describe("GetUserWhatsApp: quem continua como antes", () => {
  it("admin sem fila: conexao padrao", async () => {
    userFindByPk.mockResolvedValue(admin);
    conectadas([ISABELA, JACKELINE]);
    expect((await GetUserWhatsApp({ companyId: 2, userId: 1 })).id).toBe(9);
  });

  it("empresa sem o recurso (suporte): vendedor sem numero cai na padrao", async () => {
    userFindByPk.mockResolvedValue({ ...fellipe, companyId: 1 });
    findAll.mockResolvedValue([{ ...ISABELA, companyId: 1 }]);
    expect((await GetUserWhatsApp({ companyId: 1, userId: 17, queueId: 13 })).id).toBe(9);
  });

  it("sem usuario (robo, campanha): conexao padrao", async () => {
    conectadas([JACKELINE, ISABELA]);
    expect((await GetUserWhatsApp({ companyId: 2 })).id).toBe(9);
    expect(userFindByPk).not.toHaveBeenCalled();
  });
});
