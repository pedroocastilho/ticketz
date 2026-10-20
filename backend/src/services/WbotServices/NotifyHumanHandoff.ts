import { Session } from "../../libs/wbot";
import Ticket from "../../models/Ticket";
import QueueOption from "../../models/QueueOption";
import Whatsapp from "../../models/Whatsapp";
import { GetCompanySetting } from "../../helpers/CheckSettings";
import { logger } from "../../utils/logger";
import { getJidOf } from "./getJidOf";

// Marcador de "mensagem automatica" que o proprio Ticketz ja usa na mensagem de
// conclusao e na avaliacao. Com ele no comeco do texto o handleMessage devolve
// antes de criar contato e ticket, entao o aviso NAO vira conversa na
// plataforma. Sem isso, avisar o proprio numero abriria um ticket dele com ele
// mesmo a cada pedido de atendente.
const MARCA_AUTOMATICA = "‎";

// quantos niveis do menu sobem no "escolheu"; a arvore do 6610 tem tres
const MAX_NIVEIS = 5;

export const NOTIFY_SETTING = "humanHandoffNotifyNumbers";

/**
 * Le a configuracao e devolve os numeros (so digitos) que devem receber o
 * aviso. Aceita virgula, ponto-e-virgula ou espaco como separador. O apelido
 * `self` (ou `proprio`) vira o numero da propria conexao, que e como a Brenda
 * quer: ela deixa o 6610 aberto no WhatsApp Web e avisa a atendente.
 * Lista vazia = recurso desligado.
 */
export const parseNotifyNumbers = (
  bruto: string,
  proprio?: string
): string[] => {
  const vistos = new Set<string>();

  return String(bruto || "")
    .split(/[,;\s]+/)
    .map(pedaco => {
      const limpo = pedaco.trim().toLowerCase();
      if (limpo === "self" || limpo === "proprio" || limpo === "próprio") {
        return proprio ? proprio.replace(/\D/g, "") : "";
      }
      return pedaco.replace(/\D/g, "");
    })
    .filter(numero => {
      // numero brasileiro com DDI tem 12 ou 13 digitos; abaixo de 10 e lixo
      if (numero.length < 10) return false;
      if (vistos.has(numero)) return false;
      vistos.add(numero);
      return true;
    });
};

/**
 * Monta "Acesso ao curso > Kiwify > Nao, preciso falar com um atendente."
 * subindo pelos `parentId` ate a raiz do menu.
 */
export const buildOptionPath = async (
  option: QueueOption | null
): Promise<string> => {
  const titulos: string[] = [];
  let atual = option;

  for (let i = 0; i < MAX_NIVEIS && atual; i += 1) {
    if (atual.title) titulos.unshift(atual.title);
    if (!atual.parentId) break;
    // eslint-disable-next-line no-await-in-loop
    atual = await QueueOption.findByPk(atual.parentId);
  }

  return titulos.join(" > ");
};

interface Request {
  wbot: Session;
  ticket: Ticket;
  option?: QueueOption;
}

/**
 * Avisa no WhatsApp que alguem pediu atendente no bot. O `exitChatbot` so
 * muda o status do ticket: nao existe notificacao nenhuma nativa para quem nao
 * esta com a plataforma aberta, e o som do painel toca em mensagem recebida,
 * nao em troca de status.
 *
 * Fire-and-forget: qualquer erro vira log e devolve 0. O atendimento do cliente
 * nunca pode parar por causa do aviso.
 */
const NotifyHumanHandoff = async ({
  wbot,
  ticket,
  option
}: Request): Promise<number> => {
  try {
    const bruto = await GetCompanySetting(ticket.companyId, NOTIFY_SETTING, "");

    const proprio = wbot?.myJid ? wbot.myJid.split("@")[0] : undefined;
    const destinos = parseNotifyNumbers(bruto, proprio);

    if (!destinos.length) return 0;

    const whatsapp = await Whatsapp.findByPk(ticket.whatsappId);
    const caminho = await buildOptionPath(option);

    const linhas = [
      `🔔 Pediram atendente no WhatsApp *${whatsapp?.name || "suporte"}*`,
      "",
      `Cliente: ${ticket.contact?.name || "sem nome"}`,
      `Número: ${ticket.contact?.number || "?"}`
    ];

    if (caminho) linhas.push(`Escolheu: ${caminho}`);

    linhas.push("", "A conversa está aguardando atendimento na plataforma.");

    if (process.env.FRONTEND_URL && ticket.uuid) {
      linhas.push(
        `${process.env.FRONTEND_URL.replace(/\/$/, "")}/tickets/${ticket.uuid}`
      );
    }

    const text = `${MARCA_AUTOMATICA}${linhas.join("\n")}`;

    const enviados = await Promise.all(
      destinos.map(async numero => {
        try {
          // para o proprio numero usa o jid que o Baileys ja normalizou, para
          // nao arriscar o nono digito no getJidOf
          const jid =
            numero === proprio && wbot.myJid ? wbot.myJid : getJidOf(numero);
          await wbot.sendMessage(jid, { text });
          return 1;
        } catch (error) {
          logger.error(
            { error, numero },
            "NotifyHumanHandoff: falha ao avisar numero"
          );
          return 0;
        }
      })
    );

    return enviados.reduce((soma: number, n: number) => soma + n, 0);
  } catch (error) {
    logger.error({ error }, "NotifyHumanHandoff: falha ao montar o aviso");
    return 0;
  }
};

export default NotifyHumanHandoff;
