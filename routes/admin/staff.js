const express = require("express");
const router = express.Router();
const staffController = require("../../controllers/admin/staffController");

// Lấy danh sách
router.get("/", staffController.getAllStaffs);

// Lấy form data (nếu cần)
router.get("/form-data", staffController.getAllStaffs); // hoặc tạo controller riêng nếu muốn

// Lấy 1 nhân viên
router.get("/edit/:id", staffController.getStaffById);

// Thêm nhân viên
router.post("/add", staffController.addStaff);

// Sửa nhân viên
router.post("/edit/:id", staffController.editStaff);

// Xóa nhân viên
router.post("/delete", staffController.deleteStaff);

module.exports = router;
