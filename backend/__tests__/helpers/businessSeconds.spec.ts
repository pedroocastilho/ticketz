/**
 * Testes do calculo de tempo util (dentro do expediente) usado pelos
 * tempos medios do painel. Datas de referencia: 11/09/2026 e sexta,
 * 12/09 sabado, 13/09 domingo, 14/09 segunda, 15/09 terca.
 */
import { DateTime } from "luxon";
import { OpenHoursData } from "../../src/helpers/checkOpenHours";
import {
  businessSecondsBetween,
  refreshBusinessTimes,
  scheduleForTicket
} from "../../src/helpers/businessSeconds";

const TZ = "America/Sao_Paulo";

// monta uma data no fuso de Sao Paulo
const sp = (iso: string): Date => DateTime.fromISO(iso, { zone: TZ }).toJSDate();

const weekdaysOnly: OpenHoursData = {
  timezone: TZ,
  overrides: [],
  weeklyRules: [
    {
      days: ["mon", "tue", "wed", "thu", "fri"],
      hours: [{ from: "08:00", to: "18:00" }]
    }
  ]
};

// espelho da fila Suporte 2 em producao
const suporte2: OpenHoursData = {
  timezone: TZ,
  overrides: [],
  weeklyRules: [
    {
      days: ["mon", "tue", "wed", "thu", "fri"],
      hours: [{ from: "08:00", to: "18:00" }]
    },
    { days: ["sat"], hours: [{ from: "08:00", to: "15:00" }] },
    { days: ["sun"], hours: [{ from: "08:00", to: "12:00" }] }
  ]
};

describe("businessSecondsBetween", () => {
  it("sem horario conta relogio de parede", () => {
    expect(
      businessSecondsBetween(sp("2026-09-14T20:00"), sp("2026-09-14T22:00"), null)
    ).toBe(7200);
  });

  it("horario no formato antigo (sem timezone) conta relogio de parede", () => {
    const legacy = { weeklyRules: [], overrides: [] } as unknown as OpenHoursData;
    expect(
      businessSecondsBetween(sp("2026-09-14T20:00"), sp("2026-09-14T21:00"), legacy)
    ).toBe(3600);
  });

  it("fim antes do inicio da zero", () => {
    expect(
      businessSecondsBetween(sp("2026-09-14T10:00"), sp("2026-09-14T09:00"), suporte2)
    ).toBe(0);
    expect(
      businessSecondsBetween(sp("2026-09-14T10:00"), sp("2026-09-14T10:00"), suporte2)
    ).toBe(0);
  });

  it("intervalo inteiro dentro de uma faixa", () => {
    expect(
      businessSecondsBetween(sp("2026-09-14T09:00"), sp("2026-09-14T10:30"), suporte2)
    ).toBe(5400);
  });

  it("comeca de madrugada e termina dentro do expediente", () => {
    expect(
      businessSecondsBetween(sp("2026-09-14T03:00"), sp("2026-09-14T09:00"), suporte2)
    ).toBe(3600);
  });

  it("mensagem de madrugada aceita as 8h em ponto conta zero", () => {
    expect(
      businessSecondsBetween(sp("2026-09-14T02:00"), sp("2026-09-14T08:00"), suporte2)
    ).toBe(0);
  });

  it("sexta 17h ate segunda 9h, so dias uteis, conta 2h", () => {
    expect(
      businessSecondsBetween(sp("2026-09-11T17:00"), sp("2026-09-14T09:00"), weekdaysOnly)
    ).toBe(7200);
  });

  it("sexta 17h ate segunda 9h com sabado e domingo abertos conta 13h", () => {
    expect(
      businessSecondsBetween(sp("2026-09-11T17:00"), sp("2026-09-14T09:00"), suporte2)
    ).toBe(13 * 3600);
  });

  it("regra com hours vazio conta zero no dia", () => {
    const satClosed: OpenHoursData = {
      ...weekdaysOnly,
      weeklyRules: [...weekdaysOnly.weeklyRules, { days: ["sat"], hours: [] }]
    };
    expect(
      businessSecondsBetween(sp("2026-09-11T17:00"), sp("2026-09-12T23:00"), satClosed)
    ).toBe(3600);
  });

  it("feriado fechado conta zero naquele dia", () => {
    const holiday: OpenHoursData = {
      ...weekdaysOnly,
      overrides: [{ date: "2026-09-14", closed: true, label: "feriado" }]
    };
    expect(
      businessSecondsBetween(sp("2026-09-11T17:00"), sp("2026-09-15T09:00"), holiday)
    ).toBe(7200);
  });

  it("feriado com horario reduzido usa as faixas do override", () => {
    const halfDay: OpenHoursData = {
      ...weekdaysOnly,
      overrides: [{ date: "2026-09-14", hours: [{ from: "10:00", to: "12:00" }] }]
    };
    expect(
      businessSecondsBetween(sp("2026-09-14T08:00"), sp("2026-09-14T18:00"), halfDay)
    ).toBe(7200);
  });

  it("override anual casa pelo mes e dia", () => {
    const yearly: OpenHoursData = {
      ...weekdaysOnly,
      overrides: [{ date: "2020-09-14", repeat: "yearly", closed: true }]
    };
    expect(
      businessSecondsBetween(sp("2026-09-14T08:00"), sp("2026-09-14T18:00"), yearly)
    ).toBe(0);
  });

  it("duas faixas no mesmo dia (almoco) somam as duas", () => {
    const lunch: OpenHoursData = {
      timezone: TZ,
      overrides: [],
      weeklyRules: [
        {
          days: ["mon"],
          hours: [
            { from: "08:00", to: "12:00" },
            { from: "13:00", to: "18:00" }
          ]
        }
      ]
    };
    expect(
      businessSecondsBetween(sp("2026-09-14T11:00"), sp("2026-09-14T14:00"), lunch)
    ).toBe(7200);
  });

  it("faixa com fim antes do inicio e ignorada", () => {
    const broken: OpenHoursData = {
      timezone: TZ,
      overrides: [],
      weeklyRules: [{ days: ["mon"], hours: [{ from: "18:00", to: "08:00" }] }]
    };
    expect(
      businessSecondsBetween(sp("2026-09-14T09:00"), sp("2026-09-14T10:00"), broken)
    ).toBe(0);
  });

  it("converte instantes UTC para o fuso do horario", () => {
    // 10:00Z = 07:00 em Sao Paulo, 12:00Z = 09:00
    expect(
      businessSecondsBetween(
        new Date("2026-09-14T10:00:00Z"),
        new Date("2026-09-14T12:00:00Z"),
        suporte2
      )
    ).toBe(3600);
  });
});

describe("scheduleForTicket", () => {
  it("prefere o horario da fila, depois o da empresa, senao null", () => {
    const company = { schedules: weekdaysOnly };
    expect(scheduleForTicket({ queue: { schedules: suporte2 }, company })).toBe(suporte2);
    expect(scheduleForTicket({ queue: { schedules: null }, company })).toBe(weekdaysOnly);
    expect(scheduleForTicket({ queue: null, company: { schedules: null } })).toBeNull();
    expect(scheduleForTicket(null)).toBeNull();
  });

  it("ignora horario sem timezone", () => {
    const legacy = { weeklyRules: [], overrides: [] } as unknown as OpenHoursData;
    expect(scheduleForTicket({ queue: { schedules: legacy }, company: null })).toBeNull();
  });
});

describe("refreshBusinessTimes", () => {
  const t0 = sp("2026-09-14T09:00");
  const plus = (seconds: number): Date => new Date(t0.getTime() + seconds * 1000);

  it("inicio da espera segue chatbotendAt, queuedAt, createdAt", () => {
    const tracking: any = {
      createdAt: t0,
      queuedAt: plus(60),
      chatbotendAt: plus(120),
      startedAt: plus(300)
    };
    refreshBusinessTimes(tracking, null);
    expect(tracking.waitTimeBusiness).toBe(180);

    delete tracking.chatbotendAt;
    refreshBusinessTimes(tracking, null);
    expect(tracking.waitTimeBusiness).toBe(240);

    delete tracking.queuedAt;
    refreshBusinessTimes(tracking, null);
    expect(tracking.waitTimeBusiness).toBe(300);
  });

  it("sem aceite deixa os dois nulos", () => {
    const tracking: any = { createdAt: t0, finishedAt: plus(900) };
    refreshBusinessTimes(tracking, null);
    expect(tracking.waitTimeBusiness).toBeNull();
    expect(tracking.serviceTimeBusiness).toBeNull();
  });

  it("atendimento so com aceite e fechamento", () => {
    const tracking: any = { createdAt: t0, startedAt: plus(300) };
    refreshBusinessTimes(tracking, null);
    expect(tracking.serviceTimeBusiness).toBeNull();

    tracking.finishedAt = plus(900);
    refreshBusinessTimes(tracking, null);
    expect(tracking.serviceTimeBusiness).toBe(600);
  });

  it("aplica o horario nos dois tempos", () => {
    const tracking: any = {
      createdAt: sp("2026-09-11T22:00"),
      startedAt: sp("2026-09-14T09:00"),
      finishedAt: sp("2026-09-15T09:00")
    };
    refreshBusinessTimes(tracking, weekdaysOnly);
    expect(tracking.waitTimeBusiness).toBe(3600);
    expect(tracking.serviceTimeBusiness).toBe(10 * 3600);
  });
});
