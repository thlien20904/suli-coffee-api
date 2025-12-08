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
   2️⃣ LẤY CHI TIẾT 1 HÓA ĐƠN (THAM KHẢO getOrderDetail từ user)
   GET /api/admin/invoice/:id
===================================================== */
exports.getInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id);
    if (!orderId || isNaN(orderId)) {
      return res
        .status(400)
        .json({ success: false, message: "ID không hợp lệ" });
    }

    // Lấy đơn hàng với đầy đủ thông tin
    const order = await Orders.findByPk(orderId, {
      include: [
        {
          model: Users,
          as: "User",
          attributes: ["Id", "FullName", "Phone"],
          required: false,
        },
        {
          model: PhuongThucThanhToan,
          as: "PaymentMethod",
          attributes: ["Id", "TenPhuongThuc"],
          required: false,
        },
        {
          model: OrderStatus,
          as: "Status",
          attributes: ["StatusId", "StatusName"],
          required: false,
        },
        {
          model: models.PaymentStatus,
          as: "PaymentStatus",
          attributes: ["PaymentStatusId", "PaymentStatusName"],
          required: false,
        },
        {
          model: models.Vouchers,
          as: "Voucher",
          attributes: ["VoucherId", "Code", "DiscountPercentage"],
          required: false,
        },
        {
          model: models.CuaHang,
          as: "CuaHang",
          attributes: [
            "CuaHangId",
            "CuaHangName",
            "Address",
            "Province",
            "District",
            "Ward",
            "Phone",
          ],
          required: false,
        },
        {
          model: OrderDetails,
          as: "OrderDetails",
          include: [
            {
              model: Food,
              as: "Food",
              attributes: ["FoodName"],
            },
            {
              model: Size,
              as: "Size",
              attributes: ["SizeName"],
            },
            {
              model: models.OrderDetails_Topping,
              as: "OrderDetails_Toppings",
              include: [
                {
                  model: Topping,
                  as: "Topping",
                  attributes: ["ToppingName"],
                },
              ],
            },
          ],
        },
      ],
    });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy hóa đơn" });
    }

    const o = order.toJSON();

    // Format chi tiết sản phẩm
    const details = o.OrderDetails.map((detail) => ({
      OrderDetailId: detail.OrderDetailId,
      FoodName: detail.Food?.FoodName || "Không xác định",
      SizeName: detail.Size?.SizeName || null,
      Toppings: (detail.OrderDetails_Toppings || []).map((t) => ({
        ToppingName: t.Topping?.ToppingName || "Không xác định",
      })),
      Quantity: detail.Quantity,
      Price: parseFloat(detail.Price),
    }));

    // Tính subtotal
    const subtotal = details.reduce((sum, d) => sum + d.Price * d.Quantity, 0);

    // Format invoice data đầy đủ
    const invoice = {
      OrderId: o.OrderId,
      OrderDate: o.OrderDate,
      TotalAmount: parseFloat(o.TotalAmount),
      ShippingFee: parseFloat(o.ShippingFee || 0),
      DiscountAmount: parseFloat(o.DiscountAmount || 0),
      Subtotal: subtotal,

      // User info
      User: o.User,
      ReceiverName: o.User?.FullName || null,
      Phone: o.Phone || o.User?.Phone || null,

      // Địa chỉ giao hàng
      Address: o.DeliveryAddress,
      Ward: o.Ward,
      District: o.District,
      Province: o.Province,

      // Phương thức & trạng thái
      PaymentMethod: o.PaymentMethod,
      Status: o.Status,
      PaymentStatus: o.PaymentStatus,

      // Voucher & Cửa hàng
      Voucher: o.Voucher,
      CuaHang: o.CuaHang,
    };

    res.json({
      success: true,
      invoice,
      details,
    });
  } catch (err) {
    console.error("❌ Lỗi lấy chi tiết hóa đơn:", err);
    res
      .status(500)
      .json({ success: false, message: "Lỗi server", details: err.message });
  }
};
