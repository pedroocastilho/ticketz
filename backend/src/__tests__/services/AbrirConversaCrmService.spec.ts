import {
  normalizarNumero,
  variantesDoNumero
} from "../../services/CrmServices/AbrirConversaCrmService";

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
