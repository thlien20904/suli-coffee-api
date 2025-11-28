// controllers/password.js
const sequelize = require("../../config/sequelize");
const initModels = require("../../models/init-models");
const models = initModels(sequelize);
const { Users } = models;
const { Op } = require("sequelize");
const bcrypt = require("bcryptjs");

// Regex mạnh như form đăng ký
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || "").trim());
const isStrongPassword = (v) =>
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,}$/.test(v || "");
const isOtp = (v) => /^\d{6}$/.test((v || "").trim());

// Hàm gửi OTP (giữ nguyên, đã dùng SendGrid/Gmail đúng môi trường)
// === SỬA LẠI HÀM NÀY TRONG passwordController.js ===
const sendOtpEmail = async (email, otp) => {
  const fromEmail = process.env.FROM_EMAIL || "thuylien2k4@gmail.com";

  const msg = {
    to: email,
    from: fromEmail,
    subject: "Mã OTP đặt lại mật khẩu - SuLi Coffee",
    html: `...template đẹp...`,
  };

  try {
    if (process.env.NODE_ENV === "production" || process.env.USE_SENDGRID === "true") {
      const sendGridService = require("../../services/emailServiceSendGrid");
      await sendGridService.sendOtpEmail(email, otp);
    } else {
      const nodemailer = require("nodemailer");
      const emailUser = process.env.GMAIL_USER || process.env.EMAIL_USER;
      const emailPass = process.env.GMAIL_PASS || process.env.EMAIL_PASS;

      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: { user: emailUser, pass: emailPass },
      });

      await transporter.sendMail({ ...msg, from: `"SuLi Coffee" <${emailUser}>` });
    }

    console.log(`OTP sent successfully to ${email}`);
    return { success: true }; // ← BẮT BUỘC PHẢI CÓ

  } catch (err) {
    console.error("Lỗi gửi OTP email:", err);
    return { success: false, error: err.message }; // ← VÀ Ở ĐÂY NỮA!
  }
};

// === FORGOT PASSWORD ===
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email
    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email là bắt buộc.",
        field: "email",
      });
    }
    if (!isEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Email không đúng định dạng.",
        field: "email",
      });
    }

    const user = await Users.findOne({ where: { Email: email.trim() } });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Email này chưa được đăng ký.",
        field: "email",
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    await Users.update(
      { ResetToken: otp, ResetTokenExpiry: otpExpiry },
      { where: { Email: email.trim() } }
    );

    const result = await sendOtpEmail(email.trim(), otp);
    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: "Không thể gửi OTP. Vui lòng thử lại sau.",
      });
    }

    res.json({
      success: true,
      message: "Mã OTP đã được gửi đến email của bạn!",
    });
  } catch (err) {
    console.error("FORGOT PASSWORD ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi hệ thống. Vui lòng thử lại sau.",
    });
  }
};

// === RESET PASSWORD ===
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword, confirmPassword } = req.body;

    const errors = [];

    // Validate từng field
    if (!email || !isEmail(email)) {
      errors.push({ field: "email", msg: "Email không hợp lệ." });
    }
    if (!otp || !isOtp(otp)) {
      errors.push({ field: "otp", msg: "OTP phải là 6 chữ số." });
    }
    if (!newPassword || !isStrongPassword(newPassword)) {
      errors.push({
        field: "newPassword",
        msg: "Mật khẩu ≥8 ký tự, phải có chữ HOA, thường, số và ký tự đặc biệt.",
      });
    }
    if (newPassword !== confirmPassword) {
      errors.push({ field: "confirmPassword", msg: "Mật khẩu nhập lại không khớp!" });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Dữ liệu không hợp lệ.",
        errors,
      });
    }

    const user = await Users.findOne({
      where: {
        Email: email.trim(),
        ResetToken: otp,
        ResetTokenExpiry: { [Op.gt]: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "OTP không hợp lệ hoặc đã hết hạn.",
        field: "otp",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await Users.update(
      {
        PasswordHash: hashedPassword,
        ResetToken: null,
        ResetTokenExpiry: null,
      },
      { where: { Email: email.trim() } }
    );

    res.json({
      success: true,
      message: "Đặt lại mật khẩu thành công! Vui lòng đăng nhập lại.",
    });
  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi hệ thống. Vui lòng thử lại sau.",
    });
  }
};