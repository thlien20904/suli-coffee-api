const express = require("express");
const router = express.Router();
const profileController = require("../../controllers/user/profileController");

// Middleware xác thực và upload
const { authenticate, upload } = profileController;

// Lấy thông tin tài khoản
router.get("/", authenticate, profileController.getProfile);

// Cập nhật thông tin user (bao gồm avatar)
router.post(
  "/update",
  authenticate,
  upload.single("AvatarFile"),
  profileController.updateProfile
);

// Lấy danh sách đơn hàng theo tab + phân trang
router.get("/orders", authenticate, profileController.getOrders);

// Hủy đơn hàng
router.post("/orders/cancel", authenticate, profileController.cancelOrder);

// Lấy avatar hiện tại
router.get("/avatar", authenticate, profileController.getAvatar);

// Lấy danh sách voucher đang hoạt động
router.get("/vouchers", authenticate, profileController.getVouchers);

// Người dùng nhận voucher
router.post(
  "/vouchers/receive",
  authenticate,
  profileController.receiveVoucher
);

// Lấy danh sách voucher đã nhận
router.get("/vouchers/my", authenticate, profileController.getUserVouchers);
// ✅ Áp dụng voucher
router.post("/apply", authenticate, profileController.applyVoucher);
// Lấy danh sách thông báo
router.get("/notifications", authenticate, profileController.getNotifications);

// Đánh dấu một thông báo là đã đọc
router.post(
  "/notifications/read",
  authenticate,
  profileController.readNotification
);

// Đánh dấu tất cả thông báo là đã đọc
router.post(
  "/notifications/read-all",
  authenticate,
  profileController.readAllNotifications
);

// Xóa một thông báo
router.delete(
  "/notifications/:id",
  authenticate,
  profileController.deleteNotification
);

module.exports = router;
