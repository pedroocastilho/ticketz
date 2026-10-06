// Supervisor "somente leitura" por empresa.
//
// No comercial da Diamond o gestor acompanha as conversas de todos os
// vendedores, mas nao pode mexer: nem responder, nem aceitar uma conversa que
// esta aguardando (ela passaria a ser dele e sumiria para o vendedor), nem
// transferir, encerrar ou abrir conversa nova. No suporte o supervisor continua
// podendo intervir, por isso a regra vale so para as empresas listadas em
// SUPERVISOR_READONLY_COMPANIES (ids separados por virgula; vazio = desligado).

interface ReadonlyEnv {
  SUPERVISOR_READONLY_COMPANIES?: string;
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

export const isReadonlySupervisor = (
  user: UserLike | undefined,
  env: ReadonlyEnv = process.env
): boolean =>
  !!user &&
  user.profile === "supervisor" &&
  readonlyCompanies(env).includes(Number(user.companyId));

// O que o supervisor somente leitura ainda pode fazer alem de consultar (GET):
// sair/renovar a sessao e alterar o proprio cadastro (nome, senha).
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
  return false;
};
