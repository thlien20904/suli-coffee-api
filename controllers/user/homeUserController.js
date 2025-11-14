const sequelize = require("../../config/sequelize");
const initModels = require("../../models/init-models");
const models = initModels(sequelize);
const { Food, Category, OrderDetails } = models;

exports.getHomeData = async (req, res) => {
  try {
    // Tính tổng bán
    const soldSum = sequelize.fn(
      "COALESCE",
      sequelize.fn("SUM", sequelize.col("OrderDetails.Quantity")),
      0
    );

    const foods = await Food.findAll({
      attributes: [
        ["FoodId", "ProductID"],
        ["FoodName", "Name"],
        "Description",
        "Price",
        ["Discount", "DiscountPercent"],
        ["DiscountPrice", "DiscountedPrice"],
        [soldSum, "SoldQuantity"],
        ["ImageURL", "DefaultImage"],
      ],
      include: [
        {
          model: OrderDetails,
          as: "OrderDetails",
          attributes: [],
          required: false, // LEFT JOIN
        },
        {
          model: Category,
          as: "Category",
          attributes: ["CategoryId", "CategoryName"], // lấy luôn CategoryId để GROUP BY
          required: false,
        },
      ],
      group: [
        "Food.FoodId",
        "Food.FoodName",
        "Food.Description",
        "Food.Price",
        "Food.Discount",
        "Food.DiscountPrice",
        "Food.ImageURL",
        "Category.CategoryId",
        "Category.CategoryName",
      ],
      order: [[sequelize.literal('"SoldQuantity"'), "DESC"]],
      subQuery: false,
      limit: 8,
      raw: true,
    });

    const products = foods.map((r) => ({
      ProductID: r.ProductID,
      Name: r.Name,
      Description: r.Description,
      Price: r.Price !== null ? Number(r.Price) : 0,
      DiscountPercent:
        r.DiscountPercent !== null ? Number(r.DiscountPercent) : null,
      DiscountedPrice:
        r.DiscountedPrice !== null ? Number(r.DiscountedPrice) : null,
      SoldQuantity: Number(r.SoldQuantity || 0),
      CategoryName: r["Category.CategoryName"] || null,
      DefaultImage: r.DefaultImage || "/images/no-image.png",
    }));

    return res.json({ success: true, data: products });
  } catch (err) {
    console.error(
      "❌ Lỗi lấy dữ liệu trang chủ (Sequelize):",
      err && err.stack ? err.stack : err
    );
    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy dữ liệu trang chủ",
      detail: err && err.message ? err.message : String(err),
    });
  }
};
