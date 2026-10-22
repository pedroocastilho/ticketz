import React from "react";
import { Tooltip } from "@material-ui/core";

// Etiqueta com a nota que a Inteligencia Comercial (cerebro dos Diamond
// Agentes) deu ao lead: "78 · Quente". Le os campos "Nota IA",
// "Temperatura IA" e "Próximo passo IA" das informacoes adicionais do contato,
// gravados pelo cerebro (backend: POST /crm/ia-contato). Sem nota, nao mostra
// nada. Passar o mouse mostra o proximo passo e quando foi a analise.
const CORES = {
  Quente: { fundo: "#fbe9e8", texto: "#ad2a22", borda: "#f2c4c0" },
  Morno: { fundo: "#fbf0dc", texto: "#7d4e03", borda: "#efd7a8" },
  Frio: { fundo: "#e6eefb", texto: "#1c54ab", borda: "#c3d4f2" }
};

const campo = (contact, nome) =>
  contact?.extraInfo?.find(info => info.name === nome)?.value || "";

const NotaIaBadge = ({ contact, style }) => {
  const nota = campo(contact, "Nota IA");
  const temperatura = campo(contact, "Temperatura IA");
  if (!nota || !CORES[temperatura]) return null;
  const cor = CORES[temperatura];
  const proximoPasso = campo(contact, "Próximo passo IA");
  const quando = campo(contact, "Analisado pela IA");
  const dica = [
    `Nota da IA: ${nota} (${temperatura.toLowerCase()})`,
    proximoPasso && `Próximo passo: ${proximoPasso}`,
    quando && `Analisado em ${quando}`
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <Tooltip title={<span style={{ whiteSpace: "pre-line" }}>{dica}</span>}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          marginLeft: 6,
          padding: "0 6px",
          borderRadius: 4,
          border: `1px solid ${cor.borda}`,
          background: cor.fundo,
          color: cor.texto,
          fontSize: 11,
          fontWeight: 700,
          lineHeight: "18px",
          verticalAlign: "middle",
          whiteSpace: "nowrap",
          ...style
        }}
      >
        {nota} · {temperatura}
      </span>
    </Tooltip>
  );
};

export default NotaIaBadge;
