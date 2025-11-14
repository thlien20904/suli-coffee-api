const Sequelize = require("sequelize");
module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    "OrderDetails_Topping",
    {
      OrderDetailsToppingID: {
        autoIncrement: true,
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
      },
      OrderDetailId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "OrderDetails",
          key: "OrderDetailId",
        },
      },
      ToppingId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "Topping",
          key: "ToppingID",
        },
      },
    },
    {
      sequelize,
      tableName: "OrderDetails_Topping",

      timestamps: false,
      indexes: [
        {
          name: "PK__OrderDet__632B70CEDF1846AB",
          unique: true,
          fields: [{ name: "OrderDetailsToppingID" }],
        },
      ],
    }
  );
};
