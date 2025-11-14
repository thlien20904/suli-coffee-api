// backend/controllers/user/orders/config.js
const sequelize = require("../../../config/sequelize");
const initModels = require("../../../models/init-models");
const { VNPay, ProductCode, VnpLocale, dateFormat } = require("vnpay");

const models = initModels(sequelize);
const {
  GioHang,
  GioHang_Topping,
  Users,
  Food,
  Size,
  Topping,
  Orders,
  OrderDetails,
  Vouchers,
  UserVouchers,
  OrderDetails_Topping,
  PhuongThucThanhToan,
  OrderStatus,
  PaymentStatus,
} = models;

const vnpay = new VNPay({
  tmnCode: process.env.VNPAY_TMN_CODE || "4Z1QBO45",
  secureSecret:
    process.env.VNPAY_SECURE_SECRET || "XQBSS9ZDQJCIKDZZ108ABV5RP6B32FOH",
  vnpayHost: "https://sandbox.vnpayment.vn",
  testMode: true,
  hashAlgorithm: "SHA512",
});

module.exports = {
  sequelize,
  models,
  vnpay,
  ProductCode,
  VnpLocale,
  dateFormat,
  Op: require("sequelize").Op,
};
