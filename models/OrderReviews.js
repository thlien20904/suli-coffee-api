// frontend/backend/models/OrderReviews.js
const Sequelize = require("sequelize");

module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    "OrderReviews",
    {
      ReviewId: {
        autoIncrement: true,
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
      },
      OrderId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      OrderDetailId: {
        // Nếu đánh giá từng món
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      UserId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      Rating: {
        type: DataTypes.SMALLINT,
        allowNull: false,
        validate: { min: 1, max: 5 },
      },
      Comment: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      Images: {
        type: DataTypes.JSONB, // Mảng URL ảnh
        allowNull: true,
      },
      Videos: {
        type: DataTypes.JSONB, // Mảng URL video
        allowNull: true,
      },
      CreatedDate: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.Sequelize.fn("NOW"),
      },
      UpdatedDate: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.Sequelize.fn("NOW"),
      },
    },
    {
      sequelize,
      tableName: "OrderReviews",
      timestamps: false,
      indexes: [
        {
          name: "PK_OrderReviews",
          unique: true,
          fields: [{ name: "ReviewId" }],
        },
        {
          name: "idx_orderreviews_orderid",
          fields: [{ name: "OrderId" }],
        },
        {
          name: "idx_orderreviews_userid",
          fields: [{ name: "UserId" }],
        },
      ],
    }
  );
};
