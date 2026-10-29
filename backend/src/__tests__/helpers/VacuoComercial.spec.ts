import {
  destinoDoVendedor,
  estourouVacuo,
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
    expect(nomeFilaLivres({})).toBe("Livres (sem resposta)");
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
});
