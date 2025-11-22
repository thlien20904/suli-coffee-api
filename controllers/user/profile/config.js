// controllers/user/profile/config.js
const sequelize = require("../../../config/sequelize");
const initModels = require("../../../models/init-models");
const models = initModels(sequelize);

const {
  Users,
  Orders,
  OrderDetails,
  OrderDetails_Topping,
  PhuongThucThanhToan,
  OrderStatus,
  Food,
  Size,
  Topping,
  Vouchers,
  UserVouchers,
  Notifications,
  PaymentStatus,
  OrderReviews,
  CuaHang,
} = models;

const { Op, Sequelize } = require("sequelize");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const {
  uploadToSupabase,
  deleteFromSupabase,
  isSupabaseUrl,
} = require("../../../services/supabaseService");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_fallback";

// Upload chung cho avatar
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.match(/^image\/(jpeg|jpg|png|gif|webp)$/i)) {
      cb(null, true);
    } else {
      cb(new Error("Chỉ chấp nhận file ảnh!"), false);
    }
  },
});

// ✅ FIX: Multer .fields() KHÔNG HỖ TRỢ REGEX → Dùng .any() và validate thủ công
// → Chấp nhận: reviews (JSON), orderId, shopRating, shippingRating, images_1, images_123, videos_456...
const reviewUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB cho video
    files: 20, // Max 20 files (đủ cho nhiều OrderDetailId)
  },
  fileFilter: (req, file, cb) => {
    // ✅ Validate file type - CHỈ CHẤP NHẬN CÁC FORMAT PHỔ BIẾN
    // Ảnh: jpg, jpeg, png (KHÔNG chấp nhận gif, webp, svg, psd)
    const allowedImage = /^image\/(jpeg|jpg|png)$/i.test(file.mimetype);

    // Video: mp4, quicktime/mov, x-msvideo/avi (KHÔNG chấp nhận wmv, webm, gif)
    const allowedVideo = /^video\/(mp4|quicktime|x-msvideo)$/i.test(
      file.mimetype
    );

    if (allowedImage || allowedVideo) {
      cb(null, true);
    } else {
      // ✅ Thông báo rõ ràng format không được hỗ trợ
      const isImageAttempt = file.mimetype.startsWith("image/");
      const errorMsg = isImageAttempt
        ? `Ảnh "${file.originalname}" không đúng định dạng! Chỉ chấp nhận: JPG, JPEG, PNG. Định dạng hiện tại: ${file.mimetype}`
        : `Video "${file.originalname}" không đúng định dạng! Chỉ chấp nhận: MP4, MOV, AVI. Định dạng hiện tại: ${file.mimetype}`;
      cb(new Error(errorMsg), false);
    }
  },
}).any(); // ✅ Dùng .any() để nhận tất cả fields động

const authenticate = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ success: false, message: "Không có token xác thực!" });
  }
  const token = authHeader.split(" ")[1];
  if (!token)
    return res
      .status(401)
      .json({ success: false, message: "Token không hợp lệ!" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ success: false, message: "Token hết hạn hoặc không hợp lệ!" });
  }
};

module.exports = {
  // Models
  Users,
  Orders,
  OrderDetails,
  OrderDetails_Topping,
  PhuongThucThanhToan,
  OrderStatus,
  Food,
  Size,
  Topping,
  Vouchers,
  UserVouchers,
  Notifications,
  PaymentStatus,
  OrderReviews,
  CuaHang,

  // Sequelize
  Op,
  Sequelize,
  sequelize,

  // Auth & Upload
  authenticate,
  upload, // dùng cho avatar
  reviewUpload, // ← DÙNG CHO ĐÁNH GIÁ (ảnh + video + JSON)

  // Supabase
  uploadToSupabase,
  deleteFromSupabase,
  isSupabaseUrl,

  // Utils
  path,
  fs,
};
