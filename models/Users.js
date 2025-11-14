const Sequelize = require("sequelize");
module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    "Users",
    {
      Id: {
        autoIncrement: true,
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
      },
      Username: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: "UQ__Users__536C85E4412E6226",
      },
      Email: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: "UQ__Users__A9D10534A73D252A",
      },
      PasswordHash: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      FullName: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      Phone: {
        type: DataTypes.STRING(15),
        allowNull: true,
      },
      Address: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      Province: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      District: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      Ward: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      Role: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "User",
      },
      OTPCode: {
        type: DataTypes.STRING(10),
        allowNull: true,
      },
      OTPExpiry: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      ResetToken: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      ResetTokenExpiry: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      AvatarUrl: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      CreatedDate: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: Sequelize.Sequelize.fn("NOW"),
      },
    },
    {
      sequelize,
      tableName: "Users",

      timestamps: false,
      indexes: [
        {
          name: "PK__Users__3214EC07FCD6D6BA",
          unique: true,
          fields: [{ name: "Id" }],
        },
        {
          name: "UQ__Users__536C85E4412E6226",
          unique: true,
          fields: [{ name: "Username" }],
        },
        {
          name: "UQ__Users__A9D10534A73D252A",
          unique: true,
          fields: [{ name: "Email" }],
        },
      ],
    }
  );
};
