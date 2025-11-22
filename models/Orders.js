const Sequelize = require("sequelize");
module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    "Orders",
    {
      OrderId: {
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
      CuaHangId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "CuaHang",
          key: "CuaHangId",
        },
      },
      OrderDate: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.Sequelize.fn("NOW"),
      },
      TotalAmount: {
        type: DataTypes.DECIMAL(18, 3),
        allowNull: false,
      },
      PaymentMethodId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "PhuongThucThanhToan",
          key: "Id",
        },
      },
      StatusId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "OrderStatus",
          key: "StatusId",
        },
      },
      PaymentStatusId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "PaymentStatus",
          key: "PaymentStatusId",
        },
      },
      DeliveryAddress: {
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
      Phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      Note: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      VoucherId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "Vouchers",
          key: "VoucherId",
        },
      },
      ClientOrderCode: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      ShippingFee: {
        type: DataTypes.DECIMAL(18, 3),
        allowNull: false,
        defaultValue: 0,
      },
      DiscountAmount: {
        type: DataTypes.DECIMAL(18, 3),
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      sequelize,
      tableName: "Orders",

      timestamps: false,
      indexes: [
        {
          name: "PK__Orders__C3905BCFA37E59B0",
          unique: true,
          fields: [{ name: "OrderId" }],
        },
      ],
    }
  );
};
