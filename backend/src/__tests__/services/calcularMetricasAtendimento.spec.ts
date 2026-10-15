import {
  calcularMetricasAtendimento,
  MensagemMetrica,
  TicketMetrica
} from "../../services/CrmServices/calcularMetricasAtendimento";
import { OpenHoursData } from "../../helpers/checkOpenHours";

// 8h as 19h, segunda a sabado, horario de Brasilia (UTC-3)
const horario: OpenHoursData = {
  timezone: "America/Sao_Paulo",
  weeklyRules: [
    {
      days: ["mon", "tue", "wed", "thu", "fri", "sat"],
      hours: [{ from: "08:00", to: "19:00" }]
    }
  ],
  overrides: []
};

// hora local de Brasilia -> Date (15/10/2026 e quinta-feira)
const br = (dia: string, hora: string) =>
  new Date(`2026-10-${dia}T${hora}:00-03:00`);

const cliente = (ticketId: number, em: Date): MensagemMetrica => ({
  ticketId,
  fromMe: false,
  createdAt: em
});
const vendedor = (
  ticketId: number,
  em: Date,
  automatica = false
): MensagemMetrica => ({ ticketId, fromMe: true, createdAt: em, automatica });

const ticket = (
  id: number,
  primeiraMsgEm: Date,
  whatsappId = 9,
  status = "open"
): TicketMetrica => ({ id, whatsappId, status, primeiraMsgEm });

const opcoes = {
  de: "2026-10-15",
  ate: "2026-10-15",
  agora: br("15", "18:00"),
  horario
};

const doDia = (r, conexaoId = 9, data = "2026-10-15") =>
  r.dias.find(d => d.conexaoId === conexaoId && d.data === data);

describe("calcularMetricasAtendimento", () => {
  it("conta recebidas, respondidas, sem resposta e tempo da primeira resposta", () => {
    const r = calcularMetricasAtendimento(
      [
        cliente(1, br("15", "10:00")),
        vendedor(1, br("15", "10:15")),
        cliente(2, br("15", "11:00")),
        vendedor(2, br("15", "11:05")),
        cliente(3, br("15", "12:00"))
      ],
      [
        ticket(1, br("15", "10:00")),
        ticket(2, br("15", "11:00")),
        ticket(3, br("15", "12:00"))
      ],
      opcoes
    );
    const d = doDia(r);
    expect(d.conversasRecebidas).toBe(3);
    expect(d.conversasRespondidas).toBe(2);
    expect(d.conversasSemResposta).toBe(1);
    expect(d.primeiraRespostaQtd).toBe(2);
    expect(d.primeiraRespostaMediaSeg).toBe(10 * 60);
    expect(d.mensagensRecebidas).toBe(3);
    expect(d.mensagensEnviadas).toBe(2);
    // a 3 esta esperando desde 12h: 6 horas as 18h
    expect(r.agora[0].aguardando).toBe(1);
    expect(r.agora[0].maiorEsperaSeg).toBe(6 * 3600);
  });

  it("mensagem fora do expediente so conta o tempo dentro do horario", () => {
    const r = calcularMetricasAtendimento(
      [cliente(1, br("14", "23:00")), vendedor(1, br("15", "08:10"))],
      [ticket(1, br("14", "23:00"))],
      { ...opcoes, de: "2026-10-14", ate: "2026-10-15" }
    );
    const d = doDia(r, 9, "2026-10-14");
    expect(d.conversasRespondidas).toBe(1);
    expect(d.primeiraRespostaMediaSeg).toBe(10 * 60);
  });

  it("resposta automatica nao conta como resposta do vendedor", () => {
    const r = calcularMetricasAtendimento(
      [
        cliente(1, br("15", "10:00")),
        // saudacao do bot logo em seguida
        vendedor(1, new Date(br("15", "10:00").getTime() + 2000)),
        // mensagem marcada pelo Ticketz como automatica
        vendedor(1, br("15", "10:05"), true),
        vendedor(1, br("15", "10:30"))
      ],
      [ticket(1, br("15", "10:00"))],
      opcoes
    );
    const d = doDia(r);
    expect(d.mensagensEnviadas).toBe(1);
    expect(d.primeiraRespostaMediaSeg).toBe(30 * 60);
  });

  it("varias mensagens seguidas do cliente abrem uma espera so", () => {
    const r = calcularMetricasAtendimento(
      [
        cliente(1, br("15", "10:00")),
        cliente(1, br("15", "10:02")),
        cliente(1, br("15", "10:04")),
        vendedor(1, br("15", "10:20")),
        cliente(1, br("15", "11:00")),
        vendedor(1, br("15", "11:04"))
      ],
      [ticket(1, br("15", "10:00"))],
      opcoes
    );
    const d = doDia(r);
    expect(d.conversasRecebidas).toBe(1);
    expect(d.respostaQtd).toBe(2);
    expect(d.respostaMediaSeg).toBe(12 * 60);
    expect(d.primeiraRespostaQtd).toBe(1);
    expect(d.primeiraRespostaMediaSeg).toBe(20 * 60);
  });

  it("conversa aberta pelo vendedor conta como iniciada e nao como primeira resposta", () => {
    const r = calcularMetricasAtendimento(
      [
        vendedor(1, br("15", "09:00")),
        cliente(1, br("15", "09:30")),
        vendedor(1, br("15", "09:40"))
      ],
      [ticket(1, br("15", "09:00"))],
      opcoes
    );
    const d = doDia(r);
    expect(d.conversasIniciadasVendedor).toBe(1);
    expect(d.primeiraRespostaQtd).toBe(0);
    expect(d.respostaQtd).toBe(1);
    expect(d.respostaMediaSeg).toBe(10 * 60);
  });

  it("separa por conexao e ignora conversa encerrada em aguardando", () => {
    const r = calcularMetricasAtendimento(
      [cliente(1, br("15", "10:00")), cliente(2, br("15", "10:00"))],
      [
        ticket(1, br("15", "10:00"), 9),
        ticket(2, br("15", "10:00"), 10, "closed")
      ],
      opcoes
    );
    expect(doDia(r, 9).conversasSemResposta).toBe(1);
    expect(doDia(r, 10).conversasSemResposta).toBe(1);
    expect(r.agora.map(a => a.conexaoId)).toEqual([9]);
  });

  it("dia fora do periodo nao aparece", () => {
    const r = calcularMetricasAtendimento(
      [cliente(1, br("13", "10:00")), vendedor(1, br("13", "10:10"))],
      [ticket(1, br("13", "10:00"))],
      opcoes
    );
    expect(r.dias).toEqual([]);
  });
});
