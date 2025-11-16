const sequelize = require("../../config/sequelize");
const { fn, col, literal } = require("sequelize"); // dùng helpers chính thống
const initModels = require("../../models/init-models");
const models = initModels(sequelize);
const { Food, Category, OrderDetails } = models;

exports.getHomeData = async (req, res) => {
  try {
    console.log("🏠 HOME API CALLED - Starting query...");

    // Tính tổng bán - dùng fn từ 'sequelize' package
    const soldSum = fn("COALESCE", fn("SUM", col("OrderDetails.Quantity")), 0);

    console.log("🔍 HOME: Executing Food.findAll query...");
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
          attributes: ["CategoryId", "CategoryName"],
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
      // ORDER BY alias - dùng literal (Postgres-safe). Nếu DB khác, có thể cần chỉnh.
      order: [[literal('"SoldQuantity"'), "DESC"]],
      subQuery: false,
      limit: 8,
      raw: true,
    });

    console.log(`✅ HOME: Query successful, found ${foods.length} products`);

    const products = foods.map((r) => ({
      ProductID: r.ProductID, // chỉ 1 lần
      Name: r.Name,
      Description: r.Description,
      Price: r.Price !== null ? Number(r.Price) : 0,
      DiscountPercent:
        r.DiscountPercent !== null ? Number(r.DiscountPercent) : null,
      DiscountedPrice:
        r.DiscountedPrice !== null ? Number(r.DiscountedPrice) : null,
      SoldQuantity: Number(r.SoldQuantity ?? 0),
      CategoryName: r["Category.CategoryName"] || null,
      DefaultImage: r.DefaultImage || "/images/no-image.png",
    }));

    return res.json({ success: true, data: products });
  } catch (err) {
    console.error("❌ API HOME ERROR FULL:", err);
    console.error("❌ Error Name:", err.name);
    console.error("❌ Error Message:", err.message);
    console.error("❌ Stack Trace:", err.stack);

    return res.status(500).json({
      success: false,
      message: "Lỗi khi lấy dữ liệu trang chủ",
      detail: err.name,
      full: err.message,
      type: "SequelizeError",
    });
  }
};
