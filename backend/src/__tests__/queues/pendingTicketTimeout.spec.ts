import { Op } from "sequelize";

jest.mock("../../models/Ticket", () => ({
  __esModule: true,
  default: { findAll: jest.fn() }
}));

jest.mock("../../services/TicketServices/UpdateTicketService", () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock("../../utils/logger", () => ({
  logger: { trace: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn() }
}));

import Ticket from "../../models/Ticket";
import UpdateTicketService from "../../services/TicketServices/UpdateTicketService";
import { handlePendingTicketTimeout } from "../../queues/pendingTicketTimeout";

const findAll = Ticket.findAll as unknown as jest.Mock;
const updateTicket = UpdateTicketService as unknown as jest.Mock;

describe("handlePendingTicketTimeout", () => {
  beforeEach(() => {
    findAll.mockReset();
    updateTicket.mockReset();
    updateTicket.mockResolvedValue(undefined);
  });

  it("fecha cada ticket pendente que estourou o timeout", async () => {
    findAll.mockResolvedValue([
      { id: 84, queueId: 1, userId: null },
      { id: 86, queueId: 1, userId: null }
    ]);

    await handlePendingTicketTimeout(1, 1440);

    expect(updateTicket).toHaveBeenCalledTimes(2);
    expect(updateTicket).toHaveBeenNthCalledWith(1, {
      ticketId: 84,
      ticketData: { status: "closed", queueId: 1, userId: null },
      companyId: 1
    });
    expect(updateTicket).toHaveBeenNthCalledWith(2, {
      ticketId: 86,
      ticketData: { status: "closed", queueId: 1, userId: null },
      companyId: 1
    });
  });

  it("procura somente pendente individual da empresa parado alem do timeout", async () => {
    findAll.mockResolvedValue([]);
    const antes = Date.now();

    await handlePendingTicketTimeout(7, 60);

    const { where } = findAll.mock.calls[0][0];
    expect(where.status).toBe("pending");
    expect(where.companyId).toBe(7);
    expect(where.isGroup).toBe(false);

    // o corte tem que ficar 60 minutos atras
    const corte = where.updatedAt[Op.lt] as Date;
    const esperado = antes - 60 * 60 * 1000;
    expect(Math.abs(corte.getTime() - esperado)).toBeLessThan(5000);
  });

  it("nao mexe em nada quando o timeout esta zerado", async () => {
    await handlePendingTicketTimeout(1, 0);

    expect(findAll).not.toHaveBeenCalled();
    expect(updateTicket).not.toHaveBeenCalled();
  });

  it("segue para os demais tickets quando um deles falha", async () => {
    findAll.mockResolvedValue([
      { id: 10, queueId: 2, userId: null },
      { id: 11, queueId: 3, userId: null }
    ]);
    updateTicket.mockRejectedValueOnce(new Error("falhou"));

    await handlePendingTicketTimeout(1, 30);

    expect(updateTicket).toHaveBeenCalledTimes(2);
  });
});
