const { Op } = require("sequelize");
const Sequelize = require("sequelize");
const Food = require("../../models/Food");
const InvoiceDetail = require("../../models/InvoiceDetail");

exports.getHome = async (req, res) => {
  try {
    console.log("Fetching best sellers...");

    // Lấy 8 món bán chạy
    const results = await InvoiceDetail.findAll({
      where: { FoodId: { [Op.not]: null } },
      attributes: [
        "FoodId",
        [Sequelize.fn("SUM", Sequelize.col("SoLuong")), "TotalSold"],
      ],
      group: ["FoodId"],
      order: [[Sequelize.literal("TotalSold"), "DESC"]],
      limit: 8,
    });

    const bestSellers = await Promise.all(
      results.map(async (result) => {
        const food = await Food.findByPk(result.FoodId);
        if (!food) {
          console.warn(`Food not found for FoodId: ${result.FoodId}`);
          return {
            FoodId: result.FoodId,
            FoodName: "Không có tên",
            ImageUrl: "images/no-image.png",
            Price: 0,
            TotalSold: parseInt(result.dataValues.TotalSold || 0),
          };
        }

        // Kiểm tra nếu ImageURL là URL Supabase
        const imageUrl = food.ImageURL
          ? food.ImageURL.startsWith("http")
            ? food.ImageURL
            : `/assets/images/${food.ImageURL}`
          : "images/no-image.png";

        return {
          FoodId: food.FoodId,
          FoodName: food.FoodName,
          ImageUrl: imageUrl,
          Price: food.Price || 0,
          TotalSold: parseInt(result.dataValues.TotalSold || 0),
        };
      })
    );

    if (!bestSellers.length) {
      console.log("No best sellers found.");
    }

    res.status(200).json({ bestSellers });
  } catch (error) {
    console.error("Error in getHome:", error);
    res.status(500).json({ message: "Lỗi tải dữ liệu", error: error.message });
  }
};

exports.getCartCount = async (req, res) => {
  try {
    console.log("Fetching cart count for user:", req.user);
    const cartCount =
      req.user && req.user.cartItems ? req.user.cartItems.length : 0;
    res.status(200).json({ count: cartCount });
  } catch (error) {
    console.error("Error in getCartCount:", error);
    res
      .status(500)
      .json({ message: "Lỗi tải số lượng giỏ hàng", error: error.message });
  }
};
