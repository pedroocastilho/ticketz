import {
  gestoresDoPainel,
  isPainelComercial,
  somarTempos,
  tempoConectadoPorDia
} from "../../services/ReportService/PainelComercial";
import { MetricaDia } from "../../services/CrmServices/calcularMetricasAtendimento";

// hora local de Brasilia -> Date
const br = (dia: string, hora: string) =>
  new Date(`2026-10-${dia}T${hora}:00-03:00`);

const dia = (conexaoId: number, x: Partial<MetricaDia>): MetricaDia =>
  ({
    data: "2026-10-27",
    conexaoId,
    respostaQtd: 0,
    respostaSomaSeg: 0,
    atendimentoQtd: 0,
    atendimentoSomaSeg: 0,
    ...x
  }) as MetricaDia;

describe("PainelComercial", () => {
  it("liga so nas empresas de PAINEL_COMERCIAL_COMPANIES e le os gestores", () => {
    const env = { PAINEL_COMERCIAL_COMPANIES: "2, 5", PAINEL_GESTORES: "10" };
    expect(isPainelComercial(2, env)).toBe(true);
    expect(isPainelComercial(1, env)).toBe(false);
    expect(isPainelComercial(2, {})).toBe(false);
    expect(gestoresDoPainel(env)).toEqual([10]);
    expect(gestoresDoPainel({})).toEqual([]);
  });

  it("soma os tempos ponderados so das conexoes do vendedor", () => {
    const dias = [
      dia(9, {
        respostaQtd: 2,
        respostaSomaSeg: 600,
        atendimentoQtd: 1,
        atendimentoSomaSeg: 1800
      }),
      dia(9, {
        data: "2026-10-28",
        respostaQtd: 2,
        respostaSomaSeg: 200,
        atendimentoQtd: 3,
        atendimentoSomaSeg: 600
      }),
      dia(10, { respostaQtd: 10, respostaSomaSeg: 99999 })
    ];
    expect(somarTempos(dias, [9])).toEqual({
      esperaSeg: 200,
      atendimentoSeg: 600
    });
    expect(somarTempos(dias, [12])).toEqual({
      esperaSeg: null,
      atendimentoSeg: null
    });
  });

  it("tempo conectado: abas ao mesmo tempo contam uma vez e a media e por dia com conexao", () => {
    const t = tempoConectadoPorDia(
      [
        // dia 26: 8h-12h e 10h-13h (sobrepostas) -> 5h; 14h-18h -> 4h: 9h
        { inicio: br("26", "08:00"), fim: br("26", "12:00") },
        { inicio: br("26", "10:00"), fim: br("26", "13:00") },
        { inicio: br("26", "14:00"), fim: br("26", "18:00") },
        // dia 27: 9h-12h -> 3h
        { inicio: br("27", "09:00"), fim: br("27", "12:00") }
      ],
      "America/Sao_Paulo",
      br("26", "00:00"),
      br("28", "00:00")
    );
    expect(t.dias).toBe(2);
    expect(t.somaSeg).toBe(12 * 3600);
    expect(t.mediaSeg).toBe(6 * 3600);
  });

  it("sessao que passa da meia-noite divide nos dois dias; esquecida aberta conta no maximo 16h", () => {
    const virada = tempoConectadoPorDia(
      [{ inicio: br("26", "22:00"), fim: br("27", "02:00") }],
      "America/Sao_Paulo",
      br("26", "00:00"),
      br("28", "00:00")
    );
    expect(virada.dias).toBe(2);
    expect(virada.mediaSeg).toBe(2 * 3600);
    const esquecida = tempoConectadoPorDia(
      [{ inicio: br("26", "08:00"), fim: br("29", "08:00") }],
      "America/Sao_Paulo",
      br("26", "00:00"),
      br("30", "00:00")
    );
    expect(esquecida.somaSeg).toBe(16 * 3600);
  });

  it("corta as sessoes no periodo pedido", () => {
    const t = tempoConectadoPorDia(
      [{ inicio: br("25", "20:00"), fim: br("26", "10:00") }],
      "America/Sao_Paulo",
      br("26", "00:00"),
      br("27", "00:00")
    );
    expect(t.dias).toBe(1);
    expect(t.somaSeg).toBe(10 * 3600);
  });
});
