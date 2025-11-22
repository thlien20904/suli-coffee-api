// backend/routes/user/ordersUser.js
const express = require("express");
const router = express.Router();

// Chỉ import 1 lần toàn bộ controller
const ordersUserController = require("../../controllers/user/ordersUserController");

// ===== Auto cancel pending orders mỗi 1 phút =====
if (typeof ordersUserController.autoCancelPendingOrders === "function") {
  setInterval(ordersUserController.autoCancelPendingOrders, 60 * 1000);
}

// ===== ROUTES =====

// --- Store ---
router.get(
  "/stores",
  ordersUserController.authenticateToken,
  ordersUserController.getStores
);

// --- User Addresses ---
router.get(
  "/addresses",
  ordersUserController.authenticateToken,
  ordersUserController.getUserAddresses
);
router.post(
  "/addresses/save",
  ordersUserController.authenticateToken,
  ordersUserController.saveUserAddress
);

router.post(
  "/shipping/calculate",
  ordersUserController.authenticateToken,
  ordersUserController.calculateShippingFee
);

// --- Geocode Address ---
router.post(
  "/geocode",
  ordersUserController.authenticateToken,
  ordersUserController.geocodeAddress
);

// --- Prepare & Place & Save Pending Orders ---
router.post(
  "/prepare",
  ordersUserController.authenticateToken,
  ordersUserController.prepareOrder
);
router.post(
  "/place-order",
  ordersUserController.authenticateToken,
  ordersUserController.placeOrder
);
router.post(
  "/confirm-qr-payment",
  ordersUserController.authenticateToken,
  ordersUserController.confirmQRPayment
);
router.post(
  "/save-pending",
  ordersUserController.authenticateToken,
  ordersUserController.savePending
);

// --- Pending Orders ---
router.get(
  "/pending",
  ordersUserController.authenticateToken,
  ordersUserController.getPendingOrders
);
router.post(
  "/pending/:orderId/cancel",
  ordersUserController.authenticateToken,
  ordersUserController.cancelPendingOrder
);

// --- Re-order ---
router.post(
  "/reorder/:orderId",
  ordersUserController.authenticateToken,
  ordersUserController.reOrder
);

// --- VNPay callback (không cần token) ---
router.get("/vnpay-return", ordersUserController.vnpayReturn);

// --- Get single order by ID ---
router.get(
  "/:orderId",
  ordersUserController.authenticateToken,
  ordersUserController.getOrderById
);

module.exports = router;
