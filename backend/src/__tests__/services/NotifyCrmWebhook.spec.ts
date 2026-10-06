import axios from "axios";
import NotifyCrmWebhook, {
  isCrmWebhookEnabledFor
} from "../../services/WebhookServices/NotifyCrmWebhook";

jest.mock("axios");
jest.mock("../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn() }
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

const env = {
  CRM_WEBHOOK_URL: "https://n8n.exemplo.com/webhook/whatsapp-ticketz",
  CRM_WEBHOOK_TOKEN: "token-secreto",
  CRM_WEBHOOK_COMPANIES: "2, 5"
};

const mensagem = (companyId = 2, extra = {}) => ({
  companyId,
  fromMe: false,
  body: "Oi, vi o anuncio",
  justCreated: true,
  ticket: {
    id: 10,
    uuid: "uuid-10",
    status: "pending",
    queueId: 3,
    userId: null
  },
  whatsapp: { id: 7, name: "Comercial - Isabela" },
  contact: { id: 99, name: "Maria", number: "5573999990000" },
  ...extra
});

beforeEach(() => jest.clearAllMocks());

describe("isCrmWebhookEnabledFor", () => {
  it("so liga para as empresas da lista, com URL e token", () => {
    expect(isCrmWebhookEnabledFor(2, env)).toBe(true);
    expect(isCrmWebhookEnabledFor(5, env)).toBe(true);
    expect(isCrmWebhookEnabledFor(1, env)).toBe(false);
    expect(
      isCrmWebhookEnabledFor(2, { ...env, CRM_WEBHOOK_COMPANIES: "" })
    ).toBe(false);
    expect(isCrmWebhookEnabledFor(2, { ...env, CRM_WEBHOOK_URL: "" })).toBe(
      false
    );
    expect(isCrmWebhookEnabledFor(2, { ...env, CRM_WEBHOOK_TOKEN: "" })).toBe(
      false
    );
    expect(isCrmWebhookEnabledFor(2, {})).toBe(false);
  });
});

describe("NotifyCrmWebhook", () => {
  it("manda ticket, conexao e contato com o token no header", async () => {
    mockedAxios.post.mockResolvedValue({ status: 200 });

    const sent = await NotifyCrmWebhook(mensagem(), env);

    expect(sent).toBe(true);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      env.CRM_WEBHOOK_URL,
      {
        evento: "mensagem",
        companyId: 2,
        fromMe: false,
        body: "Oi, vi o anuncio",
        ticket: {
          id: 10,
          uuid: "uuid-10",
          status: "pending",
          queueId: 3,
          userId: null,
          justCreated: true
        },
        whatsapp: { id: 7, name: "Comercial - Isabela" },
        contact: { id: 99, name: "Maria", number: "5573999990000" }
      },
      expect.objectContaining({
        headers: { "x-webhook-token": "token-secreto" },
        timeout: 5000
      })
    );
  });

  it("empresa do suporte (fora da lista) nao manda nada", async () => {
    const sent = await NotifyCrmWebhook(mensagem(1), env);
    expect(sent).toBe(false);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it("falha de rede vira false e nao lanca", async () => {
    mockedAxios.post.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(NotifyCrmWebhook(mensagem(), env)).resolves.toBe(false);
  });
});
