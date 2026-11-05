import { isHistoricoContatoEnabled } from "../../helpers/HistoricoContato";

describe("isHistoricoContatoEnabled", () => {
  const env = { HISTORICO_CONTATO_COMPANIES: "2, 5" };

  it("vale so para as empresas da lista", () => {
    expect(isHistoricoContatoEnabled(2, env)).toBe(true);
    expect(isHistoricoContatoEnabled(5, env)).toBe(true);
    expect(isHistoricoContatoEnabled(1, env)).toBe(false);
  });

  it("sem a variavel fica desligado", () => {
    expect(isHistoricoContatoEnabled(2, {})).toBe(false);
  });
});
