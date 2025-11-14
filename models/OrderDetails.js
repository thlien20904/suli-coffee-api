const Sequelize = require("sequelize");
module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    "OrderDetails",
    {
      OrderDetailId: {
        autoIncrement: true,
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
      },
      OrderId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "Orders",
          key: "OrderId",
        },
      },
      FoodId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "Food",
          key: "FoodId",
        },
      },
      SizeId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "Size",
          key: "SizeID",
        },
      },
      ToppingId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "Topping",
          key: "ToppingID",
        },
      },
      Quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      Price: {
        type: DataTypes.DECIMAL(18, 3),
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: "OrderDetails",

      timestamps: false,
      indexes: [
        {
          name: "PK__OrderDet__D3B9D36C4C1337EE",
          unique: true,
          fields: [{ name: "OrderDetailId" }],
        },
      ],
    }
  );
};
