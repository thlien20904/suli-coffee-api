const sequelize = require("../../config/sequelize");
const { Op } = require("sequelize"); // Import Op từ sequelize
const initModels = require("../../models/init-models");
const models = initModels(sequelize);
const { Users } = models;

// ====== Helpers ======

// SECRET cho JWT (từ .env)
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_fallback";

// Ký JWT với thời gian sống tùy chọn
const signToken = (payload, expiresIn = "7d") =>
  jwt.sign(payload, JWT_SECRET, { expiresIn });

// Regex util
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || "").trim());
const isUsername = (v) => /^[a-zA-Z0-9_.-]{3,30}$/.test((v || "").trim());
const isStrongPassword = (v) =>
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,}$/.test(v || "");
const isVNPhone10 = (v) =>
  /^0(3|5|7|8|9)\d{8}$/.test((v || "").replace(/\s+/g, ""));
const errObj = (field, msg) => ({ field, msg });

// Import logic từ file con
const { login, logout } = require("../signin");
const { register, verifyEmail } = require("../signup");

// Export tất cả
exports.register = register;
exports.login = login;
exports.logout = logout;
exports.verifyEmail = verifyEmail;