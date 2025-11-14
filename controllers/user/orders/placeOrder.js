const { sequelize, models, Op } = require("./config");
const jwt = require("jsonwebtoken");
const { calculateShippingFee } = require("./prepareOrder");
const { VNPay, ProductCode, VnpLocale, dateFormat } = require("vnpay");
const {
  emitOrderUpdate,
  emitNewOrderToAdmin,
  emitUserNotification,
  emitAdminNotification,
} = require("../../../utils/realtimeHelper");
const { createGHNOrder } = require("../../../services/ghnService");

const {
  GioHang,
  Users,
  Food,
  Size,
  GioHang_Topping,
  Topping,
  Orders,
  OrderDetails,
  OrderDetails_Topping,
  Vouchers,
  UserVouchers,
  PhuongThucThanhToan,
  OrderStatus,
  PaymentStatus,
  CuaHang,
  DeliveryAddresses,
} = models;

// Cấu hình VNPay
const vnpay = new VNPay({
  tmnCode: process.env.VNP_TMN_CODE || process.env.VNPAY_TMN_CODE || "DEMOV210",
  secureSecret:
    process.env.VNP_SECURE_SECRET ||
    process.env.VNPAY_SECURE_SECRET ||
    "RAOEXHYVSDDIIENYWSNE831AENAWIIVG",
  vnpayHost: "https://sandbox.vnpayment.vn",
  testMode: true,
  hashAlgorithm: "SHA512",
});

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

// ===================== PLACE ORDER =====================
const placeOrder = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      selectedItems,
      orderItems,
      pendingOrderId,
      paymentMethodId,
      payment, // ✅ Nhận payment để phân biệt QR vs VNPAY
      voucherCode,
      cuaHangId,
      deliveryAddressId,
      newAddress,
      totalPrice,
      shippingFee,
    } = req.body;

    console.log("Place order payload:", JSON.stringify(req.body, null, 2));

    if (!cuaHangId) {
      throw new Error("Thiếu thông tin cửa hàng!");
    }

    // Kiểm tra bảng CuaHang
    const cuaHang = await CuaHang.findByPk(parseInt(cuaHangId), {
      attributes: [
        "CuaHangId",
        "CuaHangName",
        "Address",
        "Latitude",
        "Longitude",
      ],
    });
    if (!cuaHang) {
      console.error(`Không tìm thấy cửa hàng với CuaHangId: ${cuaHangId}`);
      throw new Error("Không tìm thấy cửa hàng!");
    }
    console.log("CuaHang found:", cuaHang.toJSON());

    let deliveryAddress;
    if (deliveryAddressId) {
      deliveryAddress = await DeliveryAddresses.findOne({
        where: {
          DeliveryAddressId: parseInt(deliveryAddressId),
          UserId: req.user.id,
        },
      });
      if (!deliveryAddress)
        throw new Error("Không tìm thấy địa chỉ giao hàng!");
    } else if (newAddress) {
      const {
        address,
        province,
        provinceId,
        district,
        districtId,
        ward,
        wardCode,
        receiverName,
        phone,
      } = newAddress;
      if (!address || !provinceId || !districtId || !wardCode) {
        throw new Error("Thông tin địa chỉ mới không đầy đủ!");
      }

      deliveryAddress = await DeliveryAddresses.findOne({
        where: {
          UserId: req.user.id,
          Address: address,
          ProvinceId: parseInt(provinceId),
          DistrictId: parseInt(districtId),
          WardCode: String(wardCode),
        },
      });

      if (!deliveryAddress) {
        deliveryAddress = await DeliveryAddresses.create(
          {
            UserId: req.user.id,
            Address: address,
            Province: province || "",
            ProvinceId: parseInt(provinceId),
            District: district || "",
            DistrictId: parseInt(districtId),
            Ward: ward || "",
            WardCode: String(wardCode),
            ReceiverName: receiverName || "",
            Phone: phone || "",
            IsDefault: newAddress.isDefault || false,
          },
          { transaction }
        );
      }
    } else {
      throw new Error("Thiếu thông tin địa chỉ giao hàng!");
    }
    console.log("DeliveryAddress:", deliveryAddress.toJSON());

    let itemsToOrder = [];
    if (pendingOrderId) {
      const pendingOrder = await Orders.findOne({
        where: { OrderId: pendingOrderId, UserId: req.user.id },
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
      if (!pendingOrder) throw new Error("Không tìm thấy đơn lưu tạm!");
      itemsToOrder = pendingOrder.OrderDetails.map((d) => ({
        FoodId: d.Food.FoodId,
        SizeId: d.Size?.SizeID || null,
        Quantity: d.Quantity,
        TotalPrice: d.Price * d.Quantity,
        ToppingIds: d.OrderDetails_Toppings.map((ot) => ot.Topping.ToppingID),
      }));
      await Orders.destroy({ where: { OrderId: pendingOrderId }, transaction });
    } else if (selectedItems?.length) {
      const cartItems = await GioHang.findAll({
        where: { Id: req.user.id, GioHangID: { [Op.in]: selectedItems } },
        include: [{ model: GioHang_Topping, as: "GioHang_Toppings" }],
        transaction,
      });
      if (!cartItems.length)
        throw new Error("Không tìm thấy sản phẩm trong giỏ!");
      itemsToOrder = cartItems.map((item) => ({
        FoodId: item.FoodId,
        SizeId: item.SizeID,
        Quantity: item.SoLuong,
        TotalPrice: parseFloat(item.TotalPrice),
        GioHangID: item.GioHangID,
        ToppingIds: item.GioHang_Toppings.map((t) => t.ToppingID),
      }));
    } else if (orderItems?.length) {
      // Đã loại bỏ kiểm tra TotalPrice <= 0 để tránh throw error thừa (theo yêu cầu)
      itemsToOrder = orderItems.map((item) => {
        return {
          FoodId: item.FoodId,
          SizeId: item.SizeId,
          Quantity: item.Quantity,
          TotalPrice: parseFloat(item.TotalPrice),
          ToppingIds: item.ToppingIds || [],
        };
      });
    } else throw new Error("Không có sản phẩm để đặt!");
    console.log("Items to order:", JSON.stringify(itemsToOrder, null, 2));

    for (const item of itemsToOrder) {
      const food = await Food.findByPk(item.FoodId, {
        attributes: ["FoodId", "FoodName", "Stock"],
      });
      if (!food) {
        throw new Error(`Sản phẩm FoodId ${item.FoodId} không tồn tại!`);
      }
      if (food.Stock < item.Quantity) {
        throw new Error(`Sản phẩm ${food.FoodName} không đủ số lượng!`);
      }
    }

    let finalShippingFee = shippingFee || 10000;
    if (!shippingFee && deliveryAddress.Latitude && deliveryAddress.Longitude) {
      const shippingFeeRes = await calculateShippingFee({
        body: {
          cuaHangId: cuaHang.CuaHangId,
          userLat: deliveryAddress.Latitude,
          userLng: deliveryAddress.Longitude,
          items: itemsToOrder,
        },
      });
      finalShippingFee = shippingFeeRes.success
        ? shippingFeeRes.shippingFee
        : 10000;
    }
    console.log("Final shipping fee:", finalShippingFee);

    const subtotal = itemsToOrder.reduce((sum, i) => sum + i.TotalPrice, 0);
    let discountAmount = 0;
    let appliedVoucherId = null;

    if (voucherCode) {
      const userVoucher = await UserVouchers.findOne({
        where: { UserId: req.user.id, IsUsed: false },
        include: [
          {
            model: Vouchers,
            as: "Voucher",
            where: { Code: voucherCode, IsActive: true },
          },
        ],
        transaction,
      });
      if (userVoucher) {
        const voucher = userVoucher.Voucher;
        appliedVoucherId = voucher.VoucherId;
        discountAmount = voucher.DiscountAmount
          ? parseFloat(voucher.DiscountAmount)
          : (subtotal * parseFloat(voucher.DiscountPercentage || 0)) / 100;
        await userVoucher.update({ IsUsed: true }, { transaction });
      }
    }
    console.log("Subtotal:", subtotal, "Discount:", discountAmount);

    const totalAmount =
      totalPrice || subtotal + finalShippingFee - discountAmount;
    console.log("Total amount:", totalAmount);

    // Validate totalAmount
    if (totalAmount <= 0) {
      throw new Error("Tổng tiền đơn hàng phải lớn hơn 0!");
    }

    const orderStatus = await OrderStatus.findOne({
      where: { StatusName: "Đặt hàng thành công" },
    });
    if (!orderStatus) throw new Error("Không tìm thấy trạng thái đơn hàng!");
    const [pendingPayment] = await PaymentStatus.findOrCreate({
      where: { PaymentStatusName: "Chờ thanh toán" },
      defaults: { PaymentStatusName: "Chờ thanh toán" },
      transaction,
    });
    // Get payment method name
    const paymentMethod = await PhuongThucThanhToan.findByPk(paymentMethodId, {
      attributes: ["TenPhuongThuc"],
      transaction,
    });
    const paymentMethodName = paymentMethod?.TenPhuongThuc || "Không xác định";
    console.log("Payment method:", paymentMethodName);

    const order = await Orders.create(
      {
        UserId: req.user.id,
        CuaHangId: cuaHangId,
        OrderDate: new Date(),
        TotalAmount: totalAmount,
        PaymentMethodId: paymentMethodId,
        StatusId: orderStatus.StatusId,
        PaymentStatusId: pendingPayment.PaymentStatusId, // Mặc định "Chờ thanh toán"
        DeliveryAddress: deliveryAddress.Address,
        Province: deliveryAddress.Province,
        District: deliveryAddress.District,
        Ward: deliveryAddress.Ward,
        Phone: deliveryAddress.Phone,
        VoucherId: appliedVoucherId,
      },
      { transaction }
    );
    console.log("Order created:", order.OrderId);

    for (const item of itemsToOrder) {
      let unitPrice = (item.TotalPrice || 0) / (item.Quantity || 1);

      // ✅ FIX: Nếu unitPrice = 0, tính lại từ Food/Size/Topping trong DB
      if (!unitPrice || unitPrice <= 0) {
        try {
          const food = await Food.findByPk(item.FoodId, {
            attributes: ["Price", "DiscountPrice"],
            transaction,
          });
          const size = item.SizeId
            ? await Size.findByPk(item.SizeId, {
                attributes: ["ExtraPrice"],
                transaction,
              })
            : null;

          let toppingSum = 0;
          if (item.ToppingIds && item.ToppingIds.length > 0) {
            const toppings = await Topping.findAll({
              where: { ToppingID: item.ToppingIds },
              attributes: ["ToppingPrice"],
              transaction,
            });
            toppingSum = toppings.reduce(
              (sum, t) => sum + parseFloat(t.ToppingPrice || 0),
              0
            );
          }

          const basePrice = food
            ? parseFloat(food.DiscountPrice || food.Price || 0)
            : 0;
          const sizeExtra = size ? parseFloat(size.ExtraPrice || 0) : 0;
          unitPrice = basePrice + sizeExtra + toppingSum;

          console.log(
            `✅ Computed unitPrice for FoodId ${item.FoodId}: ${unitPrice}`
          );
        } catch (err) {
          console.warn(
            `⚠️ Failed to compute unitPrice for item ${item.FoodId}:`,
            err.message
          );
          unitPrice = 0;
        }
      }

      // Log diagnostic info
      console.log(
        "Creating OrderDetail - item:",
        JSON.stringify(item),
        "unitPrice:",
        unitPrice
      );

      const orderDetail = await OrderDetails.create(
        {
          OrderId: order.OrderId,
          FoodId: item.FoodId,
          SizeId: item.SizeId,
          Quantity: item.Quantity,
          Price: unitPrice,
        },
        { transaction }
      );
      for (const toppingId of item.ToppingIds) {
        await OrderDetails_Topping.create(
          { OrderDetailId: orderDetail.OrderDetailId, ToppingId: toppingId },
          { transaction }
        );
      }
    }

    // ✅ QR Payment: paymentMethodId = 3 (QR CODE)
    if (parseInt(paymentMethodId) === 3) {
      console.log("\n💳 ===== QR CODE PAYMENT - NO GHN ORDER =====");
      console.log(`Order ID: ${order.OrderId}`);
      console.log("⏭️ Skipping GHN order creation for QR CODE payment");

      // Clear giỏ hàng
      if (selectedItems?.length) {
        await GioHang.destroy({
          where: { GioHangID: { [Op.in]: selectedItems } },
          transaction,
        });
      }

      // PaymentStatusId = "Chờ thanh toán" (ban đầu)
      // User sẽ xác nhận đã thanh toán trên trang /qr-payment
      // OrderStatusId = 1 (Đặt hàng thành công) - Chờ admin xác nhận

      await transaction.commit();
      console.log("✅ QR CODE order transaction committed (no GHN)\n");

      // Emit real-time notifications (non-blocking)
      try {
        const orderData = {
          orderId: order.OrderId,
          userId: req.user.id,
          totalAmount,
          paymentMethod: paymentMethodName,
          status: "pending",
          timestamp: new Date().toISOString(),
        };

        emitOrderUpdate(req, req.user.id, orderData);
        emitNewOrderToAdmin(req, orderData);
        emitUserNotification(req, req.user.id, {
          type: "order",
          title: "Đơn hàng mới",
          message: `Đơn hàng #${order.OrderId} đang chờ thanh toán QR`,
        });
        emitAdminNotification(req, {
          type: "order",
          title: "Đơn hàng mới",
          message: `Đơn hàng #${order.OrderId} - Thanh toán QR CODE`,
          data: orderData,
        });
      } catch (emitErr) {
        console.error(
          "❌ Real-time emit error (non-critical):",
          emitErr.message
        );
      }

      // Generate QR code URL
      const qrCodeUrl = `https://img.vietqr.io/image/mbbank-0366413924-compact2.jpg?amount=${Math.round(
        totalAmount * 1000
      )}&addInfo=DonHang${order.OrderId}&accountName=SULI COFFEE`;

      return res.json({
        success: true,
        message: "Đơn hàng đã được tạo. Vui lòng thanh toán qua QR Code.",
        paymentMethod: "QR",
        orderId: order.OrderId,
        totalPrice: totalAmount,
        qrCodeUrl,
      });
    }

    // COD Payment
    if (parseInt(paymentMethodId) === 2 && selectedItems?.length) {
      await GioHang.destroy({
        where: { GioHangID: { [Op.in]: selectedItems } },
        transaction,
      });
    }

    // VNPAY Payment - paymentMethodId = 1
    if (parseInt(paymentMethodId) === 1) {
      // ✅ FIX: Convert IPv6 localhost (::1) sang IPv4 (127.0.0.1)
      let ipAddr =
        req.headers["x-forwarded-for"] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        "127.0.0.1";

      // VNPay KHÔNG CHẤP NHẬN IPv6 → Convert ::1 thành 127.0.0.1
      if (ipAddr === "::1" || ipAddr === "::ffff:127.0.0.1") {
        ipAddr = "127.0.0.1";
      }
      // Nếu có nhiều IP (qua proxy), lấy IP đầu tiên
      if (ipAddr.includes(",")) {
        ipAddr = ipAddr.split(",")[0].trim();
      }

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      // ✅ Validate amount trước khi gửi
      const amountNumber = Number(totalAmount);
      if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
        throw new Error(`Invalid amount: ${totalAmount}`);
      }

      // ⚠️ VNPay SDK (package 'vnpay') TỰ ĐỘNG nhân 100 trong buildPaymentUrl
      // → Không cần nhân 100 thủ công, chỉ truyền số VND
      console.log("\n💳 ===== VNPAY PAYMENT URL GENERATION =====");
      console.log(`💰 Amount (VND): ${amountNumber}`);
      console.log(
        `🔑 TMN_CODE: ${
          process.env.VNP_TMN_CODE || process.env.VNPAY_TMN_CODE || "4Z1QBO45"
        }`
      );
      console.log(
        `🔐 SECRET: ${process.env.VNPAY_SECURE_SECRET ? "✅ Có" : "❌ Không"}`
      );
      console.log(
        `🔗 Return URL: ${
          process.env.VNPAY_RETURN_URL || "http://localhost:3000/vnpay-return"
        }`
      );
      console.log(`📦 Order ID: ${order.OrderId}`);
      console.log(`🌐 VNPay Host: https://sandbox.vnpayment.vn`);

      const vnpayParams = {
        vnp_Amount: amountNumber, // ✅ Truyền số VND thuần, SDK sẽ tự nhân 100
        vnp_IpAddr: ipAddr,
        vnp_TxnRef: order.OrderId.toString(),
        vnp_OrderInfo: `Thanh toán đơn hàng ${order.OrderId}`,
        vnp_OrderType: ProductCode.Other,
        vnp_ReturnUrl:
          process.env.VNP_RETURN_URL ||
          process.env.VNPAY_RETURN_URL ||
          "http://localhost:3000/vnpay-return",
        vnp_Locale: VnpLocale.VN,
        vnp_CreateDate: dateFormat(new Date()),
        vnp_ExpireDate: dateFormat(tomorrow),
      };

      console.log("📝 VNPay Params:", JSON.stringify(vnpayParams, null, 2));

      const paymentUrl = await vnpay.buildPaymentUrl(vnpayParams);
      console.log("✅ VNPay URL Generated:", paymentUrl);
      console.log("====================================\n");

      await transaction.commit();

      // ✅ Emit real-time event (non-blocking, không throw error)
      try {
        const orderData = {
          orderId: order.OrderId,
          userId: req.user.id,
          totalAmount,
          paymentMethod: paymentMethodName,
          status: "pending",
          timestamp: new Date().toISOString(),
        };

        emitOrderUpdate(req, req.user.id, orderData);
        emitNewOrderToAdmin(req, orderData);
        emitUserNotification(req, req.user.id, {
          type: "order",
          title: "Đặt hàng thành công",
          message: `Đơn hàng #${order.OrderId} đang chờ thanh toán VNPay`,
        });
        emitAdminNotification(req, {
          type: "order",
          title: "Đơn hàng mới",
          message: `Đơn hàng #${order.OrderId} - Thanh toán VNPay`,
          data: orderData,
        });
      } catch (emitErr) {
        console.error(
          "❌ Real-time emit error (non-critical):",
          emitErr.message
        );
      }

      return res.json({
        success: true,
        message: "Đặt hàng thành công, chuyển hướng đến VNPay!",
        orderId: order.OrderId,
        Code: paymentMethodId,
        Url: paymentUrl,
      });
    }

    // ✅ TẠO ĐƠN GHN CHỈ CHO COD (Skip VNPAY và QR CODE)
    let ghnOrderCode = null;

    // Skip GHN nếu là VNPAY (id=1) hoặc QR CODE (id=3)
    const shouldCreateGHN = parseInt(paymentMethodId) === 2; // Chỉ COD

    if (shouldCreateGHN) {
      try {
        console.log("\n🚀 ===== CREATING GHN ORDER (BEFORE COMMIT) =====");
        console.log("Payment Method:", paymentMethodName);
        console.log("Delivery Address:", {
          name: deliveryAddress.ReceiverName,
          phone: deliveryAddress.Phone,
          address: deliveryAddress.Address,
          districtId: deliveryAddress.DistrictId,
          wardCode: deliveryAddress.WardCode,
          province: deliveryAddress.Province,
          district: deliveryAddress.District,
          ward: deliveryAddress.Ward,
        });

        const ghnItems = itemsToOrder.map((item, idx) => ({
          name: `Sản phẩm ${idx + 1}`,
          quantity: item.Quantity || 1,
          weight: 500,
        }));
        console.log("GHN Items:", ghnItems);

        const isCOD =
          paymentMethodName.toLowerCase().includes("cod") ||
          paymentMethodName.toLowerCase().includes("tiền mặt") ||
          paymentMethodName.toLowerCase().includes("tiền mặt khi nhận hàng");
        const codAmount = isCOD ? totalAmount : 0;
        console.log("COD Amount:", codAmount, "(isCOD:", isCOD, ")");

        const toLatitude = deliveryAddress.Latitude
          ? parseFloat(deliveryAddress.Latitude)
          : null;
        const toLongitude = deliveryAddress.Longitude
          ? parseFloat(deliveryAddress.Longitude)
          : null;
        console.log(
          "Coordinates:",
          toLatitude && toLongitude
            ? `${toLatitude}, ${toLongitude}`
            : "NOT AVAILABLE - GHN will geocode"
        );

        const ghnResult = await createGHNOrder({
          clientOrderCode: `ORDER-${order.OrderId}`,
          toName: deliveryAddress.ReceiverName || "Khách hàng",
          toPhone: deliveryAddress.Phone || "0366413924",
          toAddress: deliveryAddress.Address,
          toWardCode: deliveryAddress.WardCode,
          toDistrictId: deliveryAddress.DistrictId,
          toProvinceName: deliveryAddress.Province || "",
          toDistrictName: deliveryAddress.District || "",
          toWardName: deliveryAddress.Ward || "",
          toLatitude,
          toLongitude,
          items: ghnItems,
          codAmount,
        });

        ghnOrderCode = ghnResult.ghnOrderCode;
        console.log(`✅ GHN Order created: ${ghnOrderCode}`);
        console.log("GHN Result:", ghnResult);

        // Lưu ClientOrderCode vào DB (vẫn trong transaction)
        await Orders.update(
          { ClientOrderCode: `ORDER-${order.OrderId}` },
          { where: { OrderId: order.OrderId }, transaction }
        );
        console.log(`💾 Saved ClientOrderCode: ORDER-${order.OrderId}`);
        console.log("====================================\n");
      } catch (ghnErr) {
        console.error("❌ GHN Order creation FAILED:", ghnErr.message);

        // ⚠️ ROLLBACK transaction TRƯỚC KHI trả response
        if (!transaction.finished) {
          await transaction.rollback();
          console.log("🔄 Transaction rolled back due to GHN failure");
        }

        // Kiểm tra lỗi địa chỉ không hợp lệ
        const errorCode = ghnErr.response?.data?.code || ghnErr.code || "";
        const errorMsg = ghnErr.response?.data?.message || ghnErr.message || "";

        if (
          errorCode === "TO_ADDRESS_CONVERT_FAIL" ||
          errorMsg.includes("invalid google status") ||
          errorMsg.includes("address") ||
          errorMsg.includes("geocode")
        ) {
          return res.status(400).json({
            success: false,
            message: `❌ Địa chỉ giao hàng không hợp lệ hoặc không thể xác minh với Giao Hàng Nhanh.

📍 Vui lòng kiểm tra lại:
• Số nhà, tên đường phải chính xác
• Phường/Xã, Quận/Huyện, Tỉnh/Thành phố phải đúng
• Địa chỉ phải tồn tại thực tế trên bản đồ

💡 Gợi ý: Thử nhập địa chỉ chi tiết hơn hoặc chọn địa chỉ khác.`,
            errorCode: "INVALID_ADDRESS",
            ghnError: errorMsg,
          });
        }

        // Các lỗi GHN khác
        return res.status(400).json({
          success: false,
          message: `❌ Không thể tạo đơn giao hàng: ${errorMsg}`,
          errorCode: "GHN_ERROR",
          ghnError: errorMsg,
        });
      }
    } else {
      // VNPAY và QR CODE không cần GHN
      console.log("⏭️ Skipping GHN order creation (VNPAY/QR CODE)");
    }

    // ✅ Commit transaction SAU KHI GHN thành công (hoặc skip GHN)
    await transaction.commit();
    console.log("✅ Transaction committed successfully");

    // ✅ Emit real-time event cho đơn COD (non-blocking, không throw error)
    try {
      const orderData = {
        orderId: order.OrderId,
        userId: req.user.id,
        totalAmount,
        paymentMethod: paymentMethodName,
        status: "pending",
        timestamp: new Date().toISOString(),
        ghnOrderCode, // Thêm mã đơn GHN
      };

      emitOrderUpdate(req, req.user.id, orderData);
      emitNewOrderToAdmin(req, orderData);
      emitUserNotification(req, req.user.id, {
        type: "order",
        title: "Đặt hàng thành công",
        message: `Đơn hàng #${order.OrderId} đã được tạo${
          ghnOrderCode ? ` - Mã GHN: ${ghnOrderCode}` : ""
        }`,
      });
      emitAdminNotification(req, {
        type: "order",
        title: "Đơn hàng mới",
        message: `Đơn hàng #${order.OrderId} - ${paymentMethodName}${
          ghnOrderCode ? ` - GHN: ${ghnOrderCode}` : ""
        }`,
        data: orderData,
      });
    } catch (emitErr) {
      console.error("❌ Real-time emit error (non-critical):", emitErr.message);
    }

    res.json({
      success: true,
      message: "Đặt hàng thành công!",
      orderId: order.OrderId,
      subtotal,
      shippingFee: finalShippingFee,
      totalAmount,
    });
  } catch (err) {
    // Chỉ rollback nếu transaction chưa commit hoặc rollback
    if (transaction && !transaction.finished) {
      try {
        await transaction.rollback();
      } catch (rollbackErr) {
        console.error("❌ Rollback error:", rollbackErr.message);
      }
    }

    console.error("PLACE ORDER ERROR:", err.message, err.stack);
    res.status(400).json({
      success: false,
      message: err.message || "Có lỗi xảy ra khi đặt hàng!",
      detail: err.sql ? `SQL Error: ${err.sql}` : err.message,
    });
  }
};

module.exports = { authenticateToken, placeOrder };
