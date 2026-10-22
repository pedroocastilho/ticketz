import { Request, Response } from "express";
import {
  conversaHistorico,
  conversasComAtividade
} from "../../controllers/CrmConversasController";
import {
  ConversaHistoricoService,
  ConversasComAtividadeService
} from "../../services/CrmServices/ConversasCrmService";

// o service fala com o banco: aqui so a protecao e a validacao do controller
jest.mock("../../services/CrmServices/ConversasCrmService", () => ({
  ConversasComAtividadeService: jest.fn(),
  ConversaHistoricoService: jest.fn()
}));

const atividade = ConversasComAtividadeService as jest.Mock;
const historico = ConversaHistoricoService as jest.Mock;

const TOKEN = "token-secreto";

type Query = Record<string, string>;
type Handler = (req: Request, res: Response) => Promise<Response>;

const fakeReq = (query: Query, token: string | undefined): Request =>
  ({
    query,
    header: (nome: string) =>
      nome.toLowerCase() === "x-webhook-token" ? token : undefined
  }) as unknown as Request;

const fakeRes = () => {
  const r = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      r.statusCode = code;
      return r;
    },
    json(body: unknown) {
      r.body = body;
      return r;
    }
  };
  return r;
};

const chamar = async (fn: Handler, query: Query, token: string = TOKEN) => {
  const r = fakeRes();
  await fn(fakeReq(query, token), r as unknown as Response);
  return r;
};

const envOriginal = { ...process.env };

beforeEach(() => {
  process.env.CRM_WEBHOOK_URL = "https://n8n.exemplo.com/webhook/x";
  process.env.CRM_WEBHOOK_TOKEN = TOKEN;
  process.env.CRM_WEBHOOK_COMPANIES = "2";
  atividade.mockResolvedValue({ contatos: [], proximoCursor: null });
  historico.mockResolvedValue({
    contactId: 10,
    nome: "Cliente",
    numero: "5511999999999",
    truncado: false,
    mensagens: []
  });
});

afterAll(() => {
  process.env = envOriginal;
});

const casos: Array<[string, Handler, Query]> = [
  [
    "conversas-com-atividade",
    conversasComAtividade,
    { desde: "2026-10-22T10:00:00Z" }
  ],
  ["conversa-historico", conversaHistorico, { contactId: "10" }]
];

describe.each(casos)("%s: protecao", (_nome, fn, extra) => {
  it("sem token = 403", async () => {
    const r = await chamar(fn, { companyId: "2", ...extra }, "");
    expect(r.statusCode).toBe(403);
    expect(r.body).toEqual({ error: "ERR_FORBIDDEN" });
  });

  it("token errado = 403", async () => {
    const r = await chamar(fn, { companyId: "2", ...extra }, "token-errado!");
    expect(r.statusCode).toBe(403);
  });

  it("empresa fora de CRM_WEBHOOK_COMPANIES = 403 mesmo com token certo", async () => {
    const r = await chamar(fn, { companyId: "1", ...extra });
    expect(r.statusCode).toBe(403);
  });

  it("sem companyId = 403 e nao consulta nada", async () => {
    const r = await chamar(fn, { ...extra });
    expect(r.statusCode).toBe(403);
    expect(atividade).not.toHaveBeenCalled();
    expect(historico).not.toHaveBeenCalled();
  });

  it("com token e empresa certos = 200", async () => {
    const r = await chamar(fn, { companyId: "2", ...extra });
    expect(r.statusCode).toBe(200);
  });
});

describe("conversas-com-atividade", () => {
  it("desde obrigatorio e valido", async () => {
    const invalidos: Query[] = [
      { companyId: "2" },
      { companyId: "2", desde: "ontem" },
      { companyId: "2", desde: "2026-13-40T10:00:00Z" }
    ];
    // eslint-disable-next-line no-restricted-syntax
    for (const query of invalidos) {
      const r = await chamar(conversasComAtividade, query);
      expect(r.statusCode).toBe(400);
      expect(r.body).toEqual({ error: "ERR_INVALID_PARAMS" });
    }
    expect(atividade).not.toHaveBeenCalled();
  });

  it("limite invalido = 400", async () => {
    const r = await chamar(conversasComAtividade, {
      companyId: "2",
      desde: "2026-10-22T10:00:00Z",
      limite: "0"
    });
    expect(r.statusCode).toBe(400);
  });

  it("limite padrao 200 e maximo 500", async () => {
    await chamar(conversasComAtividade, {
      companyId: "2",
      desde: "2026-10-22T10:00:00Z"
    });
    expect(atividade).toHaveBeenLastCalledWith({
      companyId: 2,
      desde: new Date("2026-10-22T10:00:00Z"),
      limite: 200
    });

    const r = await chamar(conversasComAtividade, {
      companyId: "2",
      desde: "2026-10-22T07:00:00-03:00",
      limite: "9000"
    });
    expect(atividade).toHaveBeenLastCalledWith({
      companyId: 2,
      desde: new Date("2026-10-22T10:00:00Z"),
      limite: 500
    });
    expect(r.statusCode).toBe(200);
    expect(r.body).toEqual({ contatos: [], proximoCursor: null });
  });
});

describe("conversa-historico", () => {
  it("contactId obrigatorio e inteiro", async () => {
    const invalidos: Query[] = [
      { companyId: "2" },
      { companyId: "2", contactId: "abc" },
      { companyId: "2", contactId: "0" }
    ];
    // eslint-disable-next-line no-restricted-syntax
    for (const query of invalidos) {
      const r = await chamar(conversaHistorico, query);
      expect(r.statusCode).toBe(400);
      expect(r.body).toEqual({ error: "ERR_INVALID_PARAMS" });
    }
    expect(historico).not.toHaveBeenCalled();
  });

  it("desde opcional, mas se vier tem que ser valido", async () => {
    const r = await chamar(conversaHistorico, {
      companyId: "2",
      contactId: "10",
      desde: "xyz"
    });
    expect(r.statusCode).toBe(400);

    const ok = await chamar(conversaHistorico, {
      companyId: "2",
      contactId: "10"
    });
    expect(ok.statusCode).toBe(200);
    expect(historico).toHaveBeenLastCalledWith({
      companyId: 2,
      contactId: 10,
      desde: null,
      limite: 400
    });
  });

  it("limite maximo 1000", async () => {
    await chamar(conversaHistorico, {
      companyId: "2",
      contactId: "10",
      desde: "2026-10-22T10:00:00Z",
      limite: "5000"
    });
    expect(historico).toHaveBeenLastCalledWith({
      companyId: 2,
      contactId: 10,
      desde: new Date("2026-10-22T10:00:00Z"),
      limite: 1000
    });
  });

  it("contato de outra empresa = 404", async () => {
    historico.mockResolvedValueOnce(null);
    const r = await chamar(conversaHistorico, {
      companyId: "2",
      contactId: "99"
    });
    expect(r.statusCode).toBe(404);
    expect(r.body).toEqual({ error: "ERR_NOT_FOUND" });
  });
});
