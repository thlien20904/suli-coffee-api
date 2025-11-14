const sequelize = require("../../config/sequelize");
const initModels = require("../../models/init-models");
const models = initModels(sequelize);
const {
  Users,
  Orders,
  OrderDetails,
  OrderDetails_Topping,
  PhuongThucThanhToan,
  OrderStatus,
  Food,
  Size,
  Topping,
  Vouchers,
  UserVouchers,
  Notifications,
} = models;
// ✅ THÊM: Import PaymentStatus
const { PaymentStatus } = models;
const { Op, Sequelize } = require("sequelize");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// Import Supabase service
const {
  uploadToSupabase,
  deleteFromSupabase,
  isSupabaseUrl,
} = require("../../services/supabaseService");

// JWT Secret từ .env
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_fallback";

// Cấu hình upload file - sử dụng memory storage cho Supabase
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only allow image files
    if (file.mimetype.match(/^image\/(jpeg|jpg|png|gif|webp)$/)) {
      cb(null, true);
    } else {
      cb(
        new Error("Chỉ chấp nhận file ảnh (jpeg, jpg, png, gif, webp)!"),
        false
      );
    }
  },
});

// Middleware xác thực JWT (Giữ nguyên)
const authenticate = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  console.log("🟢 AUTH HEADER:", authHeader); // ✅ log header nhận được

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("❌ Không có header hoặc sai định dạng");
    return res
      .status(401)
      .json({ success: false, message: "Không có token xác thực!" });
  }

  const token = authHeader.split(" ")[1];
  console.log("🟡 TOKEN NHẬN ĐƯỢC:", token); // ✅ log token

  if (!token) {
    console.log("❌ Token trống");
    return res
      .status(401)
      .json({ success: false, message: "Token không hợp lệ!" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log("✅ TOKEN DECODED:", decoded); // ✅ log payload token
    req.user = decoded; // { id, role, username, ... }
    next();
  } catch (err) {
    console.error("🔴 JWT VERIFY ERROR:", err.message);
    return res
      .status(401)
      .json({ success: false, message: "Token hết hạn hoặc không hợp lệ!" });
  }
};

// =========================
// 📌 LẤY THÔNG TIN TÀI KHOẢN (Giữ nguyên)
// =========================
const getProfile = async (req, res) => {
  try {
    console.log("🟢 REQ.USER:", req.user);
    const userId = req.user.id;
    console.log("🟡 Đang truy vấn userId:", userId);
    const user = await Users.findByPk(userId, {
      attributes: [
        "Id",
        "Username",
        "Email",
        "FullName",
        "Phone",
        "Address",
        "Role",
        "AvatarUrl",
        "CreatedDate",
      ],
    });
    if (!user) {
      console.log("❌ Không tìm thấy user với Id:", userId);
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy người dùng!" });
    }
    console.log("✅ USER FOUND:", user.toJSON());
    res.json({ success: true, data: user });
  } catch (err) {
    console.error("🔴 PROFILE ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy thông tin user",
      detail: err.message,
    });
  }
};

// =========================
// 📌 CẬP NHẬT THÔNG TIN USER (Giữ nguyên)
// =========================
const updateProfile = async (req, res) => {
  try {
    const { id, FullName, Phone, Address } = req.body;
    const file = req.file;

    if (req.user.id !== parseInt(id) && req.user.role !== "admin") {
      if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res
        .status(403)
        .json({ success: false, message: "Bạn không có quyền chỉnh sửa!" });
    }

    const user = await Users.findByPk(id);
    if (!user) {
      if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy người dùng!" });
    }

    // Validate input
    const errors = {};
    if (!FullName || FullName.trim().length < 3)
      errors.FullName = "FullName phải ≥ 3 ký tự";
    if (!Phone || !/^(0[3|5|7|8|9])[0-9]{8,9}$/.test(Phone.trim()))
      errors.Phone = "Số điện thoại không hợp lệ (9-10 số)";
    if (!Address || Address.trim().length === 0)
      errors.Address = "Address không được để trống";

    if (Object.keys(errors).length > 0) {
      return res
        .status(400)
        .json({ success: false, message: Object.values(errors).join("\n") });
    }

    // Xử lý avatar upload to Supabase
    let avatarUrl = user.AvatarUrl || "";
    if (file) {
      // Upload new avatar to Supabase
      const uploadResult = await uploadToSupabase(
        file.buffer,
        file.originalname,
        "Avatar" // folder for user avatars
      );

      if (uploadResult.success) {
        avatarUrl = uploadResult.url; // Full Supabase URL

        // Delete old avatar from Supabase if it exists
        if (user.AvatarUrl && isSupabaseUrl(user.AvatarUrl)) {
          await deleteFromSupabase(user.AvatarUrl);
        } else if (user.AvatarUrl && user.AvatarUrl.trim() !== "") {
          // Delete old local file for backward compatibility
          const oldPath = path.join(__dirname, "../../public", user.AvatarUrl);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
      } else {
        return res.status(500).json({
          success: false,
          message: `Lỗi upload avatar: ${uploadResult.error}`,
        });
      }
    }

    // Update instance
    user.FullName = FullName.trim();
    user.Phone = Phone.trim();
    user.Address = Address.trim();
    user.AvatarUrl = avatarUrl;

    await user.save();

    res.json({
      success: true,
      message: "Cập nhật thành công!",
      data: { avatarUrl },
    });
  } catch (err) {
    console.error("UPDATE USER ERROR:", err);
    res
      .status(500)
      .json({ success: false, message: "Có lỗi xảy ra khi cập nhật." });
  }
};

// =========================
// 📌 LẤY DANH SÁCH ĐƠN HÀNG THEO TAB + PHÂN TRANG (ĐÃ SỬA LẠI LOGIC)
// =========================
// =========================
const getOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10; // ✅ default 10 đơn/trang
    const tab = req.query.tab || "cho-xac-nhan";
    const userId = req.user.id;

    let whereClause = { UserId: userId };

    // Lấy PaymentStatusId của "Đã thanh toán" và "Chờ thanh toán"
    const [paidStatus, pendingStatus] = await Promise.all([
      PaymentStatus.findOne({ where: { PaymentStatusName: "Đã thanh toán" } }),
      PaymentStatus.findOne({ where: { PaymentStatusName: "Chờ thanh toán" } }),
    ]);

    const paidStatusId = paidStatus ? paidStatus.PaymentStatusId : null;
    const pendingStatusId = pendingStatus
      ? pendingStatus.PaymentStatusId
      : null;

    // Điều kiện COD, QR CODE, hoặc đã thanh toán
    const codOrPaidCondition = {
      [Op.or]: [
        { PaymentMethodId: 2 }, // COD
        { PaymentMethodId: 3 }, // QR CODE (hiển thị cả khi chờ thanh toán)
        { PaymentStatusId: paidStatusId }, // đã thanh toán (VNPAY)
      ],
    };

    let statusName;
    switch (tab) {
      case "cho-xac-nhan":
        statusName = "Đặt hàng thành công";
        break;
      case "dang-chuan-bi":
        statusName = "Đang chuẩn bị đơn hàng";
        whereClause[Op.and] = [codOrPaidCondition];
        break;
      case "dang-giao-hang":
        statusName = "Đang giao hàng";
        whereClause[Op.and] = [codOrPaidCondition];
        break;
      case "da-giao":
        statusName = "Giao hàng thành công";
        whereClause[Op.and] = [codOrPaidCondition];
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
        if (whereClause[Op.and]) {
          whereClause[Op.and].push({ StatusId: status.StatusId });
        } else {
          whereClause.StatusId = status.StatusId;
        }
      } else {
        whereClause.StatusId = -1;
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
      ],
      include: [
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
            .map((ot) => ot.Topping?.ToppingName)
            .filter(Boolean),
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
      isPaid: (() => {
        const pmName = (o.PaymentMethod?.TenPhuongThuc || "").toLowerCase();
        const psName = (o.PaymentStatus?.PaymentStatusName || "").toLowerCase();
        if (pmName.includes("vnpay") || o.PaymentMethodId === 1) {
          return psName.includes("thanh") || psName.includes("paid");
        }
        if (o.PaymentMethodId === 2 || pmName.includes("cod")) return false;
        return psName.length > 0;
      })(),
      OrderDetails: (detailsMap[o.OrderId] || []).map((d) => ({
        ...d,
        Toppings:
          (d.Toppings || []).length > 0
            ? d.Toppings.map((t_name) => ({ ToppingName: t_name }))
            : [],
      })),
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
    console.error("ORDERS ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi lấy danh sách đơn hàng.",
    });
  }
};

// =========================
// 📌 HỦY ĐƠN HÀNG
// =========================
const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.json({ success: false, message: "Thiếu orderId!" });
    }

    const userId = req.user.id;
    const order = await Orders.findOne({
      where: { OrderId: orderId, UserId: userId },
      include: [
        { model: OrderStatus, as: "Status", attributes: ["StatusName"] },
        {
          model: PaymentStatus,
          as: "PaymentStatus",
          attributes: ["PaymentStatusName"],
        },
        { model: OrderDetails, as: "OrderDetails" }, // nếu cần frontend hiển thị chi tiết
      ],
    });

    if (!order) {
      return res.json({
        success: false,
        message: "Không tìm thấy đơn hàng hoặc không có quyền hủy!",
      });
    }

    const statusName = order.Status?.StatusName;
    const paymentStatusName = order.PaymentStatus?.PaymentStatusName;

    // Các trạng thái được phép hủy
    const isPending =
      statusName === "Lưu tạm" || statusName === "Chưa thanh toán";
    const isConfirmed = statusName === "Đặt hàng thành công";
    const isPaid = paymentStatusName === "Đã thanh toán";
    const isPreparing = statusName === "Đang chuẩn bị đơn hàng";

    if (isPending || isConfirmed || isPaid || isPreparing) {
      const cancelledStatus = await OrderStatus.findOne({
        where: { StatusName: "Đã hủy" },
      });

      if (!cancelledStatus) {
        return res.json({
          success: false,
          message: "Không tìm thấy trạng thái 'Đã hủy'!",
        });
      }

      // Cập nhật trạng thái thành 'Đã hủy'
      await order.update({ StatusId: cancelledStatus.StatusId });

      // Trả về luôn order vừa hủy để frontend cập nhật tab 'Đã hủy'
      const cancelledOrder = await Orders.findOne({
        where: { OrderId: orderId },
        include: [
          { model: OrderStatus, as: "Status", attributes: ["StatusName"] },
          {
            model: PaymentStatus,
            as: "PaymentStatus",
            attributes: ["PaymentStatusName"],
          },
          { model: OrderDetails, as: "OrderDetails" },
        ],
      });

      return res.json({
        success: true,
        message: "Hủy đơn hàng thành công!",
        order: cancelledOrder,
      });
    }

    return res.json({
      success: false,
      message: "Không thể hủy đơn hàng ở trạng thái hiện tại!",
    });
  } catch (err) {
    console.error("CANCEL ORDER ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi hủy đơn hàng: " + err.message,
    });
  }
};

module.exports = { cancelOrder };

// =========================
// 📌 LẤY AVATAR HIỆN TẠI (Giữ nguyên)
// =========================
const getAvatar = async (req, res) => {
  try {
    const user = await Users.findByPk(req.user.id, {
      attributes: ["AvatarUrl"],
    });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy người dùng!" });
    }

    res.json({ success: true, data: { avatarUrl: user.AvatarUrl } });
  } catch (err) {
    console.error("GET AVATAR ERROR:", err);
    res.status(500).json({ success: false, message: "Lỗi khi lấy avatar" });
  }
};

// =========================
// 📌 LẤY DANH SÁCH VOUCHER ĐANG HOẠT ĐỘNG (Giữ nguyên)
// =========================
const getVouchers = async (req, res) => {
  try {
    const vouchers = await Vouchers.findAll({
      where: {
        IsActive: true,
        ExpiryDate: { [Op.gt]: Sequelize.fn("NOW") },
      },
      attributes: [
        "VoucherId",
        "Code",
        "DiscountAmount",
        "DiscountPercentage",
        "MinOrderAmount",
        "ExpiryDate",
        "Description",
        "MaxUsage",
        "UsedCount",
      ],
      order: [["CreatedDate", "DESC"]],
    });

    res.json({ success: true, data: vouchers });
  } catch (err) {
    console.error("GET VOUCHERS ERROR:", err);
    res
      .status(500)
      .json({ success: false, message: "Lỗi khi lấy danh sách voucher." });
  }
};

// =========================
// 📌 NGƯỜI DÙNG NHẬN VOUCHER (Giữ nguyên)
// =========================
const receiveVoucher = async (req, res) => {
  try {
    const { voucherId } = req.body;
    const userId = req.user.id;
    if (!voucherId) {
      return res.json({ success: false, message: "Thiếu voucherId!" });
    }

    const voucher = await Vouchers.findOne({
      where: {
        VoucherId: voucherId,
        IsActive: true,
        ExpiryDate: { [Op.gt]: Sequelize.fn("NOW") },
      },
    });

    if (!voucher) {
      return res.json({
        success: false,
        message: "Voucher không hợp lệ hoặc đã hết hạn!",
      });
    }

    const existingVoucher = await UserVouchers.findOne({
      where: { UserId: userId, VoucherId: voucherId },
    });

    if (existingVoucher) {
      return res.json({
        success: false,
        message: "Bạn đã nhận voucher này rồi!",
      });
    }

    await UserVouchers.create({
      UserId: userId,
      VoucherId: voucherId,
      IsUsed: false,
    });

    res.json({ success: true, message: "Nhận voucher thành công!" });
  } catch (err) {
    console.error("RECEIVE VOUCHER ERROR:", err);
    res.status(500).json({ success: false, message: "Lỗi khi nhận voucher." });
  }
};

// =========================
// 📌 LẤY DANH SÁCH VOUCHER ĐÃ NHẬN (Giữ nguyên)
// =========================
const getUserVouchers = async (req, res) => {
  try {
    const userId = req.user.id;
    const vouchers = await UserVouchers.findAll({
      where: { UserId: userId },
      include: [
        {
          model: Vouchers,
          as: "Voucher",
          attributes: [
            "Code",
            "Description",
            "DiscountAmount",
            "DiscountPercentage",
            "MinOrderAmount",
            "ExpiryDate",
          ],
        },
      ],
      order: [["ReceivedDate", "DESC"]],
      attributes: ["UserVoucherId", "IsUsed", "ReceivedDate"],
    });

    const formattedVouchers = vouchers.map((uv) => ({
      UserVoucherId: uv.UserVoucherId,
      Code: uv.Voucher?.Code,
      Description: uv.Voucher?.Description,
      DiscountAmount: uv.Voucher?.DiscountAmount
        ? parseFloat(uv.Voucher.DiscountAmount)
        : null,
      DiscountPercentage: uv.Voucher?.DiscountPercentage
        ? parseFloat(uv.Voucher.DiscountPercentage)
        : null,
      MinOrderAmount: uv.Voucher?.MinOrderAmount
        ? parseFloat(uv.Voucher.MinOrderAmount)
        : null,
      ExpiryDate: uv.Voucher?.ExpiryDate,
      IsUsed: uv.IsUsed,
      ReceivedDate: uv.ReceivedDate,
    }));

    res.json({ success: true, data: formattedVouchers });
  } catch (err) {
    console.error("GET USER VOUCHERS ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy danh sách voucher của bạn.",
    });
  }
};

// =========================
// 📌 Áp dụng voucher vào đơn hàng (Giữ nguyên)
// =========================
const applyVoucher = async (req, res) => {
  try {
    const { voucherCode, subtotal } = req.body; // sửa từ code -> voucherCode
    const userId = req.user.id;

    if (!voucherCode) {
      return res
        .status(400)
        .json({ success: false, message: "Thiếu mã voucher!" });
    }

    // Kiểm tra voucher tồn tại
    const voucher = await Vouchers.findOne({
      where: {
        Code: voucherCode,
        IsActive: true,
        ExpiryDate: { [Op.gt]: Sequelize.fn("NOW") },
      },
    });

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: "Voucher không tồn tại hoặc đã hết hạn",
      });
    }

    // Kiểm tra user đã nhận voucher
    const userVoucher = await UserVouchers.findOne({
      where: { UserId: userId, VoucherId: voucher.VoucherId },
    });

    if (!userVoucher) {
      return res
        .status(403)
        .json({ success: false, message: "Bạn chưa nhận voucher này" });
    }

    if (userVoucher.IsUsed) {
      return res
        .status(400)
        .json({ success: false, message: "Voucher đã được sử dụng" });
    }

    // Kiểm tra subtotal
    // Kiểm tra subtotal
    if (voucher.MinOrderAmount && subtotal < voucher.MinOrderAmount) {
      return res.status(400).json({
        success: false,
        message: `Đơn hàng phải >= ${voucher.MinOrderAmount.toLocaleString(
          "vi-VN"
        )} ₫ để áp dụng voucher`,
      });
    }

    // Tính giảm giá
    let discount = 0;
    if (voucher.DiscountAmount) discount += parseFloat(voucher.DiscountAmount);
    if (voucher.DiscountPercentage)
      discount +=
        (parseFloat(voucher.DiscountPercentage) / 100) * (subtotal || 0);

    res.json({
      success: true,
      discountAmount: discount, // luôn có giá trị
      message: "Voucher áp dụng thành công!",
    });
  } catch (err) {
    console.error("APPLY VOUCHER ERROR:", err);
    res
      .status(500)
      .json({ success: false, message: "Lỗi khi áp dụng voucher" });
  }
};

// =========================
// 📌 LẤY DANH SÁCH THÔNG BÁO (Giữ nguyên)
// =========================
const getNotifications = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 4;
    const offset = (page - 1) * pageSize;

    const notifications = await Notifications.findAll({
      where: { UserId: req.user.id },
      attributes: ["NotificationId", "Title", "Message", "IsRead", "CreatedAt"],
      order: [["CreatedAt", "DESC"]],
      offset,
      limit: pageSize,
    });

    const total = await Notifications.count({
      where: { UserId: req.user.id },
    });

    res.json({
      success: true,
      data: {
        notifications,
        total,
        currentPage: page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error("GET NOTIFICATIONS ERROR:", err);
    res
      .status(500)
      .json({ success: false, message: "Lỗi khi lấy danh sách thông báo." });
  }
};

// =========================
// 📌 ĐÁNH DẤU THÔNG BÁO LÀ ĐÃ ĐỌC (Giữ nguyên)
// =========================
const readNotification = async (req, res) => {
  try {
    const { notificationId } = req.body;
    if (!notificationId) {
      return res.json({ success: false, message: "Thiếu notificationId!" });
    }

    const notification = await Notifications.findOne({
      where: { NotificationId: notificationId, UserId: req.user.id },
    });

    if (!notification) {
      return res.json({ success: false, message: "Không tìm thấy thông báo!" });
    }

    await notification.update({ IsRead: true });

    res.json({ success: true, message: "Đã đánh dấu là đã đọc!" });
  } catch (err) {
    console.error("READ NOTIFICATION ERROR:", err);
    res
      .status(500)
      .json({ success: false, message: "Lỗi khi cập nhật thông báo." });
  }
};

// =========================
// 📌 ĐÁNH DẤU TẤT CẢ THÔNG BÁO LÀ ĐÃ ĐỌC (Giữ nguyên)
// =========================
const readAllNotifications = async (req, res) => {
  try {
    await Notifications.update(
      { IsRead: true },
      { where: { UserId: req.user.id } }
    );

    res.json({
      success: true,
      message: "Đã đánh dấu tất cả thông báo là đã đọc!",
    });
  } catch (err) {
    console.error("READ ALL NOTIFICATIONS ERROR:", err);
    res
      .status(500)
      .json({ success: false, message: "Lỗi khi cập nhật tất cả thông báo." });
  }
};

// =========================
// 📌 XÓA MỘT THÔNG BÁO (Giữ nguyên)
// =========================
const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Notifications.destroy({
      where: { NotificationId: id, UserId: req.user.id },
    });

    if (result === 0) {
      return res.json({ success: false, message: "Không tìm thấy thông báo." });
    }

    res.json({ success: true, message: "Đã xóa thông báo thành công!" });
  } catch (err) {
    console.error("DELETE NOTIFICATION ERROR:", err);
    res.status(500).json({ success: false, message: "Lỗi khi xóa thông báo." });
  }
};

// Export tất cả middleware và controller (Giữ nguyên)
module.exports = {
  authenticate,
  upload,
  getProfile,
  updateProfile,
  getOrders,
  cancelOrder,
  getAvatar,
  getVouchers,
  receiveVoucher,
  getUserVouchers,
  applyVoucher,
  getNotifications,
  readNotification,
  readAllNotifications,
  deleteNotification,
};
