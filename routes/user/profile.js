// routes/user/profile.js
const express = require("express");
const router = express.Router();
const profileController = require("../../controllers/user/profileController");
const reviewController = require("../../controllers/user/profile/review"); // ← Tách riêng cho rõ

const { authenticate } = profileController;

// === PROFILE ===
router.get("/", authenticate, profileController.getProfile);
router.post(
  "/update",
  authenticate,
  profileController.upload.single("AvatarFile"),
  profileController.updateProfile
);
router.get("/avatar", authenticate, profileController.getAvatar);

// === ORDERS ===
router.get("/orders", authenticate, profileController.getOrders);
router.get("/orders/:id", authenticate, profileController.getOrderDetail);
router.post("/orders/cancel", authenticate, profileController.cancelOrder);
router.post(
  "/orders/confirm-received",
  authenticate,
  profileController.confirmReceived
);

// === REVIEW – Tách riêng cho rõ ràng ===
router.get(
  "/order/:orderId/review",
  authenticate,
  reviewController.getReviewableItems
);
router.post("/order/review", authenticate, reviewController.submitReview);
router.get(
  "/order/:orderId/reviewed",
  authenticate,
  reviewController.checkReviewed
);

// === VOUCHER ===
router.get("/vouchers", authenticate, profileController.getVouchers);
router.post(
  "/vouchers/receive",
  authenticate,
  profileController.receiveVoucher
);
router.get("/vouchers/my", authenticate, profileController.getUserVouchers);
router.post("/apply", authenticate, profileController.applyVoucher);

// === NOTIFICATIONS ===
router.get("/notifications", authenticate, profileController.getNotifications);
router.post(
  "/notifications/read",
  authenticate,
  profileController.readNotification
);
router.post(
  "/notifications/read-all",
  authenticate,
  profileController.readAllNotifications
);
router.delete(
  "/notifications/:id",
  authenticate,
  profileController.deleteNotification
);

module.exports = router;
