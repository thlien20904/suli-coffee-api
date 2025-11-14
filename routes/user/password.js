const express = require("express");
const router = express.Router();
const passwordController = require("../../controllers/user/passwordController");

// Route gửi OTP qua email
router.post("/forgot", passwordController.forgotPassword);

// Route xác minh OTP và đổi mật khẩu
router.post("/reset", passwordController.resetPassword);

module.exports = router;
