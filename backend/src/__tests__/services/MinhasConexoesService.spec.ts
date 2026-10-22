import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";
import {
  acharMinhaConexao,
  listarMinhasConexoes
} from "../../services/WhatsappService/MinhasConexoesService";

// models dublados: o teste confere so quem enxerga o que (sem banco)
jest.mock("../../models/User", () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock("../../models/Whatsapp", () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock("../../models/Queue", () => ({ __esModule: true, default: {} }));

const findByPk = User.findByPk as unknown as jest.Mock;
const findAll = Whatsapp.findAll as unknown as jest.Mock;

const conexao = (id: number, fila: number, extra = {}) => ({
  id,
  name: `Comercial - ${id}`,
  status: "CONNECTED",
  qrcode: "segredo-do-qr",
  pairedNumber: `55739990000${id}`,
  companyId: 2,
  channel: "whatsapp",
  token: "token-que-nao-pode-vazar",
  queues: [{ id: fila, name: `Fila ${fila}` }],
  updatedAt: new Date("2026-10-22T12:00:00Z"),
  ...extra
});

const isabela = { id: 8, profile: "user", companyId: 2 };
const beatriz = { id: 10, profile: "supervisor", companyId: 2 };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CONEXAO_PROPRIA_COMPANIES = "2";
  findAll.mockImplementation(async ({ where }) =>
    [conexao(9, 6), conexao(10, 7), conexao(11, 8, { channel: "instagram" })].filter(
      c => !where.id || c.id === where.id
    )
  );
});

afterAll(() => {
  delete process.env.CONEXAO_PROPRIA_COMPANIES;
});

describe("listarMinhasConexoes", () => {
  it("vendedora ve so a conexao da fila dela, sem token", async () => {
    findByPk.mockResolvedValue({ id: 8, queues: [{ id: 6 }] });
    const lista = await listarMinhasConexoes(isabela);
    expect(lista.map(c => c.id)).toEqual([9]);
    expect(lista[0]).not.toHaveProperty("token");
    expect(lista[0].pairedNumber).toBe("557399900009");
  });

  it("QR so aparece quando a conexao espera leitura", async () => {
    findByPk.mockResolvedValue({ id: 8, queues: [{ id: 6 }] });
    expect((await listarMinhasConexoes(isabela))[0].qrcode).toBe("");
    findAll.mockResolvedValueOnce([conexao(9, 6, { status: "qrcode" })]);
    expect((await listarMinhasConexoes(isabela))[0].qrcode).toBe("segredo-do-qr");
  });

  it("gestora ve todas as conexoes de WhatsApp (Instagram fica de fora)", async () => {
    findByPk.mockResolvedValue({ id: 10, queues: [] });
    expect((await listarMinhasConexoes(beatriz)).map(c => c.id)).toEqual([9, 10]);
  });

  it("empresa sem o recurso ligado: lista vazia", async () => {
    findByPk.mockResolvedValue({ id: 8, queues: [{ id: 6 }] });
    expect(await listarMinhasConexoes({ ...isabela, companyId: 1 })).toEqual([]);
  });
});

describe("acharMinhaConexao", () => {
  it("conexao do colega responde 404, igual a que nao existe", async () => {
    findByPk.mockResolvedValue({ id: 8, queues: [{ id: 6 }] });
    await expect(acharMinhaConexao(isabela, 10)).rejects.toMatchObject({ message: "ERR_NO_WAPP_FOUND", statusCode: 404 });
    await expect(acharMinhaConexao(isabela, 999)).rejects.toMatchObject({ statusCode: 404 });
    await expect(acharMinhaConexao(isabela, NaN)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("a propria conexao vem", async () => {
    findByPk.mockResolvedValue({ id: 8, queues: [{ id: 6 }] });
    expect((await acharMinhaConexao(isabela, 9)).id).toBe(9);
  });
});
