const sequelize = require("../../config/sequelize");
const initModels = require("../../models/init-models");
const models = initModels(sequelize);
const { Sequelize, Op } = require("sequelize");

const { Vouchers, UserVouchers, Users, Notifications } = models;

// =========================
// 📌 LẤY DANH SÁCH VOUCHER
// =========================
exports.getAllVouchers = async (req, res) => {
  try {
    const vouchers = await Vouchers.findAll({
      order: [["VoucherId", "DESC"]],
    });
    res.json({ success: true, data: vouchers });
  } catch (err) {
    console.error("❌ Lỗi lấy danh sách voucher:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// =========================
// 📌 LẤY TẤT CẢ VOUCHER ĐÃ CẤP
// =========================
exports.getAssignedVouchers = async (req, res) => {
  try {
    const assigned = await UserVouchers.findAll({
      include: [
        { model: Users, as: "User", attributes: ["Id", "FullName"] },
        {
          model: Vouchers,
          as: "Voucher",
          attributes: ["VoucherId", "Code", "Description", "ExpiryDate"],
        },
      ],
      order: [["ReceivedDate", "DESC"]],
    });

    res.json({ success: true, data: assigned });
  } catch (err) {
    console.error("❌ Lỗi lấy danh sách voucher đã cấp:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// =========================
// 📌 CẤP VOUCHER CHO USER (TẠO USERVOUCHERS NGAY + NOTIFICATION)
// =========================
exports.assignVoucherToUser = async (req, res) => {
  const t = await sequelize.transaction(); // ← THÊM: Transaction cho safety
  try {
    const { UserId, VoucherId } = req.body;
    if (!UserId || !VoucherId)
      return res
        .status(400)
        .json({ success: false, message: "Thiếu UserId hoặc VoucherId" });

    // Kiểm tra voucher đã có trong UserVouchers chưa (để không cấp nhiều lần)
    const exists = await UserVouchers.findOne({
      where: { UserId, VoucherId },
      transaction: t,
    });
    if (exists)
      return res.json({
        success: false,
        message: "Người dùng đã được cấp voucher này rồi!", // ← UPDATE: Message rõ hơn
      });

    // Kiểm tra user và voucher tồn tại
    const user = await Users.findByPk(UserId, { transaction: t });
    const voucher = await Vouchers.findByPk(VoucherId, { transaction: t });
    if (!user || !voucher || !voucher.IsActive)
      return res
        .status(400)
        .json({ success: false, message: "User hoặc voucher không hợp lệ" });

    const now = new Date(); // ← THÊM: Ngày cấp ngay

    // Tạo UserVouchers NGAY (để hiện bảng)
    await UserVouchers.create(
      {
        UserId,
        VoucherId,
        ReceivedDate: now,
        // Có thể thêm Status: 'pending' nếu cần user confirm sau
      },
      { transaction: t }
    );

    // Tạo Notification nhắc user sử dụng voucher
    const notification = await Notifications.create(
      {
        UserId,
        Title: "🎁 Voucher mới đã được cấp cho bạn!",
        Message: `Bạn đã nhận voucher ${voucher.Code}. Sử dụng ngay trong đơn hàng!`,
        IsRead: false,
      },
      { transaction: t }
    );

    await t.commit(); // ← COMMIT

    res.json({
      success: true,
      message: "Đã cấp voucher thành công cho user! (Họ sẽ nhận thông báo)", // ← UPDATE: Message rõ
    });
  } catch (err) {
    await t.rollback(); // ← ROLLBACK nếu lỗi
    console.error("❌ Lỗi cấp voucher:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// =========================
// 📌 CẤP VOUCHER CHO TẤT CẢ USER (TẠO USERVOUCHERS NGAY + NOTIFICATION)
// =========================
exports.assignVoucherToAllUsers = async (req, res) => {
  const t = await sequelize.transaction(); // ← THÊM: Transaction outer
  try {
    const { VoucherId } = req.body;
    if (!VoucherId)
      return res
        .status(400)
        .json({ success: false, message: "Thiếu VoucherId" });

    const voucher = await Vouchers.findByPk(VoucherId, { transaction: t });
    if (!voucher || !voucher.IsActive)
      return res
        .status(400)
        .json({ success: false, message: "Voucher không hợp lệ" });

    const users = await Users.findAll({
      where: { Role: { [Op.ne]: "admin" } },
      transaction: t,
    });

    const now = new Date();
    let count = 0;

    // Bulk tạo để nhanh (nếu Sequelize hỗ trợ, hoặc loop với transaction)
    const newUserVouchers = [];
    const newNotifications = [];

    for (const user of users) {
      // Kiểm tra user đã có UserVouchers chưa
      const exists = await UserVouchers.findOne({
        where: { UserId: user.Id, VoucherId },
        transaction: t,
      });

      if (!exists) {
        // Thêm vào bulk
        newUserVouchers.push({
          UserId: user.Id,
          VoucherId,
          ReceivedDate: now,
        });

        newNotifications.push({
          UserId: user.Id,
          Title: "🎁 Voucher mới đã được cấp cho bạn!",
          Message: `Bạn đã nhận voucher ${voucher.Code}. Sử dụng ngay trong đơn hàng!`,
          IsRead: false,
        });
        count++;
      }
    }

    // Bulk create (nhanh hơn loop await)
    if (newUserVouchers.length > 0) {
      await UserVouchers.bulkCreate(newUserVouchers, { transaction: t });
      await Notifications.bulkCreate(newNotifications, { transaction: t });
    }

    await t.commit();

    res.json({
      success: true,
      message: `Đã cấp voucher thành công cho ${count} người dùng! (Họ sẽ nhận thông báo)`,
    });
  } catch (err) {
    await t.rollback();
    console.error("❌ Lỗi cấp voucher cho tất cả user:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// =========================
// 📌 LẤY VOUCHER CỦA USER
// =========================
exports.getUserVouchers = async (req, res) => {
  try {
    const userId = req.params.id;
    const vouchers = await UserVouchers.findAll({
      where: { UserId: userId },
      include: [{ model: Vouchers }],
      order: [["ReceivedDate", "DESC"]],
    });
    res.json({ success: true, data: vouchers });
  } catch (err) {
    console.error("❌ Lỗi lấy voucher user:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// THÊM VOUCHER
exports.addVoucher = async (req, res) => {
  try {
    const {
      Code,
      DiscountAmount,
      DiscountPercentage,
      MinOrderAmount,
      ExpiryDate,
      MaxUsage,
      Description,
    } = req.body;

    if (!Code || !ExpiryDate) {
      return res.status(400).json({
        success: false,
        message: "Thiếu Code hoặc ExpiryDate",
      });
    }

    // Kiểm tra ExpiryDate format
    const expiryDateStr = String(ExpiryDate).trim();
    if (
      !expiryDateStr ||
      expiryDateStr === "null" ||
      expiryDateStr === "undefined"
    ) {
      return res.status(400).json({
        success: false,
        message: "ExpiryDate không hợp lệ",
      });
    }

    // Kiểm tra format ngày
    const expiryDate = new Date(expiryDateStr);
    if (isNaN(expiryDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "ExpiryDate phải có format ngày hợp lệ",
      });
    }

    const code = String(Code).trim();
    const exists = await Vouchers.findOne({ where: { Code: code } });
    if (exists) {
      return res.status(400).json({
        success: false,
        message: "Mã voucher đã tồn tại",
      });
    }

    const expiry = expiryDate.toISOString().slice(0, 10) + " 00:00:00";

    await Vouchers.create({
      Code: code,
      DiscountAmount: DiscountAmount ? Number(DiscountAmount) : null,
      DiscountPercentage: DiscountPercentage
        ? Number(DiscountPercentage)
        : null,
      MinOrderAmount: MinOrderAmount ? Number(MinOrderAmount) : null,
      ExpiryDate: expiry,
      MaxUsage: MaxUsage ? Number(MaxUsage) : null,
      Description: Description || null,
      IsActive: true,
    });

    res.status(201).json({
      success: true,
      message: "Thêm voucher thành công!",
    });
  } catch (err) {
    console.error("Lỗi thêm voucher:", err.message);
    res.status(500).json({
      success: false,
      message: "Lỗi server: " + err.message,
    });
  }
};

// SỬA VOUCHER - ĐÃ FIX MÃ TRÙNG KHI SỬA
exports.editVoucher = async (req, res) => {
  try {
    const id = req.params.id;
    const {
      Code,
      DiscountAmount,
      DiscountPercentage,
      MinOrderAmount,
      ExpiryDate,
      MaxUsage,
      Description,
      IsActive,
    } = req.body;

    // Kiểm tra dữ liệu bắt buộc
    if (!id || !Code || !ExpiryDate) {
      return res.status(400).json({
        success: false,
        message: "Thiếu ID, Code hoặc ExpiryDate",
      });
    }

    // Kiểm tra ExpiryDate format
    const expiryDateStr = String(ExpiryDate).trim();
    if (
      !expiryDateStr ||
      expiryDateStr === "null" ||
      expiryDateStr === "undefined"
    ) {
      return res.status(400).json({
        success: false,
        message: "ExpiryDate không hợp lệ",
      });
    }

    // Kiểm tra format ngày
    const expiryDate = new Date(expiryDateStr);
    if (isNaN(expiryDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "ExpiryDate phải có format ngày hợp lệ",
      });
    }

    // Tìm voucher hiện tại
    const voucher = await Vouchers.findByPk(id);
    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: "Voucher không tồn tại",
      });
    }

    const code = String(Code).trim();

    // KIỂM TRA MÃ TRÙNG (LOẠI TRỪ CHÍNH NÓ)
    const exists = await Vouchers.findOne({
      where: {
        Code: code,
        VoucherId: { [Op.ne]: id },
      },
    });

    if (exists) {
      return res.status(400).json({
        success: false,
        message: "Mã voucher đã tồn tại (khác voucher này)",
      });
    }

    // Chuẩn hóa ngày - sử dụng expiryDate đã validate
    const expiry = expiryDate.toISOString().slice(0, 10) + " 00:00:00";

    // Cập nhật
    await voucher.update({
      Code: code,
      DiscountAmount: DiscountAmount ? Number(DiscountAmount) : null,
      DiscountPercentage: DiscountPercentage
        ? Number(DiscountPercentage)
        : null,
      MinOrderAmount: MinOrderAmount ? Number(MinOrderAmount) : null,
      ExpiryDate: expiry,
      MaxUsage: MaxUsage ? Number(MaxUsage) : null,
      Description: Description || null,
      IsActive: !!IsActive,
    });

    res.json({
      success: true,
      message: "Cập nhật voucher thành công!",
    });
  } catch (err) {
    console.error("Lỗi cập nhật voucher:", err.message);
    res.status(500).json({
      success: false,
      message: "Lỗi server: " + err.message,
    });
  }
};
// =========================
// 📌 NGƯNG KÍCH HOẠT / XÓA VOUCHER
// =========================
exports.deleteVoucher = async (req, res) => {
  try {
    const { id } = req.body;
    if (!id)
      return res.status(400).json({ success: false, message: "Thiếu ID" });

    const voucher = await Vouchers.findByPk(id);
    if (!voucher)
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy voucher" });

    const assignedCount = await UserVouchers.count({
      where: { VoucherId: id },
    });
    if (assignedCount > 0)
      return res.status(400).json({
        success: false,
        message:
          "Voucher đã được cấp cho user, không thể xóa hoặc ngưng hoạt động.",
      });

    voucher.IsActive = false;
    await voucher.save();

    res.json({
      success: true,
      message: "Voucher đã được ngưng kích hoạt (ẩn khỏi hệ thống).",
    });
  } catch (err) {
    console.error("❌ Lỗi xóa voucher:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// =========================
// 📌 TOGGLE TRẠNG THÁI VOUCHER
// =========================
exports.toggleVoucher = async (req, res) => {
  try {
    const id = req.params.id;
    const voucher = await Vouchers.findByPk(id);
    if (!voucher)
      return res
        .status(404)
        .json({ success: false, message: "Voucher không tồn tại" });

    voucher.IsActive = !voucher.IsActive;
    await voucher.save();

    res.json({
      success: true,
      message: `Voucher đã được ${
        voucher.IsActive ? "kích hoạt" : "ngừng hoạt động"
      }.`,
    });
  } catch (err) {
    console.error("❌ Lỗi toggle voucher:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// =========================
// 📌 LẤY VOUCHER THEO ID
// =========================
exports.getVoucherById = async (req, res) => {
  try {
    const id = req.params.id;
    const voucher = await Vouchers.findByPk(id);
    if (!voucher)
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy voucher" });

    res.json({ success: true, data: voucher });
  } catch (err) {
    console.error("❌ Lỗi lấy voucher theo ID:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};
