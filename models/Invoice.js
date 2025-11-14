const Sequelize = require("sequelize");
module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    "Invoice",
    {
      InvoiceId: {
        autoIncrement: true,
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
      },
      TableId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "TableFood",
          key: "TableId",
        },
      },
      DateCheckIn: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        defaultValue: Sequelize.Sequelize.fn("NOW"),
      },
      DateCheckOut: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      TrangThai: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: "Invoice",

      timestamps: false,
      indexes: [
        {
          name: "PK__Invoice__D796AAB577F3E976",
          unique: true,
          fields: [{ name: "InvoiceId" }],
        },
      ],
    }
  );
};
