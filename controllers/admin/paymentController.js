const sequelize = require("../../config/sequelize"); // Sequelize instance
const initModels = require("../../models/init-models"); // initModels generated
const models = initModels(sequelize);

const { PhuongThucThanhToan, Orders } = models;
const { Op } = require("sequelize");

// =========================
// 📌 LẤY DANH SÁCH PAYMENT METHODS
// =========================
exports.getAllPaymentMethods = async (req, res) => {
  try {
    const payments = await PhuongThucThanhToan.findAll({
      order: [["Id", "DESC"]],
    });
    res.json({ success: true, data: payments });
  } catch (err) {
    console.error("❌ Lỗi lấy payment methods:", err);
    res.status(500).json({ success: false, message: "Lỗi server." });
  }
};

// =========================
// 📌 LẤY 1 PAYMENT METHOD THEO ID
// =========================
exports.getPaymentById = async (req, res) => {
  try {
    const id = req.params.id;
    const payment = await PhuongThucThanhToan.findByPk(id);
    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy phương thức." });
    }
    res.json({ success: true, data: payment });
  } catch (err) {
    console.error("❌ Lỗi lấy payment theo ID:", err);
    res.status(500).json({ success: false, message: "Lỗi server." });
  }
};

// =========================
// 📌 THÊM PAYMENT METHOD
// =========================
exports.addPaymentMethod = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    let { TenPhuongThuc } = req.body;
    if (!TenPhuongThuc || !String(TenPhuongThuc).trim()) {
      await t.rollback();
      return res
        .status(400)
        .json({ success: false, message: "Tên phương thức không được để trống." });
    }
    TenPhuongThuc = String(TenPhuongThuc).trim();

    // Kiểm tra trùng
    const exists = await PhuongThucThanhToan.findOne({
      where: { TenPhuongThuc },
      transaction: t,
    });
    if (exists) {
      await t.rollback();
      return res
        .status(400)
        .json({ success: false, message: "Tên phương thức đã tồn tại." });
    }

    const newPayment = await PhuongThucThanhToan.create({ TenPhuongThuc }, { transaction: t });
    await t.commit();

    res.status(201).json({
      success: true,
      message: "Thêm phương thức thành công!",
      data: newPayment,
    });
  } catch (err) {
    await t.rollback();
    if (
      err.name === "SequelizeValidationError" ||
      err.name === "SequelizeUniqueConstraintError"
    ) {
      return res
        .status(400)
        .json({ success: false, message: err.errors[0].message || "Dữ liệu không hợp lệ." });
    }
    console.error("❌ Lỗi thêm payment method:", err);
    res.status(500).json({ success: false, message: "Lỗi server." });
  }
};

// =========================
// 📌 SỬA PAYMENT METHOD
// =========================
exports.editPaymentMethod = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const id = req.params.id;
    const payment = await PhuongThucThanhToan.findByPk(id, { transaction: t });
    if (!payment) {
      await t.rollback();
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy phương thức." });
    }

    let { TenPhuongThuc } = req.body;
    if (!TenPhuongThuc || !String(TenPhuongThuc).trim()) {
      await t.rollback();
      return res
        .status(400)
        .json({ success: false, message: "Tên phương thức không được để trống." });
    }
    TenPhuongThuc = String(TenPhuongThuc).trim();

    const exists = await PhuongThucThanhToan.findOne({
      where: { 
        TenPhuongThuc,
        Id: { [Op.ne]: id }
      },
      transaction: t,
    });
    if (exists) {
      await t.rollback();
      return res
        .status(400)
        .json({ success: false, message: "Tên phương thức đã tồn tại." });
    }

    payment.TenPhuongThuc = TenPhuongThuc;
    await payment.save({ transaction: t });
    await t.commit();

    res.json({ success: true, message: "Cập nhật phương thức thành công!" });
  } catch (err) {
    await t.rollback();
    if (
      err.name === "SequelizeValidationError" ||
      err.name === "SequelizeUniqueConstraintError"
    ) {
      return res
        .status(400)
        .json({ success: false, message: err.errors[0].message || "Dữ liệu không hợp lệ." });
    }
    console.error("❌ Lỗi sửa payment method:", err);
    res.status(500).json({ success: false, message: "Lỗi server." });
  }
};

// =========================
// 📌 XÓA PAYMENT METHOD
// =========================
exports.deletePaymentMethod = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.body;
    if (!id)
      return res
        .status(400)
        .json({ success: false, message: "Thiếu ID phương thức." });

    const payment = await PhuongThucThanhToan.findByPk(id, { transaction: t });
    if (!payment)
      return res
        .status(404)
        .json({ success: false, message: "Phương thức không tồn tại." });

    // Kiểm tra xem đang được dùng trong Orders không
    const orderCount = await Orders.count({ 
      where: { PaymentMethodId: id },
      transaction: t,
    });
    if (orderCount > 0) {
      await t.rollback();
      return res.status(409).json({
        success: false,
        message: `Không thể xóa vì phương thức đang được sử dụng trong ${orderCount} đơn hàng.`,
      });
    }

    await payment.destroy({ transaction: t });
    await t.commit();
    res.json({ success: true, message: "Xóa phương thức thành công!" });
  } catch (err) {
    await t.rollback();
    console.error("❌ Lỗi xóa payment method:", err);
    res.status(500).json({ success: false, message: "Lỗi server." });
  }
};

// =========================
// 📌 CHECK TÊN TRÙNG (AJAX)
// =========================
exports.checkName = async (req, res) => {
  try {
    const { tenPhuongThuc } = req.query;
    if (!tenPhuongThuc)
      return res
        .status(400)
        .json({ success: false, message: "Thiếu tên phương thức." });

    const count = await PhuongThucThanhToan.count({
      where: { TenPhuongThuc: tenPhuongThuc.trim() },
    });
    res.json({ success: true, available: count === 0 });
  } catch (err) {
    console.error("❌ Lỗi check tên phương thức:", err);
    res.status(500).json({ success: false, message: "Lỗi server." });
  }
};