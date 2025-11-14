const Sequelize = require("sequelize");
module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    "UserVouchers",
    {
      UserVoucherId: {
        autoIncrement: true,
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
      },
      UserId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "Users",
          key: "Id",
        },
        unique: "UQ__UserVouc__14262BDF8F1BC80D",
      },
      VoucherId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "Vouchers",
          key: "VoucherId",
        },
        unique: "UQ__UserVouc__14262BDF8F1BC80D",
      },
      IsUsed: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
      },
      ReceivedDate: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: Sequelize.Sequelize.fn("NOW"),
      },
    },
    {
      sequelize,
      tableName: "UserVouchers",

      timestamps: false,
      indexes: [
        {
          name: "PK__UserVouc__8017D4995247451E",
          unique: true,
          fields: [{ name: "UserVoucherId" }],
        },
        {
          name: "UQ__UserVouc__14262BDF8F1BC80D",
          unique: true,
          fields: [{ name: "UserId" }, { name: "VoucherId" }],
        },
      ],
    }
  );
};
