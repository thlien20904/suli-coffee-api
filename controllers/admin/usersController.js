const sequelize = require("../../config/sequelize"); // Sequelize instance
const initModels = require("../../models/init-models"); // file init-models
const models = initModels(sequelize);

const { Users } = models;

// =========================
// 📌 LẤY DANH SÁCH USERS (không gồm Admin)
// =========================
exports.getAllUsers = async (req, res) => {
  try {
    const users = await Users.findAll({
      where: { Role: { [sequelize.Sequelize.Op.ne]: "admin" } }, // ✅ FIX: Đổi "Admin" → "admin" (lowercase, khớp DB từ table screenshot)
      order: [["CreatedDate", "DESC"]],
    });
    res.json({ success: true, data: users });
  } catch (err) {
    console.error("❌ Lỗi lấy users:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// =========================
// 📌 LẤY 1 USER THEO ID
// =========================
exports.getUserById = async (req, res) => {
  try {
    const id = req.params.id;
    const user = await Users.findByPk(id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy user" });
    }
    res.json({ success: true, data: user });
  } catch (err) {
    console.error("❌ Lỗi lấy user theo ID:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// =========================
// 📌 CẤM USER
// =========================
exports.banUser = async (req, res) => {
  try {
    const id = req.params.id;
    const user = await Users.findOne({ where: { Id: id, Role: { [sequelize.Sequelize.Op.ne]: "admin" } } }); // ✅ FIX: Đổi "Admin" → "admin" (khớp DB)
    if (!user) {
      return res.status(404).json({ success: false, message: "Không tìm thấy user hoặc không thể cấm admin" });
    }

    user.Role = "Banned";
    await user.save();

    res.json({ success: true, message: "Đã cấm user thành công" });
  } catch (err) {
    console.error("❌ Lỗi khi cấm user:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// =========================
// 📌 BỎ CẤM USER
// =========================
exports.unbanUser = async (req, res) => {
  try {
    const id = req.params.id;
    const user = await Users.findOne({ where: { Id: id, Role: { [sequelize.Sequelize.Op.ne]: "admin" } } }); // ✅ FIX: Đổi "Admin" → "admin" (khớp DB)
    if (!user) {
      return res.status(404).json({ success: false, message: "Không tìm thấy user hoặc không thể bỏ cấm admin" });
    }

    user.Role = "User";
    await user.save();

    res.json({ success: true, message: "Đã bỏ cấm user thành công" });
  } catch (err) {
    console.error("❌ Lỗi khi bỏ cấm user:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};