import {
  normalizeText,
  splitKeywords,
  matchesKeywords
} from "../../services/AutoReplyServices/FindMatchingAutoReplyRule";

describe("normalizeText", () => {
  it("baixa a caixa e remove acentos", () => {
    expect(normalizeText("REEMBÔLSO")).toBe("reembolso");
    expect(normalizeText("Devolução")).toBe("devolucao");
  });

  it("aceita entrada vazia sem quebrar", () => {
    expect(normalizeText(undefined as any)).toBe("");
    expect(normalizeText("")).toBe("");
  });
});

describe("splitKeywords", () => {
  it("separa por virgula, normaliza e descarta vazios", () => {
    expect(splitKeywords(" Reembolso , ESTORNO ,, devolução ")).toEqual([
      "reembolso",
      "estorno",
      "devolucao"
    ]);
  });

  it("devolve lista vazia quando nao ha palavras", () => {
    expect(splitKeywords("")).toEqual([]);
    expect(splitKeywords(" , , ")).toEqual([]);
  });
});

describe("matchesKeywords", () => {
  const keywords = "reembolso, reenbolso, cancelamento, dinheiro de volta";

  it("casa ignorando caixa e acento", () => {
    expect(matchesKeywords(keywords, "Quero um REEMBOLSO agora")).toBe(true);
    expect(matchesKeywords(keywords, "pedido de reembôlso")).toBe(true);
  });

  it("casa variacoes de digitacao cadastradas", () => {
    expect(matchesKeywords(keywords, "como peço reenbolso?")).toBe(true);
  });

  it("casa expressao com mais de uma palavra", () => {
    expect(matchesKeywords(keywords, "quero meu dinheiro de volta")).toBe(true);
  });

  it("nao casa mensagem sem nenhuma das palavras", () => {
    expect(matchesKeywords(keywords, "nao consigo acessar o curso")).toBe(false);
  });

  it("nao casa mensagem vazia", () => {
    expect(matchesKeywords(keywords, "")).toBe(false);
    expect(matchesKeywords(keywords, "   ")).toBe(false);
  });

  it("nao casa quando a regra nao tem palavras cadastradas", () => {
    expect(matchesKeywords("", "quero reembolso")).toBe(false);
  });
});
