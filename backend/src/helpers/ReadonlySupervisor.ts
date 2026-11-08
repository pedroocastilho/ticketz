// Supervisor "somente leitura" por empresa.
//
// No comercial da Diamond o gestor acompanha as conversas de todos os
// vendedores, mas nao pode mexer: nem responder, nem aceitar uma conversa que
// esta aguardando (ela passaria a ser dele e sumiria para o vendedor), nem
// transferir, encerrar ou abrir conversa nova. No suporte o supervisor continua
// podendo intervir, por isso a regra vale so para as empresas listadas em
// SUPERVISOR_READONLY_COMPANIES (ids separados por virgula; vazio = desligado).

import { isRotaSessaoConexaoPropria } from "./ConexaoPropria";

interface ReadonlyEnv {
  SUPERVISOR_READONLY_COMPANIES?: string;
  SUPERVISOR_LIBERADOS?: string;
  [key: string]: string | undefined;
}

interface UserLike {
  id?: string | number;
  profile?: string;
  companyId?: number;
}

export const readonlyCompanies = (env: ReadonlyEnv = process.env): number[] =>
  String(env.SUPERVISOR_READONLY_COMPANIES || "")
    .split(",")
    .map(s => Number(s.trim()))
    .filter(n => Number.isInteger(n) && n > 0);

// supervisores liberados (ids de usuario separados por virgula; 08/11/2026, Pedro:
// a Beatriz transfere e atende como ele e o Francisco). Os outros seguem so lendo.
export const supervisoresLiberados = (
  env: ReadonlyEnv = process.env
): number[] =>
  String(env.SUPERVISOR_LIBERADOS || "")
    .split(",")
    .map(s => Number(s.trim()))
    .filter(n => Number.isInteger(n) && n > 0);

export const isReadonlySupervisor = (
  user: UserLike | undefined,
  env: ReadonlyEnv = process.env
): boolean =>
  !!user &&
  user.profile === "supervisor" &&
  readonlyCompanies(env).includes(Number(user.companyId)) &&
  !supervisoresLiberados(env).includes(Number(user.id));

// O que o supervisor somente leitura ainda pode fazer alem de consultar (GET):
// sair/renovar a sessao, alterar o proprio cadastro (nome, senha) e religar
// numeros pela tela "Meu numero" (a permissao fina fica no controller).
export const isAllowedForReadonly = (
  method: string,
  originalUrl: string,
  userId: string | number | undefined
): boolean => {
  const m = String(method || "").toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return true;
  const path = String(originalUrl || "")
    .split("?")[0]
    .replace(/^\/backend(?=\/)/, "")
    .replace(/\/+$/, "");
  if (path === "/auth" || path.startsWith("/auth/")) return true;
  if (m === "PUT" && userId !== undefined && path === `/users/${userId}`) {
    return true;
  }
  if (isRotaSessaoConexaoPropria(m, path)) return true;
  return false;
};
