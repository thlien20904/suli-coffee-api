// controllers/user/profile/order.js
const {
  Orders,
  OrderDetails,
  OrderDetails_Topping,
  PhuongThucThanhToan,
  OrderStatus,
  PaymentStatus,
  Food,
  Size,
  Topping,
  Op,
  Vouchers,
  Users,
} = require("./config");

// ✅ ĐÃ SỬA: getOrders - Hiển thị đúng đơn ở từng tab
const getOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const tab = req.query.tab || "cho-xac-nhan";
    const userId = req.user.id;

    let whereClause = { UserId: userId };

    // Lấy StatusId theo tab
    let statusName;
    switch (tab) {
      case "cho-xac-nhan":
        statusName = "Đặt hàng thành công";
        break;
      case "dang-chuan-bi":
        statusName = "Đang chuẩn bị đơn hàng";
        break;
      case "dang-giao-hang":
        statusName = "Đang giao hàng";
        break;
      case "da-giao":
        statusName = "Giao hàng thành công"; // ĐÃ GIAO THÀNH CÔNG
        break;
      case "da-huy":
        statusName = "Đã hủy";
        break;
      default:
        statusName = "Đặt hàng thành công";
    }

    // Chỉ áp dụng điều kiện thanh toán cho các tab từ "dang-chuan-bi" trở đi
    if (["dang-chuan-bi", "dang-giao-hang", "da-giao"].includes(tab)) {
      const paidStatus = await PaymentStatus.findOne({
        where: { PaymentStatusName: "Đã thanh toán" },
      });
      const paidStatusId = paidStatus ? paidStatus.PaymentStatusId : null;

      const codOrPaidCondition = {
        [Op.or]: [
          { PaymentMethodId: 2 }, // COD
          { PaymentMethodId: 3 }, // QR Code
          { PaymentStatusId: paidStatusId }, // VNPAY đã thanh toán
        ],
      };

      whereClause[Op.and] = [codOrPaidCondition];
    }

    // Áp StatusId
    if (statusName) {
      const status = await OrderStatus.findOne({
        where: { StatusName: statusName },
      });
      if (status) {
        if (whereClause[Op.and]) {
          whereClause[Op.and].push({ StatusId: status.StatusId });
        } else {
          whereClause.StatusId = status.StatusId;
        }
      } else {
        return res.json({
          success: true,
          data: { orders: [], totalOrders: 0, currentPage: 1, totalPages: 1 },
        });
      }
    }

    const totalOrders = await Orders.count({ where: whereClause });

    const orders = await Orders.findAll({
      where: whereClause,
      order: [["OrderDate", "DESC"]],
      offset: (page - 1) * pageSize,
      limit: pageSize,
      attributes: [
        "OrderId",
        "OrderDate",
        "TotalAmount",
        "StatusId",
        "PaymentMethodId",
        "PaymentStatusId",
      ],
      include: [
        {
          model: PhuongThucThanhToan,
          as: "PaymentMethod",
          attributes: ["TenPhuongThuc"],
        },
        { model: OrderStatus, as: "Status", attributes: ["StatusName"] },
        {
          model: PaymentStatus,
          as: "PaymentStatus",
          attributes: ["PaymentStatusName", "PaymentStatusId"],
        },
      ],
    });

    // Lấy chi tiết món ăn
    const orderIds = orders.map((o) => o.OrderId);
    const detailsMap = {};

    if (orderIds.length > 0) {
      const details = await OrderDetails.findAll({
        where: { OrderId: { [Op.in]: orderIds } },
        include: [
          { model: Food, as: "Food", attributes: ["FoodName"] },
          { model: Size, as: "Size", attributes: ["SizeName"] },
          {
            model: OrderDetails_Topping,
            as: "OrderDetails_Toppings",
            include: [
              { model: Topping, as: "Topping", attributes: ["ToppingName"] },
            ],
          },
        ],
      });

      details.forEach((d) => {
        if (!detailsMap[d.OrderId]) detailsMap[d.OrderId] = [];
        detailsMap[d.OrderId].push({
          FoodName: d.Food?.FoodName || "Không xác định",
          SizeName: d.Size?.SizeName || null,
          Toppings: (d.OrderDetails_Toppings || [])
            .map((t) => t.Topping?.ToppingName)
            .filter(Boolean),
          Quantity: d.Quantity,
          Price: parseFloat(d.Price),
        });
      });
    }

    const ordersWithDetails = orders.map((o) => ({
      OrderId: o.OrderId,
      OrderDate: o.OrderDate,
      TotalAmount: parseFloat(o.TotalAmount),
      StatusId: o.StatusId,
      Status: o.Status?.StatusName || "Không xác định",
      PaymentMethod: o.PaymentMethod?.TenPhuongThuc || "Không xác định",
      PaymentStatus: o.PaymentStatus?.PaymentStatusName || null,
      PaymentStatusId: o.PaymentStatus?.PaymentStatusId || null,
      PaymentMethodId: o.PaymentMethodId,
      isPaid:
        o.PaymentStatus?.PaymentStatusName === "Đã thanh toán" ||
        o.PaymentMethodId === 2 ||
        o.PaymentMethodId === 3,
      OrderDetails: (detailsMap[o.OrderId] || []).map((d) => ({
        ...d,
        Toppings:
          d.Toppings.length > 0
            ? d.Toppings.map((t) => ({ ToppingName: t }))
            : [],
      })),
    }));

    res.json({
      success: true,
      data: {
        orders: ordersWithDetails,
        totalOrders,
        currentPage: page,
        pageSize,
        totalPages: Math.ceil(totalOrders / pageSize),
      },
    });
  } catch (err) {
    console.error("GET ORDERS ERROR:", err);
    res
      .status(500)
      .json({ success: false, message: "Lỗi khi lấy danh sách đơn hàng" });
  }
};

// controllers/user/profile/order.js
const confirmReceived = async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.user.id;

    await Orders.update(
      { StatusId: 4 },
      { where: { OrderId: orderId, UserId: userId, StatusId: 3 } }
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

// =========================
// 📌 HỦY ĐƠN HÀNG
// =========================
const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.json({ success: false, message: "Thiếu orderId!" });
    }

    const userId = req.user.id;
    const order = await Orders.findOne({
      where: { OrderId: orderId, UserId: userId },
      include: [
        { model: OrderStatus, as: "Status", attributes: ["StatusName"] },
        {
          model: PaymentStatus,
          as: "PaymentStatus",
          attributes: ["PaymentStatusName"],
        },
        { model: OrderDetails, as: "OrderDetails" }, // nếu cần frontend hiển thị chi tiết
      ],
    });

    if (!order) {
      return res.json({
        success: false,
        message: "Không tìm thấy đơn hàng hoặc không có quyền hủy!",
      });
    }

    const statusName = order.Status?.StatusName;
    const paymentStatusName = order.PaymentStatus?.PaymentStatusName;

    // Các trạng thái được phép hủy
    const isPending =
      statusName === "Lưu tạm" || statusName === "Chưa thanh toán";
    const isConfirmed = statusName === "Đặt hàng thành công";
    const isPaid = paymentStatusName === "Đã thanh toán";
    const isPreparing = statusName === "Đang chuẩn bị đơn hàng";

    if (isPending || isConfirmed || isPaid || isPreparing) {
      const cancelledStatus = await OrderStatus.findOne({
        where: { StatusName: "Đã hủy" },
      });

      if (!cancelledStatus) {
        return res.json({
          success: false,
          message: "Không tìm thấy trạng thái 'Đã hủy'!",
        });
      }

      // Cập nhật trạng thái thành 'Đã hủy'
      await order.update({ StatusId: cancelledStatus.StatusId });

      // Trả về luôn order vừa hủy để frontend cập nhật tab 'Đã hủy'
      const cancelledOrder = await Orders.findOne({
        where: { OrderId: orderId },
        include: [
          { model: OrderStatus, as: "Status", attributes: ["StatusName"] },
          {
            model: PaymentStatus,
            as: "PaymentStatus",
            attributes: ["PaymentStatusName"],
          },
          { model: OrderDetails, as: "OrderDetails" },
        ],
      });

      return res.json({
        success: true,
        message: "Hủy đơn hàng thành công!",
        order: cancelledOrder,
      });
    }

    return res.json({
      success: false,
      message: "Không thể hủy đơn hàng ở trạng thái hiện tại!",
    });
  } catch (err) {
    console.error("CANCEL ORDER ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi hủy đơn hàng: " + err.message,
    });
  }
};

// =========================
// 📌 LẤY CHI TIẾT ĐƠN HÀNG THEO ID (MỚI, NORMALIZED) - THÊM SHIPPINGFEE, DISCOUNT, VOUCHERCODE
// =========================
const getOrderDetail = async (req, res) => {
  try {
    const { id: orderId } = req.params;
    const userId = req.user.id;
    if (!orderId || isNaN(parseInt(orderId))) {
      return res
        .status(400)
        .json({ success: false, message: "OrderId không hợp lệ!" });
    }
    // Lấy chi tiết đơn hàng - THÊM INCLUDE Users để lấy FullName (ReceiverName) & Phone
    const order = await Orders.findOne({
      where: { OrderId: orderId, UserId: userId },
      include: [
        {
          model: OrderStatus,
          as: "Status",
          attributes: ["StatusId", "StatusName"], // ✅ Đúng tên theo SQL: StatusName
        },
        {
          model: PhuongThucThanhToan,
          as: "PaymentMethod",
          attributes: ["Id", "TenPhuongThuc"], // ✅ Đúng tên theo SQL: TenPhuongThuc (thêm Id nếu cần)
        },
        {
          model: PaymentStatus,
          as: "PaymentStatus",
          attributes: ["PaymentStatusId", "PaymentStatusName"], // ✅ Đúng tên theo SQL: PaymentStatusName
        },
        {
          model: Vouchers, // ✅ THÊM: Để lấy mã giảm giá (Code)
          as: "Voucher",
          attributes: ["VoucherId", "Code"],
          required: false, // Optional nếu không có voucher
        },
        {
          // ✅ THÊM: Include Users để lấy FullName (ReceiverName) & Phone fallback
          model: Users,
          as: "User",
          attributes: ["FullName", "Phone"],
          required: false,
        },
        {
          model: OrderDetails,
          as: "OrderDetails",
          include: [
            { model: Food, as: "Food", attributes: ["FoodName"] },
            { model: Size, as: "Size", attributes: ["SizeName"] },
            {
              model: OrderDetails_Topping,
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
        .json({ success: false, message: "Không tìm thấy đơn hàng!" });
    }
    const o = order.toJSON();
    console.log("Raw order check - Payment & Status & User:", {
      PaymentMethod: o.PaymentMethod,
      PaymentStatus: o.PaymentStatus,
      Voucher: o.Voucher,
      User: o.User, // ✅ DEBUG: Kiểm tra User join
    }); // ✅ DEBUG: Kiểm tra join đúng chưa (nếu null → check data/associations)

    // Normalize Payment Status / Method name - ĐÚNG THEO SQL
    const StatusName = o.Status?.StatusName || "Không xác định";
    const PaymentMethodName = o.PaymentMethod?.TenPhuongThuc || "Không có"; // ✅ TenPhuongThuc từ SQL
    const PaymentStatusName = o.PaymentStatus?.PaymentStatusName || "Không rõ"; // ✅ PaymentStatusName từ SQL
    const paymentStatusId =
      o.PaymentStatus?.PaymentStatusId || o.PaymentStatusId || null;

    // ✅ TÍNH SUBTOTAL TỪ ORDERDETAILS
    const subtotal = o.OrderDetails.reduce(
      (sum, detail) =>
        sum + parseFloat(detail.Price || 0) * (detail.Quantity || 1),
      0
    );

    // ✅ LẤY DISCOUNTAMOUNT VÀ VOUCHERCODE TỪ DB (theo cách 2)
    const discountAmount = parseFloat(o.DiscountAmount || 0);
    const voucherCode = o.Voucher?.Code || null; // ✅ Mã giảm giá từ Vouchers.Code

    // ✅ LẤY SHIPPINGFEE TỪ DB (theo cách 2)
    const shippingFee = parseFloat(o.ShippingFee || 0);

    // Verify TotalAmount (debug)
    const calculatedTotal = subtotal + shippingFee - discountAmount;
    if (Math.abs(calculatedTotal - parseFloat(o.TotalAmount)) > 0.01) {
      console.warn(
        `⚠️ Total mismatch: DB=${o.TotalAmount}, Calc=${calculatedTotal}`
      );
    }

    const isPaid = (() => {
      const pm = PaymentMethodName.toLowerCase();
      const ps = PaymentStatusName.toLowerCase();
      if (pm.includes("vnpay") || o.PaymentMethodId === 1)
        return (
          ps.includes("thanh") || ps.includes("paid") || ps.includes("success")
        );
      if (o.PaymentMethodId === 2 || pm.includes("cod")) return false; // COD chưa paid
      return ps.length > 0 && !ps.includes("chờ") && !ps.includes("pending");
    })();

    // Chuẩn hoá OrderDetails (giữ nguyên)
    const orderDetails = o.OrderDetails.map((detail) => ({
      FoodName: detail.Food?.FoodName || "Không xác định",
      SizeName: detail.Size?.SizeName || null,
      Toppings: (detail.OrderDetails_Toppings || []).map((t) => ({
        ToppingName: t.Topping?.ToppingName || "Không xác định",
      })),
      Quantity: detail.Quantity,
      Price: parseFloat(detail.Price),
    }));

    // Format trả về - THÊM SUBTOTAL, SHIPPINGFEE, DISCOUNTAMOUNT, VOUCHERCODE
    const result = {
      OrderId: o.OrderId,
      OrderDate: o.OrderDate,
      Subtotal: subtotal, // ✅ THÊM: Tổng sản phẩm trước ship + discount
      ShippingFee: shippingFee, // ✅ THÊM: Phí ship từ DB
      DiscountAmount: discountAmount, // ✅ THÊM: Giảm giá từ DB
      TotalAmount: parseFloat(o.TotalAmount),
      StatusId: o.StatusId,
      Status: StatusName,
      PaymentMethod: PaymentMethodName, // ✅ Đúng tên: TenPhuongThuc
      PaymentStatus: PaymentStatusName, // ✅ Đúng tên: PaymentStatusName
      PaymentMethodId: o.PaymentMethodId,
      PaymentStatusId: paymentStatusId,
      isPaid,
      VoucherCode: voucherCode, // ✅ THÊM: Mã giảm giá
      OrderDetails: orderDetails,
      // Địa chỉ: Ưu tiên DeliveryAddress từ Orders (theo schema mới)
      Address: o.DeliveryAddress || o.Address,
      Ward: o.Ward,
      District: o.District,
      Province: o.Province,
      ReceiverName: o.User?.FullName || null, // ✅ FIX: Lấy từ Users.FullName (không có cột ReceiverName trong Orders)
      Phone: o.Phone || o.User?.Phone || null, // ✅ FIX: Ưu tiên Phone từ Orders, fallback Users.Phone
    };
    res.json({ success: true, data: result });
  } catch (err) {
    console.error("❌ GET ORDER DETAIL ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy chi tiết đơn hàng: " + err.message,
    });
  }
};

module.exports = { getOrders, cancelOrder, getOrderDetail, confirmReceived };
