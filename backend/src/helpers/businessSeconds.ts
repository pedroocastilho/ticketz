import { DateTime } from "luxon";
import { OpenHoursData } from "./checkOpenHours";

/**
 * Calculo de tempo util (dentro do expediente) para os tempos medios do
 * painel. Usa o mesmo formato de horario das filas e da empresa
 * (OpenHoursData, ver checkOpenHours.ts), com a mesma precedencia:
 * override da data (feriado) > regra semanal > sem regra = fechado.
 */

type HourRange = { from: string; to: string };

type WithSchedules = { schedules?: OpenHoursData | null } | null | undefined;

export type TrackingTimes = {
  createdAt?: Date | null;
  queuedAt?: Date | null;
  chatbotendAt?: Date | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  waitTimeBusiness?: number | null;
  serviceTimeBusiness?: number | null;
};

// protecao contra intervalos absurdos (ticket esquecido por mais de um ano)
const MAX_DAYS = 400;

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function parseHour(value: string): { hour: number; minute: number } | null {
  const [hour, minute] = (value || "").split(":").map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }
  return { hour, minute };
}

// faixas abertas de um dia, na mesma ordem de prioridade do checkOpenHours
function openRangesForDay(day: DateTime, schedule: OpenHoursData): HourRange[] {
  const dateStr = day.toISODate();
  const monthDay = day.toFormat("MM-dd");
  const weekday = WEEKDAYS[day.weekday - 1];

  const override = (schedule.overrides || []).find(o =>
    o.repeat === "yearly" ? o.date?.slice(5) === monthDay : o.date === dateStr
  );
  if (override) {
    if (override.closed) {
      return [];
    }
    return override.hours || [];
  }

  const rule = (schedule.weeklyRules || []).find(r =>
    (r.days || []).includes(weekday)
  );
  return rule ? rule.hours || [] : [];
}

/**
 * Segundos entre start e end que caem dentro do expediente. Sem horario
 * (ou horario no formato antigo, sem timezone) devolve relogio de parede.
 */
export function businessSecondsBetween(
  start: Date,
  end: Date,
  schedule: OpenHoursData | null
): number {
  if (!start || !end) {
    return 0;
  }
  const total = Math.floor((end.getTime() - start.getTime()) / 1000);
  if (total <= 0) {
    return 0;
  }
  if (!schedule?.timezone) {
    return total;
  }

  const startDt = DateTime.fromJSDate(start).setZone(schedule.timezone);
  const endDt = DateTime.fromJSDate(end).setZone(schedule.timezone);
  if (!startDt.isValid || !endDt.isValid) {
    return total;
  }

  let seconds = 0;
  let day = startDt.startOf("day");
  let guard = 0;

  while (day < endDt && guard < MAX_DAYS) {
    // eslint-disable-next-line no-restricted-syntax
    for (const range of openRangesForDay(day, schedule)) {
      const from = parseHour(range.from);
      const to = parseHour(range.to);
      if (from && to) {
        const rangeStart = day.set({ ...from, second: 0, millisecond: 0 });
        const rangeEnd = day.set({ ...to, second: 0, millisecond: 0 });
        if (rangeEnd > rangeStart) {
          const clipStart = rangeStart > startDt ? rangeStart : startDt;
          const clipEnd = rangeEnd < endDt ? rangeEnd : endDt;
          if (clipEnd > clipStart) {
            seconds += Math.floor(clipEnd.diff(clipStart, "seconds").seconds);
          }
        }
      }
    }
    day = day.plus({ days: 1 });
    guard += 1;
  }

  return seconds;
}

/**
 * Horario que vale para o ticket: o da fila, senao o da empresa, senao
 * nenhum. O ticket precisa vir com queue e company ja carregados.
 */
export function scheduleForTicket(
  ticket: { queue?: WithSchedules; company?: WithSchedules } | null | undefined
): OpenHoursData | null {
  if (ticket?.queue?.schedules?.timezone) {
    return ticket.queue.schedules;
  }
  if (ticket?.company?.schedules?.timezone) {
    return ticket.company.schedules;
  }
  return null;
}

/**
 * Preenche waitTimeBusiness e serviceTimeBusiness no objeto, sem salvar.
 * Inicio da espera segue a mesma precedencia da coluna gerada waitTime.
 */
export function refreshBusinessTimes(
  tracking: TrackingTimes,
  schedule: OpenHoursData | null
): void {
  const waitStart =
    tracking.chatbotendAt || tracking.queuedAt || tracking.createdAt;

  tracking.waitTimeBusiness =
    tracking.startedAt && waitStart
      ? businessSecondsBetween(waitStart, tracking.startedAt, schedule)
      : null;

  tracking.serviceTimeBusiness =
    tracking.startedAt && tracking.finishedAt
      ? businessSecondsBetween(
          tracking.startedAt,
          tracking.finishedAt,
          schedule
        )
      : null;
}
