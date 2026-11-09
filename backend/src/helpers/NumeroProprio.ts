// Cada vendedor so fala pelo proprio numero (09/11/2026, caso Mariana: a Laura e a
// Isabela mandaram mensagem pelo Ticketz em conversas que estavam no numero da
// Mariana, porque a transferencia trocou a fila e o atendente mas nao o numero).
//
// 1. Envio: vendedor (perfil user) nao manda nem encaminha mensagem por conversa que
//    esta no numero de OUTRO vendedor (numero ligado a uma fila de vendedor que nao e
//    dele). Numero sem fila de vendedor (so a Livres, ou nenhuma) nao trava.
// 2. Transferencia feita por uma pessoa: a conversa vai junto para o numero da fila
//    (ou do vendedor) que vai atender, se esse numero estiver conectado.
// Ligado por SO_NUMERO_PROPRIO=1, so nas empresas de CONEXAO_PROPRIA_COMPANIES.

import { isConexaoPropriaEnabled } from "./ConexaoPropria";

interface NumeroProprioEnv {
  SO_NUMERO_PROPRIO?: string;
  CONEXAO_PROPRIA_COMPANIES?: string;
  [key: string]: string | undefined;
}

export const isNumeroProprioEnabled = (
  companyId: number,
  env: NumeroProprioEnv = process.env
): boolean =>
  ["1", "true", "sim"].includes(
    String(env.SO_NUMERO_PROPRIO || "")
      .trim()
      .toLowerCase()
  ) && isConexaoPropriaEnabled(companyId, env);

export interface FilaLike {
  id: number;
  name: string;
}

// null = pode usar o numero; texto = nome da fila (vendedor) dona do numero
export const donoDoNumeroParaUsuario = ({
  filasDoNumero,
  filasDoUsuario,
  nomeLivres
}: {
  filasDoNumero: FilaLike[];
  filasDoUsuario: number[];
  nomeLivres: string;
}): string | null => {
  const deVendedor = (filasDoNumero || []).filter(f => f.name !== nomeLivres);
  if (!deVendedor.length) return null;
  const minhas = new Set((filasDoUsuario || []).map(Number));
  if (deVendedor.some(f => minhas.has(Number(f.id)))) return null;
  return deVendedor[0].name;
};

export const mensagemNumeroDeOutro = (dono: string): string =>
  `Esta conversa está no número de ${dono}. Peça para a gestão passar a conversa para o seu número.`;

export interface LigacaoNumero {
  whatsappId: number;
  queueId: number;
  status: string;
}

// para qual numero a conversa vai quando passa a ser atendida pelas filas `filasAlvo`.
// null = fica onde esta (ja e um numero dessas filas, ou nenhum deles conectado)
export const numeroDeDestino = ({
  ligacoes,
  filasAlvo,
  numeroAtual
}: {
  ligacoes: LigacaoNumero[];
  filasAlvo: number[];
  numeroAtual: number | null;
}): number | null => {
  const alvo = new Set((filasAlvo || []).map(Number));
  const dasFilas = (ligacoes || []).filter(l => alvo.has(Number(l.queueId)));
  if (!dasFilas.length) return null;
  if (dasFilas.some(l => Number(l.whatsappId) === Number(numeroAtual))) {
    return null;
  }
  const conectado = dasFilas.find(l => l.status === "CONNECTED");
  return conectado ? Number(conectado.whatsappId) : null;
};
