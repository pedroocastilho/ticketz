// Transferencia feita por uma pessoa (gestao ou vendedor) para o numero de outro
// vendedor: o CRM passa o dono do lead para o dono do numero novo, com o mesmo
// evento "dono" de quem puxa conversa da fila Livres (o n8n descobre o dono pela
// conexao da conversa). Sem isso o CRM continuava com o dono antigo e a regra da
// Black (lead com dono que fala no numero de outro vendedor vai para o dono)
// devolvia a conversa ao dono antigo a cada mensagem do cliente (07/11/2026).
//
// Fica de fora:
//   - movimento feito pela automacao (sem pessoa: conversa-para-dono, robos);
//   - puxar da fila Livres (ja avisa o CRM pelo proprio caminho);
//   - grupo (nao e lead);
//   - so trocar a fila sem trocar o numero (o dono no CRM sai do numero);
//   - mandar para a fila Livres (ninguem e dono ainda: quem puxar vira dono).

interface Transferencia {
  feitaPorPessoa: boolean;
  puxouDaFilaLivre: boolean;
  isGroup: boolean;
  conexaoAntes: number | null | undefined;
  conexaoDepois: number | null | undefined;
  filaDepois: string | null | undefined;
  nomeLivres: string;
}

export const avisarDonoNaTransferencia = ({
  feitaPorPessoa,
  puxouDaFilaLivre,
  isGroup,
  conexaoAntes,
  conexaoDepois,
  filaDepois,
  nomeLivres
}: Transferencia): boolean =>
  feitaPorPessoa &&
  !puxouDaFilaLivre &&
  !isGroup &&
  !!conexaoDepois &&
  conexaoDepois !== conexaoAntes &&
  (filaDepois || "") !== nomeLivres;
