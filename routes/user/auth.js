const express = require("express");
const router = express.Router();

const authController = require("../../controllers/user/authController");

// Đăng ký người dùng
router.post("/register", authController.register);
// Xác nhận email (link gửi trong mail)
router.get("/verify-email", authController.verifyEmail);

// Đăng nhập người dùng
router.post("/login", authController.login);

// Đăng xuất (client-side)
router.post("/logout", authController.logout);

module.exports = router;
