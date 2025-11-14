// backend/controllers/user/orders/pending.js
const { sequelize, models, Op } = require("./config");
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
    const { orderItems, newAddress } = req.body;
    if (!orderItems || !orderItems.length)
      return res.json({ success: false, message: "Không có sản phẩm để lưu" });

    // Lấy hoặc tạo Status "Chưa hoàn tất"
    const [status] = await OrderStatus.findOrCreate({
      where: { StatusName: "Chưa hoàn tất" },
      defaults: { StatusName: "Chưa hoàn tất" },
      transaction,
    });

    // Kiểm tra đơn tạm gần đây trùng
    const recent = await Orders.findOne({
      where: {
        UserId: req.user.id,
        StatusId: status.StatusId,
        DeliveryAddress: newAddress || null,
        TotalAmount: orderItems.reduce((s, it) => s + (it.TotalPrice || 0), 0),
        OrderDate: {
          [Op.gt]: sequelize.literal("DATEADD(minute, -30, GETDATE())"),
        },
      },
      transaction,
    });
    if (recent) {
      await transaction.commit();
      return res.json({
        success: true,
        message: "Đã có đơn tạm tương tự gần đây, sử dụng đơn hiện có",
        orderId: recent.OrderId,
      });
    }

    // Tạo đơn tạm mới
    const order = await Orders.create(
      {
        UserId: req.user.id,
        OrderDate: new Date(),
        TotalAmount: orderItems.reduce((s, it) => s + (it.TotalPrice || 0), 0),
        PaymentMethodId: null, // Chưa chọn
        StatusId: status.StatusId, // Chưa hoàn tất
        DeliveryAddress: newAddress || null,
      },
      { transaction }
    );

    for (const it of orderItems) {
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

      for (const t of it.ToppingIDs || []) {
        await OrderDetails_Topping.create(
          { OrderDetailId: od.OrderDetailId, ToppingId: t },
          { transaction }
        );
      }
    }

    await transaction.commit();
    res.json({
      success: true,
      message: "Lưu đơn hàng chưa hoàn tất thành công",
      orderId: order.OrderId,
    });
  } catch (err) {
    await transaction.rollback();
    console.error("SAVE PENDING ERROR:", err);
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
    const [pendingStatus] = await OrderStatus.findOrCreate({
      where: { StatusName: "Chưa hoàn tất" },
      defaults: { StatusName: "Chưa hoàn tất" },
      transaction,
    });
    const [cancelledStatus] = await OrderStatus.findOrCreate({
      where: { StatusName: "Đã hủy" },
      defaults: { StatusName: "Đã hủy" },
      transaction,
    });
    if (!pendingStatus || !cancelledStatus) {
      console.error(
        "Could not find required statuses 'Chưa hoàn tất' or 'Đã hủy'."
      );
      await transaction.rollback();
      return;
    }
    const timeLimit = -15;
    const [affectedRows] = await Orders.update(
      { StatusId: cancelledStatus.StatusId },
      {
        where: {
          StatusId: pendingStatus.StatusId,
          OrderDate: {
            [Op.lt]: sequelize.literal(
              `NOW() + interval '${timeLimit} minutes'`
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
