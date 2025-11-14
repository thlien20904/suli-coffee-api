const Sequelize = require("sequelize");
module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    "FoodDimensions",
    {
      DimensionId: {
        autoIncrement: true,
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
      },
      FoodId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "Food",
          key: "FoodId",
        },
      },
      Length: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 10,
      },
      Width: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 10,
      },
      Height: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 15,
      },
      Weight: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 300,
      },
      CreatedDate: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: Sequelize.Sequelize.fn("NOW"),
      },
    },
    {
      sequelize,
      tableName: "FoodDimensions",

      timestamps: false,
      indexes: [
        {
          name: "PK__FoodDime__1F7D4F118B2820F5",
          unique: true,
          fields: [{ name: "DimensionId" }],
        },
      ],
    }
  );
};
