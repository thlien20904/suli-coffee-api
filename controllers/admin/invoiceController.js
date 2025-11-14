const sequelize = require("../../config/sequelize");
const initModels = require("../../models/init-models");
const models = initModels(sequelize);
const { Sequelize, Op } = require("sequelize");

const {
  Orders,
  OrderDetails,
  Users,
  PhuongThucThanhToan,
  OrderStatus,
  Food,
  Size,
  Topping,
} = models;

/* =====================================================
   1️⃣ LẤY DANH SÁCH HÓA ĐƠN
   GET /api/admin/invoice?page=1&limit=10&search=abc
===================================================== */
exports.getInvoices = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";

    const offset = (page - 1) * limit;
    const whereCondition = search
      ? {
          [Op.or]: [
            { OrderId: { [Op.like]: `%${search}%` } },
            { "$User.FullName$": { [Op.like]: `%${search}%` } },
          ],
        }
      : {};

    const invoices = await Orders.findAll({
      where: whereCondition,
      include: [
        {
          model: Users,
          as: "User",
          attributes: ["Id", "FullName"],
          required: true,
        }, // ✅ FIX: Thêm as: "User"
        {
          model: PhuongThucThanhToan,
          as: "PaymentMethod",
          attributes: ["Id", "TenPhuongThuc"],
          required: true,
        }, // ✅ FIX: Thêm as: "PaymentMethod"
        {
          model: OrderStatus,
          as: "Status",
          attributes: ["StatusId", "StatusName"],
          required: true,
        }, // ✅ FIX: Thêm as: "Status"
      ],
      order: [["OrderId", "DESC"]],
      limit,
      offset,
    });

    res.json({ success: true, data: invoices });
  } catch (err) {
    console.error("❌ Lỗi lấy danh sách hóa đơn:", err);
    res
      .status(500)
      .json({ success: false, message: "Lỗi server", details: err.message }); // ✅ Thêm details để debug
  }
};

/* =====================================================
   2️⃣ LẤY CHI TIẾT 1 HÓA ĐƠN
   GET /api/admin/invoice/:id
===================================================== */
exports.getInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id);
    if (!orderId) {
      return res
        .status(400)
        .json({ success: false, message: "ID không hợp lệ" });
    }

    const invoice = await Orders.findByPk(orderId, {
      include: [
        {
          model: Users,
          as: "User",
          attributes: ["Id", "FullName"],
          required: true,
        }, // ✅ FIX: Thêm as: "User"
        {
          model: PhuongThucThanhToan,
          as: "PaymentMethod",
          attributes: ["Id", "TenPhuongThuc"],
          required: true,
        }, // ✅ FIX: Thêm as: "PaymentMethod"
        {
          model: OrderStatus,
          as: "Status",
          attributes: ["StatusId", "StatusName"],
          required: true,
        }, // ✅ FIX: Thêm as: "Status"
      ],
    });

    if (!invoice) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy hóa đơn" });
    }

    const details = await OrderDetails.findAll({
      where: { OrderId: orderId },
      include: [
        {
          model: Food,
          as: "Food",
          attributes: ["FoodId", "FoodName"],
          required: true,
        }, // ✅ FIX: Thêm as: "Food"
        { model: Size, as: "Size", attributes: ["SizeID", "SizeName"] }, // ✅ FIX: Thêm as: "Size"
        {
          model: Topping,
          as: "Topping",
          attributes: ["ToppingID", "ToppingName"],
        }, // ✅ FIX: Thêm as: "Topping"
      ],
    });

    res.json({
      success: true,
      invoice,
      details,
    });
  } catch (err) {
    console.error("❌ Lỗi lấy chi tiết hóa đơn:", err);
    res
      .status(500)
      .json({ success: false, message: "Lỗi server", details: err.message }); // ✅ Thêm details để debug
  }
};
