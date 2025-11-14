const Sequelize = require("sequelize");
module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    "DeliveryAddresses",
    {
      DeliveryAddressId: {
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
      },
      Address: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      Province: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      ProvinceId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      District: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      DistrictId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      Ward: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      WardCode: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      ReceiverName: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      Phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      IsDefault: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      CreatedDate: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: Sequelize.Sequelize.fn("NOW"),
      },
      Latitude: {
        type: DataTypes.DECIMAL(10, 8),
        allowNull: true,
      },
      Longitude: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: "DeliveryAddresses",

      timestamps: false,
      indexes: [
        {
          name: "PK__Delivery__4EBD54FCE929B9DB",
          unique: true,
          fields: [{ name: "DeliveryAddressId" }],
        },
      ],
    }
  );
};
