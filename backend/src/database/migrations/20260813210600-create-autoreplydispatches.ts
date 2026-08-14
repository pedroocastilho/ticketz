import { QueryInterface, DataTypes } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("AutoReplyDispatches", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      ticketId: {
        type: DataTypes.INTEGER,
        references: { model: "Tickets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: false
      },
      ruleId: {
        type: DataTypes.INTEGER,
        references: { model: "AutoReplyRules", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: false
      },
      companyId: {
        type: DataTypes.INTEGER,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: false
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false
      }
    });

    // uma regra dispara no maximo uma vez por conversa
    await queryInterface.addConstraint("AutoReplyDispatches", {
      fields: ["ticketId", "ruleId"],
      type: "unique",
      name: "uniq_autoreplydispatches_ticket_rule"
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AutoReplyDispatches");
  }
};
