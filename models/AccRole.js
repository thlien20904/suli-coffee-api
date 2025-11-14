const Sequelize = require("sequelize");
module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    "AccRole",
    {
      RoleId: {
        autoIncrement: true,
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
      },
      RoleName: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: "AccRole",

      timestamps: false,
      indexes: [
        {
          name: "PK__AccRole__8AFACE1A0D79BB92",
          unique: true,
          fields: [{ name: "RoleId" }],
        },
      ],
    }
  );
};
