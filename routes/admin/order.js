const express = require("express");
const router = express.Router();
const orderController = require("../../controllers/admin/orderController");

/* =====================================================
   1️⃣ LẤY DANH SÁCH ĐƠN HÀNG
===================================================== */
router.get("/", orderController.getOrders);

/* =====================================================
   2️⃣ CẬP NHẬT TRẠNG THÁI ĐƠN HÀNG
===================================================== */
router.post("/:id/status", orderController.updateOrderStatus);

/* =====================================================
   3️⃣ ĐỒNG BỘ TRẠNG THÁI ĐƠN HÀNG TỪ GHN
===================================================== */
router.post("/:id/sync-ghn", orderController.syncGHNOrderStatus);

/* =====================================================
   4️⃣ XÁC NHẬN / TỪ CHỐI ĐƠN HÀNG QR CODE
===================================================== */
router.post("/:id/qr-action", orderController.confirmOrRejectQR);

module.exports = router;
