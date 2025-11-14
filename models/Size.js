const Sequelize = require("sequelize");
module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    "Size",
    {
      SizeID: {
        autoIncrement: true,
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
      },
      SizeName: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      ExtraPrice: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: "Size",

      timestamps: false,
      indexes: [
        {
          name: "PK__Size__83BD095A4E05AD03",
          unique: true,
          fields: [{ name: "SizeID" }],
        },
      ],
    }
  );
};
