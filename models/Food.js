const Sequelize = require("sequelize");
module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    "Food",
    {
      FoodId: {
        autoIncrement: true,
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
      },
      FoodName: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      CategoryId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "Category",
          key: "CategoryId",
        },
      },
      IngredientId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "Ingredient",
          key: "IngredientId",
        },
      },
      Price: {
        type: DataTypes.DECIMAL(18, 3),
        allowNull: false,
        defaultValue: 0,
      },
      Discount: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        defaultValue: 0,
      },
      DiscountPrice: {
        type: DataTypes.DECIMAL(29, 9),
        allowNull: true,
      },
      Stock: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      Description: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      ImageURL: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      CreatedDate: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: Sequelize.Sequelize.fn("NOW"),
      },
      UpdatedDate: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      Status: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: true,
      },
    },
    {
      sequelize,
      tableName: "Food",

      timestamps: false,
      indexes: [
        {
          name: "PK__Food__856DB3EBE3D6D386",
          unique: true,
          fields: [{ name: "FoodId" }],
        },
      ],
    }
  );
};
