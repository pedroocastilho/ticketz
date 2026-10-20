/**
 * Aviso de "pediram atendente" no WhatsApp.
 *
 * O `exitChatbot` deixa o ticket pendente na fila e nao notifica ninguem: o som
 * do painel so toca em mensagem recebida e so para quem esta com a plataforma
 * aberta. Num numero atendido por bot, isso era cliente esperando em silencio.
 */
jest.mock("../../src/libs/wbot", () => ({}));
jest.mock("../../src/models/Ticket", () => ({ __esModule: true, default: {} }));
jest.mock("../../src/models/QueueOption", () => ({
  __esModule: true,
  default: { findByPk: jest.fn() }
}));
jest.mock("../../src/models/Whatsapp", () => ({
  __esModule: true,
  default: { findByPk: jest.fn() }
}));
jest.mock("../../src/helpers/CheckSettings", () => ({
  GetCompanySetting: jest.fn()
}));
jest.mock("../../src/services/WbotServices/getJidOf", () => ({
  getJidOf: (numero: string) => `${numero}@s.whatsapp.net`
}));
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn() }
}));

import QueueOption from "../../src/models/QueueOption";
import Whatsapp from "../../src/models/Whatsapp";
import { GetCompanySetting } from "../../src/helpers/CheckSettings";
import NotifyHumanHandoff, {
  parseNotifyNumbers,
  buildOptionPath
} from "../../src/services/WbotServices/NotifyHumanHandoff";

const mockedQueueOption = QueueOption as unknown as { findByPk: jest.Mock };
const mockedWhatsapp = Whatsapp as unknown as { findByPk: jest.Mock };
const mockedSetting = GetCompanySetting as unknown as jest.Mock;

const PROPRIO = "5573991036610";

const wbotFake = () => ({
  myJid: `${PROPRIO}@s.whatsapp.net`,
  sendMessage: jest.fn().mockResolvedValue({})
});

const ticketFake = () =>
  ({
    id: 900,
    uuid: "abc-123",
    companyId: 1,
    whatsappId: 4,
    contact: { name: "Cliente Teste", number: "5542984393938" }
  }) as any;

const opcaoFake = () =>
  ({
    id: 10,
    title: "Não, preciso falar com um atendente.",
    parentId: 7
  }) as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockedWhatsapp.findByPk.mockResolvedValue({ name: "Suporte - Fabi" });
  delete process.env.FRONTEND_URL;
});

describe("parseNotifyNumbers", () => {
  it("troca self pelo numero da propria conexao", () => {
    expect(parseNotifyNumbers("self", PROPRIO)).toEqual([PROPRIO]);
    expect(parseNotifyNumbers("proprio", PROPRIO)).toEqual([PROPRIO]);
  });

  it("aceita lista, limpa pontuacao e nao repete numero", () => {
    expect(
      parseNotifyNumbers("self, +55 (73) 99108074-0, 5573991080740", PROPRIO)
    ).toEqual([PROPRIO, "5573991080740"]);
  });

  it("descarta lixo e devolve vazio quando nao ha configuracao", () => {
    expect(parseNotifyNumbers("", PROPRIO)).toEqual([]);
    expect(parseNotifyNumbers("abc, 123", PROPRIO)).toEqual([]);
    expect(parseNotifyNumbers("self")).toEqual([]);
  });
});

describe("buildOptionPath", () => {
  it("sobe pelos pais e monta o caminho do menu", async () => {
    mockedQueueOption.findByPk
      .mockResolvedValueOnce({ title: "Kiwify", parentId: 3 })
      .mockResolvedValueOnce({ title: "Acesso ao curso", parentId: null });

    await expect(buildOptionPath(opcaoFake())).resolves.toBe(
      "Acesso ao curso > Kiwify > Não, preciso falar com um atendente."
    );
  });
});

describe("NotifyHumanHandoff", () => {
  it("nao manda nada quando a configuracao esta vazia", async () => {
    mockedSetting.mockResolvedValue("");
    const wbot = wbotFake();

    await expect(
      NotifyHumanHandoff({
        wbot: wbot as any,
        ticket: ticketFake(),
        option: opcaoFake()
      })
    ).resolves.toBe(0);

    expect(wbot.sendMessage).not.toHaveBeenCalled();
  });

  it("avisa o proprio numero com a marca de mensagem automatica", async () => {
    mockedSetting.mockResolvedValue("self");
    mockedQueueOption.findByPk.mockResolvedValue({
      title: "Acesso ao curso",
      parentId: null
    });
    process.env.FRONTEND_URL = "https://atendimento.diamondglobal.com.br";
    const wbot = wbotFake();

    await expect(
      NotifyHumanHandoff({
        wbot: wbot as any,
        ticket: ticketFake(),
        option: opcaoFake()
      })
    ).resolves.toBe(1);

    const [jid, conteudo] = wbot.sendMessage.mock.calls[0];
    // jid do proprio Baileys, nao passa pelo getJidOf
    expect(jid).toBe(`${PROPRIO}@s.whatsapp.net`);
    // sem o ‎ o aviso viraria um ticket do numero com ele mesmo
    expect(conteudo.text.startsWith("‎")).toBe(true);
    expect(conteudo.text).toContain("Suporte - Fabi");
    expect(conteudo.text).toContain("Cliente Teste");
    expect(conteudo.text).toContain("5542984393938");
    expect(conteudo.text).toContain(
      "Acesso ao curso > Não, preciso falar com um atendente."
    );
    expect(conteudo.text).toContain(
      "https://atendimento.diamondglobal.com.br/tickets/abc-123"
    );
  });

  it("falha de envio nao derruba o atendimento", async () => {
    mockedSetting.mockResolvedValue("self");
    mockedQueueOption.findByPk.mockResolvedValue(null);
    const wbot = wbotFake();
    wbot.sendMessage.mockRejectedValue(new Error("sem sessao"));

    await expect(
      NotifyHumanHandoff({
        wbot: wbot as any,
        ticket: ticketFake(),
        option: opcaoFake()
      })
    ).resolves.toBe(0);
  });
});
