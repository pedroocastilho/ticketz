// Nota que a Inteligencia Comercial (cerebro dos Diamond Agentes) deu ao lead,
// gravada nas "Informacoes adicionais" do contato. O vendedor ve no painel do
// contato e a lista de atendimentos mostra a etiqueta "78 · Quente" a partir
// destes mesmos campos (frontend: components/NotaIaBadge).

export const CAMPOS_IA = {
  nota: "Nota IA",
  temperatura: "Temperatura IA",
  proximoPasso: "Próximo passo IA",
  resumo: "Resumo IA",
  analisadoEm: "Analisado pela IA"
} as const;

const TEMPERATURAS: Record<string, string> = {
  quente: "Quente",
  morno: "Morno",
  frio: "Frio"
};

export type EntradaNotaIa = {
  nota: unknown;
  temperatura: unknown;
  proximoPasso?: unknown;
  resumo?: unknown;
  analisadoEm?: unknown;
};

// ContactCustomFields.value e varchar(255): corta antes, senao o insert falha
const texto = (v: unknown, max: number): string =>
  typeof v === "string"
    ? v.replace(/\s+/g, " ").trim().slice(0, Math.min(max, 255))
    : "";

// Valida o corpo e devolve os campos prontos (nome e valor). null = invalido
export const camposNotaIa = (
  e: EntradaNotaIa
): { name: string; value: string }[] | null => {
  const nota = Number(e.nota);
  const temperatura =
    TEMPERATURAS[String(e.temperatura ?? "").toLowerCase()] ?? null;
  if (!Number.isInteger(nota) || nota < 0 || nota > 100 || !temperatura) {
    return null;
  }
  const quando = new Date(String(e.analisadoEm ?? ""));
  const analisadoEm = Number.isNaN(quando.getTime()) ? new Date() : quando;
  const dataBr = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(analisadoEm);
  return [
    { name: CAMPOS_IA.nota, value: String(nota) },
    { name: CAMPOS_IA.temperatura, value: temperatura },
    { name: CAMPOS_IA.proximoPasso, value: texto(e.proximoPasso, 500) },
    { name: CAMPOS_IA.resumo, value: texto(e.resumo, 1000) },
    { name: CAMPOS_IA.analisadoEm, value: dataBr }
  ];
};
