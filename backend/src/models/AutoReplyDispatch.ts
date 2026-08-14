import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo
} from "sequelize-typescript";

import AutoReplyRule from "./AutoReplyRule";
import Company from "./Company";
import Ticket from "./Ticket";

// Registro de que uma regra ja disparou numa conversa. Garante o limite de
// uma vez por conversa por regra e serve de auditoria de quem recebeu o que.
@Table({ tableName: "AutoReplyDispatches" })
class AutoReplyDispatch extends Model<AutoReplyDispatch> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Ticket)
  @Column
  ticketId: number;

  @BelongsTo(() => Ticket)
  ticket: Ticket;

  @ForeignKey(() => AutoReplyRule)
  @Column
  ruleId: number;

  @BelongsTo(() => AutoReplyRule)
  rule: AutoReplyRule;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AutoReplyDispatch;
