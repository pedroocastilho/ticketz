import { OpenHoursData } from "./checkOpenHours";
import { businessSecondsBetween } from "./businessSeconds";

// Conversa no vacuo (2026-10-29, pedido do Pedro): o cliente escreveu e o
// vendedor nao respondeu em VACUO_HORAS (padrao 5) horas DENTRO do horario do
// comercial (o mesmo das metricas, 8h-19h seg-sab). A conversa sai do vendedor
// e volta para "aguardando" na fila comum (VACUO_FILA_NOME), que todos os
// vendedores veem. Quem puxar fala com o cliente pelo PROPRIO numero (a
// conversa e transferida para a conexao e a fila dele; trava de 23/10 mantida)
// e vira o dono no CRM (evento "dono").
// Vale so para as empresas de VACUO_COMPANIES (ids separados por virgula;
// vazio = desligado).

interface VacuoEnv {
  VACUO_COMPANIES?: string;
  VACUO_HORAS?: string;
  VACUO_FILA_NOME?: string;
  VACUO_DESDE?: string;
  [key: string]: string | undefined;
}

export const isVacuoEnabled = (
  companyId: number,
  env: VacuoEnv = process.env
): boolean =>
  String(env.VACUO_COMPANIES || "")
    .split(",")
    .map(s => Number(s.trim()))
    .filter(n => Number.isInteger(n) && n > 0)
    .includes(Number(companyId));

export const limiteVacuoSeg = (env: VacuoEnv = process.env): number => {
  const horas = Number(env.VACUO_HORAS);
  return (Number.isFinite(horas) && horas > 0 ? horas : 5) * 3600;
};

export const nomeFilaLivres = (env: VacuoEnv = process.env): string =>
  String(env.VACUO_FILA_NOME || "").trim() || "Livres (sem resposta)";

// so conta espera que comecou depois de VACUO_DESDE (o deploy grava a hora em
// que ligou): ligar a regra nao despeja de uma vez as conversas antigas
export const vacuoDesde = (env: VacuoEnv = process.env): Date | null => {
  const d = env.VACUO_DESDE ? new Date(env.VACUO_DESDE) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

// esperaDesde = primeira mensagem do cliente depois da ultima resposta humana
// do vendedor (sem nenhuma = nao esta esperando)
export const estourouVacuo = (
  esperaDesde: Date | null,
  agora: Date,
  horario: OpenHoursData,
  limiteSeg: number = limiteVacuoSeg(),
  desde: Date | null = vacuoDesde()
): boolean =>
  !!esperaDesde &&
  (!desde || esperaDesde.getTime() >= desde.getTime()) &&
  businessSecondsBetween(esperaDesde, agora, horario) >= limiteSeg;

export type ConexaoDoVendedor = {
  whatsappId: number;
  queueId: number;
  status?: string;
};

// numero e fila de quem puxou: a conexao ligada a uma fila dele (a conectada
// primeiro). Sem nenhuma = null (ele nao tem numero proprio).
export const destinoDoVendedor = (
  conexoes: ConexaoDoVendedor[]
): ConexaoDoVendedor | null => {
  if (!conexoes.length) return null;
  return conexoes.find(c => c.status === "CONNECTED") || conexoes[0];
};
