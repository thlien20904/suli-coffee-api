const Sequelize = require("sequelize");
module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    "PaymentStatus",
    {
      PaymentStatusId: {
        autoIncrement: true,
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
      },
      PaymentStatusName: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: "UQ__PaymentS__BBAC58DB02679C76",
      },
    },
    {
      sequelize,
      tableName: "PaymentStatus",

      timestamps: false,
      indexes: [
        {
          name: "PK__PaymentS__34F8AC3FECBF1824",
          unique: true,
          fields: [{ name: "PaymentStatusId" }],
        },
        {
          name: "UQ__PaymentS__BBAC58DB02679C76",
          unique: true,
          fields: [{ name: "PaymentStatusName" }],
        },
      ],
    }
  );
};
