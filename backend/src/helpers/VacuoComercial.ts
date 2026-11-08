import { OpenHoursData } from "./checkOpenHours";
import { businessSecondsBetween } from "./businessSeconds";

// Conversa no vacuo (2026-10-29, pedido do Pedro): o cliente escreveu e o
// vendedor nao respondeu em VACUO_MINUTOS / VACUO_HORAS (padrao 5h) DENTRO do horario do
// comercial (o mesmo das metricas, 8h-19h seg-sab). A conversa sai do vendedor
// e volta para "aguardando" na fila comum (VACUO_FILA_NOME), que todos os
// vendedores veem. Quem puxar fala com o cliente pelo PROPRIO numero (a
// conversa e transferida para a conexao e a fila dele; trava de 23/10 mantida)
// e vira o dono no CRM (evento "dono").
// Vale so para as empresas de VACUO_COMPANIES (ids separados por virgula;
// vazio = desligado).

interface VacuoEnv {
  VACUO_COMPANIES?: string;
  VACUO_ETIQUETA?: string;
  VACUO_ETIQUETA_FORA?: string;
  VACUO_HORAS?: string;
  VACUO_MINUTOS?: string;
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

// VACUO_MINUTOS (08/11/2026, Pedro: 50 minutos) vale antes de VACUO_HORAS
export const limiteVacuoSeg = (env: VacuoEnv = process.env): number => {
  const minutos = Number(env.VACUO_MINUTOS);
  if (Number.isFinite(minutos) && minutos > 0) return Math.round(minutos * 60);
  const horas = Number(env.VACUO_HORAS);
  return (Number.isFinite(horas) && horas > 0 ? horas : 5) * 3600;
};

// so conversas cujo CONTATO tem esta etiqueta vao para a fila Livres (07/11/2026,
// pedido do Pedro: so leads da Black; Ligacoes e as outras abas ficam com o
// vendedor). O CRM poe a etiqueta (POST /crm/etiqueta-contato). Vazio = todas.
export const etiquetaVacuo = (env: VacuoEnv = process.env): string =>
  String(env.VACUO_ETIQUETA || "").trim();

// etiquetas que tiram a conversa da regra (08/11/2026, Pedro: quem ja comprou e
// manda mensagem pedindo ajuda com acesso nao e venda, nao vai para a fila Livres).
// Ex.: "Vendido,Comprou na live". Vale a etiqueta no contato ou em QUALQUER
// conversa do cliente (a etiqueta da coluna fica na conversa onde ele comprou).
export const etiquetasForaDoVacuo = (env: VacuoEnv = process.env): string[] =>
  String(env.VACUO_ETIQUETA_FORA || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

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

// conversa parada na fila Livres (ninguem puxou) que alguem do time respondeu
// DEPOIS da ultima mensagem do cliente nela (pelo celular, em outra conversa do
// mesmo cliente ou por outro numero): o cliente ja esta sendo atendido, ela sai da
// fila Livres e a contagem recomeca do zero (08/11/2026, pedido do Pedro: ninguem
// puxa quem ja esta tendo conversa)
export const respondidaDepois = (
  ultimaDoCliente: Date | null,
  ultimaResposta: Date | null
): boolean =>
  !!ultimaDoCliente &&
  !!ultimaResposta &&
  ultimaResposta.getTime() > ultimaDoCliente.getTime();

export type SaidaDaLivres =
  | { acao: "devolver"; userId: number; queueId: number }
  | { acao: "fechar" }
  | { acao: "nada"; motivo: string };

// o que fazer com a conversa parada na fila Livres: cliente ja respondido volta
// para o dono do numero (na fila dele); se o dono ja tem outra conversa aberta com
// o cliente no mesmo numero, esta e repetida e so fecha (sem mensagem ao cliente)
export const decidirSaidaDaLivres = (d: {
  ultimaDoCliente: Date | null;
  ultimaResposta: Date | null;
  outraAbertaNoNumero: boolean;
  donoDoNumero: number | null;
  filaDoNumero: number | null;
  // cliente que ja comprou (etiqueta de VACUO_ETIQUETA_FORA): sai mesmo sem resposta
  jaComprou?: boolean;
}): SaidaDaLivres => {
  if (!d.jaComprou && !respondidaDepois(d.ultimaDoCliente, d.ultimaResposta)) {
    return { acao: "nada", motivo: "cliente ainda esperando resposta" };
  }
  if (d.outraAbertaNoNumero) return { acao: "fechar" };
  if (!d.donoDoNumero || !d.filaDoNumero) {
    return { acao: "nada", motivo: "numero sem dono unico" };
  }
  return { acao: "devolver", userId: d.donoDoNumero, queueId: d.filaDoNumero };
};

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
