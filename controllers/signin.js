const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const sequelize = require("../config/sequelize");
const { Op } = require("sequelize"); // Import Op từ sequelize
const initModels = require("../models/init-models");
const models = initModels(sequelize);
const { Users } = models;

// ====== Helpers ======

// SECRET cho JWT (từ .env)
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_fallback";

// Ký JWT với thời gian sống tùy chọn
const signToken = (payload, expiresIn = "7d") =>
  jwt.sign(payload, JWT_SECRET, { expiresIn });

// Regex util
const errObj = (field, msg) => ({ field, msg });

// =========================
// 📌 ĐĂNG NHẬP NGƯỜI DÙNG
// =========================
exports.login = async (req, res) => {
  try {
    const { identifier, password, remember } = req.body;

    // Validate đầu vào
    const errs = [];
    if (!identifier)
      errs.push(errObj("identifier", "Vui lòng nhập Username hoặc Email."));
    if (!password) errs.push(errObj("password", "Vui lòng nhập Mật khẩu."));
    if (errs.length)
      return res.status(400).json({ success: false, errors: errs });

    // Tìm người dùng
    const user = await Users.findOne({
      where: {
        [Op.or]: [{ Username: identifier }, { Email: identifier }],
      },
    });
    if (!user)
      return res.status(401).json({
        success: false,
        message: "Tên đăng nhập không tồn tại",
        errorType: "username",
        errors: [errObj("identifier", "Tên đăng nhập không tồn tại")],
      });

    // So khớp mật khẩu
    const passInDb = user.PasswordHash || "";
    const looksHashed =
      passInDb.startsWith("$2a$") || passInDb.startsWith("$2b$");
    const ok = looksHashed
      ? await bcrypt.compare(password, passInDb)
      : password === passInDb;
    if (!ok)
      return res.status(401).json({
        success: false,
        message: "Mật khẩu không đúng",
        errorType: "password",
        errors: [errObj("password", "Mật khẩu không đúng")],
      });

    // Nếu mật khẩu lưu dạng plain text, hash lại
    if (!looksHashed) {
      const newHash = await bcrypt.hash(password, 10);
      user.PasswordHash = newHash;
      await user.save();
    }

    // Tạo JWT
    const expiresIn = remember ? "30d" : "2h";
    const token = signToken(
      {
        id: user.Id,
        role: user.Role || "User",
        username: user.Username,
        email: user.Email,
        avatar: user.AvatarUrl || null,
      },
      expiresIn
    );

    res.json({
      success: true,
      token,
      role: user.Role || "User",
      expiresIn,
      data: {
        id: user.Id,
        username: user.Username,
        email: user.Email,
        fullName: user.FullName || "",
        avatar: user.AvatarUrl || null,
      },
    });
  } catch (err) {
    console.error("❌ Lỗi đăng nhập:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// =========================
// 📌 ĐĂNG XUẤT (CLIENT-SIDE)
// =========================
exports.logout = async (req, res) => {
  try {
    res.json({
      success: true,
      message: "Đăng xuất thành công. Token đã hết hạn.",
    });
  } catch (err) {
    console.error("❌ Lỗi đăng xuất:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};