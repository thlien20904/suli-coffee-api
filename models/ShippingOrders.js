const Sequelize = require("sequelize");
module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    "ShippingOrders",
    {
      ShippingOrderId: {
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
      ShopId: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      GHNOrderCode: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      Status: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      Fee: {
        type: DataTypes.DECIMAL(18, 3),
        allowNull: true,
      },
      COD: {
        type: DataTypes.DECIMAL(18, 3),
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: "ShippingOrders",

      timestamps: true,
      indexes: [
        {
          name: "PK__Shipping__6636D675205740A4",
          unique: true,
          fields: [{ name: "ShippingOrderId" }],
        },
      ],
    }
  );
};
