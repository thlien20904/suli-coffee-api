// controllers/admin/homeController.js
const sequelize = require("../../config/sequelize");
const initModels = require("../../models/init-models");
const models = initModels(sequelize);
const { Sequelize, Op } = require("sequelize");

const { Food, Ingredient, Orders, OrderStatus, OrderDetails, Users } = models;
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

// ------------------- HELPER -------------------
const formatImage = (img) =>
  !img
    ? `${BACKEND_URL}/images/no-image.png`
    : img.includes("://") // ✅ FIX: Kiểm tra full URL bằng '://' (http:// hoặc https://)
    ? img
    : `${BACKEND_URL}${img}`; // Chỉ prepend nếu là relative path (không có protocol)

// ------------------- DASHBOARD HOME ADMIN -------------------
exports.getHome = async (req, res) => {
  try {
    // 1️⃣ Tổng sản phẩm & nguyên liệu
    const [totalProducts, totalIngredients] = await Promise.all([
      Food.count(),
      Ingredient.count(),
    ]);

    // 2️⃣ Trạng thái đơn hàng
    const statuses = await OrderStatus.findAll();
    const statusCount = {};
    for (const st of statuses) {
      const count = await Orders.count({ where: { StatusId: st.StatusId } });
      statusCount[st.StatusName] = count;
    }

    // 3️⃣ Tổng đơn hàng & doanh thu
    const [totalOrders, totalSalesRes] = await Promise.all([
      Orders.count(),
      Orders.sum("TotalAmount"),
    ]);
    const totalSales = totalSalesRes || 0;

    // 4️⃣ Doanh thu theo tháng (năm hiện tại)
    const currentYear = new Date().getFullYear();
    const monthlySalesRaw = await sequelize.query(
      `
      SELECT 
        EXTRACT(MONTH FROM "OrderDate")::INTEGER AS "Month",
        SUM("TotalAmount")::FLOAT AS "TotalRevenue"
      FROM "Orders"
      WHERE "OrderDate" >= '${currentYear}-01-01'
        AND "OrderDate" <= '${currentYear}-12-31'
      GROUP BY EXTRACT(MONTH FROM "OrderDate")
      ORDER BY EXTRACT(MONTH FROM "OrderDate") ASC
      `,
      { type: Sequelize.QueryTypes.SELECT }
    );

    const monthlySales = Array.from({ length: 12 }, (_, i) => {
      const found = monthlySalesRaw.find((r) => r.Month === i + 1);
      return {
        Month: i + 1,
        TotalRevenue: found ? parseFloat(found.TotalRevenue) : 0,
      };
    });

    // 5️⃣ Sản phẩm bán chạy (top 3)
    const topFoodIds = await OrderDetails.findAll({
      attributes: [
        "FoodId",
        [Sequelize.fn("SUM", Sequelize.col("Quantity")), "TotalSold"],
      ],
      group: ["FoodId"],
      order: [[Sequelize.col("TotalSold"), "DESC"]],
      limit: 3,
    });

    const bestSellers = await Promise.all(
      topFoodIds.map(async (item) => {
        const food = await Food.findByPk(item.FoodId, {
          attributes: ["FoodName", "Price", "ImageURL"],
        });

        return {
          FoodId: item.FoodId,
          TotalSold: parseInt(item.dataValues.TotalSold),
          FoodName: food?.FoodName || "N/A",
          Price: food?.Price || 0,
          ImageURL: formatImage(food?.ImageURL),
        };
      })
    );

    // 6️⃣ Nguyên liệu sắp hết (<10)
    const lowStockRaw = await Ingredient.findAll({
      where: { SoLuong: { [Op.lt]: 10 } },
    });

    const lowStockIngredients = lowStockRaw.map((item) => ({
      ...item.dataValues,
      ImageURL: formatImage(item.ImageURL),
    }));

    // 7️⃣ Top Address (GROUP BY Address in Users)
    const topAddressesRaw = await sequelize.query(
      `
      SELECT COALESCE(u."Address", 'Unknown') AS "Address",
             COUNT(o."OrderId") AS "OrderCount"
      FROM "Users" u
      LEFT JOIN "Orders" o ON u."Id" = o."UserId"
      WHERE u."Address" IS NOT NULL
      GROUP BY u."Address"
      ORDER BY "OrderCount" DESC
      LIMIT 5;
      `,
      { type: Sequelize.QueryTypes.SELECT }
    );

    const topAddresses = topAddressesRaw.map((item) => ({
      Address: item.Address,
      OrderCount: parseInt(item.OrderCount),
    }));

    // 8️⃣ Đơn hàng gần đây (top 5)
    const recentOrdersRaw = await Orders.findAll({
      attributes: ["OrderId", "OrderDate", "TotalAmount", "StatusId"],
      include: [
        { model: Users, as: "User", attributes: ["FullName"], required: true },
        {
          model: OrderStatus,
          as: "Status",
          attributes: ["StatusName"],
          required: true,
        },
      ],
      order: [["OrderDate", "DESC"]],
      limit: 5,
    });

    const recentOrders = recentOrdersRaw.map((item) => ({
      OrderId: item.OrderId,
      FullName: item.User.FullName,
      StatusName: item.Status.StatusName,
      OrderDate: item.OrderDate,
      TotalAmount: item.TotalAmount,
    }));

    // 9️⃣ Khách hàng cần hỗ trợ (hardcoded)
    const customersNeedHelp = [
      {
        CustomerName: "Laila Tazkiah",
        Message: "My order hasn't arrived yet",
        TimeAgo: "1 min ago",
      },
      {
        CustomerName: "Rizal Fakhri",
        Message: "Please cancel my order",
        TimeAgo: "2 hours ago",
      },
      {
        CustomerName: "Syahdan Ubaidillah",
        Message: "Do you see my mother?",
        TimeAgo: "6 hours ago",
      },
    ];

    // 10️⃣ Trả về JSON
    res.json({
      totalProducts,
      totalIngredients,
      statusCount,
      totalOrders,
      totalSales,
      monthlySales,
      bestSellers,
      lowStockIngredients,
      topAddresses,
      recentOrders,
      customersNeedHelp,
    });
  } catch (err) {
    console.error("❌ Lỗi dashboard home admin:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};
