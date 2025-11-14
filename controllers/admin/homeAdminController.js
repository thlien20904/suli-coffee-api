const sequelize = require("../../config/sequelize");
const initModels = require("../../models/init-models");
const models = initModels(sequelize);
const { Sequelize, Op } = require("sequelize");

const { Food, Ingredient, Orders, OrderStatus, OrderDetails, Users } = models;

/* =====================================================
   📊 DASHBOARD HOME ADMIN
   GET /api/admin/home
===================================================== */
exports.getHome = async (req, res) => {
  try {
    // 1. Tổng sản phẩm & nguyên liệu
    const [totalProducts, totalIngredients] = await Promise.all([
      Food.count(),
      Ingredient.count(),
    ]);

    // 2. Trạng thái đơn hàng
    const statuses = await OrderStatus.findAll();
    const statusCount = {};
    for (const st of statuses) {
      const count = await Orders.count({ where: { StatusId: st.StatusId } });
      statusCount[st.StatusName] = count;
    }

    // Tổng đơn hàng và doanh thu
    const [totalOrders, totalSalesRes] = await Promise.all([
      Orders.count(),
      Orders.sum("TotalAmount"),
    ]);
    const totalSales = totalSalesRes || 0;

    // 3. Doanh thu theo tháng (năm hiện tại) - Fix PostgreSQL query
    const currentYear = new Date().getFullYear();
    console.log("📅 Current year:", currentYear);

    // Use raw SQL for PostgreSQL compatibility
    const monthlySales = await sequelize.query(
      `
      SELECT 
        EXTRACT(MONTH FROM "OrderDate")::INTEGER as "Month",
        SUM("TotalAmount")::FLOAT as "TotalRevenue"
      FROM "Orders" 
      WHERE "OrderDate" >= '${currentYear}-01-01' 
        AND "OrderDate" <= '${currentYear}-12-31'
      GROUP BY EXTRACT(MONTH FROM "OrderDate")
      ORDER BY EXTRACT(MONTH FROM "OrderDate") ASC
    `,
      {
        type: Sequelize.QueryTypes.SELECT,
      }
    );

    console.log(
      "📊 Raw monthly sales from DB:",
      JSON.stringify(monthlySales, null, 2)
    );

    const monthlySalesArray = Array.from({ length: 12 }, (_, i) => {
      const found = monthlySales.find((r) => r.Month === i + 1);
      const revenue = found ? parseFloat(found.TotalRevenue) : 0;
      console.log(`📅 Month ${i + 1}:`, {
        found: !!found,
        revenue,
        raw: found,
      });
      return {
        Month: i + 1,
        TotalRevenue: revenue,
      };
    });

    console.log(
      "📊 Final monthly sales array:",
      JSON.stringify(monthlySalesArray, null, 2)
    );

    // 4. Sản phẩm bán chạy (top 3) - Separate query to avoid group with include
    const topFoodIds = await OrderDetails.findAll({
      attributes: [
        "FoodId",
        [Sequelize.fn("SUM", Sequelize.col("Quantity")), "TotalSold"],
      ],
      group: ["FoodId"],
      order: [[Sequelize.col("TotalSold"), "DESC"]],
      limit: 3,
    });

    const bestSellersProcessed = await Promise.all(
      topFoodIds.map(async (item) => {
        const food = await Food.findByPk(item.FoodId, {
          attributes: ["FoodName", "Price", "ImageURL"],
        });
        return {
          FoodId: item.FoodId,
          TotalSold: parseInt(item.dataValues.TotalSold),
          FoodName: food ? food.FoodName : "N/A",
          Price: food ? food.Price : 0,
          ImageURL:
            food && food.ImageURL
              ? `http://localhost:5000${food.ImageURL}`
              : `http://localhost:5000/images/no-image.png`,
        };
      })
    );

    // 5. Nguyên liệu sắp hết (<10)
    const lowStock = await Ingredient.findAll({
      where: { SoLuong: { [Op.lt]: 10 } },
    });

    const lowStockProcessed = lowStock.map((item) => ({
      ...item.dataValues,
      ImageURL: item.ImageURL
        ? `http://localhost:5000${item.ImageURL}`
        : `http://localhost:5000/images/no-image.png`,
    }));

    // 6. Top Address (GROUP BY Address in Users) - Raw SQL fix for MSSQL
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

    const topAddressesProcessed = topAddressesRaw.map((item) => ({
      Address: item.Address,
      OrderCount: parseInt(item.OrderCount),
    }));

    // 7. Đơn hàng gần đây (top 5)
    const recentOrders = await Orders.findAll({
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

    const recentOrdersProcessed = recentOrders.map((item) => ({
      OrderId: item.OrderId,
      FullName: item.User.FullName,
      StatusName: item.Status.StatusName,
      OrderDate: item.OrderDate,
      TotalAmount: item.TotalAmount,
    }));

    // Hardcoded customers need help
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

    res.json({
      totalProducts,
      totalIngredients,
      statusCount,
      totalOrders,
      totalSales,
      monthlySales: monthlySalesArray,
      bestSellers: bestSellersProcessed,
      lowStockIngredients: lowStockProcessed,
      topAddresses: topAddressesProcessed,
      recentOrders: recentOrdersProcessed,
      customersNeedHelp,
    });
  } catch (err) {
    console.error("❌ Lỗi dashboard home admin:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};
