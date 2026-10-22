import {
  conexaoPropriaCompanies,
  isConexaoPropriaEnabled,
  isRotaSessaoConexaoPropria,
  podeGerenciarConexao,
  podeVerTodasConexoes
} from "../../helpers/ConexaoPropria";

const env = { CONEXAO_PROPRIA_COMPANIES: "2" };
const vendedora = { profile: "user", companyId: 2 };
const conexaoDela = { companyId: 2, queueIds: [6] };
const conexaoDoColega = { companyId: 2, queueIds: [7] };

describe("conexaoPropriaCompanies", () => {
  it("le a lista e ignora lixo", () => {
    expect(conexaoPropriaCompanies({ CONEXAO_PROPRIA_COMPANIES: "2, x,5" })).toEqual([2, 5]);
    expect(conexaoPropriaCompanies({})).toEqual([]);
  });

  it("empresa fora da lista fica desligada", () => {
    expect(isConexaoPropriaEnabled(2, env)).toBe(true);
    expect(isConexaoPropriaEnabled(1, env)).toBe(false);
    expect(isConexaoPropriaEnabled(2, {})).toBe(false);
  });
});

describe("podeVerTodasConexoes", () => {
  it("so admin e supervisor de empresa ligada", () => {
    expect(podeVerTodasConexoes({ profile: "supervisor", companyId: 2 }, env)).toBe(true);
    expect(podeVerTodasConexoes({ profile: "admin", companyId: 2 }, env)).toBe(true);
    expect(podeVerTodasConexoes(vendedora, env)).toBe(false);
    expect(podeVerTodasConexoes({ profile: "supervisor", companyId: 1 }, env)).toBe(false);
  });
});

describe("podeGerenciarConexao", () => {
  it("vendedor so mexe na conexao com fila dele", () => {
    expect(podeGerenciarConexao(vendedora, conexaoDela, [6], env)).toBe(true);
    expect(podeGerenciarConexao(vendedora, conexaoDoColega, [6], env)).toBe(false);
    expect(podeGerenciarConexao(vendedora, { companyId: 2, queueIds: [6, 7] }, [6], env)).toBe(true);
  });

  it("vendedor sem fila ou conexao sem fila: ninguem", () => {
    expect(podeGerenciarConexao(vendedora, conexaoDela, [], env)).toBe(false);
    expect(podeGerenciarConexao(vendedora, { companyId: 2, queueIds: [] }, [6], env)).toBe(false);
  });

  it("outra empresa nunca, nem para admin", () => {
    expect(podeGerenciarConexao({ profile: "admin", companyId: 2 }, { companyId: 1, queueIds: [6] }, [6], env)).toBe(false);
    expect(podeGerenciarConexao(vendedora, { companyId: 1, queueIds: [6] }, [6], env)).toBe(false);
  });

  it("empresa desligada: ninguem por aqui (admin usa a tela Conexoes)", () => {
    expect(podeGerenciarConexao(vendedora, conexaoDela, [6], {})).toBe(false);
    expect(podeGerenciarConexao({ profile: "admin", companyId: 2 }, conexaoDela, [], {})).toBe(false);
  });

  it("gestor e admin mexem em qualquer conexao da empresa", () => {
    expect(podeGerenciarConexao({ profile: "supervisor", companyId: 2 }, conexaoDoColega, [], env)).toBe(true);
    expect(podeGerenciarConexao({ profile: "admin", companyId: 2 }, conexaoDoColega, [], env)).toBe(true);
  });

  it("perfil desconhecido nao passa", () => {
    expect(podeGerenciarConexao({ profile: "", companyId: 2 }, conexaoDela, [6], env)).toBe(false);
  });
});

describe("isRotaSessaoConexaoPropria", () => {
  it("so as tres acoes de sessao", () => {
    expect(isRotaSessaoConexaoPropria("POST", "/minhas-conexoes/9/sessao")).toBe(true);
    expect(isRotaSessaoConexaoPropria("PUT", "/minhas-conexoes/9/sessao")).toBe(true);
    expect(isRotaSessaoConexaoPropria("DELETE", "/backend/minhas-conexoes/9/sessao/")).toBe(true);
    expect(isRotaSessaoConexaoPropria("POST", "/minhas-conexoes/9/sessao?x=1")).toBe(true);
  });

  it("qualquer outra coisa nao", () => {
    expect(isRotaSessaoConexaoPropria("PATCH", "/minhas-conexoes/9/sessao")).toBe(false);
    expect(isRotaSessaoConexaoPropria("POST", "/minhas-conexoes/9")).toBe(false);
    expect(isRotaSessaoConexaoPropria("POST", "/minhas-conexoes/abc/sessao")).toBe(false);
    expect(isRotaSessaoConexaoPropria("DELETE", "/whatsappsession/9")).toBe(false);
    expect(isRotaSessaoConexaoPropria("PUT", "/whatsapp/9")).toBe(false);
    expect(isRotaSessaoConexaoPropria("POST", "/minhas-conexoes/9/sessao/extra")).toBe(false);
  });
});
