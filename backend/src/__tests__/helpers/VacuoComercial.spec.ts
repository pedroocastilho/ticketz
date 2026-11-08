import {
  decidirSaidaDaLivres,
  destinoDoVendedor,
  estourouVacuo,
  etiquetaVacuo,
  etiquetasForaDoVacuo,
  isVacuoEnabled,
  limiteVacuoSeg,
  nomeFilaLivres
} from "../../helpers/VacuoComercial";
import { HORARIO_PADRAO } from "../../services/CrmServices/MetricasAtendimentoService";

// hora local de Brasilia -> Date (29/10/2026 = quinta; 01/11 = domingo)
const br = (dia: string, hora: string) =>
  new Date(`2026-${dia}T${hora}:00-03:00`);

describe("conversa no vacuo (5h sem resposta no horario do comercial)", () => {
  it("configuracao por ambiente", () => {
    expect(isVacuoEnabled(2, { VACUO_COMPANIES: "2" })).toBe(true);
    expect(isVacuoEnabled(2, {})).toBe(false);
    expect(limiteVacuoSeg({})).toBe(5 * 3600);
    expect(limiteVacuoSeg({ VACUO_HORAS: "3" })).toBe(3 * 3600);
    // 08/11: 50 minutos; minutos vale antes das horas
    expect(limiteVacuoSeg({ VACUO_MINUTOS: "50" })).toBe(50 * 60);
    expect(limiteVacuoSeg({ VACUO_MINUTOS: "50", VACUO_HORAS: "1" })).toBe(
      3000
    );
    expect(limiteVacuoSeg({ VACUO_MINUTOS: "0", VACUO_HORAS: "1" })).toBe(3600);
    expect(limiteVacuoSeg({ VACUO_MINUTOS: "x", VACUO_HORAS: "1" })).toBe(3600);
    expect(nomeFilaLivres({})).toBe("Livres (sem resposta)");
    expect(etiquetaVacuo({})).toBe("");
    expect(etiquetaVacuo({ VACUO_ETIQUETA: " Black " })).toBe("Black");
  });

  it("conta so 8h-19h seg-sab: 10h -> 15h estoura; 16h -> 10h do dia seguinte (3h + 2h) estoura; 17h -> 9h nao", () => {
    expect(
      estourouVacuo(br("10-29", "10:00"), br("10-29", "15:00"), HORARIO_PADRAO)
    ).toBe(true);
    expect(
      estourouVacuo(br("10-29", "10:00"), br("10-29", "14:59"), HORARIO_PADRAO)
    ).toBe(false);
    expect(
      estourouVacuo(br("10-29", "16:00"), br("10-30", "10:00"), HORARIO_PADRAO)
    ).toBe(true);
    expect(
      estourouVacuo(br("10-29", "17:00"), br("10-30", "09:00"), HORARIO_PADRAO)
    ).toBe(false);
  });

  it("espera que comecou antes de VACUO_DESDE (antes de ligar a regra) nao conta", () => {
    const ligou = br("10-29", "12:00");
    expect(
      estourouVacuo(
        br("10-29", "09:00"),
        br("10-30", "18:00"),
        HORARIO_PADRAO,
        5 * 3600,
        ligou
      )
    ).toBe(false);
    expect(
      estourouVacuo(
        br("10-29", "12:30"),
        br("10-30", "18:00"),
        HORARIO_PADRAO,
        5 * 3600,
        ligou
      )
    ).toBe(true);
  });

  it("domingo nao conta e sem espera nao estoura", () => {
    // sabado 17h -> segunda 10h = 2h (sab) + 2h (seg) = 4h
    expect(
      estourouVacuo(br("10-31", "17:00"), br("11-02", "10:00"), HORARIO_PADRAO)
    ).toBe(false);
    expect(estourouVacuo(null, br("10-29", "18:00"), HORARIO_PADRAO)).toBe(
      false
    );
  });

  it("quem puxou fala pelo numero dele: o conectado primeiro; sem numero = null", () => {
    expect(
      destinoDoVendedor([
        { whatsappId: 9, queueId: 6, status: "DISCONNECTED" },
        { whatsappId: 15, queueId: 12, status: "CONNECTED" }
      ])
    ).toEqual({ whatsappId: 15, queueId: 12, status: "CONNECTED" });
    expect(
      destinoDoVendedor([{ whatsappId: 9, queueId: 6, status: "DISCONNECTED" }])
        .whatsappId
    ).toBe(9);
    expect(destinoDoVendedor([])).toBeNull();
  });

  it("50 minutos: 9h46 sem resposta estoura 10h36, nao 10h35; noite conta do inicio do expediente", () => {
    const h = HORARIO_PADRAO;
    expect(
      estourouVacuo(br("10-29", "09:46"), br("10-29", "10:36"), h, 3000)
    ).toBe(true);
    expect(
      estourouVacuo(br("10-29", "09:46"), br("10-29", "10:35"), h, 3000)
    ).toBe(false);
    // mensagem as 22h (fora do horario 8h-19h): conta a partir das 8h do outro dia
    expect(
      estourouVacuo(br("10-29", "22:00"), br("10-30", "08:49"), h, 3000)
    ).toBe(false);
    expect(
      estourouVacuo(br("10-29", "22:00"), br("10-30", "08:50"), h, 3000)
    ).toBe(true);
  });

  it("fila Livres: respondida depois da ultima do cliente sai; resposta antes ou sem cliente fica", () => {
    const base = {
      ultimaDoCliente: br("11-02", "09:46"),
      ultimaResposta: br("11-02", "10:40"),
      outraAbertaNoNumero: false,
      donoDoNumero: 20,
      filaDoNumero: 9
    };
    expect(decidirSaidaDaLivres(base)).toEqual({
      acao: "devolver",
      userId: 20,
      queueId: 9
    });
    expect(
      decidirSaidaDaLivres({ ...base, outraAbertaNoNumero: true })
    ).toEqual({ acao: "fechar" });
    expect(
      decidirSaidaDaLivres({ ...base, ultimaResposta: br("11-02", "09:40") })
        .acao
    ).toBe("nada");
    expect(decidirSaidaDaLivres({ ...base, ultimaResposta: null }).acao).toBe(
      "nada"
    );
    expect(decidirSaidaDaLivres({ ...base, ultimaDoCliente: null }).acao).toBe(
      "nada"
    );
    // o cliente escreveu de novo depois da resposta: continua esperando, fica na Livres
    expect(
      decidirSaidaDaLivres({ ...base, ultimaDoCliente: br("11-02", "10:41") })
        .acao
    ).toBe("nada");
    expect(decidirSaidaDaLivres({ ...base, donoDoNumero: null })).toEqual({
      acao: "nada",
      motivo: "numero sem dono unico"
    });
    expect(decidirSaidaDaLivres({ ...base, filaDoNumero: null }).acao).toBe(
      "nada"
    );
  });

  it("quem ja comprou (etiqueta Vendido / Comprou na live) nao fica na fila Livres", () => {
    expect(etiquetasForaDoVacuo({})).toEqual([]);
    expect(
      etiquetasForaDoVacuo({
        VACUO_ETIQUETA_FORA: " Vendido , Comprou na live,,"
      })
    ).toEqual(["Vendido", "Comprou na live"]);
    const base = {
      ultimaDoCliente: br("11-02", "10:00"),
      ultimaResposta: br("11-02", "09:00"),
      outraAbertaNoNumero: false,
      donoDoNumero: 20,
      filaDoNumero: 9
    };
    // sem resposta, mas ja comprou: volta para o dono
    expect(decidirSaidaDaLivres({ ...base, jaComprou: true })).toEqual({
      acao: "devolver",
      userId: 20,
      queueId: 9
    });
    expect(decidirSaidaDaLivres({ ...base, jaComprou: false }).acao).toBe(
      "nada"
    );
    expect(
      decidirSaidaDaLivres({
        ...base,
        jaComprou: true,
        outraAbertaNoNumero: true
      })
    ).toEqual({ acao: "fechar" });
  });
});
