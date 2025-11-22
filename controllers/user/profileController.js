// controllers/user/profileController.js
const { authenticate, upload, reviewUpload } = require("./profile/config");
const { getProfile, updateProfile, getAvatar } = require("./profile/profile");
const { 
  getOrders, 
  cancelOrder, 
  getOrderDetail, 
  confirmReceived   // ← ĐÃ THÊM VÀO ĐÂY
} = require("./profile/order");
const {
  getVouchers,
  receiveVoucher,
  getUserVouchers,
  applyVoucher,
} = require("./profile/voucher");
const {
  getNotifications,
  readNotification,
  readAllNotifications,
  deleteNotification,
} = require("./profile/notification");
const {
  getReviewableItems,
  submitReview,
  checkReviewed,
} = require("./profile/review");

module.exports = {
  authenticate,
  upload,
  getProfile,
  updateProfile,
  getAvatar,

  // Orders
  getOrders,
  cancelOrder,
  getOrderDetail,
  confirmReceived,        // ← ĐÃ XUẤT RA ĐÚNG

  // Voucher
  getVouchers,
  receiveVoucher,
  getUserVouchers,
  applyVoucher,

  // Notification
  getNotifications,
  readNotification,
  readAllNotifications,
  deleteNotification,

  // Review
  getReviewableItems,
  submitReview,
  checkReviewed,
};