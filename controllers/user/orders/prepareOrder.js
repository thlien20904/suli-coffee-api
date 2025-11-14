const { sequelize, models, Op } = require("./config");
const {
  GioHang,
  Food,
  Size,
  GioHang_Topping,
  Topping,
  PhuongThucThanhToan,
  CuaHang,
  DeliveryAddresses,
  FoodDimensions,
} = models;

// =========================
// 📌 Format item giỏ hàng
// =========================
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

// =========================
// 📌 Hàm tính phí ship theo khoảng cách
// =========================
const calculateShippingFee = async ({ cuaHangId, userLat, userLng }) => {
  if (!cuaHangId || userLat == null || userLng == null) return 0;

  const store = await CuaHang.findByPk(cuaHangId, {
    attributes: ["Latitude", "Longitude"],
  });
  if (!store || store.Latitude == null || store.Longitude == null) return 0;

  // Hàm tính khoảng cách Haversine
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(userLat - store.Latitude);
  const dLng = toRad(userLng - store.Longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(store.Latitude)) *
      Math.cos(toRad(userLat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  const fee = Math.ceil(distance) * 5000; // 1km = 5.000đ
  return fee;
};

// =========================
// 📌 Chuẩn bị dữ liệu đơn hàng
// =========================
const prepareOrder = async (req, res) => {
  try {
    const { selectedItems, cuaHangId, deliveryAddressId } = req.body;
    if (!selectedItems?.length || !cuaHangId || !deliveryAddressId) {
      return res.json({
        success: false,
        message: "Thiếu thông tin sản phẩm, cửa hàng hoặc địa chỉ giao hàng!",
      });
    }

    // Lấy sản phẩm từ giỏ hàng
    const items = await GioHang.findAll({
      where: { Id: req.user.id, GioHangID: { [Op.in]: selectedItems } },
      include: [
        { model: Food, as: "Food" },
        { model: Size, as: "Size", required: false },
        {
          model: GioHang_Topping,
          as: "GioHang_Toppings",
          include: [{ model: Topping, as: "Topping" }],
        },
      ],
    });
    if (!items.length)
      return res.json({
        success: false,
        message: "Không tìm thấy sản phẩm trong giỏ!",
      });

    const cuaHang = await CuaHang.findByPk(cuaHangId);
    if (!cuaHang)
      return res.json({ success: false, message: "Không tìm thấy cửa hàng!" });

    const deliveryAddress = await DeliveryAddresses.findOne({
      where: { DeliveryAddressId: deliveryAddressId, UserId: req.user.id },
    });
    if (!deliveryAddress)
      return res.json({
        success: false,
        message: "Không tìm thấy địa chỉ giao hàng!",
      });

    // Tính tổng khối lượng & kích thước (nếu muốn)
    let totalWeight = 0,
      maxLength = 10,
      maxWidth = 10,
      maxHeight = 15;
    for (const item of items) {
      const dim = await FoodDimensions.findOne({
        where: { FoodId: item.Food.FoodId },
      });
      totalWeight += (dim?.Weight || 300) * item.SoLuong;
      maxLength = Math.max(maxLength, dim?.Length || 10);
      maxWidth = Math.max(maxWidth, dim?.Width || 10);
      maxHeight = Math.max(maxHeight, dim?.Height || 15);
    }

    // Tính phí vận chuyển tự động theo khoảng cách
    const shippingFee = await calculateShippingFee({
      cuaHangId: cuaHang.CuaHangId,
      userLat: deliveryAddress.Latitude,
      userLng: deliveryAddress.Longitude,
    });

    const formattedItems = items.map(formatItem);
    const subtotal = formattedItems.reduce((sum, i) => sum + i.TotalPrice, 0);
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

module.exports = { formatItem, prepareOrder, calculateShippingFee };
