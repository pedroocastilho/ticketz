import axios from "axios";
import { decidirConversaParaDono } from "../../services/CrmServices/ConversaParaDonoService";
import {
  consultarDonoDoLead,
  isTravaDonoEnabled,
  mensagemLeadDeOutro
} from "../../services/CrmServices/TravaDonoService";

jest.mock("axios");

const base = {
  ticket: { isGroup: false, status: "pending", whatsappId: 9 },
  conexaoDestino: 10,
  statusDestino: "CONNECTED",
  filaDestino: 7,
  temConversaViva: false
};

describe("decidirConversaParaDono", () => {
  it("sem conversa viva no numero do dono: a conversa muda de numero", () => {
    expect(decidirConversaParaDono(base)).toEqual({ acao: "mover" });
  });

  it("com conversa viva no numero do dono: junta as mensagens nela", () => {
    expect(
      decidirConversaParaDono({ ...base, temConversaViva: true })
    ).toEqual({ acao: "juntar" });
  });

  it("numero do dono desconectado: nao move (a resposta nao sairia)", () => {
    expect(
      decidirConversaParaDono({ ...base, statusDestino: "DISCONNECTED" })
    ).toEqual({ acao: "nada", motivo: "numero do dono desconectado" });
  });

  it("ja no numero do dono, conversa fechada, grupo, sem fila ou sem conversa: nada", () => {
    const nada = (extra: object) =>
      decidirConversaParaDono({ ...base, ...extra }).acao;
    expect(nada({ conexaoDestino: 9 })).toBe("nada");
    expect(nada({ ticket: { ...base.ticket, status: "closed" } })).toBe("nada");
    expect(nada({ ticket: { ...base.ticket, isGroup: true } })).toBe("nada");
    expect(nada({ filaDestino: null })).toBe("nada");
    expect(nada({ ticket: null })).toBe("nada");
    expect(nada({ statusDestino: null })).toBe("nada");
  });
});

describe("trava de lead de outro vendedor", () => {
  const env = {
    CRM_DONO_URL: "https://n8n/webhook/dono-do-lead",
    CRM_WEBHOOK_TOKEN: "tok",
    CRM_WEBHOOK_URL: "https://n8n/webhook/x",
    CRM_WEBHOOK_COMPANIES: "2"
  };
  const get = axios.get as jest.Mock;
  beforeEach(() => get.mockReset());

  it("so liga com a URL e na empresa do CRM", () => {
    expect(isTravaDonoEnabled(2, env)).toBe(true);
    expect(isTravaDonoEnabled(1, env)).toBe(false);
    expect(isTravaDonoEnabled(2, { ...env, CRM_DONO_URL: "" })).toBe(false);
  });

  it("devolve o dono que o CRM informou, com token e tempo limite", async () => {
    get.mockResolvedValue({
      data: { dono: { nome: "Marcos", conexaoTicketz: "10" } }
    });
    await expect(consultarDonoDoLead("5573999887766", env)).resolves.toEqual({
      nome: "Marcos",
      conexaoTicketz: 10
    });
    const opcoes = get.mock.calls[0][1];
    expect(opcoes.headers["x-webhook-token"]).toBe("tok");
    expect(opcoes.params.numero).toBe("5573999887766");
    expect(opcoes.timeout).toBeGreaterThan(0);
  });

  it("sem dono: libera", async () => {
    get.mockResolvedValue({ data: { dono: null } });
    await expect(consultarDonoDoLead("55", env)).resolves.toBeNull();
  });

  it("CRM fora do ar nao para o comercial: libera", async () => {
    get.mockRejectedValue(new Error("timeout"));
    await expect(consultarDonoDoLead("55", env)).resolves.toBeNull();
  });

  it("a mensagem diz de quem e o lead", () => {
    expect(mensagemLeadDeOutro("Marcos")).toContain("Este lead é de Marcos");
  });
});
