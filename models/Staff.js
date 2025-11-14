const Sequelize = require("sequelize");
module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    "Staff",
    {
      StaffId: {
        autoIncrement: true,
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
      },
      FullName: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      Phone: {
        type: DataTypes.STRING(15),
        allowNull: true,
      },
      DateOfBirth: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      Email: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      Gender: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      AccountId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "Account",
          key: "AccountId",
        },
      },
      RoleId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "AccRole",
          key: "RoleId",
        },
      },
    },
    {
      sequelize,
      tableName: "Staff",

      timestamps: false,
      indexes: [
        {
          name: "PK__Staff__96D4AB17750A9FCC",
          unique: true,
          fields: [{ name: "StaffId" }],
        },
      ],
    }
  );
};
