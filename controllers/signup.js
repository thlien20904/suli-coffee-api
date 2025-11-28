// Định nghĩa FRONTEND_URL để tránh lỗi undefined
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
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

// Import email helpers từ file con cùng cấp
const { sendVerificationEmail } = require("./emailHelpers");

// Regex util
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || "").trim());
const isUsername = (v) => /^[a-zA-Z0-9_.-]{3,30}$/.test((v || "").trim());
const isStrongPassword = (v) =>
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,}$/.test(v || "");
const isVNPhone10 = (v) =>
  /^0(3|5|7|8|9)\d{8}$/.test((v || "").replace(/\s+/g, ""));
const errObj = (field, msg) => ({ field, msg });

// =========================
// 📌 ĐĂNG KÝ NGƯỜI DÙNG
// =========================
exports.register = async (req, res) => {
  console.log("🚀 REGISTER FUNCTION STARTED");
  try {
    const { username, email, password, fullName, phone, address } = req.body;
    console.log("📝 REQUEST DATA:", {
      username,
      email,
      fullName,
      phone,
      address,
    });

    // Validate đầu vào
    const errs = [];
    if (!username || !isUsername(username))
      errs.push(
        errObj("username", "Username 3–30 ký tự, chỉ a-z, A-Z, 0-9, _ . -")
      );
    if (!email || !isEmail(email))
      errs.push(errObj("email", "Email không đúng định dạng."));
    if (!password || !isStrongPassword(password))
      errs.push(
        errObj(
          "password",
          "Mật khẩu ≥8 ký tự, gồm chữ HOA, thường, số và ký tự đặc biệt."
        )
      );
    if (!fullName || fullName.length < 2)
      errs.push(errObj("fullName", "Họ tên tối thiểu 2 ký tự."));
    if (!phone || !isVNPhone10(phone))
      errs.push(errObj("phone", "SĐT phải 10 số, bắt đầu 03/05/07/08/09."));
    if (!address || address.length < 5)
      errs.push(errObj("address", "Địa chỉ tối thiểu 5 ký tự."));

    if (errs.length)
      return res.status(400).json({ success: false, errors: errs });

    // Kiểm tra trùng username/email
    const exists = await Users.findOne({
      where: { [Op.or]: [{ Username: username }, { Email: email }] },
    });
    if (exists) {
      const errors = [];
      if (exists.Username === username)
        errors.push(errObj("username", "Username đã tồn tại."));
      if (exists.Email === email)
        errors.push(errObj("email", "Email đã tồn tại."));
      console.warn("Đăng ký thất bại - trùng username/email:", {
        usernameExists: exists.Username === username,
        emailExists: exists.Email === email,
      });
      return res.status(409).json({
        success: false,
        message: "Username hoặc Email đã tồn tại.",
        errors,
      });
    }

    // Hash mật khẩu nhưng chưa tạo user — gửi email xác nhận
    const hashed = await bcrypt.hash(password, 10);

    // Tạo token chứa thông tin đăng ký tạm thời (không gồm password plain)
    const verifyPayload = {
      username,
      email,
      passwordHash: hashed,
      fullName,
      phone,
      address,
    };
    const verifyToken = signToken(verifyPayload, "24h");

    // Gửi email xác nhận
    console.log("📧 STARTING EMAIL SEND PROCESS");
    const mailSent = await sendVerificationEmail(email, verifyToken, username);
    console.log("📧 EMAIL SEND RESULT:", mailSent);
    if (!mailSent) {
      // Nếu SMTP không cấu hình hoặc gửi thất bại, trả lỗi rõ ràng
      return res.status(500).json({
        success: false,
        message:
          "Không thể gửi email xác nhận. Vui lòng liên hệ quản trị viên hoặc thử lại sau.",
      });
    }

    res.status(200).json({
      success: true,
      message:
        "Đăng ký tạm thời thành công. Vui lòng kiểm tra email để xác nhận và hoàn tất đăng ký.",
    });
  } catch (err) {
    console.error("❌ Lỗi đăng ký người dùng:", err);
    if (
      err.name === "SequelizeValidationError" ||
      err.name === "SequelizeUniqueConstraintError"
    ) {
      return res
        .status(400)
        .json({ success: false, message: err.errors[0].message });
    }
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// =========================
// 📌 XÁC NHẬN EMAIL (KẾT THÚC ĐĂNG KÝ)
// =========================
exports.verifyEmail = async (req, res) => {
  try {
    const token = req.query.token || req.body.token;
    if (!token)
      return res
        .status(400)
        .json({ success: false, message: "Thiếu token xác nhận." });

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: "Token không hợp lệ hoặc đã hết hạn.",
      });
    }

    const { username, email, passwordHash, fullName, phone, address } = payload;
    if (!username || !email || !passwordHash) {
      return res.status(400).json({
        success: false,
        message: "Payload token thiếu thông tin cần thiết.",
      });
    }

    // Kiểm tra tồn tại trước khi tạo
    const exists = await Users.findOne({
      where: { [Op.or]: [{ Username: username }, { Email: email }] },
    });
    if (exists) {
      return res
        .status(409)
        .json({ success: false, message: "Username hoặc Email đã tồn tại." });
    }

    const newUser = await Users.create({
      Username: username,
      Email: email,
      PasswordHash: passwordHash,
      FullName: fullName,
      Phone: phone,
      Address: address,
      Role: "User",
    });

    // Optionally, create a JWT so user is logged in after verification
    const authToken = signToken(
      {
        id: newUser.Id,
        role: newUser.Role || "User",
        username: newUser.Username,
        email: newUser.Email,
      },
      "2h"
    );

    // Redirect to frontend success page instead of login directly
    const redirectTo = `${FRONTEND_URL.replace(
      /\/$/,
      ""
    )}/email-verified?success=1`;
    // If request comes from API client (Accept: application/json) prefer JSON response.
    const acceptsJson =
      req.get("accept") && req.get("accept").includes("application/json");
    if (acceptsJson || req.xhr) {
      return res.json({
        success: true,
        message: "Xác nhận thành công. Tài khoản đã được tạo.",
        token: authToken,
        user: {
          id: newUser.Id,
          username: newUser.Username,
          email: newUser.Email,
        },
      });
    }

    return res.redirect(redirectTo);
  } catch (err) {
    console.error("Lỗi xác nhận email:", err);
    res
      .status(500)
      .json({ success: false, message: "Lỗi server khi xác nhận email." });
  }
};