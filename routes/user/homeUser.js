const express = require("express");
const router = express.Router();
const homeUserController = require("../../controllers/user/homeUserController");

// Lấy dữ liệu trang chủ (8 món ăn mới nhất)
router.get("/", homeUserController.getHomeData);

module.exports = router;
