// Tolerancia do "online" do painel do comercial (2026-11-03, a Bia via todo mundo offline com o time atendendo).
// "Online" no Ticketz = existe sessao de socket ativa (UserSocketSessions). Dentro do CRM o Ticketz fica na pagina
// Conversas: trocar de pagina no CRM fecha a conexao e a vendedora caia para offline na hora (Laura: 19 conexoes de
// ~22 s numa hora). Nas empresas de PAINEL_COMERCIAL_COMPANIES, quem saiu ha menos de PAINEL_ONLINE_TOLERANCIA_MIN
// minutos (padrao 10; 0 desliga) continua online. Vale igual para quem abre pelo CRM e pelo link direto (mesma conexao).
// Sem imports de proposito: e usado pelo socket e pelos servicos do painel sem risco de import circular.

type Env = { [key: string]: string | undefined };

const PADRAO_MIN = 10;
const MAX_MIN = 120;

const empresas = (valor: string | undefined): number[] =>
  String(valor || "")
    .split(",")
    .map(s => Number(s.trim()))
    .filter(n => Number.isInteger(n) && n > 0);

// minutos de tolerancia da empresa (0 = sem tolerancia: o online e so a sessao ativa, como no Ticketz original)
export const toleranciaOnlineMin = (
  companyId: number,
  env: Env = process.env
): number => {
  if (!empresas(env.PAINEL_COMERCIAL_COMPANIES).includes(Number(companyId)))
    return 0;
  const bruto = env.PAINEL_ONLINE_TOLERANCIA_MIN;
  if (bruto === undefined || String(bruto).trim() === "") return PADRAO_MIN;
  const n = Number(bruto);
  if (!Number.isFinite(n) || n < 0) return PADRAO_MIN;
  return Math.min(Math.floor(n), MAX_MIN);
};

// trecho SQL de "esta online": sessao ativa ou fechada dentro da tolerancia. tabela = nome/alias de UserSocketSessions
export const sqlSessaoOnline = (tabela: string, minutos: number): string => {
  const m = Math.max(0, Math.floor(Number(minutos) || 0));
  return m > 0
    ? `(${tabela}."active" = true OR ${tabela}."updatedAt" > NOW() - INTERVAL '${m} minutes')`
    : `${tabela}."active" = true`;
};
