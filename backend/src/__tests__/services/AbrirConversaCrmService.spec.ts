import {
  filaPropriaDoVendedor,
  normalizarNumero,
  variantesDoNumero
} from "../../services/CrmServices/AbrirConversaCrmService";

describe("filaPropriaDoVendedor", () => {
  const livres = { id: 9, name: "Livres (sem resposta)" };
  const dela = { id: 4, name: "Jackeline" };

  it("Chamar no WhatsApp nunca cria a conversa na fila Livres", () => {
    expect(filaPropriaDoVendedor([livres, dela])).toBe(4);
    expect(filaPropriaDoVendedor([dela, livres])).toBe(4);
  });

  it("sem outra fila, fica com a unica que tem", () => {
    expect(filaPropriaDoVendedor([livres])).toBe(9);
  });

  it("sem fila nenhuma: null", () => {
    expect(filaPropriaDoVendedor([])).toBeNull();
  });
});

describe("normalizarNumero", () => {
  it("fica so com os digitos (o CRM manda o numero com DDI)", () => {
    expect(normalizarNumero("+55 (11) 94272-8770")).toBe("5511942728770");
    expect(normalizarNumero("+55 73 99917-0694")).toBe("5573999170694");
  });

  it("mantem numero com DDI de fora do BR", () => {
    expect(normalizarNumero("+1 203 895 3755")).toBe("12038953755");
    expect(normalizarNumero("5491123456789")).toBe("5491123456789");
  });
});

describe("variantesDoNumero", () => {
  it("BR com nono digito tambem procura sem ele (JID de DDD acima de 30)", () => {
    expect(variantesDoNumero("5573999170694")).toEqual([
      "5573999170694",
      "557399170694"
    ]);
  });

  it("BR sem nono digito tambem procura com ele", () => {
    expect(variantesDoNumero("557399170694")).toEqual([
      "557399170694",
      "5573999170694"
    ]);
  });

  it("fora do BR fica so o proprio numero", () => {
    expect(variantesDoNumero("12038953755")).toEqual(["12038953755"]);
  });
});
