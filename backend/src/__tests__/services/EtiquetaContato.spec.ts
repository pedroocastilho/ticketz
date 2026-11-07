import {
  contatosComEtiqueta,
  contatosSemEtiqueta
} from "../../services/CrmServices/EtiquetaContatoService";
import { variantesDoNumero } from "../../services/CrmServices/AbrirConversaCrmService";

describe("etiqueta no contato (Comprou na live)", () => {
  it("so marca quem ainda nao tem a etiqueta", () => {
    const contatos = [
      { id: 1, tags: [{ id: 50 }] },
      { id: 2, tags: [{ id: 7 }] },
      { id: 3 }
    ];
    expect(contatosSemEtiqueta(contatos, 50)).toEqual([2, 3]);
    expect(contatosSemEtiqueta([{ id: 1, tags: [{ id: 50 }] }], 50)).toEqual(
      []
    );
  });

  it("tirar: so quem tem alguma das etiquetas", () => {
    const contatos = [
      { id: 1, tags: [{ id: 50 }] },
      { id: 2, tags: [{ id: 7 }] },
      { id: 3 },
      { id: 4, tags: [{ id: 51 }, { id: 7 }] }
    ];
    expect(contatosComEtiqueta(contatos, [50, 51])).toEqual([1, 4]);
    expect(contatosComEtiqueta(contatos, [])).toEqual([]);
  });

  it("acha o contato com e sem o 9 (WhatsApp tira o 9 em DDD acima de 30)", () => {
    expect(variantesDoNumero("5573999887766")).toEqual([
      "5573999887766",
      "557399887766"
    ]);
    expect(variantesDoNumero("557399887766")).toEqual([
      "557399887766",
      "5573999887766"
    ]);
  });
});
