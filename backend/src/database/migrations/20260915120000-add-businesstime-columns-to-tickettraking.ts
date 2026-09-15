import { QueryInterface, DataTypes } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface) => {
    // tempos de espera e atendimento contando so o expediente da fila
    // (calculados em helpers/businessSeconds.ts; nulos ate o aceite)
    await queryInterface.addColumn("TicketTraking", "waitTimeBusiness", {
      type: DataTypes.INTEGER,
      allowNull: true
    });
    await queryInterface.addColumn("TicketTraking", "serviceTimeBusiness", {
      type: DataTypes.INTEGER,
      allowNull: true
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("TicketTraking", "serviceTimeBusiness");
    await queryInterface.removeColumn("TicketTraking", "waitTimeBusiness");
  }
};
