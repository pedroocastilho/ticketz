import { QueryInterface, DataTypes } from "sequelize";

// Opcao de menu que encerra o atendimento depois de enviar o texto. Serve para
// o fim de um fluxo de bot ("sua duvida foi resolvida" ou "fale com a equipe
// neste link"), em que nao sobra nada para um atendente fazer.
export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("QueueOptions", "closeTicket", {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("QueueOptions", "closeTicket");
  }
};
