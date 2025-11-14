// backend/routes/admin/category.js
const express = require("express");
const router = express.Router();
const categoryController = require("../../controllers/admin/categoryController");

// --- Định nghĩa các endpoint và gọi đến hàm controller tương ứng ---

// Lấy toàn bộ danh mục
router.get("/", categoryController.getAllCategories);

// Thêm mới danh mục
router.post("/add", categoryController.addCategory);

// Lấy chi tiết một danh mục (để hiện lên form sửa)
router.get("/edit/:id", categoryController.getCategoryById);

// Cập nhật danh mục sau khi sửa
router.post("/edit/:id", categoryController.editCategory);

// Xóa danh mục
router.post("/delete", categoryController.deleteCategory);

// API kiểm tra tên trùng lặp cho front-end (AJAX)
router.get("/check-name", categoryController.checkName);

module.exports = router;
