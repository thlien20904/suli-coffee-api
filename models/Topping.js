const Sequelize = require("sequelize");
module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    "Topping",
    {
      ToppingID: {
        autoIncrement: true,
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
      },
      ToppingName: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      ToppingPrice: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: "Topping",

      timestamps: false,
      indexes: [
        {
          name: "PK__Topping__EE02CCE58857E9A3",
          unique: true,
          fields: [{ name: "ToppingID" }],
        },
      ],
    }
  );
};
