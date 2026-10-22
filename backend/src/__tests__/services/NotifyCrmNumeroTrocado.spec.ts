import axios from "axios";
import NotifyCrmNumeroTrocado from "../../services/WebhookServices/NotifyCrmNumeroTrocado";

jest.mock("axios");
jest.mock("../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn() }
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

const env = {
  CRM_WEBHOOK_URL: "https://n8n.exemplo.com/webhook/whatsapp-ticketz",
  CRM_WEBHOOK_TOKEN: "token-secreto",
  CRM_WEBHOOK_COMPANIES: "2"
};

const troca = (companyId = 2) => ({
  companyId,
  whatsapp: { id: 9, name: "Comercial - Isabela" },
  numeroAnterior: "5573999840461",
  numeroNovo: "5511912345678",
  pedidoPor: { id: 8, name: "Isabela" }
});

beforeEach(() => jest.clearAllMocks());

describe("NotifyCrmNumeroTrocado", () => {
  it("manda o evento troca_numero com o token no header", async () => {
    mockedAxios.post.mockResolvedValueOnce({ status: 200 });
    expect(await NotifyCrmNumeroTrocado(troca(), env)).toBe(true);
    const [url, payload, opcoes] = mockedAxios.post.mock.calls[0];
    expect(url).toBe(env.CRM_WEBHOOK_URL);
    expect(payload).toEqual(
      expect.objectContaining({
        evento: "troca_numero",
        companyId: 2,
        whatsapp: { id: 9, name: "Comercial - Isabela" },
        numeroAnterior: "5573999840461",
        numeroNovo: "5511912345678",
        pedidoPor: { id: 8, name: "Isabela" }
      })
    );
    expect(typeof (payload as { trocadoEm: string }).trocadoEm).toBe("string");
    expect(opcoes.headers["x-webhook-token"]).toBe("token-secreto");
  });

  it("empresa fora da lista ou sem URL nao manda nada", async () => {
    expect(await NotifyCrmNumeroTrocado(troca(1), env)).toBe(false);
    expect(await NotifyCrmNumeroTrocado(troca(), { ...env, CRM_WEBHOOK_URL: "" })).toBe(false);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it("erro de rede vira false, nunca lanca", async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error("timeout"));
    expect(await NotifyCrmNumeroTrocado(troca(), env)).toBe(false);
  });

  it("sem quem pediu vai null", async () => {
    mockedAxios.post.mockResolvedValueOnce({ status: 200 });
    await NotifyCrmNumeroTrocado({ ...troca(), pedidoPor: null }, env);
    expect((mockedAxios.post.mock.calls[0][1] as { pedidoPor: unknown }).pedidoPor).toBeNull();
  });
});
