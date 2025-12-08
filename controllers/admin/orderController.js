const sequelize = require("../../config/sequelize");
const initModels = require("../../models/init-models");
const models = initModels(sequelize);
const { Sequelize, Op } = require("sequelize");
const {
  emitOrderStatusChange,
  emitUserNotification,
  emitAdminNotification,
} = require("../../utils/realtimeHelper");
const {
  getGHNOrderDetail,
  getGHNOrderByClientCode,
  mapGHNStatusToLocal,
} = require("../../services/ghnService");

const {
  Orders,
  Users,
  OrderStatus,
  PaymentStatus,
  PhuongThucThanhToan,
  OrderDetails,
  Food,
  Size,
  OrderDetails_Topping,
  Topping,
} = models;

/* =====================================================
   1️⃣ LẤY DANH SÁCH ĐƠN HÀNG (Admin) - HỖ TRỢ TAB
   GET /api/admin/orders?tab=cho-xac-nhan&page=1&pageSize=10
===================================================== */
exports.getOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const tab = req.query.tab || "cho-xac-nhan";

    let whereClause = {};

    // Lọc theo tab
    let statusName;
    switch (tab) {
      case "don-luu-tam":
        statusName = "Chưa hoàn tất";
        break;
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
        statusName = "Giao hàng thành công";
        break;
      case "da-huy":
        statusName = "Đã hủy";
        break;
      default:
        statusName = "Đặt hàng thành công";
    }

    // Lấy StatusId
    if (statusName) {
      const status = await OrderStatus.findOne({
        where: { StatusName: statusName },
      });
      if (status) {
        whereClause.StatusId = status.StatusId;
      } else {
        whereClause.StatusId = -1; // Không tồn tại
      }
    }

    // Tổng số đơn
    const totalOrders = await Orders.count({ where: whereClause });

    // Lấy danh sách đơn hàng phân trang
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
        "UserId",
      ],
      include: [
        {
          model: Users,
          as: "User",
          attributes: ["Id", "FullName"],
        },
        {
          model: PhuongThucThanhToan,
          as: "PaymentMethod",
          attributes: ["TenPhuongThuc"],
        },
        {
          model: OrderStatus,
          as: "Status",
          attributes: ["StatusName"],
        },
        {
          model: PaymentStatus,
          as: "PaymentStatus",
          attributes: ["PaymentStatusName", "PaymentStatusId"],
        },
      ],
    });

    // Lấy chi tiết đơn
    const orderIds = orders.map((o) => o.OrderId);
    let detailsMap = {};
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
            .map((ot) => ({ ToppingName: ot.Topping?.ToppingName }))
            .filter((t) => t.ToppingName),
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
      User: o.User,
      OrderDetails: detailsMap[o.OrderId] || [],
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
    console.error("❌ Lỗi lấy danh sách đơn hàng:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

/* =====================================================
   2️⃣ CẬP NHẬT TRẠNG THÁI ĐƠN HÀNG
   POST /api/admin/orders/:id/status
===================================================== */
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { statusId } = req.body;

    if (!id || !statusId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu dữ liệu!",
      });
    }

    const orderId = parseInt(id);
    const newStatusId = parseInt(statusId);

    // Tìm đơn hàng kèm PaymentStatus
    const order = await Orders.findByPk(orderId, {
      include: [{ model: PaymentStatus, as: "PaymentStatus" }],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng!",
      });
    }

    // Nếu đơn hàng đã hủy (OrderStatusId = 5) → không cho update
    if (order.StatusId === 5) {
      return res.status(400).json({
        success: false,
        message: "Đơn hàng đã hủy, không thể cập nhật trạng thái!",
      });
    }

    // Nếu thanh toán thất bại (PaymentStatusId = 3) → không cho update
    if (order.PaymentStatusId === 3) {
      return res.status(400).json({
        success: false,
        message: "Đơn hàng thanh toán thất bại, không thể cập nhật trạng thái!",
      });
    }

    // Kiểm tra trạng thái mới hợp lệ
    const status = await OrderStatus.findByPk(newStatusId);
    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Trạng thái không hợp lệ!",
      });
    }

    // Cập nhật trạng thái
    await order.update({ StatusId: newStatusId });

    // ✅ Emit real-time event
    const statusChangeData = {
      orderId: order.OrderId,
      status: status.StatusName,
      statusId: status.StatusId,
      message: `Đơn hàng đã được cập nhật sang trạng thái: ${status.StatusName}`,
    };

    emitOrderStatusChange(req, order.UserId, statusChangeData);
    emitUserNotification(req, order.UserId, {
      type: "order-status",
      title: "Cập nhật đơn hàng",
      message: `Đơn hàng #${order.OrderId} - ${status.StatusName}`,
    });
    emitAdminNotification(req, {
      type: "order-status",
      title: "Đã cập nhật trạng thái",
      message: `Đơn hàng #${order.OrderId} → ${status.StatusName}`,
      data: statusChangeData,
    });

    res.json({
      success: true,
      message: "Cập nhật trạng thái thành công!",
      newStatus: {
        StatusId: status.StatusId,
        StatusName: status.StatusName,
      },
    });
  } catch (err) {
    console.error("❌ Lỗi cập nhật trạng thái:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

/* =====================================================
   3️⃣ HỦY ĐƠN LƯU TẠM (Admin)
   POST /api/admin/orders/pending/:id/cancel
===================================================== */
exports.cancelPendingOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id);

    console.log(`[Admin] Đang hủy đơn lưu tạm #${orderId}...`);

    // Tìm đơn hàng
    const order = await Orders.findByPk(orderId, {
      include: [
        { model: OrderStatus, as: "Status" },
        { model: Users, as: "User" },
      ],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng!",
      });
    }

    // Kiểm tra đơn hàng phải là đơn lưu tạm (StatusId = 6)
    if (order.StatusId !== 6) {
      return res.status(400).json({
        success: false,
        message: `Không thể hủy đơn hàng này. Trạng thái hiện tại: ${
          order.Status?.StatusName || "N/A"
        }`,
      });
    }

    // Tìm status "Đã hủy" (ID = 5)
    const canceledStatus = await OrderStatus.findOne({
      where: { StatusName: "Đã hủy" },
    });

    if (!canceledStatus) {
      console.error("❌ Không tìm thấy trạng thái 'Đã hủy' trong DB!");
      return res.status(500).json({
        success: false,
        message: "Lỗi hệ thống: Không tìm thấy trạng thái hủy đơn",
      });
    }

    // Cập nhật trạng thái sang "Đã hủy"
    await order.update({ StatusId: canceledStatus.StatusId });

    console.log(`✅ [Admin] Đã hủy đơn lưu tạm #${orderId}`);

    // ✅ Emit real-time event
    const statusChangeData = {
      orderId: order.OrderId,
      status: canceledStatus.StatusName,
      statusId: canceledStatus.StatusId,
      message: `Đơn lưu tạm đã được Admin hủy`,
    };

    if (order.UserId) {
      emitOrderStatusChange(req, order.UserId, statusChangeData);
      emitUserNotification(req, order.UserId, {
        type: "order-status",
        title: "Đơn hàng bị hủy",
        message: `Đơn lưu tạm #${order.OrderId} đã bị Admin hủy`,
      });
    }

    emitAdminNotification(req, {
      type: "order-status",
      title: "Đã hủy đơn lưu tạm",
      message: `Admin đã hủy đơn #${order.OrderId}`,
      data: statusChangeData,
    });

    res.json({
      success: true,
      message: "Đã hủy đơn lưu tạm thành công!",
      order: {
        OrderId: order.OrderId,
        StatusId: canceledStatus.StatusId,
        StatusName: canceledStatus.StatusName,
      },
    });
  } catch (err) {
    console.error("❌ Lỗi hủy đơn lưu tạm:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi hủy đơn lưu tạm",
    });
  }
};

/* =====================================================
   4️⃣ ĐỒNG BỘ TRẠNG THÁI ĐƠN HÀNG TỪ GHN
   POST /api/admin/orders/:id/sync-ghn
===================================================== */
exports.syncGHNOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const orderId = parseInt(id);

    const order = await Orders.findByPk(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng!",
      });
    }

    // Lấy ClientOrderCode từ DB
    const clientOrderCode = order.ClientOrderCode;
    if (!clientOrderCode) {
      return res.status(400).json({
        success: false,
        message: "Đơn hàng không có mã GHN (ClientOrderCode)!",
      });
    }

    // Lấy thông tin từ GHN
    console.log(
      `🔄 Syncing order ${orderId} with GHN code: ${clientOrderCode}`
    );
    const ghnOrder = await getGHNOrderByClientCode(clientOrderCode);

    if (!ghnOrder) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng trên GHN!",
      });
    }

    // Map trạng thái GHN sang local
    const ghnStatus = ghnOrder.status; // e.g., "cancel", "delivered", etc.
    const newStatusId = mapGHNStatusToLocal(ghnStatus);

    console.log(`📦 GHN Status: ${ghnStatus} -> Local Status: ${newStatusId}`);

    // Cập nhật trạng thái nếu khác
    if (order.StatusId !== newStatusId) {
      await order.update({ StatusId: newStatusId });

      const status = await OrderStatus.findByPk(newStatusId);

      // Emit real-time event
      const statusChangeData = {
        orderId: order.OrderId,
        status: status.StatusName,
        statusId: status.StatusId,
        message: `Đơn hàng đã được đồng bộ từ GHN: ${status.StatusName}`,
        ghnStatus,
      };

      emitOrderStatusChange(req, order.UserId, statusChangeData);
      emitUserNotification(req, order.UserId, {
        type: "order-status",
        title: "Cập nhật đơn hàng",
        message: `Đơn hàng #${order.OrderId} - ${status.StatusName}`,
      });
      emitAdminNotification(req, {
        type: "order-sync",
        title: "Đồng bộ trạng thái từ GHN",
        message: `Đơn hàng #${order.OrderId} → ${status.StatusName}`,
        data: statusChangeData,
      });

      return res.json({
        success: true,
        message: "Đồng bộ trạng thái thành công!",
        data: {
          orderId: order.OrderId,
          oldStatus: order.StatusId,
          newStatus: newStatusId,
          ghnStatus,
          ghnOrder: {
            order_code: ghnOrder.order_code,
            status: ghnOrder.status,
            updated_date: ghnOrder.updated_date,
          },
        },
      });
    } else {
      return res.json({
        success: true,
        message: "Trạng thái đã đồng bộ, không có thay đổi!",
        data: {
          orderId: order.OrderId,
          currentStatus: order.StatusId,
          ghnStatus,
        },
      });
    }
  } catch (err) {
    console.error("❌ Lỗi đồng bộ trạng thái GHN:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Lỗi server",
    });
  }
};

/* =====================================================
   5️⃣ XÁC NHẬN / TỪ CHỐI ĐƠN HÀNG QR CODE
   ===================================================== */
exports.confirmOrRejectQR = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // "confirm" hoặc "reject"

    if (!id || !action) {
      return res.status(400).json({
        success: false,
        message: "Thiếu dữ liệu!",
      });
    }

    const orderId = parseInt(id);

    // Tìm đơn hàng
    const order = await Orders.findByPk(orderId, {
      include: [
        { model: PaymentStatus, as: "PaymentStatus" },
        { model: OrderStatus, as: "OrderStatus" },
        { model: PhuongThucThanhToan, as: "PaymentMethod" },
      ],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng!",
      });
    }

    // Kiểm tra phương thức thanh toán phải là QR CODE (id = 3)
    if (order.PaymentMethodId !== 3) {
      return res.status(400).json({
        success: false,
        message: "Đơn hàng này không phải thanh toán QR CODE!",
      });
    }

    // Kiểm tra trạng thái đơn hàng phải là "Đặt hàng thành công" (id = 1)
    if (order.StatusId !== 1) {
      return res.status(400).json({
        success: false,
        message: "Đơn hàng đã được xử lý rồi!",
      });
    }

    let newStatusId;
    let message;

    if (action === "confirm") {
      // Xác nhận → Chuyển sang "Đang chuẩn bị đơn hàng" (id = 2)
      newStatusId = 2;
      message = "Đơn hàng QR CODE đã được xác nhận và chuyển sang chuẩn bị";
    } else if (action === "reject") {
      // Từ chối → Chuyển sang "Đã hủy" (id = 5)
      newStatusId = 5;
      message = "Đơn hàng QR CODE đã bị từ chối";
    } else {
      return res.status(400).json({
        success: false,
        message: "Action không hợp lệ! (confirm hoặc reject)",
      });
    }

    // Cập nhật trạng thái
    await order.update({ StatusId: newStatusId });

    // Emit real-time notification
    const newStatus = await OrderStatus.findByPk(newStatusId);
    emitOrderStatusChange(req, order.UserId, {
      orderId: order.OrderId,
      status: newStatus.StatusName,
      statusId: newStatus.StatusId,
      message: `Đơn hàng QR CODE - ${message}`,
    });

    emitUserNotification(req, order.UserId, {
      type: "order-qr-status",
      title:
        action === "confirm" ? "Đơn hàng được xác nhận" : "Đơn hàng bị từ chối",
      message: `Đơn hàng #${order.OrderId} - ${newStatus.StatusName}`,
    });

    res.json({
      success: true,
      message,
      orderId: order.OrderId,
      newStatus: newStatus.StatusName,
    });
  } catch (err) {
    console.error("❌ Lỗi xác nhận/từ chối QR:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Lỗi server",
    });
  }
};
