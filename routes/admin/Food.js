// backend/routes/admin/food.js
const express = require("express");
const router = express.Router();
const foodController = require("../../controllers/admin/foodController");

// Lấy danh sách món ăn (có phân trang, tìm kiếm, sắp xếp)
router.get("/", foodController.getAllFoods);

// Lấy chi tiết một món ăn
router.get("/:id", foodController.getFoodById);

// Thêm món ăn mới (sử dụng middleware upload)
router.post(
  "/add",
  foodController.upload.single("ImageFile"),
  foodController.addFood
);

// Cập nhật món ăn (sử dụng middleware upload)
router.post(
  "/edit/:id",
  foodController.upload.single("ImageFile"),
  foodController.editFood
);

// Xóa món ăn
router.post("/delete", foodController.deleteFood);

module.exports = router;
