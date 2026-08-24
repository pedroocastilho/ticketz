import { DateTime } from "luxon";
import Message from "../models/Message";
import { OpenHoursData } from "./checkOpenHours";

// Mensagens automaticas localizadas por dia e idioma (customizacao Diamond).
//
// - Os campos de mensagem automatica (saudacao, fora de expediente, conclusao,
//   respostas automaticas) aceitam duas versoes no mesmo campo, separadas por
//   uma linha contendo apenas [es] (opcionalmente [pt] antes do bloco em
//   portugues). Sem marcador, o campo inteiro vale para os dois idiomas.
// - O idioma do cliente e detectado por heuristica sobre as ultimas mensagens
//   recebidas dele no ticket. Na duvida, portugues.
// - Cada regra semanal de horario da fila pode ter uma mensagem propria de
//   fora de expediente (campo "message" no JSON weeklyRules), permitindo texto
//   diferente para sabado, domingo etc.

export type AutoMessageLang = "pt" | "es";

type WeeklyRuleWithMessage = {
  days: string[];
  hours: { from: string; to: string }[];
  message?: string;
};

const ES_WORDS = new Set([
  "hola",
  "gracias",
  "buenos",
  "buenas",
  "dias",
  "días",
  "usted",
  "ustedes",
  "señor",
  "señora",
  "yo",
  "muy",
  "bien",
  "aquí",
  "también",
  "tambien",
  "cómo",
  "qué",
  "dónde",
  "cuándo",
  "pero",
  "porque",
  "hacer",
  "hice",
  "hago",
  "tengo",
  "tienes",
  "tiene",
  "necesito",
  "quiero",
  "puedo",
  "puede",
  "ayuda",
  "ayudar",
  "acceso",
  "acceder",
  "correo",
  "contraseña",
  "clases",
  "clase",
  "compré",
  "compre",
  "pagué",
  "mi",
  "mis",
  "el",
  "los",
  "las",
  "una",
  "uno",
  "es",
  "estoy",
  "soy",
  "ya",
  "sí",
  "ahora",
  "entrar",
  "ingresar",
  "nombre",
  "ayúdame",
  "realicé",
  "hecho",
  "nuevo",
  "nueva"
]);

const PT_WORDS = new Set([
  "olá",
  "ola",
  "oi",
  "obrigado",
  "obrigada",
  "você",
  "voce",
  "vocês",
  "voces",
  "não",
  "nao",
  "meu",
  "minha",
  "eu",
  "muito",
  "bom",
  "boa",
  "dia",
  "noite",
  "ajuda",
  "ajudar",
  "acesso",
  "acessar",
  "senha",
  "consigo",
  "preciso",
  "quero",
  "posso",
  "pode",
  "tenho",
  "tem",
  "fazer",
  "fiz",
  "faço",
  "onde",
  "quando",
  "aqui",
  "agora",
  "já",
  "ja",
  "né",
  "pra",
  "estou",
  "sou",
  "comprei",
  "paguei",
  "entrei",
  "aula",
  "aulas",
  "novo",
  "nova",
  "ainda",
  "então",
  "entao",
  "também",
  "tambem",
  "mais"
]);

// palavras iguais nos dois idiomas nao podem pontuar para nenhum lado
const AMBIGUOUS = new Set(
  [...ES_WORDS].filter(w => PT_WORDS.has(w))
);

export function detectLanguage(text: string): AutoMessageLang {
  if (!text) {
    return "pt";
  }
  const lower = text.toLowerCase();
  let esScore = 0;
  let ptScore = 0;

  // sinais ortograficos fortes de cada idioma
  if (/[¿¡]/.test(lower)) esScore += 3;
  if (/ñ/.test(lower)) esScore += 2;
  if (/ção|ções|çã|õe|ã /.test(lower)) ptScore += 2;

  const words = lower.split(/[^a-zà-ÿ¿¡]+/i).filter(w => w.length > 0);
  words.forEach(w => {
    if (AMBIGUOUS.has(w)) return;
    if (ES_WORDS.has(w)) esScore += 1;
    if (PT_WORDS.has(w)) ptScore += 1;
  });

  return esScore > ptScore ? "es" : "pt";
}

// Divide um campo de mensagem em variantes por idioma usando linhas-marcador
// [pt] / [es]. Texto antes de qualquer marcador conta como portugues.
export function pickLanguageVariant(
  text: string,
  lang: AutoMessageLang
): string {
  if (!text) {
    return text;
  }
  const variants: Record<string, string[]> = {};
  let current = "pt";
  let sawMarker = false;

  text.split("\n").forEach(line => {
    const marker = line.trim().match(/^\[(pt|es)\]$/i);
    if (marker) {
      current = marker[1].toLowerCase();
      sawMarker = true;
      return;
    }
    (variants[current] = variants[current] || []).push(line);
  });

  if (!sawMarker) {
    return text;
  }

  const chosen =
    variants[lang]?.join("\n").trim() || variants.pt?.join("\n").trim();
  return chosen || text;
}

// Detecta o idioma do cliente pelas ultimas mensagens recebidas no ticket.
export async function detectTicketLanguage(
  ticketId: number
): Promise<AutoMessageLang> {
  try {
    const messages = await Message.findAll({
      where: { ticketId, fromMe: false },
      order: [["createdAt", "DESC"]],
      limit: 5
    });
    if (!messages.length) {
      return "pt";
    }
    return detectLanguage(messages.map(m => m.body || "").join(" "));
  } catch (err) {
    return "pt";
  }
}

// Mensagem de fora de expediente especifica da regra de horario que cobre o
// dia de hoje (formato novo de horarios, com timezone). Null quando a regra
// do dia nao tem mensagem propria — o chamador cai no campo geral da fila.
export function getTodayOutOfHoursMessage(
  schedules: OpenHoursData | null | undefined
): string | null {
  if (!schedules?.timezone || !Array.isArray(schedules.weeklyRules)) {
    return null;
  }
  const weekday = DateTime.now()
    .setZone(schedules.timezone)
    .toFormat("ccc")
    .toLowerCase()
    .slice(0, 3);

  const rule = (schedules.weeklyRules as WeeklyRuleWithMessage[]).find(
    r => r.days?.includes(weekday) && r.message?.trim()
  );
  return rule?.message?.trim() || null;
}
