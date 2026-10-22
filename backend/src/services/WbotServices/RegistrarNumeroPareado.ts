import { logger } from "../../utils/logger";
import NotifyCrmNumeroTrocado from "../WebhookServices/NotifyCrmNumeroTrocado";

// Guarda qual numero de WhatsApp esta pareado em cada conexao
// (Whatsapps.pairedNumber) e avisa o CRM quando ela volta com OUTRO numero.
// Chamado pelo wbot a cada conexao aberta. Primeira conexao so grava;
// reconexao do mesmo numero (o caso comum, quando cai) nao faz nada.

interface ConexaoPareada {
  id: number;
  name?: string;
  companyId: number;
  pairedNumber?: string | null;
  update(dados: { pairedNumber: string }): Promise<unknown>;
}

interface QuemPediu {
  id: number;
  name: string;
}

// "5573999840461:12@s.whatsapp.net" -> "5573999840461"
export const numeroDoJid = (jid: string | undefined | null): string =>
  String(jid || "")
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");

export const decidirTrocaNumero = (
  anterior: string | null | undefined,
  novo: string
): { gravar: boolean; avisar: boolean } => {
  if (!novo) return { gravar: false, avisar: false };
  if (!anterior) return { gravar: true, avisar: false };
  if (anterior === novo) return { gravar: false, avisar: false };
  return { gravar: true, avisar: true };
};

// Quem clicou em conectar pela tela "Meu numero": vai no aviso ao CRM. Fica
// so em memoria (30 min): depois de reiniciar o backend, o aviso sai sem nome.
const VALIDADE_PEDIDO_MS = 30 * 60 * 1000;
const pedidos = new Map<number, { quem: QuemPediu; em: number }>();

export const registrarPedidoConexao = (
  whatsappId: number,
  quem: QuemPediu,
  agoraMs: number = Date.now()
): void => {
  pedidos.set(Number(whatsappId), {
    quem: { id: quem.id, name: quem.name },
    em: agoraMs
  });
};

export const quemPediuConexao = (
  whatsappId: number,
  agoraMs: number = Date.now()
): QuemPediu | null => {
  const p = pedidos.get(Number(whatsappId));
  if (!p || agoraMs - p.em > VALIDADE_PEDIDO_MS) return null;
  return p.quem;
};

// Nunca lanca: a conexao do WhatsApp nao pode cair por causa deste registro.
export const registrarNumeroPareado = async (
  whatsapp: ConexaoPareada,
  jid: string
): Promise<void> => {
  try {
    const novo = numeroDoJid(jid);
    const anterior = whatsapp.pairedNumber || null;
    const { gravar, avisar } = decidirTrocaNumero(anterior, novo);
    if (!gravar) return;
    await whatsapp.update({ pairedNumber: novo });
    if (!avisar) return;
    logger.info(
      { whatsappId: whatsapp.id, anterior, novo },
      "Conexao voltou com outro numero"
    );
    await NotifyCrmNumeroTrocado({
      companyId: whatsapp.companyId,
      whatsapp: { id: whatsapp.id, name: whatsapp.name },
      numeroAnterior: anterior,
      numeroNovo: novo,
      pedidoPor: quemPediuConexao(whatsapp.id)
    });
  } catch (err) {
    logger.warn(
      { message: err?.message, whatsappId: whatsapp?.id },
      "registrarNumeroPareado: falha ao registrar o numero"
    );
  }
};
