import NotifyCrmNumeroTrocado from "../../services/WebhookServices/NotifyCrmNumeroTrocado";
import {
  decidirTrocaNumero,
  numeroDoJid,
  quemPediuConexao,
  registrarNumeroPareado,
  registrarPedidoConexao
} from "../../services/WbotServices/RegistrarNumeroPareado";

jest.mock("../../services/WebhookServices/NotifyCrmNumeroTrocado", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(true)
}));
jest.mock("../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() }
}));

const notify = NotifyCrmNumeroTrocado as jest.Mock;

const conexao = (pairedNumber: string | null) => {
  const c = {
    id: 9,
    name: "Comercial - Isabela",
    companyId: 2,
    pairedNumber,
    update: jest.fn(async (dados: { pairedNumber: string }) => {
      c.pairedNumber = dados.pairedNumber;
    })
  };
  return c;
};

beforeEach(() => jest.clearAllMocks());

describe("numeroDoJid", () => {
  it("tira dominio e sufixo de aparelho", () => {
    expect(numeroDoJid("5573999840461@s.whatsapp.net")).toBe("5573999840461");
    expect(numeroDoJid("5573999840461:12@s.whatsapp.net")).toBe("5573999840461");
    expect(numeroDoJid("")).toBe("");
    expect(numeroDoJid(undefined)).toBe("");
  });
});

describe("decidirTrocaNumero", () => {
  it("primeira conexao grava sem avisar", () => {
    expect(decidirTrocaNumero(null, "5573999")).toEqual({ gravar: true, avisar: false });
    expect(decidirTrocaNumero("", "5573999")).toEqual({ gravar: true, avisar: false });
  });

  it("mesmo numero nao faz nada", () => {
    expect(decidirTrocaNumero("5573999", "5573999")).toEqual({ gravar: false, avisar: false });
  });

  it("numero diferente grava e avisa", () => {
    expect(decidirTrocaNumero("5573999", "5511888")).toEqual({ gravar: true, avisar: true });
  });

  it("sem numero novo (JID estranho) nao mexe", () => {
    expect(decidirTrocaNumero("5573999", "")).toEqual({ gravar: false, avisar: false });
  });
});

describe("pedido de conexao pela tela", () => {
  it("lembra quem pediu por 30 minutos", () => {
    registrarPedidoConexao(9, { id: 8, name: "Isabela" }, 1000);
    expect(quemPediuConexao(9, 1000 + 29 * 60 * 1000)).toEqual({ id: 8, name: "Isabela" });
    expect(quemPediuConexao(9, 1000 + 31 * 60 * 1000)).toBeNull();
    expect(quemPediuConexao(10, 1000)).toBeNull();
  });
});

describe("registrarNumeroPareado", () => {
  it("primeira conexao so grava", async () => {
    const c = conexao(null);
    await registrarNumeroPareado(c, "5573999840461:3@s.whatsapp.net");
    expect(c.update).toHaveBeenCalledWith({ pairedNumber: "5573999840461" });
    expect(notify).not.toHaveBeenCalled();
  });

  it("reconexao do mesmo numero nao grava nem avisa", async () => {
    const c = conexao("5573999840461");
    await registrarNumeroPareado(c, "5573999840461@s.whatsapp.net");
    expect(c.update).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("troca de numero grava e avisa o CRM com quem pediu", async () => {
    registrarPedidoConexao(9, { id: 8, name: "Isabela" });
    const c = conexao("5573999840461");
    await registrarNumeroPareado(c, "5511912345678@s.whatsapp.net");
    expect(c.update).toHaveBeenCalledWith({ pairedNumber: "5511912345678" });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 2,
        whatsapp: { id: 9, name: "Comercial - Isabela" },
        numeroAnterior: "5573999840461",
        numeroNovo: "5511912345678",
        pedidoPor: { id: 8, name: "Isabela" }
      })
    );
  });

  it("falha ao gravar nunca lanca (a conexao nao pode cair por isso)", async () => {
    const c = conexao("5573999840461");
    c.update.mockRejectedValueOnce(new Error("banco fora"));
    await expect(registrarNumeroPareado(c, "5511912345678@s.whatsapp.net")).resolves.toBeUndefined();
  });
});
