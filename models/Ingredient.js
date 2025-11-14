const Sequelize = require("sequelize");
module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    "Ingredient",
    {
      IngredientId: {
        autoIncrement: true,
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
      },
      IngredientName: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      SoLuong: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      PhanLoai: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      ImageURL: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      LastUpdated: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        defaultValue: Sequelize.Sequelize.fn("NOW"),
      },
    },
    {
      sequelize,
      tableName: "Ingredient",

      timestamps: false,
      indexes: [
        {
          name: "PK__Ingredie__BEAEB25AC0862CC6",
          unique: true,
          fields: [{ name: "IngredientId" }],
        },
      ],
    }
  );
};
