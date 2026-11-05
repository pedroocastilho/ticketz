// Historico por contato (2026-11-05, pedido do Pedro). O Ticketz separa a conversa
// por contato + numero: quem foi atendido em 3 numeros tinha 3 conversas, cada uma com
// um pedaco do historico. Com isto, abrir qualquer uma delas mostra as mensagens de
// todas, em ordem de data. So a exibicao muda: nada e movido no banco, e o envio
// continua saindo pelo numero da conversa aberta. Vale so para as empresas de
// HISTORICO_CONTATO_COMPANIES (ids separados por virgula; vazio = desligado).

interface HistoricoContatoEnv {
  HISTORICO_CONTATO_COMPANIES?: string;
  [key: string]: string | undefined;
}

export const isHistoricoContatoEnabled = (
  companyId: number,
  env: HistoricoContatoEnv = process.env
): boolean =>
  String(env.HISTORICO_CONTATO_COMPANIES || "")
    .split(",")
    .map(s => Number(s.trim()))
    .filter(n => Number.isInteger(n) && n > 0)
    .includes(Number(companyId));
