// backend/controllers/admin/staffController.js
const sequelize = require("../../config/sequelize"); // Sequelize instance
const initModels = require("../../models/init-models"); // init-models.js
const models = initModels(sequelize);

const { Staff, AccRole } = models;
const { Op } = require("sequelize");

// ================== LẤY DANH SÁCH NHÂN VIÊN ==================
exports.getAllStaffs = async (req, res) => {
  try {
    const staffs = await Staff.findAll({
      include: [{ model: AccRole, as: "Role", attributes: ["RoleName"] }],
      order: [["StaffId", "DESC"]],
    });
    res.json({ success: true, data: staffs });
  } catch (err) {
    console.error("❌ Lỗi lấy staff:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// ================== LẤY 1 NHÂN VIÊN ==================
exports.getStaffById = async (req, res) => {
  try {
    const id = req.params.id;
    const staff = await Staff.findByPk(id, {
      include: [{ model: AccRole, as: "Role", attributes: ["RoleName"] }],
    });
    if (!staff)
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy nhân viên" });

    res.json({ success: true, data: staff });
  } catch (err) {
    console.error("❌ Lỗi lấy staff theo ID:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// ================== THÊM NHÂN VIÊN ==================
exports.addStaff = async (req, res) => {
  try {
    let { FullName, Phone, DateOfBirth, Email, Gender, RoleId } = req.body;

    if (!FullName || !RoleId)
      return res
        .status(400)
        .json({ success: false, message: "Thiếu dữ liệu bắt buộc" });

    FullName = String(FullName).trim();
    Email = Email ? String(Email).trim() : null;

    // Check trùng email
    if (Email) {
      const exist = await Staff.count({ where: { Email } });
      if (exist > 0) {
        return res.json({ success: false, message: "Email đã tồn tại" });
      }
    }

    const newStaff = await Staff.create({
      FullName,
      Phone,
      DateOfBirth,
      Email,
      Gender,
      RoleId,
    });

    res.status(201).json({
      success: true,
      message: "Thêm nhân viên thành công!",
      data: newStaff,
    });
  } catch (err) {
    console.error("❌ Lỗi thêm staff:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// ================== SỬA NHÂN VIÊN ==================
exports.editStaff = async (req, res) => {
  try {
    const id = req.params.id;
    const staff = await Staff.findByPk(id);
    if (!staff)
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy nhân viên" });

    let { FullName, Phone, DateOfBirth, Email, Gender, RoleId } = req.body;

    if (!FullName || !RoleId)
      return res
        .status(400)
        .json({ success: false, message: "Thiếu dữ liệu bắt buộc" });

    FullName = String(FullName).trim();
    Email = Email ? String(Email).trim() : null;

    // Check email trùng
    if (Email) {
      const exist = await Staff.count({
        where: { Email, StaffId: { [Op.ne]: id } },
      });
      if (exist > 0) {
        return res.json({ success: false, message: "Email đã tồn tại" });
      }
    }

    await staff.update({ FullName, Phone, DateOfBirth, Email, Gender, RoleId });

    res.json({
      success: true,
      message: "Cập nhật nhân viên thành công!",
      data: staff,
    });
  } catch (err) {
    console.error("❌ Lỗi sửa staff:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// ================== XÓA NHÂN VIÊN ==================
exports.deleteStaff = async (req, res) => {
  try {
    const { id } = req.body;
    const staff = await Staff.findByPk(id);
    if (!staff)
      return res.json({ success: false, message: "Nhân viên không tồn tại" });

    await staff.destroy();
    res.json({ success: true, message: "Xóa nhân viên thành công!" });
  } catch (err) {
    console.error("❌ Lỗi xóa staff:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};
