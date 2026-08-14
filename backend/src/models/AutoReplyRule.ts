import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  Default,
  ForeignKey,
  BelongsTo,
  DataType
} from "sequelize-typescript";

import Company from "./Company";
import Queue from "./Queue";
import Whatsapp from "./Whatsapp";

// Regra de resposta automatica: quando uma mensagem recebida contem uma das
// palavras cadastradas, o sistema responde sozinho depois de alguns segundos.
@Table({ tableName: "AutoReplyRules" })
class AutoReplyRule extends Model<AutoReplyRule> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  name: string;

  @Default(true)
  @Column
  active: boolean;

  // vazio = vale para todas as conexoes
  @ForeignKey(() => Whatsapp)
  @Column
  whatsappId: number;

  @BelongsTo(() => Whatsapp)
  whatsapp: Whatsapp;

  // vazio = vale para todas as filas
  @ForeignKey(() => Queue)
  @Column
  queueId: number;

  @BelongsTo(() => Queue)
  queue: Queue;

  // termos que disparam a regra, separados por virgula
  @Column(DataType.TEXT)
  keywords: string;

  @Default(10)
  @Column
  delaySeconds: number;

  @Column(DataType.TEXT)
  message: string;

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

export default AutoReplyRule;
