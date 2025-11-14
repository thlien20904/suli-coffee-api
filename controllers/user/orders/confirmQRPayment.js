const { sequelize, models } = require("./config");
const jwt = require("jsonwebtoken");
const { createGHNOrder } = require("../../../services/ghnService");
const {
  emitOrderUpdate,
  emitUserNotification,
  emitAdminNotification,
} = require("../../../utils/realtimeHelper");

const { Orders } = models;

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

    console.log(`🚀 ===== CREATING GHN ORDER FOR QR PAYMENT #${orderId} =====`);

    // Create GHN order for QR payment (COD = 0, same as VNPay)
    try {
      await createGHNOrder(orderId, 0); // COD = 0 for QR payment
      console.log(`✅ QR Payment #${orderId} - GHN Order created successfully`);
    } catch (ghnError) {
      console.error(
        `❌ GHN Order creation failed for QR #${orderId}:`,
        ghnError.message
      );
      // Don't fail the confirmation if GHN fails - just log it
    }

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
