import {
  chaveEtiqueta,
  corDaEtiqueta,
  isEtiquetaEtapaEnabled,
  precisaTrocar,
  umaEtapaSo
} from "../../helpers/EtiquetaEtapa";

// kanban 1 = etiqueta de etapa; 0 = produto/canal
const fu1 = { id: 1, name: "Follow-up 1", kanban: 1 };
const fu2 = { id: 2, name: "Follow-up 2", kanban: 1 };
const conversa = { id: 3, name: "Em conversa", kanban: 1 };
const comunidade = { id: 6, name: "COMUNIDADE", kanban: 0 };

describe("etiquetas de etapa do comercial", () => {
  it("liga so nas empresas de ETIQUETA_ETAPA_COMPANIES", () => {
    expect(isEtiquetaEtapaEnabled(2, { ETIQUETA_ETAPA_COMPANIES: "2" })).toBe(
      true
    );
    expect(isEtiquetaEtapaEnabled(1, { ETIQUETA_ETAPA_COMPANIES: "2" })).toBe(
      false
    );
    expect(isEtiquetaEtapaEnabled(2, {})).toBe(false);
  });

  it("nome sem acento, maiuscula nem hifen e a mesma etiqueta", () => {
    expect(chaveEtiqueta("Follow-up 1")).toBe("FOLLOW UP 1");
    expect(chaveEtiqueta("  NEGOCIAÇÃO ")).toBe("NEGOCIACAO");
    expect(corDaEtiqueta("follow up 7")).toBe("#e53935");
    expect(corDaEtiqueta("qualquer")).toBe("#607d8b");
  });

  it("marcar outra etapa tira a anterior; produto e canal ficam", () => {
    // tinha Follow-up 1 e Comunidade, marcou Follow-up 2
    expect(umaEtapaSo([fu1, comunidade, fu2], [1, 6]).map(t => t.id)).toEqual([
      6, 2
    ]);
    // so uma etapa: nada muda
    expect(umaEtapaSo([fu1, comunidade], [6]).map(t => t.id)).toEqual([1, 6]);
    // marcou duas de uma vez numa conversa sem etapa: fica a ultima
    expect(umaEtapaSo([fu1, conversa], []).map(t => t.id)).toEqual([3]);
  });

  it("CRM so troca quando a conversa nao tem nenhuma das etiquetas da coluna", () => {
    expect(
      precisaTrocar([conversa, comunidade], ["Negociação", "Em conversa"])
    ).toBe(false);
    expect(precisaTrocar([fu1], ["Negociação", "Em conversa"])).toBe(true);
    // produto com o mesmo nome nao conta (kanban desligado)
    expect(
      precisaTrocar([{ id: 9, name: "Vendido", kanban: 0 }], ["Vendido"])
    ).toBe(true);
    expect(precisaTrocar([], ["Em atendimento"])).toBe(true);
  });
});
