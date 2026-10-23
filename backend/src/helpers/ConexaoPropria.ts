// "Meu numero": cada vendedor conecta, reconecta ou troca o proprio numero de
// WhatsApp sem depender do admin, e sem ver os numeros dos colegas.
//
// No comercial da Diamond cada vendedor tem uma fila exclusiva e uma conexao
// ligada so a essa fila. Por isso "a conexao dele" = conexao com alguma fila
// em comum com as filas do usuario. Gestor (supervisor) e admin cuidam de
// todas as conexoes da empresa. Vale so para as empresas listadas em
// CONEXAO_PROPRIA_COMPANIES (ids separados por virgula; vazio = desligado):
// o suporte, na mesma instalacao, continua so com a tela Conexoes do admin.

interface ConexaoPropriaEnv {
  CONEXAO_PROPRIA_COMPANIES?: string;
  [key: string]: string | undefined;
}

interface UsuarioLike {
  profile?: string;
  companyId?: number;
}

interface ConexaoLike {
  companyId: number;
  queueIds: number[];
}

export const conexaoPropriaCompanies = (
  env: ConexaoPropriaEnv = process.env
): number[] =>
  String(env.CONEXAO_PROPRIA_COMPANIES || "")
    .split(",")
    .map(s => Number(s.trim()))
    .filter(n => Number.isInteger(n) && n > 0);

export const isConexaoPropriaEnabled = (
  companyId: number,
  env: ConexaoPropriaEnv = process.env
): boolean => conexaoPropriaCompanies(env).includes(Number(companyId));

export const podeVerTodasConexoes = (
  user: UsuarioLike,
  env: ConexaoPropriaEnv = process.env
): boolean =>
  !!user &&
  (user.profile === "admin" || user.profile === "supervisor") &&
  isConexaoPropriaEnabled(user.companyId, env);

export const podeGerenciarConexao = (
  user: UsuarioLike,
  conexao: ConexaoLike,
  filasDoUsuario: number[],
  env: ConexaoPropriaEnv = process.env
): boolean => {
  if (!user || !conexao) return false;
  if (Number(conexao.companyId) !== Number(user.companyId)) return false;
  if (!isConexaoPropriaEnabled(user.companyId, env)) return false;
  if (podeVerTodasConexoes(user, env)) return true;
  if (user.profile !== "user") return false;
  const minhas = new Set((filasDoUsuario || []).map(Number));
  return (conexao.queueIds || []).some(id => minhas.has(Number(id)));
};

// Vendedor da empresa com conexao propria so conversa pelo proprio numero.
// Antes, com o numero dele desconectado, a conversa saia pela conexao padrao
// (ou qualquer uma conectada) = numero de um colega; em 23/10/2026 as conversas
// do Fellipe derrubaram os numeros da Isabela, da Jackeline e do Marcos.
export const soConexaoPropria = (
  user: UsuarioLike,
  env: ConexaoPropriaEnv = process.env
): boolean =>
  !!user && user.profile === "user" && isConexaoPropriaEnabled(user.companyId, env);

// Acoes de sessao da tela "Meu numero" (POST reconecta, PUT novo QR, DELETE
// desconecta). O supervisor somente leitura passa so por elas: continua sem
// responder conversa, mas consegue religar o numero de um vendedor.
const ROTA_SESSAO = /^\/minhas-conexoes\/\d+\/sessao$/;

export const isRotaSessaoConexaoPropria = (
  method: string,
  originalUrl: string
): boolean => {
  const m = String(method || "").toUpperCase();
  if (m !== "POST" && m !== "PUT" && m !== "DELETE") return false;
  const path = String(originalUrl || "")
    .split("?")[0]
    .replace(/^\/backend(?=\/)/, "")
    .replace(/\/+$/, "");
  return ROTA_SESSAO.test(path);
};
