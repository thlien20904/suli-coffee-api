const Sequelize = require("sequelize");
module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    "OrderStatus",
    {
      StatusId: {
        autoIncrement: true,
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
      },
      StatusName: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: "UQ__OrderSta__05E7698A0F60EE2E",
      },
    },
    {
      sequelize,
      tableName: "OrderStatus",

      timestamps: false,
      indexes: [
        {
          name: "PK__OrderSta__C8EE2063EAB9BEEC",
          unique: true,
          fields: [{ name: "StatusId" }],
        },
        {
          name: "UQ__OrderSta__05E7698A0F60EE2E",
          unique: true,
          fields: [{ name: "StatusName" }],
        },
      ],
    }
  );
};
