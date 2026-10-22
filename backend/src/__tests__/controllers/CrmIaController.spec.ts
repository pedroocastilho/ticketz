import { Request, Response } from "express";
import { gravarIaContato } from "../../controllers/CrmIaController";
import GravarNotaIaService from "../../services/CrmServices/GravarNotaIaService";
import {
  CAMPOS_IA,
  camposNotaIa
} from "../../services/CrmServices/notaIaContato";

// o service fala com o banco: aqui a protecao, a validacao e os campos montados
jest.mock("../../services/CrmServices/GravarNotaIaService", () => ({
  __esModule: true,
  default: jest.fn()
}));
const gravar = GravarNotaIaService as jest.Mock;

const TOKEN = "token-secreto";
const fakeReq = (body: unknown, token: string | undefined): Request =>
  ({
    body,
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
    json(b: unknown) {
      r.body = b;
      return r;
    }
  };
  return r;
};
const chamar = async (body: unknown, token: string = TOKEN) => {
  const r = fakeRes();
  await gravarIaContato(fakeReq(body, token), r as unknown as Response);
  return r;
};

const envOriginal = { ...process.env };
beforeEach(() => {
  process.env.CRM_WEBHOOK_URL = "https://n8n.exemplo.com/webhook/x";
  process.env.CRM_WEBHOOK_TOKEN = TOKEN;
  process.env.CRM_WEBHOOK_COMPANIES = "2";
  gravar.mockReset();
  gravar.mockResolvedValue(true);
});
afterAll(() => {
  process.env = envOriginal;
});

const valido = {
  companyId: 2,
  contactId: 10,
  nota: 78,
  temperatura: "quente",
  proximoPasso: "Mandar o Pix  hoje",
  resumo: "Quer entrar.",
  analisadoEm: "2026-10-22T18:30:00Z"
};

describe("camposNotaIa", () => {
  it("monta os cinco campos com temperatura e data em portugues", () => {
    expect(camposNotaIa(valido)).toEqual([
      { name: CAMPOS_IA.nota, value: "78" },
      { name: CAMPOS_IA.temperatura, value: "Quente" },
      { name: CAMPOS_IA.proximoPasso, value: "Mandar o Pix hoje" },
      { name: CAMPOS_IA.resumo, value: "Quer entrar." },
      { name: CAMPOS_IA.analisadoEm, value: "22/10, 15:30" }
    ]);
  });

  it("recusa nota fora de 0 a 100 e temperatura desconhecida", () => {
    expect(camposNotaIa({ ...valido, nota: 101 })).toBeNull();
    expect(camposNotaIa({ ...valido, nota: 7.5 })).toBeNull();
    expect(camposNotaIa({ ...valido, temperatura: "morna" })).toBeNull();
  });
});

describe("POST /crm/ia-contato", () => {
  it("sem token, token errado ou empresa fora da lista: 403", async () => {
    expect((await chamar(valido, "")).statusCode).toBe(403);
    expect((await chamar(valido, "outro")).statusCode).toBe(403);
    expect((await chamar({ ...valido, companyId: 1 })).statusCode).toBe(403);
    expect(gravar).not.toHaveBeenCalled();
  });

  it("dados ruins: 400; contato de outra empresa: 404; certo: grava", async () => {
    expect((await chamar({ ...valido, contactId: "x" })).statusCode).toBe(400);
    expect((await chamar({ ...valido, nota: -1 })).statusCode).toBe(400);
    gravar.mockResolvedValueOnce(false);
    expect((await chamar(valido)).statusCode).toBe(404);
    const r = await chamar(valido);
    expect(r.statusCode).toBe(200);
    expect(gravar).toHaveBeenLastCalledWith(
      expect.objectContaining({ companyId: 2, contactId: 10 })
    );
  });
});
