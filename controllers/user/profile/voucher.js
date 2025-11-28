// controllers/user/profile/voucher.js
const { Vouchers, UserVouchers, Op, Sequelize } = require("./config");

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

    // Format số tiền cho thông báo lỗi
    const formatCurrency = (value) => {
      if (!value || isNaN(value)) return "0";
      return Math.round(Number(value)).toLocaleString("vi-VN");
    };
    if (voucher.MinOrderAmount && subtotal < voucher.MinOrderAmount) {
      return res.status(400).json({
        success: false,
        message: `Đơn hàng phải >= ${formatCurrency(
          voucher.MinOrderAmount
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

module.exports = { getVouchers, receiveVoucher, getUserVouchers, applyVoucher };
