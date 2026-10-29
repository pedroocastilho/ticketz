import { QueryTypes } from "sequelize";
import { DateTime } from "luxon";
import sequelize from "../../database";
import MetricasAtendimentoService, {
  horarioDoAmbiente
} from "../CrmServices/MetricasAtendimentoService";
import { MetricaDia } from "../CrmServices/calcularMetricasAtendimento";

// Painel (Dashboard) do comercial da Diamond (2026-10-29, pedido do Pedro).
// No comercial ninguem finaliza a conversa e o vendedor ja recebe ou puxa o
// atendimento, entao os tempos do Ticketz (que so contam conversa finalizada e
// a espera ate alguem aceitar) ficavam vazios ou zerados. Nas empresas de
// PAINEL_COMERCIAL_COMPANIES (ids separados por virgula; vazio = desligado):
//   - tempo de espera = quanto o cliente espera a resposta humana do vendedor;
//   - tempo de atendimento = da primeira a ultima mensagem da conversa no dia;
//     os dois so dentro do horario do comercial (calcularMetricasAtendimento,
//     o mesmo calculo do painel do CRM);
//   - a tabela mostra so vendedor (perfil user) com fila: quem saiu do time
//     fica sem fila e some; supervisores e admin ficam de fora;
//   - os gestores de PAINEL_GESTORES (ids de usuario) aparecem num quadro
//     proprio, com o tempo medio conectado por dia (nao atendem lead).

type PainelEnv = {
  PAINEL_COMERCIAL_COMPANIES?: string;
  PAINEL_GESTORES?: string;
  [key: string]: string | undefined;
};

const ids = (valor: string | undefined): number[] =>
  String(valor || "")
    .split(",")
    .map(s => Number(s.trim()))
    .filter(n => Number.isInteger(n) && n > 0);

export const isPainelComercial = (
  companyId: number,
  env: PainelEnv = process.env
): boolean => ids(env.PAINEL_COMERCIAL_COMPANIES).includes(Number(companyId));

export const gestoresDoPainel = (env: PainelEnv = process.env): number[] =>
  ids(env.PAINEL_GESTORES);

export type Tempos = {
  esperaSeg: number | null;
  atendimentoSeg: number | null;
};

// media ponderada dos dias das conexoes pedidas (todas, se conexoes = null)
export function somarTempos(
  dias: MetricaDia[],
  conexoes: number[] | null
): Tempos {
  let esperaSoma = 0;
  let esperaQtd = 0;
  let atendSoma = 0;
  let atendQtd = 0;
  dias
    .filter(d => !conexoes || conexoes.includes(d.conexaoId))
    .forEach(d => {
      esperaSoma += d.respostaSomaSeg;
      esperaQtd += d.respostaQtd;
      atendSoma += d.atendimentoSomaSeg || 0;
      atendQtd += d.atendimentoQtd || 0;
    });
  return {
    esperaSeg: esperaQtd ? Math.round(esperaSoma / esperaQtd) : null,
    atendimentoSeg: atendQtd ? Math.round(atendSoma / atendQtd) : null
  };
}

// sessao "ativa" esquecida (socket que caiu sem avisar) nao conta mais que isso
const MAX_SESSAO_MS = 16 * 3600 * 1000;

export type Sessao = { inicio: Date; fim: Date };
export type TempoConectado = {
  dias: number;
  somaSeg: number;
  mediaSeg: number | null;
};

// tempo conectado: uniao das sessoes (varias abas ao mesmo tempo contam uma
// vez) dentro de [de, ate], separada por dia no fuso; media = por dia com
// alguma conexao
export function tempoConectadoPorDia(
  sessoes: Sessao[],
  fuso: string,
  de: Date,
  ate: Date
): TempoConectado {
  const porDia = new Map<string, Array<[number, number]>>();
  sessoes.forEach(s => {
    const ini = Math.max(s.inicio.getTime(), de.getTime());
    const fim = Math.min(
      s.fim.getTime(),
      ate.getTime(),
      s.inicio.getTime() + MAX_SESSAO_MS
    );
    let cur = ini;
    while (cur < fim) {
      const dia = DateTime.fromMillis(cur).setZone(fuso);
      const fimDoDia = dia.startOf("day").plus({ days: 1 }).toMillis();
      const corte = Math.min(fim, fimDoDia);
      const chave = dia.toISODate();
      if (!porDia.has(chave)) porDia.set(chave, []);
      porDia.get(chave).push([cur, corte]);
      cur = corte;
    }
  });

  let somaMs = 0;
  porDia.forEach(intervalos => {
    intervalos.sort((a, b) => a[0] - b[0]);
    let [aIni, aFim] = intervalos[0];
    intervalos.slice(1).forEach(([i, f]) => {
      if (i <= aFim) {
        aFim = Math.max(aFim, f);
      } else {
        somaMs += aFim - aIni;
        [aIni, aFim] = [i, f];
      }
    });
    somaMs += aFim - aIni;
  });

  const somaSeg = Math.round(somaMs / 1000);
  return {
    dias: porDia.size,
    somaSeg,
    mediaSeg: porDia.size ? Math.round(somaSeg / porDia.size) : null
  };
}

export type VendedorPainel = { id: number; name: string; conexoes: number[] };

// vendedor = perfil user com alguma fila; conexoes = as ligadas as filas dele
export async function vendedoresDoPainel(
  companyId: number
): Promise<VendedorPainel[]> {
  const linhas: Array<{ id: number; name: string; conexoes: number[] }> =
    await sequelize.query(
      `
        SELECT u.id, u.name,
               COALESCE(array_agg(DISTINCT wq."whatsappId")
                 FILTER (WHERE wq."whatsappId" IS NOT NULL), '{}') AS conexoes
          FROM "Users" u
          JOIN "UserQueues" uq ON uq."userId" = u.id
          LEFT JOIN "WhatsappQueues" wq ON wq."queueId" = uq."queueId"
         WHERE u."companyId" = :companyId AND u.profile = 'user'
         GROUP BY u.id, u.name
         ORDER BY u.name
      `,
      { replacements: { companyId }, type: QueryTypes.SELECT }
    );
  return linhas.map(l => ({
    id: Number(l.id),
    name: l.name,
    conexoes: (l.conexoes || []).map(Number)
  }));
}

const periodoNoHorario = (start: Date, end: Date) => {
  const horario = horarioDoAmbiente();
  const de = DateTime.fromJSDate(start).setZone(horario.timezone).toISODate();
  const ate = DateTime.fromJSDate(end).setZone(horario.timezone).toISODate();
  return { horario, de, ate: ate < de ? de : ate };
};

export async function metricasDoPeriodo(
  companyId: number,
  start: Date,
  end: Date
): Promise<MetricaDia[]> {
  const { horario, de, ate } = periodoNoHorario(start, end);
  const r = await MetricasAtendimentoService({ companyId, de, ate, horario });
  return r.dias;
}

export type GestorPainel = {
  id: number;
  name: string;
  online: boolean;
  diasConectada: number;
  mediaConectadaSeg: number | null;
};

export async function gestoresComercial(
  companyId: number,
  start: Date,
  end: Date,
  env: PainelEnv = process.env
): Promise<GestorPainel[]> {
  const lista = gestoresDoPainel(env);
  if (!lista.length) return [];
  const agora = new Date();
  const ate = end.getTime() < agora.getTime() ? end : agora;

  const usuarios: Array<{ id: number; name: string; online: boolean }> =
    await sequelize.query(
      `
        SELECT u.id, u.name,
               EXISTS (SELECT 1 FROM "UserSocketSessions" s
                        WHERE s."userId" = u.id AND s.active = true) AS online
          FROM "Users" u
         WHERE u."companyId" = :companyId AND u.id IN (:lista)
         ORDER BY u.name
      `,
      { replacements: { companyId, lista }, type: QueryTypes.SELECT }
    );
  if (!usuarios.length) return [];

  const sessoes: Array<{ userId: number; inicio: Date; fim: Date }> =
    await sequelize.query(
      `
        SELECT s."userId", s."createdAt" AS inicio,
               CASE WHEN s.active THEN NOW() ELSE s."updatedAt" END AS fim
          FROM "UserSocketSessions" s
         WHERE s."userId" IN (:ids)
           AND s."createdAt" < :ate
           AND (s.active = true OR s."updatedAt" > :de)
      `,
      {
        replacements: { ids: usuarios.map(u => u.id), de: start, ate },
        type: QueryTypes.SELECT
      }
    );

  const { horario } = periodoNoHorario(start, end);
  return usuarios.map(u => {
    const t = tempoConectadoPorDia(
      sessoes
        .filter(s => Number(s.userId) === Number(u.id))
        .map(s => ({ inicio: new Date(s.inicio), fim: new Date(s.fim) })),
      horario.timezone,
      start,
      ate
    );
    return {
      id: Number(u.id),
      name: u.name,
      online: !!u.online,
      diasConectada: t.dias,
      mediaConectadaSeg: t.mediaSeg
    };
  });
}
