import { avisarDonoNaTransferencia } from "../../helpers/DonoNaTransferencia";

const base = {
  feitaPorPessoa: true,
  puxouDaFilaLivre: false,
  isGroup: false,
  conexaoAntes: 19,
  conexaoDepois: 21,
  filaDepois: "Mariana",
  nomeLivres: "Livres (sem resposta)"
};

describe("transferencia para o numero de outro vendedor avisa o dono ao CRM", () => {
  it("gestao transfere da Andreia para a Mariana (fila e numero): avisa", () => {
    expect(avisarDonoNaTransferencia(base)).toBe(true);
  });

  it("automacao (conversa-para-dono) nao avisa: nao foi uma pessoa", () => {
    expect(avisarDonoNaTransferencia({ ...base, feitaPorPessoa: false })).toBe(false);
  });

  it("puxar da fila Livres ja avisa pelo proprio caminho", () => {
    expect(avisarDonoNaTransferencia({ ...base, puxouDaFilaLivre: true })).toBe(false);
  });

  it("so trocou a fila, numero igual: nao avisa", () => {
    expect(avisarDonoNaTransferencia({ ...base, conexaoDepois: 19 })).toBe(false);
    expect(avisarDonoNaTransferencia({ ...base, conexaoDepois: undefined })).toBe(false);
  });

  it("mandou para a fila Livres: ninguem e dono ainda", () => {
    expect(
      avisarDonoNaTransferencia({ ...base, filaDepois: "Livres (sem resposta)" })
    ).toBe(false);
  });

  it("grupo nunca", () => {
    expect(avisarDonoNaTransferencia({ ...base, isGroup: true })).toBe(false);
  });
});
