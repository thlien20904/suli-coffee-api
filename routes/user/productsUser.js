const express = require("express");
const router = express.Router();
const productsUserController = require("../../controllers/user/productsUserController");

// Lấy danh sách sản phẩm
router.get("/", productsUserController.getProducts);

// Lấy chi tiết sản phẩm
router.get("/:id", productsUserController.getProductDetail);

module.exports = router;
