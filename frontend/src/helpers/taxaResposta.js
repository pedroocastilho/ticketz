// Taxa de resposta do vendedor no painel do comercial (2026-11-09, pedido da
// Bia): respondidos / clientes que escreveram, em %. Cor para ler rapido quem
// deixa cliente no vacuo: verde a partir de 90%, laranja de 70% a 89,9%,
// vermelho abaixo de 70%.

export const corTaxaResposta = taxa => {
  if (taxa === null || taxa === undefined) return undefined;
  if (taxa >= 90) return "#2e7d32";
  if (taxa >= 70) return "#ef6c00";
  return "#c62828";
};

export const textoTaxa = taxa =>
  taxa === null || taxa === undefined
    ? "-"
    : `${String(taxa).replace(".", ",")}%`;
