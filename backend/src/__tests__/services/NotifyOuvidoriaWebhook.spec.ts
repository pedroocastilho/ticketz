import axios from "axios";
import NotifyOuvidoriaWebhook, {
  isOuvidoriaConexao
} from "../../services/WebhookServices/NotifyOuvidoriaWebhook";

jest.mock("axios");
jest.mock("../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn() }
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

const env = {
  OUVIDORIA_WEBHOOK_URL: "https://n8n.exemplo.com/webhook/reembolsos",
  OUVIDORIA_CONEXOES: "7, 12",
  CRM_WEBHOOK_TOKEN: "token-secreto"
};

const mensagem = (whatsappId = 7, extra = {}) => ({
  companyId: 1,
  fromMe: false,
  messageAt: Date.parse("2026-11-11T15:00:00.000Z"),
  justCreated: true,
  ticket: {
    id: 50,
    uuid: "uuid-50",
    status: "pending",
    queueId: 4,
    userId: null
  },
  whatsapp: { id: whatsappId, name: "VIVIAN - OUVIDORIA" },
  contact: { id: 9, name: "Ana", number: "5573999887766" },
  ...extra
});

beforeEach(() => jest.clearAllMocks());

describe("isOuvidoriaConexao", () => {
  it("so liga para as conexoes da lista, com URL e token", () => {
    expect(isOuvidoriaConexao(7, env)).toBe(true);
    expect(isOuvidoriaConexao(12, env)).toBe(true);
    expect(isOuvidoriaConexao(3, env)).toBe(false);
    expect(isOuvidoriaConexao(7, { ...env, OUVIDORIA_CONEXOES: "" })).toBe(
      false
    );
    expect(isOuvidoriaConexao(7, { ...env, OUVIDORIA_WEBHOOK_URL: "" })).toBe(
      false
    );
    expect(isOuvidoriaConexao(7, { ...env, CRM_WEBHOOK_TOKEN: "" })).toBe(
      false
    );
    expect(isOuvidoriaConexao(7, {})).toBe(false);
  });
});

describe("NotifyOuvidoriaWebhook", () => {
  it("conexao da Ouvidoria: manda quem falou e quando, com o token, sem o texto", async () => {
    mockedAxios.post.mockResolvedValue({ status: 200 });
    const ok = await NotifyOuvidoriaWebhook(mensagem(), env);

    expect(ok).toBe(true);
    const [url, payload, opcoes] = mockedAxios.post.mock.calls[0];
    expect(url).toBe(env.OUVIDORIA_WEBHOOK_URL);
    expect(opcoes.headers["x-webhook-token"]).toBe("token-secreto");
    expect(payload).toMatchObject({
      evento: "mensagem",
      companyId: 1,
      fromMe: false,
      messageAt: "2026-11-11T15:00:00.000Z",
      ticket: { id: 50, uuid: "uuid-50", userId: null, justCreated: true },
      whatsapp: { id: 7 },
      contact: { id: 9, name: "Ana", number: "5573999887766" }
    });
    expect(payload).not.toHaveProperty("body");
  });

  it("resposta da atendente leva fromMe e o usuario da conversa", async () => {
    mockedAxios.post.mockResolvedValue({ status: 200 });
    await NotifyOuvidoriaWebhook(
      mensagem(7, {
        fromMe: true,
        ticket: {
          id: 50,
          uuid: "uuid-50",
          status: "open",
          queueId: 4,
          userId: 19
        }
      }),
      env
    );

    const payload = mockedAxios.post.mock.calls[0][1] as any;
    expect(payload.fromMe).toBe(true);
    expect(payload.ticket.userId).toBe(19);
  });

  it("outra conexao do suporte nao avisa nada", async () => {
    expect(await NotifyOuvidoriaWebhook(mensagem(3), env)).toBe(false);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it("sem configuracao fica desligado", async () => {
    expect(await NotifyOuvidoriaWebhook(mensagem(), {})).toBe(false);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it("CRM fora do ar: devolve false e nao lanca", async () => {
    mockedAxios.post.mockRejectedValue(new Error("timeout"));
    await expect(NotifyOuvidoriaWebhook(mensagem(), env)).resolves.toBe(false);
  });
});
