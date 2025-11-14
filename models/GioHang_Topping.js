const Sequelize = require("sequelize");
module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    "GioHang_Topping",
    {
      GioHangToppingID: {
        autoIncrement: true,
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
      },
      GioHangID: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "GioHang",
          key: "GioHangID",
        },
      },
      ToppingID: {
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
      tableName: "GioHang_Topping",

      timestamps: false,
      indexes: [
        {
          name: "PK__GioHang___0A7C5B6DD4A9BA27",
          unique: true,
          fields: [{ name: "GioHangToppingID" }],
        },
      ],
    }
  );
};
