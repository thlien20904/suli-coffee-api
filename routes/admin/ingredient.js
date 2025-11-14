// backend/routes/admin/ingredient.js
const express = require("express");
const router = express.Router();
const ingredientController = require("../../controllers/admin/ingredientController");

// Lấy danh sách nguyên liệu
router.get("/", ingredientController.getAllIngredients);

// Lấy chi tiết một nguyên liệu
router.get("/:id", ingredientController.getIngredientById);

// Thêm nguyên liệu mới
router.post(
  "/add",
  ingredientController.upload.single("ImageFile"),
  ingredientController.addIngredient
);

// Cập nhật nguyên liệu
router.post(
  "/edit/:id",
  ingredientController.upload.single("ImageFile"),
  ingredientController.editIngredient
);

// Xóa nguyên liệu
router.post("/delete", ingredientController.deleteIngredient);

module.exports = router;
