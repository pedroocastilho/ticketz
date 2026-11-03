import {
  sqlSessaoOnline,
  toleranciaOnlineMin
} from "../../helpers/OnlineTolerancia";
import { tempoConectadoPorDia } from "../../services/ReportService/PainelComercial";

// hora local de Brasilia -> Date
const br = (hora: string) => new Date(`2026-11-03T${hora}:00-03:00`);

describe("OnlineTolerancia", () => {
  it("so o comercial tem tolerancia; padrao 10 minutos", () => {
    const env = { PAINEL_COMERCIAL_COMPANIES: "2" };
    expect(toleranciaOnlineMin(2, env)).toBe(10);
    expect(toleranciaOnlineMin(1, env)).toBe(0);
    expect(toleranciaOnlineMin(2, {})).toBe(0);
  });

  it("PAINEL_ONLINE_TOLERANCIA_MIN troca o tempo, 0 desliga, valor ruim volta ao padrao, teto de 120", () => {
    const env = (v: string) => ({
      PAINEL_COMERCIAL_COMPANIES: "2",
      PAINEL_ONLINE_TOLERANCIA_MIN: v
    });
    expect(toleranciaOnlineMin(2, env("5"))).toBe(5);
    expect(toleranciaOnlineMin(2, env("0"))).toBe(0);
    expect(toleranciaOnlineMin(2, env("abc"))).toBe(10);
    expect(toleranciaOnlineMin(2, env("-3"))).toBe(10);
    expect(toleranciaOnlineMin(2, env("999"))).toBe(120);
    expect(toleranciaOnlineMin(2, env(""))).toBe(10);
  });

  it("SQL: sessao ativa ou fechada dentro da tolerancia; sem tolerancia fica como o Ticketz original", () => {
    expect(sqlSessaoOnline("s", 10)).toBe(
      `(s."active" = true OR s."updatedAt" > NOW() - INTERVAL '10 minutes')`
    );
    expect(sqlSessaoOnline(`"UserSocketSessions"`, 0)).toBe(
      `"UserSocketSessions"."active" = true`
    );
    // nada alem de numero entra no SQL
    expect(sqlSessaoOnline("s", 7.9)).toContain("INTERVAL '7 minutes'");
  });

  it("tempo conectado: trocar de pagina no CRM (lacuna curta) nao picota; lacuna longa continua contando so as sessoes", () => {
    // Laura: entra 9h, sai 9h10 (foi para Ligacoes), volta 9h14, sai 10h; volta 11h ate 11h30
    const sessoes = [
      { inicio: br("09:00"), fim: br("09:10") },
      { inicio: br("09:14"), fim: br("10:00") },
      { inicio: br("11:00"), fim: br("11:30") }
    ];
    const de = br("00:00");
    const ate = br("23:59");
    const sem = tempoConectadoPorDia(sessoes, "America/Sao_Paulo", de, ate);
    const com = tempoConectadoPorDia(
      sessoes,
      "America/Sao_Paulo",
      de,
      ate,
      10 * 60000
    );
    expect(sem.somaSeg).toBe((10 + 46 + 30) * 60);
    // 4 minutos fora (menos que 10) contam; a hora de 10h a 11h nao
    expect(com.somaSeg).toBe((60 + 30) * 60);
  });
});
