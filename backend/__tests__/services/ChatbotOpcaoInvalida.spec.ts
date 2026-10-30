/**
 * Aviso de opcao invalida no menu do chatbot (pedido da Brenda, 30/10/2026).
 *
 * Antes, quem digitava algo que nao era um dos numeros so recebia o menu de
 * novo, sem explicacao, e muita gente ficava repetindo a pergunta. Agora, com a
 * configuracao chatbotInvalidOptionMessage preenchida, o aluno recebe o aviso
 * com os numeros logo embaixo, sem repetir o boas-vindas nem as instrucoes.
 *
 * Exercita o handleChartbot de verdade; so o que fala com banco, socket e
 * WhatsApp e simulado.
 */
jest.mock("@sentry/node", () => ({ captureException: jest.fn() }));
jest.mock("../../src/database", () => ({ __esModule: true, default: {} }));
jest.mock("../../src/libs/wbot", () => ({}));
jest.mock("../../src/libs/socket", () => {
  const sala: any = { emit: jest.fn() };
  sala.to = () => sala;
  return { getIO: () => sala };
});
jest.mock("../../src/queues/campaign", () => ({ campaignQueue: {} }));
// a fila do Bull da resposta automatica abre conexao com o Redis so de ser
// importada, e o jest nunca terminaria
jest.mock("../../src/services/AutoReplyServices/ScheduleAutoReply", () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock("../../src/helpers/transcriber", () => ({ transcriber: jest.fn() }));
jest.mock("../../src/helpers/CheckCompanyCompliant", () => ({
  checkCompanyCompliant: jest.fn(async () => true)
}));
jest.mock("../../src/helpers/CheckSettings", () => ({
  GetCompanySetting: jest.fn()
}));
jest.mock("../../src/services/TranslationServices/i18nService", () => ({
  _t: (texto: string) => texto
}));
jest.mock("../../src/services/WbotServices/getJidOf", () => ({
  getJidOf: () => "5511999990000@s.whatsapp.net"
}));
jest.mock("../../src/services/MessageServices/CreateMessageService", () => ({
  __esModule: true,
  default: jest.fn(async () => ({}))
}));
jest.mock("../../src/services/TicketServices/UpdateTicketService", () => ({
  __esModule: true,
  default: jest.fn(async () => ({}))
}));
jest.mock("../../src/models/Message", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(async () => null),
    findAll: jest.fn(async () => [])
  }
}));
// o sendMenu decide entre fila e opcao com instanceof, entao os dois mocks
// precisam ser classes de verdade
jest.mock("../../src/models/Queue", () => {
  class Queue {
    static findByPk = jest.fn();

    constructor(dados: object) {
      Object.assign(this, dados);
    }
  }
  return { __esModule: true, default: Queue };
});
jest.mock("../../src/models/QueueOption", () => {
  class QueueOption {
    static findByPk = jest.fn();

    static findOne = jest.fn();

    static count = jest.fn();

    constructor(dados: object) {
      Object.assign(this, dados);
    }
  }
  return { __esModule: true, default: QueueOption };
});

import Queue from "../../src/models/Queue";
import QueueOption from "../../src/models/QueueOption";
import { GetCompanySetting } from "../../src/helpers/CheckSettings";
import { handleChartbot } from "../../src/services/WbotServices/wbotMessageListener";

const FilaMock = Queue as any;
const OpcaoMock = QueueOption as any;
const configuracao = GetCompanySetting as unknown as jest.Mock;

const AVISO =
  "Opção não encontrada.\nDigite apenas o *número* do serviço que você deseja:";
const SAUDACAO = "Olá! 👋 Seja bem-vindo(a) ao Suporte Diamond! 💎";

// menu principal da fila 2, resumido
const raizes = () => [
  new OpcaoMock({ id: 11, option: "1", title: "Acesso ao curso" }),
  new OpcaoMock({ id: 12, option: "2", title: "Acesso à DIA" })
];

// opcao "Kiwify": instrucoes longas e o sim/nao embaixo
const kiwify = () =>
  new OpcaoMock({
    id: 21,
    option: "1",
    title: "Kiwify",
    parentId: 11,
    message: "Siga as instruções abaixo para acessar o curso...",
    mediaPath: null,
    exitChatbot: false,
    closeTicket: false,
    forwardQueueId: null,
    options: [
      new OpcaoMock({ option: "1", title: "Sim, minha dúvida foi resolvida!" }),
      new OpcaoMock({
        option: "2",
        title: "Não, preciso falar com um atendente."
      })
    ]
  });

const acessoAoCurso = () =>
  new OpcaoMock({
    id: 11,
    option: "1",
    title: "Acesso ao curso",
    parentId: null,
    message: "Em qual plataforma você adquiriu o curso?",
    mediaPath: null,
    exitChatbot: false,
    closeTicket: false,
    forwardQueueId: null,
    options: [new OpcaoMock({ option: "1", title: "Kiwify" })]
  });

const ticketFake = (queueOptionId: number | null) => {
  const ticket: any = {
    id: 900,
    companyId: 1,
    queueId: 2,
    queueOptionId,
    isGroup: false,
    contact: { id: 57, name: "Aluno", number: "5511999990000" },
    update: jest.fn(async (dados: object) => Object.assign(ticket, dados)),
    reload: jest.fn(async () => ticket)
  };
  return ticket;
};

const wbotFake = () => {
  const wbot: any = {
    sendMessage: jest.fn(async (_jid: string, conteudo: { text: string }) => ({
      key: { id: `msg-${wbot.sendMessage.mock.calls.length}`, fromMe: true },
      message: { conversation: conteudo.text }
    }))
  };
  return wbot;
};

const recebida = (texto: string) =>
  ({ key: { fromMe: false }, message: { conversation: texto } }) as any;

// o sendMenu dispara o envio sem await; espera a fila de promessas esvaziar
const esperarEnvios = async () => {
  for (let i = 0; i < 10; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise(resolve => setImmediate(resolve));
  }
};

const textosEnviados = (wbot: any): string[] =>
  wbot.sendMessage.mock.calls.map((chamada: any[]) => chamada[1].text);

const configurar = (aviso: string) => {
  configuracao.mockImplementation(async (_empresa: number, chave: string) =>
    chave === "chatbotInvalidOptionMessage" ? aviso : "disabled"
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  FilaMock.findByPk.mockResolvedValue(
    new FilaMock({ id: 2, greetingMessage: SAUDACAO, options: raizes() })
  );
});

describe("aviso de opcao invalida no menu principal", () => {
  it("manda o aviso com os numeros embaixo, sem repetir o boas-vindas", async () => {
    configurar(AVISO);
    const wbot = wbotFake();

    await handleChartbot(ticketFake(null), recebida("quero ajuda"), wbot);
    await esperarEnvios();

    const enviados = textosEnviados(wbot);
    expect(enviados).toHaveLength(1);
    expect(enviados[0].startsWith("Opção não encontrada.")).toBe(true);
    expect(enviados[0]).toContain("*[ 1 ]* - Acesso ao curso");
    expect(enviados[0]).toContain("*[ 2 ]* - Acesso à DIA");
    expect(enviados[0]).not.toContain("Seja bem-vindo");
    // no proprio menu principal, "voltar ao menu principal" nao faz sentido
    expect(enviados[0]).not.toContain("Back to Main Menu");
  });

  it("sem a configuracao, reenvia o menu com a saudacao, como antes", async () => {
    configurar("");
    const wbot = wbotFake();

    await handleChartbot(ticketFake(null), recebida("quero ajuda"), wbot);
    await esperarEnvios();

    const enviados = textosEnviados(wbot);
    expect(enviados).toHaveLength(1);
    expect(enviados[0].startsWith(SAUDACAO)).toBe(true);
    expect(enviados[0]).not.toContain("Opção não encontrada");
  });

  it("numero certo nao leva aviso e abre o submenu", async () => {
    configurar(AVISO);
    OpcaoMock.findByPk.mockResolvedValue(acessoAoCurso());
    const wbot = wbotFake();

    await handleChartbot(ticketFake(null), recebida("1"), wbot);
    await esperarEnvios();

    const enviados = textosEnviados(wbot);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toContain("Em qual plataforma");
    expect(enviados[0]).not.toContain("Opção não encontrada");
  });

  it("numero com espaco sobrando ainda vale como a opcao", async () => {
    configurar(AVISO);
    OpcaoMock.findByPk.mockResolvedValue(acessoAoCurso());
    const ticket = ticketFake(null);
    const wbot = wbotFake();

    await handleChartbot(ticket, recebida(" 1 "), wbot);
    await esperarEnvios();

    expect(ticket.update).toHaveBeenCalledWith({ queueOptionId: 11 });
    expect(textosEnviados(wbot)[0]).not.toContain("Opção não encontrada");
  });

  it("primeira mensagem da conversa nunca leva aviso", async () => {
    configurar(AVISO);
    const wbot = wbotFake();

    // dontReadTheFirstQuestion: a saudacao com o menu acabou de sair pelo
    // startQueue, o "bom dia" do aluno nao e uma tentativa de opcao
    await handleChartbot(ticketFake(null), recebida("bom dia"), wbot, true);
    await esperarEnvios();

    expect(textosEnviados(wbot)).toHaveLength(0);
  });
});

describe("aviso de opcao invalida dentro de um submenu", () => {
  it("troca as instrucoes longas pelo aviso e mostra so o sim/nao", async () => {
    configurar(AVISO);
    OpcaoMock.count.mockResolvedValue(2);
    OpcaoMock.findOne.mockResolvedValue(null);
    OpcaoMock.findByPk.mockResolvedValue(kiwify());
    const wbot = wbotFake();

    await handleChartbot(ticketFake(21), recebida("obrigado"), wbot);
    await esperarEnvios();

    const enviados = textosEnviados(wbot);
    expect(enviados).toHaveLength(1);
    expect(enviados[0].startsWith("Opção não encontrada.")).toBe(true);
    expect(enviados[0]).toContain("*[ 1 ]* - Sim, minha dúvida foi resolvida!");
    expect(enviados[0]).toContain(
      "*[ 2 ]* - Não, preciso falar com um atendente."
    );
    expect(enviados[0]).not.toContain("Siga as instruções");
    // no submenu o "voltar" continua: e o caminho para recomecar
    expect(enviados[0]).toContain("Back to Main Menu");
  });
});
