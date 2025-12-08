// backend/controllers/user/orders/pending.js
const sequelize = require("../../../config/sequelize");
const initModels = require("../../../models/init-models");
const models = initModels(sequelize);
const { Op } = require("sequelize");
const {
  Orders,
  OrderDetails,
  OrderStatus,
  PaymentStatus,
  Food,
  Size,
  OrderDetails_Topping,
  Topping,
  PhuongThucThanhToan,
} = models;

// ==============================
// API: GET /api/profile/orders/pending
// Lấy danh sách đơn lưu tạm (chưa hoàn tất) hoặc thanh toán thất bại
// Chỉ lấy những đơn chưa hoàn tất hoặc thanh toán thất bại, KHÔNG lấy đơn đã thanh toán thành công
// ==============================
exports.getPendingOrders = async (req, res) => {
  try {
    // Lấy các Status và PaymentStatus cần thiết
    const [pendingStatus, failedPaymentStatus, cancelledStatus] =
      await Promise.all([
        OrderStatus.findOne({ where: { StatusName: "Chưa hoàn tất" } }),
        PaymentStatus.findOne({
          where: { PaymentStatusName: "Thanh toán thất bại" },
        }),
        OrderStatus.findOne({ where: { StatusName: "Đã hủy" } }),
      ]);

    const orConditions = [];
    if (pendingStatus) orConditions.push({ StatusId: pendingStatus.StatusId });
    if (failedPaymentStatus)
      orConditions.push({
        PaymentStatusId: failedPaymentStatus.PaymentStatusId,
      });

    if (orConditions.length === 0) {
      return res.json({
        success: true,
        data: { orders: [], currentPage: 1, totalPages: 1 },
      });
    }

    // Loại bỏ đơn đã hủy
    const whereClause = {
      UserId: req.user.id,
      [Op.or]: orConditions,
      ...(cancelledStatus && {
        StatusId: { [Op.ne]: cancelledStatus.StatusId },
      }),
    };

    const orders = await Orders.findAll({
      where: whereClause,
      order: [["OrderDate", "DESC"]],
      include: [
        {
          model: OrderDetails,
          as: "OrderDetails",
          include: [
            {
              model: Food,
              as: "Food",
              attributes: [
                "FoodId",
                "FoodName",
                "ImageURL",
                "Price",
                "DiscountPrice",
              ],
            },
            {
              model: Size,
              as: "Size",
              attributes: ["SizeID", "SizeName", "ExtraPrice"],
            },
            {
              model: OrderDetails_Topping,
              as: "OrderDetails_Toppings",
              include: [
                {
                  model: Topping,
                  as: "Topping",
                  attributes: ["ToppingID", "ToppingName", "ToppingPrice"],
                },
              ],
            },
          ],
        },
        {
          model: PhuongThucThanhToan,
          as: "PaymentMethod",
          attributes: ["TenPhuongThuc"],
        },
        { model: OrderStatus, as: "Status", attributes: ["StatusName"] },
        {
          model: PaymentStatus,
          as: "PaymentStatus",
          attributes: ["PaymentStatusName"],
        },
      ],
    });

    const formattedOrders = orders.map((order) => ({
      OrderId: order.OrderId,
      OrderDate: order.OrderDate,
      TotalAmount: parseFloat(order.TotalAmount),
      PaymentMethod: order.PaymentMethod?.TenPhuongThuc || "Chưa chọn",
      Status: order.Status?.StatusName || "Chưa hoàn tất",
      PaymentStatus: order.PaymentStatus?.PaymentStatusName || null,
      StatusId: order.StatusId,
      OrderDetails: order.OrderDetails.map((d) => {
        const toppingSum = (d.OrderDetails_Toppings || []).reduce(
          (s, ot) => s + (parseFloat(ot.Topping?.ToppingPrice) || 0),
          0
        );
        const foodBase =
          d.Food && (d.Food.DiscountPrice || d.Food.Price)
            ? parseFloat(d.Food.DiscountPrice || d.Food.Price)
            : 0;
        const sizeExtra = d.Size ? parseFloat(d.Size.ExtraPrice || 0) : 0;
        const computedUnit = foodBase + sizeExtra + toppingSum;
        const unitPrice =
          d.Price !== undefined && d.Price !== null && Number(d.Price) > 0
            ? parseFloat(d.Price)
            : computedUnit;

        return {
          FoodName: d.Food.FoodName,
          SizeName: d.Size?.SizeName || null,
          Quantity: d.Quantity,
          Price: unitPrice,
          Toppings: d.OrderDetails_Toppings.map((ot) => ({
            ToppingID: ot.Topping.ToppingID,
            ToppingName: ot.Topping.ToppingName,
            ToppingPrice: parseFloat(ot.Topping.ToppingPrice),
          })),
        };
      }),
    }));

    res.json({
      success: true,
      data: { orders: formattedOrders, currentPage: 1, totalPages: 1 },
    });
  } catch (err) {
    console.error("GET PENDING ORDERS ERROR:", err);
    res
      .status(500)
      .json({ success: false, message: "Lỗi server", detail: err.message });
  }
};

// ==============================
// API: POST /api/profile/orders/save-pending
// Lưu đơn hàng tạm (Chưa hoàn tất, hoặc thanh toán thất bại)
// ✅ Chỉ lưu đơn tạm, KHÔNG lưu đơn thanh toán thành công
// ==============================
exports.savePending = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    console.log("📝 Save pending request body:", req.body);
    console.log("👤 User from token:", req.user);

    const { orderItems, newAddress } = req.body;
    if (!orderItems || !orderItems.length) {
      await transaction.rollback();
      return res.json({ success: false, message: "Không có sản phẩm để lưu" });
    }

    if (!req.user || !req.user.id) {
      await transaction.rollback();
      return res
        .status(401)
        .json({ success: false, message: "Chưa đăng nhập" });
    }

    // ✅ Tìm Status "Chưa hoàn tất" có sẵn trong DB (StatusId = 6)
    const status = await OrderStatus.findOne({
      where: { StatusName: "Chưa hoàn tất" },
      transaction,
    });

    if (!status) {
      await transaction.rollback();
      console.error("❌ Status 'Chưa hoàn tất' not found in database!");
      return res.status(500).json({
        success: false,
        message: "Lỗi hệ thống: Không tìm thấy trạng thái 'Chưa hoàn tất'",
      });
    }

    console.log("✅ Found status 'Chưa hoàn tất':", status.StatusId);

    // ✅ Tìm PaymentStatus "Chờ thanh toán" có sẵn
    const paymentStatus = await PaymentStatus.findOne({
      where: { PaymentStatusName: "Chờ thanh toán" },
      transaction,
    });

    if (!paymentStatus) {
      await transaction.rollback();
      console.error("❌ PaymentStatus 'Chờ thanh toán' not found in database!");
      return res.status(500).json({
        success: false,
        message: "Lỗi hệ thống: Không tìm thấy trạng thái thanh toán",
      });
    }

    // Kiểm tra đơn tạm gần đây trùng
    const recent = await Orders.findOne({
      where: {
        UserId: req.user.id,
        StatusId: status.StatusId,
        DeliveryAddress: newAddress || null,
        TotalAmount: orderItems.reduce((s, it) => s + (it.TotalPrice || 0), 0),
        OrderDate: {
          [Op.gt]: sequelize.literal("NOW() - INTERVAL '30 minutes'"),
        },
      },
      transaction,
    });

    if (recent) {
      await transaction.commit();
      console.log("✅ Found recent pending order:", recent.OrderId);
      return res.json({
        success: true,
        message: "Đã có đơn tạm tương tự gần đây, sử dụng đơn hiện có",
        orderId: recent.OrderId,
      });
    }

    // Tìm hoặc tạo PaymentMethod mặc định cho đơn tạm
    const [defaultPaymentMethod] = await PhuongThucThanhToan.findOrCreate({
      where: { TenPhuongThuc: "Chưa chọn" },
      defaults: { TenPhuongThuc: "Chưa chọn" },
      transaction,
    });
    console.log("✅ Default PaymentMethod:", defaultPaymentMethod.Id);

    // Tạo đơn tạm mới
    const order = await Orders.create(
      {
        UserId: req.user.id,
        OrderDate: new Date(),
        TotalAmount: orderItems.reduce((s, it) => s + (it.TotalPrice || 0), 0),
        PaymentMethodId: defaultPaymentMethod.Id, // ✅ Phương thức thanh toán mặc định
        PaymentStatusId: paymentStatus.PaymentStatusId,
        StatusId: status.StatusId,
        DeliveryAddress: newAddress || null,
        CuaHangId: null,
      },
      { transaction }
    );

    console.log("✅ Created pending order:", order.OrderId);

    // Validate và tạo OrderDetails
    for (const it of orderItems) {
      console.log("📦 Creating order detail for Food:", it.FoodId);

      // Validate FoodId exists
      const foodExists = await Food.findByPk(it.FoodId, { transaction });
      if (!foodExists) {
        console.warn("⚠️ Food not found, skipping:", it.FoodId);
        continue;
      }

      const od = await OrderDetails.create(
        {
          OrderId: order.OrderId,
          FoodId: it.FoodId,
          SizeId: it.SizeID || null,
          Quantity: it.Quantity || 1,
          Price: (it.TotalPrice || 0) / (it.Quantity || 1),
        },
        { transaction }
      );

      if (it.ToppingIDs && it.ToppingIDs.length > 0) {
        console.log("🍰 Adding toppings:", it.ToppingIDs);
        for (const t of it.ToppingIDs || []) {
          await OrderDetails_Topping.create(
            { OrderDetailId: od.OrderDetailId, ToppingId: t },
            { transaction }
          );
        }
      }
    }

    await transaction.commit();
    console.log("✅ Transaction committed successfully");

    res.json({
      success: true,
      message: "Lưu đơn hàng chưa hoàn tất thành công",
      orderId: order.OrderId,
    });
  } catch (err) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    console.error("❌ SAVE PENDING ERROR:", err.message);
    console.error("❌ Error stack:", err.stack);
    res.status(500).json({
      success: false,
      message: "Lỗi khi lưu đơn hàng",
      detail: err.message,
    });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const id = parseInt(req.params.orderId, 10);
    if (!id)
      return res
        .status(400)
        .json({ success: false, message: "OrderId không hợp lệ" });
    const order = await Orders.findOne({
      where: { OrderId: id, UserId: req.user.id },
      include: [
        {
          model: OrderDetails,
          as: "OrderDetails",
          include: [
            {
              model: Food,
              as: "Food",
              attributes: [
                "FoodId",
                "FoodName",
                "ImageURL",
                "Price",
                "DiscountPrice",
              ],
            },
            {
              model: Size,
              as: "Size",
              attributes: ["SizeID", "SizeName", "ExtraPrice"],
            },
            {
              model: OrderDetails_Topping,
              as: "OrderDetails_Toppings",
              include: [
                {
                  model: Topping,
                  as: "Topping",
                  attributes: ["ToppingID", "ToppingName", "ToppingPrice"],
                },
              ],
            },
          ],
        },
        // Include payment/status information so frontend can display total & status
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
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy đơn" });
    const items = order.OrderDetails.map((d) => ({
      FoodId: d.Food.FoodId,
      FoodName: d.Food.FoodName,
      ImageURL: d.Food.ImageURL,
      Price: parseFloat(d.Price),
      DiscountPrice: d.Food.DiscountPrice
        ? parseFloat(d.Food.DiscountPrice)
        : null,
      Size: d.Size
        ? {
            SizeID: d.Size.SizeID,
            SizeName: d.Size.SizeName,
            ExtraPrice: d.Size.ExtraPrice,
          }
        : null,
      Toppings: d.OrderDetails_Toppings.map((ot) => ({
        ToppingID: ot.Topping.ToppingID,
        ToppingName: ot.Topping.ToppingName,
        ToppingPrice: parseFloat(ot.Topping.ToppingPrice),
      })),
      Quantity: d.Quantity,
      TotalPrice: parseFloat(d.Price) * (d.Quantity || 1),
    }));

    // Build a full order object consistent with other APIs (OrderId, OrderDate, TotalAmount, Status, PaymentStatus, DeliveryAddress, OrderDetails, ...)
    const formattedOrder = {
      OrderId: order.OrderId,
      OrderDate: order.OrderDate,
      TotalAmount:
        parseFloat(order.TotalAmount) ||
        items.reduce((s, it) => s + (it.TotalPrice || 0), 0),
      Status: order.Status?.StatusName || null,
      PaymentStatus: order.PaymentStatus?.PaymentStatusName || null,
      PaymentMethod: order.PaymentMethod?.TenPhuongThuc || null,
      DeliveryAddress: order.DeliveryAddress || null,
      OrderDetails: items,
    };

    res.json({ success: true, data: formattedOrder });
  } catch (err) {
    console.error("GET ORDER BY ID ERROR:", err);
    res
      .status(500)
      .json({ success: false, message: "Lỗi server", detail: err.message });
  }
};

exports.autoCancelPendingOrders = async () => {
  const transaction = await sequelize.transaction();
  try {
    // ✅ Tìm status có sẵn trong DB thay vì findOrCreate
    const pendingStatus = await OrderStatus.findOne({
      where: { StatusName: "Chưa hoàn tất" },
      transaction,
    });
    const cancelledStatus = await OrderStatus.findOne({
      where: { StatusName: "Đã hủy" },
      transaction,
    });

    if (!pendingStatus || !cancelledStatus) {
      console.error(
        "❌ Auto-cancel: Could not find required statuses 'Chưa hoàn tất' or 'Đã hủy'."
      );
      await transaction.rollback();
      return;
    }

    console.log("🔄 Auto-cancel: Found statuses -", {
      pending: pendingStatus.StatusId,
      cancelled: cancelledStatus.StatusId,
    });
    const timeLimit = 5; // ✅ Hủy đơn cũ hơn 5 phút
    const [affectedRows] = await Orders.update(
      { StatusId: cancelledStatus.StatusId },
      {
        where: {
          StatusId: pendingStatus.StatusId,
          OrderDate: {
            [Op.lt]: sequelize.literal(
              `NOW() - interval '${timeLimit} minutes'`
            ),
          },
        },
        transaction,
      }
    );
    if (affectedRows > 0) {
      console.log(`Auto-cancelled ${affectedRows} pending orders.`);
    }
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    console.error("Auto-cancel pending orders failed:", err);
  }
};

// ==============================
// API: POST /api/orders/pending/:orderId/cancel
// Hủy đơn hàng tạm bởi người dùng
// ==============================
exports.cancelPendingOrder = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { orderId } = req.params;

    // ✅ Log request info
    console.log("📥 CANCEL PENDING ORDER REQUEST:", {
      orderId,
      userId: req.user?.id,
      userEmail: req.user?.email,
    });

    // Tìm đơn hàng
    const order = await Orders.findOne({
      where: {
        OrderId: parseInt(orderId),
        UserId: req.user.id, // Chỉ cho phép hủy đơn của chính mình
      },
      transaction,
    });

    console.log(
      "🔍 Found order:",
      order
        ? {
            OrderId: order.OrderId,
            StatusId: order.StatusId,
            UserId: order.UserId,
          }
        : "NOT FOUND"
    );

    if (!order) {
      await transaction.rollback();
      console.log("❌ Order not found for userId:", req.user.id);
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng",
      });
    }

    // Kiểm tra trạng thái đơn hàng
    const orderStatus = await OrderStatus.findByPk(order.StatusId, {
      transaction,
    });

    console.log(
      "📊 Order status:",
      orderStatus
        ? {
            StatusId: orderStatus.StatusId,
            StatusName: orderStatus.StatusName,
          }
        : "NOT FOUND"
    );

    // ✅ Kiểm tra orderStatus tồn tại trước
    if (!orderStatus) {
      await transaction.rollback();
      console.log("❌ OrderStatus not found for StatusId:", order.StatusId);
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy trạng thái đơn hàng",
      });
    }

    // Chỉ cho phép hủy đơn "Chưa hoàn tất"
    if (orderStatus.StatusName !== "Chưa hoàn tất") {
      await transaction.rollback();
      console.log(
        "❌ Cannot cancel order with status:",
        orderStatus.StatusName
      );
      return res.status(400).json({
        success: false,
        message: `Không thể hủy đơn hàng này. Trạng thái hiện tại: ${orderStatus.StatusName}. Chỉ có thể hủy đơn chưa hoàn tất.`,
      });
    }

    // ✅ Tìm trạng thái "Đã hủy" có sẵn trong DB (StatusId = 5)
    const cancelledStatus = await OrderStatus.findOne({
      where: { StatusName: "Đã hủy" },
      transaction,
    });

    if (!cancelledStatus) {
      await transaction.rollback();
      console.error("❌ Status 'Đã hủy' not found in database!");
      return res.status(500).json({
        success: false,
        message: "Lỗi hệ thống: Không tìm thấy trạng thái 'hủy'",
      });
    }

    console.log(
      "🔄 Updating order to cancelled status:",
      cancelledStatus.StatusId
    );

    await order.update({ StatusId: cancelledStatus.StatusId }, { transaction });

    await transaction.commit();

    console.log("✅ Order cancelled successfully:", orderId);

    res.json({
      success: true,
      message: "Đã hủy đơn hàng thành công",
    });
  } catch (err) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    console.error("❌ CANCEL PENDING ORDER ERROR:", {
      message: err.message,
      stack: err.stack,
      orderId: req.params?.orderId,
      userId: req.user?.id,
    });
    res.status(500).json({
      success: false,
      message: "Lỗi khi hủy đơn hàng",
      detail: err.message,
    });
  }
};
