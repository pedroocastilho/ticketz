import {
  agruparPorContato,
  ContatoComAtividade,
  ehMensagemAutomatica,
  LinhaTicketAtividade,
  lerLimite,
  mediaUrlAbsoluta,
  montarMensagemHistorico,
  paginarContatos,
  selecionarMaisRecentes
} from "../../services/CrmServices/conversasCrm";

const em = (hora: string) => new Date(`2026-10-22T${hora}:00.000Z`);

const ticket = (
  extra: Partial<LinhaTicketAtividade> & {
    ticketId: number;
    contactId: number;
    ultimaMensagemEm: Date;
  }
): LinhaTicketAtividade => ({
  ticketUuid: `uuid-${extra.ticketId}`,
  nome: `Contato ${extra.contactId}`,
  numero: `55119${extra.contactId}`,
  whatsappId: 1,
  whatsappNome: "Vendedor 1",
  userId: null,
  userNome: null,
  ultimaFromMe: false,
  novas: 1,
  ...extra
});

describe("agruparPorContato", () => {
  it("um item por contato, com o ticket da mensagem mais recente e novas somadas", () => {
    const r = agruparPorContato([
      ticket({
        ticketId: 1,
        contactId: 10,
        ultimaMensagemEm: em("10:00"),
        novas: 3
      }),
      ticket({
        ticketId: 2,
        contactId: 10,
        ultimaMensagemEm: em("11:00"),
        novas: 2,
        whatsappId: 7,
        whatsappNome: "Vendedor 7",
        userId: 4,
        userNome: "Ana",
        ultimaFromMe: true
      }),
      ticket({ ticketId: 3, contactId: 20, ultimaMensagemEm: em("09:00") })
    ]);

    expect(r).toEqual([
      expect.objectContaining({ contactId: 20, ticketId: 3, novas: 1 }),
      {
        contactId: 10,
        nome: "Contato 10",
        numero: "5511910",
        ticketId: 2,
        ticketUuid: "uuid-2",
        whatsappId: 7,
        whatsappNome: "Vendedor 7",
        userId: 4,
        userNome: "Ana",
        ultimaMensagemEm: "2026-10-22T11:00:00.000Z",
        ultimaDoCliente: false,
        novas: 5
      }
    ]);
  });

  it("ultimaDoCliente quando a ultima mensagem nao e nossa", () => {
    const [c] = agruparPorContato([
      ticket({ ticketId: 1, contactId: 10, ultimaMensagemEm: em("10:00") })
    ]);
    expect(c.ultimaDoCliente).toBe(true);
  });

  it("ordena por ultima mensagem e desempata pelo contactId", () => {
    const r = agruparPorContato([
      ticket({ ticketId: 1, contactId: 30, ultimaMensagemEm: em("10:00") }),
      ticket({ ticketId: 2, contactId: 20, ultimaMensagemEm: em("10:00") }),
      ticket({ ticketId: 3, contactId: 10, ultimaMensagemEm: em("12:00") })
    ]);
    expect(r.map(c => c.contactId)).toEqual([20, 30, 10]);
  });
});

const contato = (contactId: number, hora: string): ContatoComAtividade => ({
  contactId,
  nome: null,
  numero: null,
  ticketId: contactId,
  ticketUuid: "u",
  whatsappId: 1,
  whatsappNome: null,
  userId: null,
  userNome: null,
  ultimaMensagemEm: em(hora).toISOString(),
  ultimaDoCliente: true,
  novas: 1
});

describe("paginarContatos", () => {
  it("sem corte: tudo e cursor null", () => {
    const lista = [contato(1, "10:00"), contato(2, "11:00")];
    expect(paginarContatos(lista, 2)).toEqual({
      contatos: lista,
      proximoCursor: null
    });
  });

  it("com corte: cursor = ultima mensagem do ultimo devolvido", () => {
    const lista = [
      contato(1, "10:00"),
      contato(2, "11:00"),
      contato(3, "12:00")
    ];
    const r = paginarContatos(lista, 2);
    expect(r.contatos.map(c => c.contactId)).toEqual([1, 2]);
    expect(r.proximoCursor).toBe("2026-10-22T11:00:00.000Z");
  });

  it("nao divide contatos empatados no horario do corte", () => {
    const lista = [
      contato(1, "10:00"),
      contato(2, "11:00"),
      contato(3, "11:00"),
      contato(4, "12:00")
    ];
    const r = paginarContatos(lista, 2);
    expect(r.contatos.map(c => c.contactId)).toEqual([1]);
    expect(r.proximoCursor).toBe("2026-10-22T10:00:00.000Z");
  });

  it("pagina toda no mesmo horario: leva todos os empatados", () => {
    const lista = [
      contato(1, "11:00"),
      contato(2, "11:00"),
      contato(3, "11:00"),
      contato(4, "12:00")
    ];
    const r = paginarContatos(lista, 2);
    expect(r.contatos.map(c => c.contactId)).toEqual([1, 2, 3]);
    expect(r.proximoCursor).toBe("2026-10-22T11:00:00.000Z");
  });

  it("empatados ate o fim da lista: cursor null", () => {
    const lista = [
      contato(1, "11:00"),
      contato(2, "11:00"),
      contato(3, "11:00")
    ];
    const r = paginarContatos(lista, 2);
    expect(r.contatos).toHaveLength(3);
    expect(r.proximoCursor).toBeNull();
  });
});

describe("selecionarMaisRecentes", () => {
  const msg = (id: string, hora: string) => ({ id, createdAt: em(hora) });

  it("fica com as mais recentes, em ordem de envio", () => {
    // chega do banco da mais nova para a mais antiga
    const r = selecionarMaisRecentes(
      [
        msg("d", "13:00"),
        msg("c", "12:00"),
        msg("b", "11:00"),
        msg("a", "10:00")
      ],
      2
    );
    expect(r.itens.map(m => m.id)).toEqual(["c", "d"]);
    expect(r.truncado).toBe(true);
  });

  it("sem passar do limite devolve tudo", () => {
    const r = selecionarMaisRecentes([msg("b", "11:00"), msg("a", "10:00")], 5);
    expect(r.itens.map(m => m.id)).toEqual(["a", "b"]);
    expect(r.truncado).toBe(false);
  });

  it("empate de horario desempata pelo id", () => {
    const r = selecionarMaisRecentes([msg("y", "10:00"), msg("x", "10:00")], 5);
    expect(r.itens.map(m => m.id)).toEqual(["x", "y"]);
  });
});

describe("ehMensagemAutomatica", () => {
  it("marcador invisivel no comeco = automatica", () => {
    expect(ehMensagemAutomatica("‎Bom dia! Em que posso ajudar?")).toBe(true);
  });

  it("mensagem normal, marcador no meio ou vazia nao e", () => {
    expect(ehMensagemAutomatica("Bom dia")).toBe(false);
    expect(ehMensagemAutomatica("Oi ‎")).toBe(false);
    expect(ehMensagemAutomatica("")).toBe(false);
    expect(ehMensagemAutomatica(null)).toBe(false);
  });
});

describe("mediaUrlAbsoluta", () => {
  it("arquivo local vira BACKEND_URL/public com o nome codificado", () => {
    expect(mediaUrlAbsoluta("1/foto do cliente.jpg", "https://api.x.com")).toBe(
      "https://api.x.com/public/1/foto%20do%20cliente.jpg"
    );
  });

  it("link absoluto fica como esta (codificado)", () => {
    expect(
      mediaUrlAbsoluta("https://cdn.x.com/a b.mp3", "https://api.x.com")
    ).toBe("https://cdn.x.com/a%20b.mp3");
  });

  it("sem midia = null", () => {
    expect(mediaUrlAbsoluta(null, "https://api.x.com")).toBeNull();
    expect(mediaUrlAbsoluta("", "https://api.x.com")).toBeNull();
  });
});

describe("montarMensagemHistorico", () => {
  it("monta a mensagem com automatica e mediaUrl absoluta", () => {
    expect(
      montarMensagemHistorico(
        {
          id: "ABC",
          fromMe: true,
          body: "‎Fora do expediente",
          mediaType: "audio",
          mediaUrl: "audio.ogg",
          createdAt: em("10:00"),
          ticketId: 5,
          whatsappId: 2
        },
        "https://api.x.com"
      )
    ).toEqual({
      id: "ABC",
      fromMe: true,
      body: "‎Fora do expediente",
      mediaType: "audio",
      mediaUrl: "https://api.x.com/public/audio.ogg",
      createdAt: "2026-10-22T10:00:00.000Z",
      ticketId: 5,
      whatsappId: 2,
      automatica: true
    });
  });
});

describe("lerLimite", () => {
  it("vazio = padrao, acima do maximo = maximo", () => {
    expect(lerLimite(undefined, 200, 500)).toBe(200);
    expect(lerLimite("", 200, 500)).toBe(200);
    expect(lerLimite("50", 200, 500)).toBe(50);
    expect(lerLimite("9999", 200, 500)).toBe(500);
  });

  it("invalido = null", () => {
    expect(lerLimite("0", 200, 500)).toBeNull();
    expect(lerLimite("-3", 200, 500)).toBeNull();
    expect(lerLimite("2.5", 200, 500)).toBeNull();
    expect(lerLimite("abc", 200, 500)).toBeNull();
  });
});
