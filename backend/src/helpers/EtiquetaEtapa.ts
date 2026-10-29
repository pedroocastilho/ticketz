// Etiquetas de etapa do comercial (2026-10-29, pedido do Pedro): a etiqueta da
// conversa e a coluna do cartao no CRM andam juntas, nos dois sentidos.
//   - etiqueta de etapa = etiqueta com kanban ligado (Em atendimento,
//     Nao respondeu, Follow-up 1 a 7, Em conversa, Reuniao agendada,
//     Negociacao, Aguardando pagamento, Vendido, Perdido). As de produto e
//     canal (Comunidade, Live...) ficam com kanban desligado e nao mudam;
//   - a conversa tem uma etiqueta de etapa por vez: marcar outra tira a anterior;
//   - a primeira mensagem do vendedor numa conversa sem etapa marca
//     "Em atendimento";
//   - o CRM troca a etiqueta quando o cartao muda de coluna
//     (POST /crm/etiqueta-etapa). Qual coluna vale qual etiqueta fica no CRM.
// Vale so para as empresas de ETIQUETA_ETAPA_COMPANIES (ids separados por
// virgula; vazio = desligado).

interface EtiquetaEnv {
  ETIQUETA_ETAPA_COMPANIES?: string;
  [key: string]: string | undefined;
}

export const ETIQUETA_EM_ATENDIMENTO = "Em atendimento";

export const isEtiquetaEtapaEnabled = (
  companyId: number,
  env: EtiquetaEnv = process.env
): boolean =>
  String(env.ETIQUETA_ETAPA_COMPANIES || "")
    .split(",")
    .map(s => Number(s.trim()))
    .filter(n => Number.isInteger(n) && n > 0)
    .includes(Number(companyId));

// "Follow-up 1", "FOLLOW-UP 1" e "follow up 1" sao a mesma etiqueta
export const chaveEtiqueta = (nome: string): string =>
  String(nome || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

export type EtiquetaLike = { id: number; name?: string; kanban?: number };

const ehEtapa = (t: EtiquetaLike) => Number(t.kanban) === 1;

// Lista que o vendedor salvou na tela: se ficou com mais de uma etiqueta de
// etapa, fica so a que ele acabou de marcar (a que a conversa ainda nao tinha;
// empate = a ultima da lista). As outras etiquetas ficam como estao.
export function umaEtapaSo(
  novas: EtiquetaLike[],
  anteriores: number[]
): EtiquetaLike[] {
  const etapas = novas.filter(ehEtapa);
  if (etapas.length <= 1) return novas;
  const tinha = new Set(anteriores.map(Number));
  const recentes = etapas.filter(t => !tinha.has(Number(t.id)));
  const fica = (recentes.length ? recentes : etapas).slice(-1)[0];
  return novas.filter(t => !ehEtapa(t) || t.id === fica.id);
}

// O CRM manda a etiqueta da coluna nova e todas as que valem a mesma coluna
// (ex.: no Organico "Em conversa" e "Negociacao" sao Negociando). Se a conversa
// ja tem uma delas, nao troca: a etiqueta que o vendedor escolheu fica.
export function precisaTrocar(
  atuais: EtiquetaLike[],
  aceitas: string[]
): boolean {
  const ok = new Set(aceitas.map(chaveEtiqueta));
  return !atuais.filter(ehEtapa).some(t => ok.has(chaveEtiqueta(t.name)));
}

// cor de cada etapa no kanban do Ticketz (amarelo -> laranja -> rosa -> vermelho
// nos follow-ups, como no CRM)
const CORES: Record<string, string> = {
  "EM ATENDIMENTO": "#2196f3",
  "NAO RESPONDEU": "#9e9e9e",
  "FOLLOW UP 1": "#fdd835",
  "FOLLOW UP 2": "#fdd835",
  "FOLLOW UP 3": "#fb8c00",
  "FOLLOW UP 4": "#fb8c00",
  "FOLLOW UP 5": "#ec407a",
  "FOLLOW UP 6": "#ec407a",
  "FOLLOW UP 7": "#e53935",
  "EM CONVERSA": "#26a69a",
  "REUNIAO AGENDADA": "#5c6bc0",
  NEGOCIACAO: "#1e88e5",
  "AGUARDANDO PAGAMENTO": "#ff7043",
  VENDIDO: "#43a047",
  PERDIDO: "#757575"
};

export const corDaEtiqueta = (nome: string): string =>
  CORES[chaveEtiqueta(nome)] || "#607d8b";
