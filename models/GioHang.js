const Sequelize = require("sequelize");
module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    "GioHang",
    {
      GioHangID: {
        autoIncrement: true,
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
      },
      Id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "Users",
          key: "Id",
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
      SoLuong: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      SizeID: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "Size",
          key: "SizeID",
        },
      },
      TotalPrice: {
        type: DataTypes.DECIMAL(18, 3),
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: "GioHang",

      timestamps: false,
      indexes: [
        {
          name: "PK__GioHang__4242280D045C4E00",
          unique: true,
          fields: [{ name: "GioHangID" }],
        },
      ],
    }
  );
};
