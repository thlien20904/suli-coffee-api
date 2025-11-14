const express = require("express");
const router = express.Router();
const storesUserController = require("../../controllers/user/StoresUserController");

// Routes cụ thể trước
router.get("/search", storesUserController.searchStores);
router.get("/nearest", storesUserController.getNearestStore);
router.get("/nearest-all", storesUserController.getStoresSortedByDistance);

// Route tham số id cuối cùng
router.get("/:id", storesUserController.getStoreById);

// Lấy danh sách tất cả cửa hàng
router.get("/", storesUserController.getAllStores);

module.exports = router;
