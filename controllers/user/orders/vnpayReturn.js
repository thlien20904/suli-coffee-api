const { sequelize, models } = require("./config");
const {
  Orders,
  ShippingOrders,
  PaymentStatus,
  OrderStatus,
  OrderDetails,
  Food,
  Size,
  OrderDetails_Topping,
  Topping,
  GioHang,
  GioHang_Topping,
  DeliveryAddresses,
  Users,
} = models;
const { VNPay } = require("vnpay");
const { createGHNOrder } = require("../../../services/ghnService");
const { sendOrderConfirmation } = require("../../../services/emailService");

// Cấu hình VNPay
const vnpay = new VNPay({
  tmnCode: process.env.VNP_TMN_CODE || process.env.VNPAY_TMN_CODE || "4Z1QBO45",
  secureSecret:
    process.env.VNP_SECURE_SECRET ||
    process.env.VNPAY_SECURE_SECRET ||
    "XQBSS9ZDQJCIKDZZ108ABV5RP6B32FOH",
  vnpayHost: "https://sandbox.vnpayment.vn",
  testMode: true,
  hashAlgorithm: "SHA512",
});

async function getPaymentStatusId(name) {
  try {
    const [record] = await PaymentStatus.findOrCreate({
      where: { PaymentStatusName: name },
      defaults: { PaymentStatusName: name },
    });
    console.log(
      `[getPaymentStatusId] Found/Created status "${name}" with ID: ${record.PaymentStatusId}`
    );
    return record.PaymentStatusId;
  } catch (err) {
    console.error(`[getPaymentStatusId] Error for "${name}":`, err);
    throw err;
  }
}

async function getOrderStatusId(name) {
  try {
    // Thử tìm với tên chính xác trước
    let record = await OrderStatus.findOne({
      where: { StatusName: name },
    });

    // Nếu không tìm thấy, thử với các tên tương tự
    if (!record && name === "Đặt hàng thành công") {
      const alternatives = ["Chờ xác nhận", "Pending", "pending", "confirmed"];
      for (const alt of alternatives) {
        record = await OrderStatus.findOne({
          where: { StatusName: alt },
        });
        if (record) {
          console.log(
            `[getOrderStatusId] Used alternative "${alt}" instead of "${name}"`
          );
          break;
        }
      }
    }

    // Nếu vẫn không tìm thấy, lấy status đầu tiên
    if (!record) {
      record = await OrderStatus.findOne({ order: [["StatusId", "ASC"]] });
      if (record) {
        console.warn(
          `[getOrderStatusId] "${name}" not found, using first available status: ${record.StatusName}`
        );
      }
    }

    const statusId = record?.StatusId || null;
    console.log(
      `[getOrderStatusId] Found status "${name}" with ID: ${statusId}`
    );
    return statusId;
  } catch (err) {
    console.error(`[getOrderStatusId] Error for "${name}":`, err);
    throw err;
  }
}

const vnpayReturn = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { vnp_TxnRef, vnp_TransactionStatus, vnp_Amount } = req.query;
    const orderId = parseInt(vnp_TxnRef); // vnp_TxnRef là orderId

    console.log(
      `[VNPay Return] Processing order ${orderId}, status: ${vnp_TransactionStatus}`
    );

    let verify;
    try {
      verify = vnpay.verifyReturnUrl(req.query);
    } catch (err) {
      console.error("VNPay verify error:", err);
      const failedStatusId = await getPaymentStatusId("Thanh toán thất bại");
      await Orders.update(
        { PaymentStatusId: failedStatusId },
        { where: { OrderId: orderId }, transaction }
      );
      await transaction.commit();
      return res.json({
        success: false,
        message: "Xác thực giao dịch VNPay thất bại (verify error).",
      });
    }

    if (!verify.isSuccess || vnp_TransactionStatus !== "00") {
      console.log(`[VNPay Return] Payment failed for order ${orderId}`);
      const failedStatusId = await getPaymentStatusId("Thanh toán thất bại");
      await Orders.update(
        { PaymentStatusId: failedStatusId },
        { where: { OrderId: orderId }, transaction }
      );
      await transaction.commit();
      return res.json({ success: false, message: "Thanh toán thất bại!" });
    }

    // Thanh toán thành công - Get IDs trước khi update
    console.log(
      `[VNPay Return] Payment successful for order ${orderId}, getting status IDs...`
    );

    const [paidStatusId, orderStatusId] = await Promise.all([
      getPaymentStatusId("Đã thanh toán"),
      getOrderStatusId("Đặt hàng thành công"),
    ]);

    console.log(
      `[VNPay Return] Status IDs - Payment: ${paidStatusId}, Order: ${orderStatusId}`
    );

    // Validate status IDs before update
    if (!paidStatusId) {
      throw new Error("Failed to get PaymentStatusId for 'Đã thanh toán'");
    }
    if (!orderStatusId) {
      throw new Error("Failed to get OrderStatusId for 'Đặt hàng thành công'");
    }

    // Check if order exists before update
    const existingOrder = await Orders.findByPk(orderId, { transaction });
    if (!existingOrder) {
      throw new Error(`Order ${orderId} not found`);
    }
    console.log(
      `[VNPay Return] Found order ${orderId}, current status: ${existingOrder.StatusId}, payment: ${existingOrder.PaymentStatusId}`
    );

    // Update Orders with explicit try-catch - only if values are different
    const updateFields = {};
    if (existingOrder.PaymentStatusId !== paidStatusId) {
      updateFields.PaymentStatusId = paidStatusId;
    }
    if (existingOrder.StatusId !== orderStatusId) {
      updateFields.StatusId = orderStatusId;
    }

    if (Object.keys(updateFields).length > 0) {
      try {
        const [affectedRows] = await Orders.update(updateFields, {
          where: { OrderId: orderId },
          transaction,
        });
        console.log(
          `[VNPay Return] Orders.update affected ${affectedRows} rows with fields:`,
          updateFields
        );
      } catch (updateErr) {
        console.error(`[VNPay Return] Orders.update failed:`, updateErr);
        await transaction.rollback();
        throw updateErr;
      }
    } else {
      console.log(
        `[VNPay Return] Orders already has correct status, skipping update`
      );
    }

    // Xóa giỏ hàng trước khi commit
    const order = await Orders.findByPk(orderId, { transaction });
    if (order?.UserId) {
      try {
        await GioHang.destroy({ where: { Id: order.UserId }, transaction });
        console.log(`[VNPay Return] Cart cleared for user ${order.UserId}`);
      } catch (cartErr) {
        console.error(`[VNPay Return] Failed to clear cart:`, cartErr);
        // Don't fail the entire payment for cart clearing issue
      }
    }

    // Commit the main transaction first
    await transaction.commit();
    console.log(
      `[VNPay Return] Main transaction committed successfully for order ${orderId}`
    );

    // ✅ Gửi email xác nhận VNPay (async, non-blocking)
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
              paymentMethod: "VNPay",
            }
          );
          console.log(`✅ VNPay email sent to: ${user.Email}`);
        }
      } catch (emailErr) {
        console.error(`❌ VNPay email error (non-critical):`, emailErr.message);
      }
    });

    // Handle ShippingOrders separately (outside transaction)
    setImmediate(async () => {
      try {
        const existingShipping = await ShippingOrders.findOne({
          where: { OrderId: orderId },
        });

        if (existingShipping && existingShipping.Status !== "ready") {
          const [affectedShipping] = await ShippingOrders.update(
            { Status: "ready" },
            { where: { OrderId: orderId } }
          );
          console.log(
            `[VNPay Return] ShippingOrders.update affected ${affectedShipping} rows`
          );
        } else if (existingShipping) {
          console.log(
            `[VNPay Return] ShippingOrder already has status 'ready', skipping update`
          );
        } else {
          console.warn(
            `[VNPay Return] No ShippingOrder found for OrderId ${orderId}`
          );
        }
      } catch (shippingErr) {
        console.error(
          `[VNPay Return] ShippingOrders.update failed (non-critical):`,
          shippingErr
        );
      }
    });

    // ✅ Tạo đơn GHN sau khi thanh toán thành công (FULLY ASYNC - không chặn response)
    setImmediate(async () => {
      try {
        console.log(
          `\n🚀 ===== CREATING GHN ORDER FOR VNPAY #${orderId} =====`
        );

        const orderWithDetails = await Orders.findByPk(orderId, {
          include: [{ model: OrderDetails, as: "OrderDetails" }],
        });

        if (!orderWithDetails) {
          console.warn(`⚠️ VNPay Order #${orderId} - Order not found in DB`);
          return;
        }

        console.log(`Order UserId: ${orderWithDetails.UserId}`);
        console.log(
          `Order Province/District/Ward: ${orderWithDetails.Province}/${orderWithDetails.District}/${orderWithDetails.Ward}`
        );

        if (orderWithDetails) {
          // ⚠️ Query DeliveryAddresses table để lấy coordinates và thông tin chi tiết
          // Tìm địa chỉ của user khớp với Province/District/Ward trong Orders
          let deliveryAddressRecord = await DeliveryAddresses.findOne({
            where: {
              UserId: orderWithDetails.UserId,
              Province: orderWithDetails.Province,
              District: orderWithDetails.District,
              Ward: orderWithDetails.Ward,
            },
          });

          console.log(
            `DeliveryAddress found:`,
            deliveryAddressRecord ? "YES" : "NO"
          );

          // Fallback nếu không tìm thấy DeliveryAddress: dùng info từ Orders (nhưng vẫn cần WardCode/DistrictId cho GHN)
          if (!deliveryAddressRecord) {
            console.warn(
              `⚠️ VNPay Order #${orderId} - Không tìm thấy DeliveryAddress khớp với Province/District/Ward, dùng fallback từ Orders`
            );
            // Có thể thêm logic lấy default address của user nếu cần, nhưng skip GHN nếu thiếu required fields
            deliveryAddressRecord = {
              ReceiverName: orderWithDetails.ReceiverName || "Khách hàng", // Giả sử có field này
              Phone: orderWithDetails.Phone || "0123456789", // Fallback phone default
              WardCode: null, // Phải có từ DB, không fallback được
              DistrictId: null,
              Latitude: null,
              Longitude: null,
            };
          }

          if (
            !deliveryAddressRecord.DistrictId ||
            !deliveryAddressRecord.WardCode
          ) {
            console.warn(
              `⚠️ VNPay Order #${orderId} - DeliveryAddress thiếu DistrictId hoặc WardCode (bắt buộc cho GHN), skip tạo đơn`
            );
            return; // GHN yêu cầu bắt buộc DistrictId và WardCode
          }

          // CHỈ dùng tọa độ nếu có THẬT trong DB
          const toLatitude = deliveryAddressRecord.Latitude
            ? parseFloat(deliveryAddressRecord.Latitude)
            : null;
          const toLongitude = deliveryAddressRecord.Longitude
            ? parseFloat(deliveryAddressRecord.Longitude)
            : null;

          const ghnItems = (orderWithDetails.OrderDetails || []).map(
            (item, idx) => ({
              name: item.Food?.FoodName || `Sản phẩm ${idx + 1}`, // Cải thiện: dùng FoodName thật
              quantity: item.Quantity || 1,
              weight: 500,
            })
          );

          const ghnResult = await createGHNOrder({
            clientOrderCode: `ORDER-${orderId}`,
            toName: deliveryAddressRecord.ReceiverName || "Khách hàng",
            toPhone:
              orderWithDetails.Phone ||
              deliveryAddressRecord.Phone ||
              "0123456789", // Fallback phone an toàn hơn
            toAddress: orderWithDetails.DeliveryAddress,
            toWardCode: deliveryAddressRecord.WardCode,
            toDistrictId: deliveryAddressRecord.DistrictId,
            toProvinceName: orderWithDetails.Province || "Hà Nội",
            toDistrictName: orderWithDetails.District || "",
            toWardName: orderWithDetails.Ward || "",
            toLatitude,
            toLongitude,
            items: ghnItems,
            codAmount: 0, // VNPay đã thanh toán rồi, không thu COD
          });

          // Lưu ClientOrderCode vào DB chỉ nếu GHN success
          await Orders.update(
            {
              ClientOrderCode: ghnResult.clientOrderCode || `ORDER-${orderId}`,
            },
            { where: { OrderId: orderId } }
          );

          console.log(
            `✅ VNPay Order #${orderId} - GHN Order created: ${ghnResult.ghnOrderCode}`
          );
        }
      } catch (ghnErr) {
        console.error(
          `❌ VNPay Order #${orderId} - GHN Order creation failed:`,
          ghnErr.message
        );
        // Không throw error vì đơn hàng và thanh toán đã thành công
      }
    }); // End setImmediate for GHN

    // Lấy chi tiết đơn hàng đầy đủ để frontend hiển thị giống màn hình success
    try {
      const orderFull = await Orders.findOne({
        where: { OrderId: orderId },
        include: [
          {
            model: OrderDetails,
            as: "OrderDetails",
            include: [
              { model: Food, as: "Food" },
              { model: Size, as: "Size" },
              {
                model: OrderDetails_Topping,
                as: "OrderDetails_Toppings",
                include: [{ model: Topping, as: "Topping" }],
              },
            ],
          },
          { model: OrderStatus, as: "Status", attributes: ["StatusName"] },
          {
            model: PaymentStatus,
            as: "PaymentStatus",
            attributes: ["PaymentStatusName", "PaymentStatusId"],
          },
          {
            model: models.PhuongThucThanhToan,
            as: "PaymentMethod",
            attributes: ["TenPhuongThuc"],
          },
        ],
      });

      // Format items with fallback: if OrderDetails.Price missing/0, compute from food/size/toppings
      const items = (orderFull?.OrderDetails || []).map((d) => {
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
          FoodId: d.Food?.FoodId,
          FoodName: d.Food?.FoodName,
          ImageURL: d.Food?.ImageURL,
          Price: unitPrice,
          DiscountPrice: d.Food?.DiscountPrice
            ? parseFloat(d.Food.DiscountPrice)
            : null,
          Size: d.Size
            ? {
                SizeID: d.Size.SizeID,
                SizeName: d.Size.SizeName,
                ExtraPrice: d.Size.ExtraPrice,
              }
            : null,
          Toppings: (d.OrderDetails_Toppings || []).map((ot) => ({
            ToppingID: ot.Topping?.ToppingID,
            ToppingName: ot.Topping?.ToppingName,
            ToppingPrice: parseFloat(ot.Topping?.ToppingPrice || 0),
          })),
          Quantity: d.Quantity,
          TotalPrice: unitPrice * (d.Quantity || 1),
        };
      });

      const formattedOrder = {
        OrderId: orderFull?.OrderId || orderId,
        OrderDate: orderFull?.OrderDate,
        TotalAmount:
          parseFloat(orderFull?.TotalAmount) ||
          items.reduce((s, it) => s + (it.TotalPrice || 0), 0),
        Status: orderFull?.Status?.StatusName || null,
        PaymentStatus: orderFull?.PaymentStatus?.PaymentStatusName || null,
        PaymentMethod: orderFull?.PaymentMethod?.TenPhuongThuc || null,
        DeliveryAddress: orderFull?.DeliveryAddress || null,
        OrderDetails: items,
      };

      return res.json({
        success: true,
        message: "Thanh toán VNPay thành công!",
        ThanhToanThanhCong: vnp_Amount
          ? (parseInt(vnp_Amount) / 100).toFixed(2)
          : null,
        orderId,
        data: formattedOrder,
      });
    } catch (errFetch) {
      // Nếu lấy chi tiết lỗi, vẫn trả response thành công nhưng không có data
      console.error("Error fetching full order after vnpay commit:", errFetch);
      return res.json({
        success: true,
        message: "Thanh toán VNPay thành công!",
        ThanhToanThanhCong: vnp_Amount
          ? (parseInt(vnp_Amount) / 100).toFixed(2)
          : null,
        orderId,
      });
    }
  } catch (err) {
    await transaction.rollback();
    console.error("VNPAY RETURN ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi xử lý giao dịch VNPay!",
      detail: err.message,
    });
  }
};

const reOrder = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { orderId } = req.params;
    const cancelledOrder = await Orders.findOne({
      where: { OrderId: orderId, UserId: req.user.id, StatusId: 5 },
      include: [
        {
          model: OrderDetails,
          as: "OrderDetails",
          include: [
            { model: Food, as: "Food" },
            { model: Size, as: "Size" },
            {
              model: OrderDetails_Topping,
              as: "OrderDetails_Toppings",
              include: [{ model: Topping, as: "Topping" }],
            },
          ],
        },
      ],
      transaction,
    });

    if (!cancelledOrder) {
      await transaction.rollback();
      return res.json({
        success: false,
        message: "Không tìm thấy đơn hàng đã hủy!",
      });
    }

    const itemsToAdd = cancelledOrder.OrderDetails.map((d) => ({
      FoodId: d.Food.FoodId,
      SizeID: d.Size?.SizeID || null,
      Quantity: d.Quantity,
      TotalPrice: d.Price * d.Quantity,
      ToppingIDs: d.OrderDetails_Toppings.map((ot) => ot.Topping.ToppingID),
    }));

    for (const item of itemsToAdd) {
      const cartItem = await GioHang.create(
        {
          Id: req.user.id,
          FoodId: item.FoodId,
          SizeID: item.SizeID,
          SoLuong: item.Quantity,
          TotalPrice: item.TotalPrice,
        },
        { transaction }
      );
      for (const toppingId of item.ToppingIDs) {
        await GioHang_Topping.create(
          { GioHangID: cartItem.GioHangID, ToppingID: toppingId },
          { transaction }
        );
      }
    }

    await transaction.commit();
    res.json({ success: true, message: "Đã thêm sản phẩm vào giỏ hàng!" });
  } catch (err) {
    await transaction.rollback();
    console.error("REORDER ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi khi đặt lại đơn hàng!",
      detail: err.message,
    });
  }
};

module.exports = { vnpayReturn, reOrder };
