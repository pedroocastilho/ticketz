// Trava de ENVIO do lead de outro vendedor (09/11/2026, caso Alaide #2077: no
// lancamento a Jackeline mandou mensagem pela conversa antiga dela para uma
// cliente da Isabela, e a cliente acabou falando com 4 vendedores).
//
// A trava de dono (TravaDonoService) so barrava COMECAR conversa. Esta barra o
// vendedor (perfil user) de MANDAR mensagem, pelo Ticketz, numa conversa de um
// lead da aba do lancamento que tem outro dono. Vale so quando o CRM responde
// um dono (= no periodo do lancamento, cartao aberto com dono ativo na aba).
//
// Fica liberado (nunca pode travar quem deve atender):
//   - a conversa ja esta no numero do dono (quem a gestao pos nela atende);
//   - o vendedor e o dono (o numero do dono e de uma fila dele);
//   - o numero do dono esta desconectado (a conversa nao tem para onde ir);
//   - a conversa mudou de numero ha pouco (transferencia ou fila Livres: o CRM
//     ainda esta trocando o dono);
//   - o CRM nao respondeu (o comercial nao para).
// Ligada por TRAVA_DONO_ENVIO=1 (desligar = tirar a variavel e reiniciar).

interface TravaEnvioEnv {
  TRAVA_DONO_ENVIO?: string;
  [key: string]: string | undefined;
}

export const isTravaEnvioEnabled = (
  env: TravaEnvioEnv = process.env
): boolean =>
  ["1", "true", "sim"].includes(
    String(env.TRAVA_DONO_ENVIO || "")
      .trim()
      .toLowerCase()
  );

export const podeEnviarNaConversa = (d: {
  temDono: boolean;
  conexaoDoDono: number | null;
  conexaoDaConversa: number | null;
  conexaoDoDonoConectada: boolean;
  usuarioEhDono: boolean;
  movidaHaPouco: boolean;
}): boolean => {
  if (!d.temDono || !d.conexaoDoDono) return true;
  if (d.conexaoDaConversa === d.conexaoDoDono) return true;
  if (d.usuarioEhDono) return true;
  if (!d.conexaoDoDonoConectada) return true;
  if (d.movidaHaPouco) return true;
  return false;
};

// conversas que mudaram de numero ha pouco (memoria do processo; reiniciar o
// backend so esquece, o que libera: nunca trava a mais)
const JANELA_MOVIDA_MS = 10 * 60 * 1000;
const movidas = new Map<number, number>();

export const marcarConversaMovida = (
  ticketId: number,
  agora: number = Date.now()
): void => {
  movidas.set(Number(ticketId), agora);
  // limpeza simples para o mapa nao crescer
  if (movidas.size > 5000) {
    movidas.forEach((quando, id) => {
      if (agora - quando > JANELA_MOVIDA_MS) movidas.delete(id);
    });
  }
};

export const conversaMovidaHaPouco = (
  ticketId: number,
  agora: number = Date.now()
): boolean => {
  const quando = movidas.get(Number(ticketId));
  return quando !== undefined && agora - quando <= JANELA_MOVIDA_MS;
};
