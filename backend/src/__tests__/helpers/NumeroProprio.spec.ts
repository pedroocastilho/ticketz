import {
  donoDoNumeroParaUsuario,
  isNumeroProprioEnabled,
  mensagemNumeroDeOutro,
  numeroDeDestino
} from "../../helpers/NumeroProprio";

const LIVRES = "Livres (sem resposta)";

describe("isNumeroProprioEnabled", () => {
  it("liga com SO_NUMERO_PROPRIO so na empresa com conexao propria", () => {
    const env = { SO_NUMERO_PROPRIO: "1", CONEXAO_PROPRIA_COMPANIES: "2" };
    expect(isNumeroProprioEnabled(2, env)).toBe(true);
    expect(isNumeroProprioEnabled(1, env)).toBe(false);
    expect(isNumeroProprioEnabled(2, { ...env, SO_NUMERO_PROPRIO: "0" })).toBe(
      false
    );
    expect(isNumeroProprioEnabled(2, { CONEXAO_PROPRIA_COMPANIES: "2" })).toBe(
      false
    );
  });
});

describe("donoDoNumeroParaUsuario", () => {
  const numeroMariana = [{ id: 30, name: "Mariana" }];

  it("Laura numa conversa do numero da Mariana: trava (caso Sandra #2993)", () => {
    expect(
      donoDoNumeroParaUsuario({
        filasDoNumero: numeroMariana,
        filasDoUsuario: [1, 20],
        nomeLivres: LIVRES
      })
    ).toBe("Mariana");
  });

  it("o proprio numero: libera", () => {
    expect(
      donoDoNumeroParaUsuario({
        filasDoNumero: numeroMariana,
        filasDoUsuario: [1, 30],
        nomeLivres: LIVRES
      })
    ).toBeNull();
  });

  it("estar na fila Livres nao faz do numero dela o seu", () => {
    expect(
      donoDoNumeroParaUsuario({
        filasDoNumero: [
          { id: 1, name: LIVRES },
          { id: 30, name: "Mariana" }
        ],
        filasDoUsuario: [1, 20],
        nomeLivres: LIVRES
      })
    ).toBe("Mariana");
  });

  it("numero sem fila de vendedor (so Livres ou nenhuma): libera", () => {
    expect(
      donoDoNumeroParaUsuario({
        filasDoNumero: [{ id: 1, name: LIVRES }],
        filasDoUsuario: [20],
        nomeLivres: LIVRES
      })
    ).toBeNull();
    expect(
      donoDoNumeroParaUsuario({
        filasDoNumero: [],
        filasDoUsuario: [20],
        nomeLivres: LIVRES
      })
    ).toBeNull();
  });

  it("mensagem diz de quem e o numero", () => {
    expect(mensagemNumeroDeOutro("Mariana")).toContain("número de Mariana");
  });
});

describe("numeroDeDestino", () => {
  const ligacoes = [
    { whatsappId: 21, queueId: 30, status: "CONNECTED" }, // Mariana
    { whatsappId: 9, queueId: 8, status: "CONNECTED" }, // Isabela
    { whatsappId: 20, queueId: 22, status: "DISCONNECTED" } // Julia
  ];

  it("transferir para a fila da Isabela leva a conversa para o numero dela (caso Giovana #2715)", () => {
    expect(numeroDeDestino({ ligacoes, filasAlvo: [8], numeroAtual: 21 })).toBe(
      9
    );
  });

  it("ja esta no numero da fila: fica", () => {
    expect(
      numeroDeDestino({ ligacoes, filasAlvo: [8], numeroAtual: 9 })
    ).toBeNull();
  });

  it("numero da fila desconectado: fica onde esta", () => {
    expect(
      numeroDeDestino({ ligacoes, filasAlvo: [22], numeroAtual: 21 })
    ).toBeNull();
  });

  it("fila sem numero: fica onde esta", () => {
    expect(
      numeroDeDestino({ ligacoes, filasAlvo: [99], numeroAtual: 21 })
    ).toBeNull();
  });
});
