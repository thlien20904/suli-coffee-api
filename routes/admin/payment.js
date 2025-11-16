const express = require("express");
const router = express.Router();
const paymentController = require("../../controllers/admin/paymentController");

// Lấy danh sách
router.get("/", paymentController.getAllPaymentMethods);

// Lấy 1 payment method theo ID
router.get("/:id", paymentController.getPaymentById); // ✅ FIX: Đổi từ "/edit/:id" → "/:id" (khớp frontend GET `/api/admin/payment/${id}`)

// Thêm mới
router.post("/add", paymentController.addPaymentMethod);

// Sửa
router.post("/edit/:id", paymentController.editPaymentMethod);

// Xóa
router.post("/delete", paymentController.deletePaymentMethod);

// Check tên trùng
router.get("/check-name", paymentController.checkName);

module.exports = router;
