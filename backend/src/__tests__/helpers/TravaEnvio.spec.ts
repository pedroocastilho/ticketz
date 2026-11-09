import {
  conversaMovidaHaPouco,
  isTravaEnvioEnabled,
  marcarConversaMovida,
  podeEnviarNaConversa
} from "../../helpers/TravaEnvio";

const base = {
  temDono: true,
  conexaoDoDono: 5,
  conexaoDaConversa: 9,
  conexaoDoDonoConectada: true,
  usuarioEhDono: false,
  movidaHaPouco: false
};

describe("isTravaEnvioEnabled", () => {
  it("liga so com TRAVA_DONO_ENVIO", () => {
    expect(isTravaEnvioEnabled({ TRAVA_DONO_ENVIO: "1" })).toBe(true);
    expect(isTravaEnvioEnabled({ TRAVA_DONO_ENVIO: " Sim " })).toBe(true);
    expect(isTravaEnvioEnabled({ TRAVA_DONO_ENVIO: "0" })).toBe(false);
    expect(isTravaEnvioEnabled({})).toBe(false);
  });
});

describe("podeEnviarNaConversa", () => {
  it("trava vendedor que nao e dono, numa conversa fora do numero do dono (caso Jackeline/Alaide)", () => {
    expect(podeEnviarNaConversa(base)).toBe(false);
  });

  it("lead sem dono no lancamento (ou CRM fora): libera", () => {
    expect(podeEnviarNaConversa({ ...base, temDono: false })).toBe(true);
    expect(podeEnviarNaConversa({ ...base, conexaoDoDono: null })).toBe(true);
  });

  it("conversa no numero do dono: quem a gestao pos nela atende (caso Jussara)", () => {
    expect(podeEnviarNaConversa({ ...base, conexaoDaConversa: 5 })).toBe(true);
  });

  it("o dono sempre manda", () => {
    expect(podeEnviarNaConversa({ ...base, usuarioEhDono: true })).toBe(true);
  });

  it("numero do dono desconectado: libera (a conversa nao tem para onde ir)", () => {
    expect(
      podeEnviarNaConversa({ ...base, conexaoDoDonoConectada: false })
    ).toBe(true);
  });

  it("conversa que acabou de mudar de numero: libera enquanto o CRM troca o dono", () => {
    expect(podeEnviarNaConversa({ ...base, movidaHaPouco: true })).toBe(true);
  });
});

describe("conversaMovidaHaPouco", () => {
  it("vale por 10 minutos", () => {
    const t0 = 1_000_000;
    marcarConversaMovida(77, t0);
    expect(conversaMovidaHaPouco(77, t0 + 60_000)).toBe(true);
    expect(conversaMovidaHaPouco(77, t0 + 10 * 60_000)).toBe(true);
    expect(conversaMovidaHaPouco(77, t0 + 10 * 60_000 + 1)).toBe(false);
    expect(conversaMovidaHaPouco(78, t0)).toBe(false);
  });
});
