const { sequelize, models } = require("./config");
const jwt = require("jsonwebtoken");
const { createGHNOrder } = require("../../../services/ghnService");
const { sendOrderConfirmation } = require("../../../services/emailService");
const {
  emitOrderUpdate,
  emitUserNotification,
  emitAdminNotification,
} = require("../../../utils/realtimeHelper");

const { Orders, Users, OrderDetails, Food, DeliveryAddresses } = models;

// ===================== AUTH =====================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.split(" ")[1];
  if (!token)
    return res
      .status(401)
      .json({ success: false, message: "Bạn chưa đăng nhập!" });

  jwt.verify(
    token,
    process.env.JWT_SECRET || "abc123xyz789longrandomstringhere",
    (err, user) => {
      if (err)
        return res
          .status(403)
          .json({ success: false, message: "Token không hợp lệ!" });
      req.user = user;
      next();
    }
  );
};

// ===================== CONFIRM QR PAYMENT =====================
const confirmQRPayment = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu mã đơn hàng!",
      });
    }

    // Tìm đơn hàng
    const order = await Orders.findByPk(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng!",
      });
    }

    // Kiểm tra đơn hàng thuộc về user này
    if (order.UserId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền truy cập đơn hàng này!",
      });
    }

    // Kiểm tra trạng thái thanh toán
    if (order.PaymentStatusId === 2) {
      return res.status(400).json({
        success: false,
        message: "Đơn hàng đã được thanh toán rồi!",
      });
    }

    // Tìm PaymentStatus "Đã thanh toán"
    const paidStatus = await models.PaymentStatus.findOne({
      where: { PaymentStatusName: "Đã thanh toán" },
    });

    if (!paidStatus) {
      return res.status(500).json({
        success: false,
        message: "Không tìm thấy trạng thái thanh toán!",
      });
    }

    // Update PaymentStatus sang "Đã thanh toán" + note
    const currentNote = order.Note || "";
    const newNote = currentNote
      ? `${currentNote}\n[User xác nhận đã thanh toán QR lúc ${new Date().toLocaleString(
          "vi-VN"
        )}]`
      : `[User xác nhận đã thanh toán QR lúc ${new Date().toLocaleString(
          "vi-VN"
        )}]`;

    await order.update({
      PaymentStatusId: paidStatus.PaymentStatusId,
      Note: newNote,
    });

    // ✅ Gửi email xác nhận QR payment (async, non-blocking)
    setImmediate(async () => {
      try {
        const user = await Users.findByPk(order.UserId);
        if (user && user.Email) {
          const orderDetails = await OrderDetails.findAll({
            where: { OrderId: orderId },
            include: [{ model: Food, as: "Food" }],
          });

          const orderItems = orderDetails.map((item) => ({
            name: item.Food?.FoodName || "Sản phẩm",
            quantity: item.Quantity,
            price: parseFloat(item.Price || 0),
          }));

          const deliveryAddr = await DeliveryAddresses.findOne({
            where: {
              UserId: order.UserId,
              Province: order.Province,
              District: order.District,
              Ward: order.Ward,
            },
          });

          await sendOrderConfirmation(
            user.Email,
            user.FullName || user.Username,
            {
              orderId: order.OrderId,
              orderDate: order.OrderDate,
              items: orderItems,
              totalAmount: parseFloat(order.TotalAmount),
              shippingAddress:
                order.DeliveryAddress ||
                `${order.Ward}, ${order.District}, ${order.Province}`,
              phone: deliveryAddr?.Phone || order.Phone || "Chưa cập nhật",
              paymentMethod: "QR Code",
            }
          );
          console.log(`✅ QR payment email sent to: ${user.Email}`);
        }
      } catch (emailErr) {
        console.error(
          `❌ QR payment email error (non-critical):`,
          emailErr.message
        );
      }
    });

    console.log(`🚀 ===== CREATING GHN ORDER FOR QR PAYMENT #${orderId} =====`);

    // Create GHN order for QR payment (COD = 0, same as VNPay) - ASYNC
    setImmediate(async () => {
      try {
        await createGHNOrder(orderId, 0); // COD = 0 for QR payment
        console.log(
          `✅ QR Payment #${orderId} - GHN Order created successfully`
        );
      } catch (ghnError) {
        console.error(
          `❌ GHN Order creation failed for QR #${orderId}:`,
          ghnError.message
        );
      }
    });

    // Emit notification (non-blocking)
    try {
      emitAdminNotification(req, {
        type: "qr_payment_confirmation",
        message: `Đơn hàng #${orderId} - User xác nhận đã thanh toán qua QR. Vui lòng kiểm tra và duyệt!`,
        orderId: orderId,
      });

      emitUserNotification(req, req.user.id, {
        type: "qr_payment_confirmed",
        message: `Đơn hàng #${orderId} đang chờ admin xác nhận thanh toán`,
        orderId: orderId,
      });
    } catch (emitErr) {
      console.error("❌ Real-time emit error (non-critical):", emitErr.message);
    }

    return res.json({
      success: true,
      message:
        "Xác nhận thành công! Đơn hàng đang chờ admin kiểm tra thanh toán.",
      orderId: orderId,
    });
  } catch (err) {
    console.error("Confirm QR payment error:", err);
    return res.status(500).json({
      success: false,
      message: "Lỗi server khi xác nhận thanh toán!",
      error: err.message,
    });
  }
};

module.exports = [authenticateToken, confirmQRPayment];
