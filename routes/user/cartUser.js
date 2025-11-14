const express = require("express");
const router = express.Router();
const cartController = require("../../controllers/user/cartUserController");

// Import middleware từ controller
const { authenticateTokenOptional } = cartController;
console.log('Loaded cartUser router');

// Thêm vào giỏ
router.post("/add", authenticateTokenOptional, cartController.addToCart);

// Lấy giỏ
router.get("/", authenticateTokenOptional, cartController.getCart);

// Cập nhật số lượng
router.post("/update", authenticateTokenOptional, cartController.updateCart);
router.post("/update-options", authenticateTokenOptional, cartController.updateOptions);

// Xóa item
router.post("/delete", authenticateTokenOptional, cartController.deleteCart);

module.exports = router;
