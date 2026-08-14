import { QueryInterface, DataTypes } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface) => {
    // guarda quem falou por ultimo na conversa, para a lista destacar
    // os tickets em que estamos esperando o cliente responder
    await queryInterface.addColumn("Tickets", "lastMessageFromMe", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Tickets", "lastMessageFromMe");
  }
};
