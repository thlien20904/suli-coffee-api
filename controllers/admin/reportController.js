const sequelize = require("../../config/sequelize"); // Sequelize instance
const initModels = require("../../models/init-models"); // Sequelize-auto models
const models = initModels(sequelize);

const { Orders, OrderDetails, Food } = models;
const { Op } = require("sequelize");
const moment = require("moment"); // npm install moment
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

/* =====================================================
   1️⃣ DOANH THU (theo ngày / tuần / tháng)
   GET /api/admin/report/revenue?year=2025&month=11&type=day
===================================================== */
exports.getRevenue = async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const type = req.query.type || "month";

    let revenueData = [];

    // ======================
    // 📅 Doanh thu theo ngày trong tuần (của tháng đang chọn)
    // ======================
    if (type === "day") {
      // Tính start/end của tháng
      const monthStr = month.toString().padStart(2, "0");
      const startMonth = moment(`${year}-${monthStr}-01`).startOf("day");
      const endMonth = moment(`${year}-${monthStr}-01`).endOf("month");

      const startStr = startMonth.format("YYYY-MM-DD HH:mm:ss");
      const endStr = endMonth.format("YYYY-MM-DD HH:mm:ss");

      // Debug log để kiểm tra (xóa sau khi fix)
      console.log(
        "Debug day: startStr=",
        startStr,
        "endStr=",
        endStr,
        "month=",
        month
      );

      const orders = await Orders.findAll({
        where: {
          OrderDate: {
            [Op.between]: [startStr, endStr],
          },
        },
        include: [{ model: OrderDetails, as: "OrderDetails" }],
      });

      const dailyRevenue = Array(7).fill(0); // 0=CN, 1=T2, ..., 6=Th7
      for (const order of orders) {
        const orderDate = moment(order.OrderDate).local();
        const dayOfWeek = orderDate.day(); // 0=CN → 6=Th7
        const total = order.OrderDetails.reduce(
          (sum, od) => sum + parseFloat(od.Price || 0) * (od.Quantity || 0),
          0
        );
        dailyRevenue[dayOfWeek] += total;
      }

      // Map theo thứ tự VN: Thứ 2 (1) đầu, CN (0) cuối
      const mapVN = [1, 2, 3, 4, 5, 6, 0];
      revenueData = mapVN.map((d) => ({
        Day: d, // 1=Thứ 2, ..., 7=CN
        TotalRevenue: dailyRevenue[d] || 0,
      }));
    }

    // ======================
    // Doanh thu theo tuần trong tháng
    // ======================
    if (type === "week") {
      const monthStr = month.toString().padStart(2, "0");
      const startMoment = moment(`${year}-${monthStr}-01`).startOf("day");
      const endMoment = moment(`${year}-${monthStr}-01`).endOf("month");

      const startStr = startMoment.format("YYYY-MM-DD HH:mm:ss");
      const endStr = endMoment.format("YYYY-MM-DD HH:mm:ss");

      // Debug log để kiểm tra (xóa sau khi fix)
      console.log(
        "Debug week: startStr=",
        startStr,
        "endStr=",
        endStr,
        "month=",
        month,
        "monthStr=",
        monthStr
      );

      const orders = await Orders.findAll({
        where: {
          OrderDate: {
            [Op.between]: [startStr, endStr],
          },
        },
        include: [{ model: OrderDetails, as: "OrderDetails" }],
      });

      const weeklyRevenue = Array(5).fill(0);
      for (const order of orders) {
        const orderDate = moment(order.OrderDate).local();
        const day = orderDate.date();
        const weekInMonth = Math.ceil(day / 7);
        const total = order.OrderDetails.reduce(
          (sum, od) => sum + parseFloat(od.Price || 0) * (od.Quantity || 0),
          0
        );
        if (weekInMonth >= 1 && weekInMonth <= 5) {
          weeklyRevenue[weekInMonth - 1] += total;
        }
      }

      revenueData = weeklyRevenue.map((r, i) => ({
        Week: i + 1,
        TotalRevenue: r,
      }));
    }

    // ======================
    // 📊 Doanh thu theo tháng trong năm
    // ======================
    if (type === "month") {
      const startOfYear = moment(`${year}-01-01 00:00:00`).format(
        "YYYY-MM-DD HH:mm:ss"
      );
      const endOfYear = moment(`${year}-12-31 23:59:59`).format(
        "YYYY-MM-DD HH:mm:ss"
      );

      const orders = await Orders.findAll({
        where: {
          OrderDate: {
            [Op.between]: [startOfYear, endOfYear],
          },
        },
        include: [{ model: OrderDetails, as: "OrderDetails" }],
      });

      const monthlyRevenue = Array(12).fill(0);
      for (const order of orders) {
        const orderDate = moment(order.OrderDate).local();
        const monthIndex = orderDate.month(); // 0–11
        const total = order.OrderDetails.reduce(
          (sum, od) => sum + parseFloat(od.Price || 0) * (od.Quantity || 0),
          0
        );
        monthlyRevenue[monthIndex] += total;
      }

      revenueData = monthlyRevenue.map((r, i) => ({
        Month: i + 1,
        TotalRevenue: r,
      }));
    }

    res.json({ success: true, type, year, month, revenueData });
  } catch (err) {
    console.error("❌ Lỗi report revenue:", err);
    res
      .status(500)
      .json({ success: false, message: "Lỗi server", details: err.message });
  }
};
