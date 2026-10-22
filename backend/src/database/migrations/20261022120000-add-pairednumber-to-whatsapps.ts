import { QueryInterface, DataTypes } from "sequelize";

// Numero de WhatsApp pareado em cada conexao (so digitos, com DDI). Gravado a
// cada conexao aberta: quando volta OUTRO numero, o CRM recebe o aviso de
// troca (tela "Meu numero", vendedor conectando o proprio numero).
export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Whatsapps", "pairedNumber", {
      type: DataTypes.STRING,
      allowNull: true
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Whatsapps", "pairedNumber");
  }
};
