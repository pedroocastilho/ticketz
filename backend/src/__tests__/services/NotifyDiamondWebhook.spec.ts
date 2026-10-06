import axios from "axios";
import NotifyDiamondWebhook, {
  companyAllowed,
  isDiamondWebhookEnabled
} from "../../services/WebhookServices/NotifyDiamondWebhook";

jest.mock("axios");
jest.mock("../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn() }
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

const env = {
  DIAMOND_WEBHOOK_URL: "https://agentes.exemplo.com/api/webhooks/ticketz",
  DIAMOND_WEBHOOK_TOKEN: "token-secreto"
};

describe("isDiamondWebhookEnabled", () => {
  it("so liga quando URL e token estao preenchidos", () => {
    expect(isDiamondWebhookEnabled(env)).toBe(true);
    expect(isDiamondWebhookEnabled({ ...env, DIAMOND_WEBHOOK_URL: "" })).toBe(
      false
    );
    expect(isDiamondWebhookEnabled({ ...env, DIAMOND_WEBHOOK_TOKEN: "" })).toBe(
      false
    );
    expect(isDiamondWebhookEnabled({})).toBe(false);
  });
});

describe("NotifyDiamondWebhook", () => {
  it("faz o POST com o header e o body combinados", async () => {
    mockedAxios.post.mockResolvedValue({ status: 200 });

    const sent = await NotifyDiamondWebhook(
      { number: "5511999990000", body: "Oi, quero um reembolso" },
      env
    );

    expect(sent).toBe(true);
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      env.DIAMOND_WEBHOOK_URL,
      {
        number: "5511999990000",
        body: "Oi, quero um reembolso",
        fromMe: false
      },
      expect.objectContaining({
        headers: { "x-webhook-token": "token-secreto" },
        timeout: 5000
      })
    );
  });

  it("resposta de atendente vai marcada como fromMe e atendente", async () => {
    mockedAxios.post.mockResolvedValue({ status: 200 });

    const sent = await NotifyDiamondWebhook(
      { number: "5491150073771", body: "Hola, soy Alberto", atendente: true },
      env
    );

    expect(sent).toBe(true);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      env.DIAMOND_WEBHOOK_URL,
      {
        number: "5491150073771",
        body: "Hola, soy Alberto",
        fromMe: true,
        atendente: true
      },
      expect.anything()
    );
  });

  it("nao chama nada quando o webhook esta desligado", async () => {
    const sent = await NotifyDiamondWebhook(
      { number: "5511999990000", body: "oi" },
      {}
    );

    expect(sent).toBe(false);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it("manda body vazio quando a mensagem nao tem texto", async () => {
    mockedAxios.post.mockResolvedValue({ status: 200 });

    await NotifyDiamondWebhook(
      { number: "5511999990000", body: undefined },
      env
    );

    expect(mockedAxios.post.mock.calls[0][1]).toEqual({
      number: "5511999990000",
      body: "",
      fromMe: false
    });
  });

  it("engole a falha da API e devolve false sem lancar", async () => {
    mockedAxios.post.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      NotifyDiamondWebhook({ number: "5511999990000", body: "oi" }, env)
    ).resolves.toBe(false);
  });
});

describe("NotifyDiamondWebhook por empresa", () => {
  beforeEach(() => jest.clearAllMocks());

  it("padrao: so a empresa 1 (suporte) repassa", async () => {
    mockedAxios.post.mockResolvedValue({ status: 200 });
    expect(companyAllowed(1, env)).toBe(true);
    expect(companyAllowed(2, env)).toBe(false);
    const sent = await NotifyDiamondWebhook(
      { number: "5573999990000", body: "oi", companyId: 2 },
      env
    );
    expect(sent).toBe(false);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it("lista explicita em DIAMOND_WEBHOOK_COMPANIES manda", () => {
    expect(
      companyAllowed(3, { ...env, DIAMOND_WEBHOOK_COMPANIES: "1,3" })
    ).toBe(true);
    expect(
      companyAllowed(2, { ...env, DIAMOND_WEBHOOK_COMPANIES: "1,3" })
    ).toBe(false);
  });

  it("chamada sem companyId continua como antes", () => {
    expect(companyAllowed(undefined, env)).toBe(true);
  });
});
