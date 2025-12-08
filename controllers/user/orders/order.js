// backend/controllers/user/orders/order.js
const {
  sequelize,
  models,
  vnpay,
  ProductCode,
  VnpLocale,
  dateFormat,
  Op,
} = require("./config");
const { getVietnamTime } = require("../../../utils/timezone");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const {
  GioHang,
  Users,
  Food,
  Size,
  GioHang_Topping,
  Topping,
  Orders,
  OrderDetails,
  Vouchers,
  UserVouchers,
  OrderDetails_Topping,
  PhuongThucThanhToan,
  OrderStatus,
  PaymentStatus,
  CuaHang,
  FoodDimensions,
  ShippingOrders,
  DeliveryAddresses,
} = models;

// Cấu hình GHN
const GHN_API_URL = "https://dev-online-gateway.ghn.vn/shiip/public-api";
const GHN_TOKEN = process.env.GHN_TOKEN || "your_ghn_token_here"; // Thêm vào .env
const GHN_SHOP_ID = process.env.GHN_SHOP_ID || "your_default_shop_id"; // Thêm vào .env

// Xác thực token JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.split(" ")[1];
  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Bạn chưa đăng nhập!" });
  }
  jwt.verify(
    token,
    process.env.JWT_SECRET || "dev_secret_fallback",
    (err, user) => {
      if (err) {
        return res
          .status(403)
          .json({ success: false, message: "Token không hợp lệ!" });
      }
      req.user = user;
      next();
    }
  );
};

// Lấy danh sách cửa hàng
const getStores = async (req, res) => {
  try {
    const stores = await CuaHang.findAll({
      attributes: [
        "CuaHangId",
        "CuaHangName",
        "Address",
        "Province",
        "District",
        "Ward",
        "Phone",
        "ShopId",
        "WardCode",
        "DistrictId",
        "ProvinceId",
      ],
    });
    res.json({
      success: true,
      message: "Lấy danh sách cửa hàng thành công!",
      data: stores,
    });
  } catch (err) {
    console.error("GET STORES ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy danh sách cửa hàng!",
      detail: err.message,
    });
  }
};

// Lấy danh sách địa chỉ của người dùng
const getUserAddresses = async (req, res) => {
  try {
    const addresses = await DeliveryAddresses.findAll({
      where: { UserId: req.user.id },
      attributes: [
        "AddressId",
        "Address",
        "Province",
        "District",
        "Ward",
        "ReceiverName",
        "Phone",
        "IsDefault",
      ],
    });
    res.json({
      success: true,
      message: "Lấy danh sách địa chỉ thành công!",
      data: addresses,
    });
  } catch (err) {
    console.error("GET ADDRESSES ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy danh sách địa chỉ!",
      detail: err.message,
    });
  }
};

// Lấy danh sách Tỉnh/Quận/Xã từ GHN
const getGHNLocations = async (req, res) => {
  try {
    const { type, parentId } = req.query;
    let endpoint;
    if (type === "province") {
      endpoint = "/master-data/province";
    } else if (type === "district" && parentId) {
      endpoint = `/master-data/district?province_id=${parentId}`;
    } else if (type === "ward" && parentId) {
      endpoint = `/master-data/ward?district_id=${parentId}`;
    } else {
      return res.status(400).json({
        success: false,
        message: "Thiếu tham số type hoặc parentId!",
      });
    }

    const response = await axios.get(`${GHN_API_URL}${endpoint}`, {
      headers: { Token: GHN_TOKEN },
    });

    res.json({
      success: true,
      message: `Lấy danh sách ${type} thành công!`,
      data: response.data.data,
    });
  } catch (err) {
    console.error("GET GHN LOCATIONS ERROR:", err);
    res.status(500).json({
      success: false,
      message: `Lỗi khi lấy danh sách ${req.query.type}!`,
      detail: err.message,
    });
  }
};

// Tính phí ship
const calculateShippingFee = async (req, res) => {
  try {
    const { cuaHangId, deliveryAddressId, orderItems } = req.body;

    const cuaHang = await CuaHang.findByPk(cuaHangId, {
      attributes: ["ShopId", "WardCode", "DistrictId"],
    });
    if (!cuaHang) {
      return res.json({
        success: false,
        message: "Không tìm thấy cửa hàng!",
      });
    }

    const deliveryAddress = await DeliveryAddresses.findOne({
      where: { AddressId: deliveryAddressId, UserId: req.user.id },
      attributes: ["WardCode", "DistrictId"],
    });
    if (!deliveryAddress) {
      return res.json({
        success: false,
        message: "Không tìm thấy địa chỉ giao hàng!",
      });
    }

    let totalWeight = 0;
    let maxLength = 0;
    let maxWidth = 0;
    let maxHeight = 0;

    for (const item of orderItems) {
      const dimension = await FoodDimensions.findOne({
        where: { FoodId: item.FoodId },
        attributes: ["Weight", "Length", "Width", "Height"],
      });
      if (dimension) {
        totalWeight += (dimension.Weight || 300) * item.Quantity;
        maxLength = Math.max(maxLength, dimension.Length || 10);
        maxWidth = Math.max(maxWidth, dimension.Width || 10);
        maxHeight = Math.max(maxHeight, dimension.Height || 15);
      } else {
        totalWeight += 300 * item.Quantity;
        maxLength = Math.max(maxLength, 10);
        maxWidth = Math.max(maxWidth, 10);
        maxHeight = Math.max(maxHeight, 15);
      }
    }

    const feeResponse = await axios.post(
      `${GHN_API_URL}/v2/shipping-order/fee`,
      {
        from_district_id: cuaHang.DistrictId,
        from_ward_code: cuaHang.WardCode,
        to_district_id: deliveryAddress.DistrictId,
        to_ward_code: deliveryAddress.WardCode,
        service_type_id: 2, // Giao nhanh
        weight: totalWeight,
        length: maxLength,
        width: maxWidth,
        height: maxHeight,
      },
      { headers: { Token: GHN_TOKEN, ShopId: cuaHang.ShopId } }
    );

    const shippingFee = feeResponse.data.data.total;

    res.json({
      success: true,
      message: "Tính phí ship thành công!",
      data: { shippingFee },
    });
  } catch (err) {
    console.error("CALCULATE SHIPPING FEE ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi khi tính phí ship!",
      detail: err.message,
    });
  }
};

// Định dạng dữ liệu sản phẩm trong giỏ hàng
const formatItem = (item) => ({
  GioHangID: item.GioHangID,
  SoLuong: item.SoLuong,
  TotalPrice: parseFloat(item.TotalPrice),
  FoodId: item.Food.FoodId,
  FoodName: item.Food.FoodName,
  Price: parseFloat(item.Food.Price),
  DiscountPrice: item.Food.DiscountPrice
    ? parseFloat(item.Food.DiscountPrice)
    : null,
  ImageURL: item.Food.ImageURL || "/images/no-image.png",
  SizeID: item.Size?.SizeID,
  SizeName: item.Size?.SizeName,
  ExtraPrice: item.Size?.ExtraPrice ? parseFloat(item.Size.ExtraPrice) : null,
  Toppings:
    item.GioHang_Toppings?.map((gt) => ({
      ToppingID: gt.Topping.ToppingID,
      ToppingName: gt.Topping.ToppingName,
      ToppingPrice: parseFloat(gt.Topping.ToppingPrice),
    })) || [],
});

// Chuẩn bị dữ liệu thanh toán từ giỏ hàng
const prepareOrder = async (req, res) => {
  try {
    const { selectedItems, cuaHangId, deliveryAddressId } = req.body;
    if (!selectedItems?.length || !cuaHangId || !deliveryAddressId) {
      return res.json({
        success: false,
        message: "Thiếu thông tin sản phẩm, cửa hàng hoặc địa chỉ giao hàng!",
      });
    }

    const items = await GioHang.findAll({
      where: { Id: req.user.id, GioHangID: { [Op.in]: selectedItems } },
      attributes: ["GioHangID", "SoLuong", "TotalPrice"],
      include: [
        {
          model: Food,
          as: "Food",
          attributes: [
            "FoodId",
            "FoodName",
            "Price",
            "DiscountPrice",
            "ImageURL",
          ],
        },
        {
          model: Size,
          as: "Size",
          attributes: ["SizeID", "SizeName", "ExtraPrice"],
          required: false,
        },
        {
          model: GioHang_Topping,
          as: "GioHang_Toppings",
          attributes: [],
          include: [
            {
              model: Topping,
              as: "Topping",
              attributes: ["ToppingID", "ToppingName", "ToppingPrice"],
            },
          ],
        },
      ],
    });

    if (!items.length) {
      return res.json({
        success: false,
        message: "Không tìm thấy sản phẩm trong giỏ!",
      });
    }

    const cuaHang = await CuaHang.findByPk(cuaHangId, {
      attributes: [
        "CuaHangId",
        "CuaHangName",
        "ShopId",
        "WardCode",
        "DistrictId",
      ],
    });
    if (!cuaHang) {
      return res.json({
        success: false,
        message: "Không tìm thấy cửa hàng!",
      });
    }

    const deliveryAddress = await DeliveryAddresses.findOne({
      where: { AddressId: deliveryAddressId, UserId: req.user.id },
      attributes: [
        "AddressId",
        "Address",
        "Province",
        "District",
        "Ward",
        "WardCode",
        "DistrictId",
        "ReceiverName",
        "Phone",
      ],
    });
    if (!deliveryAddress) {
      return res.json({
        success: false,
        message: "Không tìm thấy địa chỉ giao hàng!",
      });
    }

    let shippingFee = 20000; // Mặc định
    try {
      const feeResponse = await axios.post(
        `${GHN_API_URL}/v2/shipping-order/fee`,
        {
          from_district_id: cuaHang.DistrictId,
          from_ward_code: cuaHang.WardCode,
          to_district_id: deliveryAddress.DistrictId,
          to_ward_code: deliveryAddress.WardCode,
          service_type_id: 2,
          weight: await items.reduce(async (sum, item) => {
            const dimension = await FoodDimensions.findOne({
              where: { FoodId: item.Food.FoodId },
            });
            return (await sum) + (dimension?.Weight || 300) * item.SoLuong;
          }, 0),
          length: Math.max(
            ...(await Promise.all(
              items.map(async (item) => {
                const dimension = await FoodDimensions.findOne({
                  where: { FoodId: item.Food.FoodId },
                });
                return dimension?.Length || 10;
              })
            ))
          ),
          width: Math.max(
            ...(await Promise.all(
              items.map(async (item) => {
                const dimension = await FoodDimensions.findOne({
                  where: { FoodId: item.Food.FoodId },
                });
                return dimension?.Width || 10;
              })
            ))
          ),
          height: Math.max(
            ...(await Promise.all(
              items.map(async (item) => {
                const dimension = await FoodDimensions.findOne({
                  where: { FoodId: item.Food.FoodId },
                });
                return dimension?.Height || 15;
              })
            ))
          ),
        },
        { headers: { Token: GHN_TOKEN, ShopId: cuaHang.ShopId } }
      );
      shippingFee = feeResponse.data.data.total;
    } catch (err) {
      console.error("CALCULATE SHIPPING FEE ERROR:", err);
    }

    const formattedItems = items.map(formatItem);
    const subtotal = formattedItems.reduce(
      (sum, item) => sum + item.TotalPrice,
      0
    );
    const total = subtotal + shippingFee;

    const paymentMethods = await PhuongThucThanhToan.findAll({
      attributes: [
        ["Id", "PaymentMethodId"],
        ["TenPhuongThuc", "Name"],
      ],
    });

    res.json({
      success: true,
      message: "Đã chuẩn bị dữ liệu thanh toán!",
      data: {
        items: formattedItems,
        subtotal,
        shipping: shippingFee,
        total,
        paymentMethods,
        cuaHang,
        deliveryAddress,
      },
    });
  } catch (err) {
    console.error("PREPARE ORDER ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi khi chuẩn bị thanh toán!",
      detail: err.message,
    });
  }
};

// Đặt hàng và gọi API GHN
const placeOrder = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      newAddress,
      paymentMethodId,
      selectedItems,
      orderItems,
      voucherCode,
      pendingOrderId,
      cuaHangId,
      deliveryAddressId,
      note,
    } = req.body;

    if (!cuaHangId || !deliveryAddressId) {
      await transaction.rollback();
      return res.json({
        success: false,
        message: "Thiếu thông tin cửa hàng hoặc địa chỉ giao hàng!",
      });
    }

    let itemsToOrder = [];

    // Xử lý nguồn dữ liệu
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

      if (!pendingOrder) {
        await transaction.rollback();
        return res.json({
          success: false,
          message: "Không tìm thấy đơn hàng lưu tạm!",
        });
      }

      itemsToOrder = pendingOrder.OrderDetails.map((d) => ({
        FoodId: d.Food.FoodId,
        SizeID: d.Size?.SizeID || null,
        Quantity: d.Quantity,
        TotalPrice: d.Price * d.Quantity,
        ToppingIDs: d.OrderDetails_Toppings.map((ot) => ot.Topping.ToppingID),
      }));

      await Orders.destroy({ where: { OrderId: pendingOrderId }, transaction });
    } else if (selectedItems?.length) {
      const cartItems = await GioHang.findAll({
        where: { Id: req.user.id, GioHangID: { [Op.in]: selectedItems } },
        attributes: ["GioHangID", "SoLuong", "TotalPrice", "FoodId", "SizeID"],
        include: [
          {
            model: GioHang_Topping,
            as: "GioHang_Toppings",
            attributes: ["ToppingID"],
          },
        ],
      });

      if (!cartItems.length) {
        await transaction.rollback();
        return res.json({
          success: false,
          message: "Không tìm thấy sản phẩm trong giỏ!",
        });
      }

      itemsToOrder = cartItems.map((item) => ({
        FoodId: item.FoodId,
        SizeID: item.SizeID,
        Quantity: item.SoLuong,
        TotalPrice: parseFloat(item.TotalPrice),
        GioHangID: item.GioHangID,
        ToppingIDs: item.GioHang_Toppings.map((gt) => gt.ToppingID),
      }));
    } else if (orderItems?.length) {
      itemsToOrder = orderItems.map((item) => ({
        FoodId: item.FoodId,
        SizeID: item.SizeID,
        Quantity: item.Quantity,
        TotalPrice: parseFloat(item.TotalPrice),
        ToppingIDs: item.ToppingIDs || [],
      }));
    } else {
      await transaction.rollback();
      return res.json({
        success: false,
        message: "Không có sản phẩm nào để đặt!",
      });
    }

    // Địa chỉ và cửa hàng
    const cuaHang = await CuaHang.findByPk(cuaHangId, {
      attributes: ["ShopId", "WardCode", "DistrictId", "CuaHangName"],
    });
    if (!cuaHang) {
      await transaction.rollback();
      return res.json({
        success: false,
        message: "Không tìm thấy cửa hàng!",
      });
    }

    let deliveryAddress;
    if (newAddress) {
      deliveryAddress = await DeliveryAddresses.create(
        {
          UserId: req.user.id,
          Address: newAddress.address,
          Province: newAddress.province,
          District: newAddress.district,
          Ward: newAddress.ward,
          WardCode: newAddress.wardCode,
          DistrictId: newAddress.districtId,
          ReceiverName: newAddress.receiverName,
          Phone: newAddress.phone,
          IsDefault: false,
        },
        { transaction }
      );
    } else {
      deliveryAddress = await DeliveryAddresses.findOne({
        where: { AddressId: deliveryAddressId, UserId: req.user.id },
        attributes: [
          "Address",
          "Province",
          "District",
          "Ward",
          "WardCode",
          "DistrictId",
          "ReceiverName",
          "Phone",
        ],
      });
      if (!deliveryAddress) {
        await transaction.rollback();
        return res.json({
          success: false,
          message: "Không tìm thấy địa chỉ giao hàng!",
        });
      }
    }

    // Tính tiền
    const subtotal = itemsToOrder.reduce(
      (sum, item) => sum + item.TotalPrice,
      0
    );
    let shippingFee = 20000; // Mặc định
    try {
      const feeResponse = await axios.post(
        `${GHN_API_URL}/v2/shipping-order/fee`,
        {
          from_district_id: cuaHang.DistrictId,
          from_ward_code: cuaHang.WardCode,
          to_district_id: deliveryAddress.DistrictId,
          to_ward_code: deliveryAddress.WardCode,
          service_type_id: 2,
          weight: await itemsToOrder.reduce(async (sum, item) => {
            const dimension = await FoodDimensions.findOne({
              where: { FoodId: item.FoodId },
            });
            return (await sum) + (dimension?.Weight || 300) * item.Quantity;
          }, 0),
          length: Math.max(
            ...(await Promise.all(
              itemsToOrder.map(async (item) => {
                const dimension = await FoodDimensions.findOne({
                  where: { FoodId: item.FoodId },
                });
                return dimension?.Length || 10;
              })
            ))
          ),
          width: Math.max(
            ...(await Promise.all(
              itemsToOrder.map(async (item) => {
                const dimension = await FoodDimensions.findOne({
                  where: { FoodId: item.FoodId },
                });
                return dimension?.Width || 10;
              })
            ))
          ),
          height: Math.max(
            ...(await Promise.all(
              itemsToOrder.map(async (item) => {
                const dimension = await FoodDimensions.findOne({
                  where: { FoodId: item.FoodId },
                });
                return dimension?.Height || 15;
              })
            ))
          ),
        },
        { headers: { Token: GHN_TOKEN, ShopId: cuaHang.ShopId } }
      );
      shippingFee = feeResponse.data.data.total;
    } catch (err) {
      console.error("CALCULATE SHIPPING FEE ERROR:", err);
    }

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

      if (!userVoucher) {
        await transaction.rollback();
        return res.json({
          success: false,
          message: "Voucher không hợp lệ hoặc đã dùng!",
        });
      }

      const voucher = userVoucher.Voucher;
      appliedVoucherId = voucher.VoucherId;

      if (voucher.DiscountAmount)
        discountAmount = parseFloat(voucher.DiscountAmount);
      else if (voucher.DiscountPercentage)
        discountAmount =
          (subtotal * parseFloat(voucher.DiscountPercentage)) / 100;

      await userVoucher.update({ IsUsed: true }, { transaction });
    }

    const totalAmount = subtotal + shippingFee - discountAmount;

    // Trạng thái đơn hàng
    const orderStatus = await OrderStatus.findOne({
      where: { StatusName: "Đặt hàng thành công" },
    });

    const [pendingPayment] = await PaymentStatus.findOrCreate({
      where: { PaymentStatusName: "Chờ thanh toán" },
      defaults: { PaymentStatusName: "Chờ thanh toán" },
      transaction,
    });

    // Tạo đơn hàng
    const order = await Orders.create(
      {
        UserId: req.user.id,
        CuaHangId: cuaHangId,
        OrderDate: getVietnamTime(),
        TotalAmount: totalAmount,
        PaymentMethodId: paymentMethodId,
        StatusId: orderStatus?.StatusId,
        PaymentStatusId: pendingPayment.PaymentStatusId,
        DeliveryAddress: deliveryAddress.Address,
        Province: deliveryAddress.Province,
        District: deliveryAddress.District,
        Ward: deliveryAddress.Ward,
        Phone: deliveryAddress.Phone,
        Note: note,
        VoucherId: appliedVoucherId,
        ClientOrderCode: `ORDER_${Date.now()}`,
      },
      { transaction }
    );

    // Chi tiết đơn hàng
    for (const item of itemsToOrder) {
      const unitPrice = item.TotalPrice / item.Quantity;
      const orderDetail = await OrderDetails.create(
        {
          OrderId: order.OrderId,
          FoodId: item.FoodId,
          SizeId: item.SizeID,
          Quantity: item.Quantity,
          Price: unitPrice,
        },
        { transaction }
      );

      for (const toppingId of item.ToppingIDs) {
        await OrderDetails_Topping.create(
          { OrderDetailId: orderDetail.OrderDetailId, ToppingId: toppingId },
          { transaction }
        );
      }
    }

    // Tạo đơn hàng GHN
    let ghnOrderCode = null;
    try {
      const ghnPayload = {
        to_name: deliveryAddress.ReceiverName,
        to_phone: deliveryAddress.Phone,
        to_address: deliveryAddress.Address,
        to_ward_code: deliveryAddress.WardCode,
        to_district_id: deliveryAddress.District2635Id,
        weight: await itemsToOrder.reduce(async (sum, item) => {
          const dimension = await FoodDimensions.findOne({
            where: { FoodId: item.FoodId },
          });
          return (await sum) + (dimension?.Weight || 300) * item.Quantity;
        }, 0),
        length: Math.max(
          ...(await Promise.all(
            itemsToOrder.map(async (item) => {
              const dimension = await FoodDimensions.findOne({
                where: { FoodId: item.FoodId },
              });
              return dimension?.Length || 10;
            })
          ))
        ),
        width: Math.max(
          ...(await Promise.all(
            itemsToOrder.map(async (item) => {
              const dimension = await FoodDimensions.findOne({
                where: { FoodId: item.FoodId },
              });
              return dimension?.Width || 10;
            })
          ))
        ),
        height: Math.max(
          ...(await Promise.all(
            itemsToOrder.map(async (item) => {
              const dimension = await FoodDimensions.findOne({
                where: { FoodId: item.FoodId },
              });
              return dimension?.Height || 15;
            })
          ))
        ),
        service_type_id: 2,
        payment_type_id: paymentMethodId === 2 ? 2 : 1, // 2: Người nhận trả (COD), 1: Người gửi trả
        required_note: note || "KHONGCHOXEMHANG",
        shop_id: cuaHang.ShopId,
        client_order_code: order.ClientOrderCode,
        cod_amount: paymentMethodId === 2 ? totalAmount : 0,
        items: await Promise.all(
          itemsToOrder.map(async (item) => {
            const food = await Food.findByPk(item.FoodId);
            return {
              name: food.FoodName,
              quantity: item.Quantity,
              price: item.TotalPrice / item.Quantity,
            };
          })
        ),
      };

      const ghnResponse = await axios.post(
        `${GHN_API_URL}/v2/shipping-order/create`,
        ghnPayload,
        { headers: { Token: GHN_TOKEN, ShopId: cuaHang.ShopId } }
      );

      ghnOrderCode = ghnResponse.data.data.order_code;

      await ShippingOrders.create(
        {
          OrderId: order.OrderId,
          ShopId: cuaHang.ShopId,
          GHNOrderCode: ghnOrderCode,
          Status: "ready",
          Fee: shippingFee,
          COD: paymentMethodId === 2 ? totalAmount : 0,
        },
        { transaction }
      );
    } catch (err) {
      console.error("GHN CREATE ORDER ERROR:", err);
      await transaction.rollback();
      return res.status(500).json({
        success: false,
        message: "Lỗi khi tạo đơn hàng GHN!",
        detail: err.message,
      });
    }

    // Xóa giỏ hàng
    if (selectedItems?.length) {
      await GioHang.destroy({
        where: { GioHangID: { [Op.in]: selectedItems } },
        transaction,
      });
    }

    // Nếu là VNPay
    if (paymentMethodId === 1) {
      const ipAddr =
        req.headers["x-forwarded-for"] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        "127.0.0.1";

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const uniqueTxnRef = `${order.OrderId}_${Date.now()}`;

      // ✅ Tự động detect môi trường từ Origin header hoặc Referer
      const origin = req.headers.origin || req.headers.referer || "";
      let vnpReturnUrl;

      if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
        // Môi trường local
        vnpReturnUrl = "http://localhost:3000/vnpay-return";
      } else if (origin.includes("vercel.app")) {
        // Môi trường production (Vercel)
        vnpReturnUrl = "https://suli-coffee-web.vercel.app/vnpay-return";
      } else {
        // Fallback: dùng env hoặc localhost
        vnpReturnUrl =
          process.env.VNP_RETURN_URL || "http://localhost:3000/vnpay-return";
      }

      console.log(`🔄 VNPay Return URL: ${vnpReturnUrl} (origin: ${origin})`);

      const paymentUrl = await vnpay.buildPaymentUrl({
        vnp_Amount: totalAmount,
        vnp_IpAddr: ipAddr,
        vnp_TxnRef: uniqueTxnRef,
        vnp_OrderInfo: `Thanh toán đơn hàng #${order.OrderId}`,
        vnp_OrderType: ProductCode.Other,
        vnp_ReturnUrl: vnpReturnUrl,
        vnp_Locale: VnpLocale.VN,
        vnp_CreateDate: dateFormat(new Date()),
        vnp_ExpireDate: dateFormat(tomorrow),
      });

      await transaction.commit();
      return res.json({
        success: true,
        Code: paymentMethodId,
        Url: paymentUrl,
        orderId: order.OrderId,
        ghnOrderCode,
      });
    }

    // Nếu là COD
    await transaction.commit();
    return res.json({
      success: true,
      message: "Đặt hàng thành công (COD)!",
      orderId: order.OrderId,
      ghnOrderCode,
    });
  } catch (err) {
    await transaction.rollback();
    console.error("PLACE ORDER ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi đặt hàng!",
      detail: err.message,
    });
  }
};

// Xử lý VNPay return
const vnpayReturn = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { vnp_TxnRef, vnp_TransactionStatus, vnp_Amount } = req.query;

    const orderId = parseInt(vnp_TxnRef.split("_")[0]);
    let verify;

    try {
      verify = vnpay.verifyReturnUrl(req.query);
    } catch {
      await Orders.update(
        { PaymentStatusId: await getPaymentStatusId("Thanh toán thất bại") },
        { where: { OrderId: orderId }, transaction }
      );
      await transaction.commit();
      return res.json({
        success: false,
        message: "Xác thực giao dịch VNPay thất bại (verify error).",
      });
    }

    if (!verify.isSuccess || vnp_TransactionStatus !== "00") {
      await Orders.update(
        { PaymentStatusId: await getPaymentStatusId("Thanh toán thất bại") },
        { where: { OrderId: orderId }, transaction }
      );
      await transaction.commit();
      return res.json({ success: false, message: "Thanh toán thất bại!" });
    }

    await Orders.update(
      {
        PaymentStatusId: await getPaymentStatusId("Đã thanh toán"),
        StatusId: await getOrderStatusId("Đặt hàng thành công"),
      },
      { where: { OrderId: orderId }, transaction }
    );

    await ShippingOrders.update(
      { Status: "ready" },
      { where: { OrderId: orderId }, transaction }
    );

    await transaction.commit();
    return res.json({
      success: true,
      message: "Thanh toán VNPay thành công!",
      amount: (parseInt(vnp_Amount) / 100).toFixed(0),
      orderId,
    });
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

// Hàm hỗ trợ
async function getPaymentStatusId(name) {
  const [record] = await PaymentStatus.findOrCreate({
    where: { PaymentStatusName: name },
    defaults: { PaymentStatusName: name },
  });
  return record.PaymentStatusId;
}

async function getOrderStatusId(name) {
  const record = await OrderStatus.findOne({ where: { StatusName: name } });
  return record?.StatusId || null;
}

// Đặt lại đơn hàng đã hủy
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

module.exports = {
  authenticateToken,
  formatItem,
  prepareOrder,
  placeOrder,
  vnpayReturn,
  reOrder,
  getStores,
  getUserAddresses,
  getGHNLocations,
  calculateShippingFee,
};
