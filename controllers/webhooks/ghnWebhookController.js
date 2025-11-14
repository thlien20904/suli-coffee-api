const sequelize = require("../../config/sequelize");
const initModels = require("../../models/init-models");
const models = initModels(sequelize);
const { Orders, OrderStatus } = models;
const { mapGHNStatusToLocal } = require("../../services/ghnService");
const {
  emitOrderStatusChange,
  emitUserNotification,
  emitAdminNotification,
} = require("../../utils/realtimeHelper");

/**
 * Webhook handler nhận thông báo từ GHN khi đơn hàng thay đổi trạng thái
 * POST /api/webhooks/ghn
 */
exports.handleGHNWebhook = async (req, res) => {
  try {
    const { OrderCode, Status, Reason, Time, CODAmount } = req.body;

    console.log("\n🔔 ===== GHN WEBHOOK RECEIVED =====");
    console.log("OrderCode:", OrderCode);
    console.log("Status:", Status);
    console.log("Reason:", Reason);
    console.log("Time:", Time);
    console.log("====================================\n");

    if (!OrderCode || !Status) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: OrderCode, Status",
      });
    }

    // Tìm đơn hàng theo ClientOrderCode (format: ORDER-{OrderId})
    // Nếu không có ClientOrderCode, bỏ qua webhook này
    const order = await Orders.findOne({
      where: {
        ClientOrderCode: {
          [sequelize.Sequelize.Op.like]: `%${OrderCode}%`,
        },
      },
    });

    if (!order) {
      console.log(`⚠️ Order not found for GHN OrderCode: ${OrderCode}`);
      // Vẫn trả 200 để GHN không retry
      return res.json({
        success: true,
        message: "Order not found, ignored",
      });
    }

    // Map trạng thái GHN sang local
    const newStatusId = mapGHNStatusToLocal(Status);

    // Cập nhật trạng thái nếu khác
    if (order.StatusId !== newStatusId) {
      await order.update({ StatusId: newStatusId });

      const status = await OrderStatus.findByPk(newStatusId);

      console.log(
        `✅ Order #${order.OrderId} status updated: ${Status} → ${status.StatusName}`
      );

      // Emit real-time event
      const statusChangeData = {
        orderId: order.OrderId,
        status: status.StatusName,
        statusId: status.StatusId,
        message: `Đơn hàng đã được cập nhật từ GHN: ${status.StatusName}`,
        ghnStatus: Status,
        reason: Reason || "",
      };

      emitOrderStatusChange(req, order.UserId, statusChangeData);
      emitUserNotification(req, order.UserId, {
        type: "order-status",
        title: "Cập nhật đơn hàng",
        message: `Đơn hàng #${order.OrderId} - ${status.StatusName}${
          Reason ? `: ${Reason}` : ""
        }`,
      });
      emitAdminNotification(req, {
        type: "order-ghn-webhook",
        title: "GHN Webhook - Cập nhật trạng thái",
        message: `Đơn hàng #${order.OrderId} → ${status.StatusName}`,
        data: statusChangeData,
      });
    }

    res.json({
      success: true,
      message: "Webhook processed successfully",
      orderId: order.OrderId,
      newStatus: newStatusId,
    });
  } catch (error) {
    console.error("❌ GHN Webhook Error:", error);
    res.status(500).json({
      success: false,
      message: "Webhook processing failed",
      error: error.message,
    });
  }
};
