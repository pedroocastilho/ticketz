import { conversasPorContato } from "../../services/CrmServices/MetricasAtendimentoService";
import { contatosDosNumeros } from "../../controllers/CrmMetricasController";

// hora local de Brasilia -> Date
const br = (dia: string, hora: string) =>
  new Date(`2026-10-${dia}T${hora}:00-03:00`);

describe("metricas so dos numeros pedidos (painel do Formulario Jessica)", () => {
  it("numero BR casa com e sem o nono digito; lixo e repetido ficam de fora", () => {
    expect(
      contatosDosNumeros([
        "+55 (11) 98765-4321",
        "5511987654321",
        "",
        null,
        "12"
      ])
    ).toEqual(["5511987654321", "551187654321"]);
    expect(contatosDosNumeros(["551187654321"])).toEqual([
      "551187654321",
      "5511987654321"
    ]);
  });

  it("um registro por contato, conexao e dia; mensagem automatica e fora do periodo nao contam", () => {
    const tickets = [
      { id: 1, whatsappId: 9, contactId: 100 },
      { id: 2, whatsappId: 9, contactId: 100 },
      { id: 3, whatsappId: 10, contactId: 200 }
    ];
    const mensagens = [
      { ticketId: 1, fromMe: false, createdAt: br("27", "10:00") },
      { ticketId: 1, fromMe: true, createdAt: br("27", "10:05") },
      // outro ticket do mesmo contato no mesmo dia: continua um so
      { ticketId: 2, fromMe: false, createdAt: br("27", "15:00") },
      { ticketId: 1, fromMe: false, createdAt: br("28", "09:00") },
      // so automatica: nao e conversa
      {
        ticketId: 3,
        fromMe: true,
        createdAt: br("27", "11:00"),
        automatica: true
      },
      // antes do periodo
      { ticketId: 3, fromMe: false, createdAt: br("20", "11:00") },
      // 23h30 de Brasilia do dia 28 ainda e dia 28 (02h30 UTC do dia 29)
      { ticketId: 3, fromMe: false, createdAt: br("28", "23:30") }
    ];
    const r = conversasPorContato(
      mensagens,
      tickets,
      "2026-10-27",
      "2026-10-28",
      "America/Sao_Paulo"
    );
    expect(r).toEqual([
      { contatoId: 100, conexaoId: 9, data: "2026-10-27" },
      { contatoId: 100, conexaoId: 9, data: "2026-10-28" },
      { contatoId: 200, conexaoId: 10, data: "2026-10-28" }
    ]);
  });
});
