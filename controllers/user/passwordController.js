const sequelize = require("../../config/sequelize");
const initModels = require("../../models/init-models");
const models = initModels(sequelize);
const { Users } = models;
const { Op } = require("sequelize");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");

// ✅ Cấu hình transporter cho nodemailer - hỗ trợ cả GMAIL và EMAIL variables
const emailUser = process.env.GMAIL_USER || process.env.EMAIL_USER;
const emailPass = process.env.GMAIL_PASS || process.env.EMAIL_PASS;

if (!emailUser || !emailPass) {
  console.error("❌ Password reset: No email credentials found!");
}

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: emailUser,
    pass: emailPass,
  },
  connectionTimeout: 30000, // Tăng timeout
  greetingTimeout: 15000,
  socketTimeout: 30000,
  tls: {
    rejectUnauthorized: false,
  },
  pool: true,
});

// Gửi mã OTP qua email
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email is required" });
    }

    const user = await Users.findOne({ where: { Email: email } });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Email không tồn tại" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // Hiệu lực 10 phút

    await Users.update(
      { ResetToken: otp, ResetTokenExpiry: otpExpiry },
      { where: { Email: email } }
    );

    await transporter.sendMail({
      from: `"SuLi Coffee" <${emailUser}>`,
      to: email,
      subject: "Mã đặt lại mật khẩu",
      text: `Mã OTP của bạn là: ${otp}. Có hiệu lực trong 10 phút.`,
    });

    res.json({ success: true, message: "OTP đã gửi vào email" });
  } catch (err) {
    console.error("FORGOT PASSWORD ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi khi gửi OTP",
      detail: err.message,
    });
  }
};

// Xác minh OTP và đổi mật khẩu
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: "Thiếu dữ liệu" });
    }

    const user = await Users.findOne({
      where: {
        Email: email,
        ResetToken: otp,
        ResetTokenExpiry: { [Op.gt]: new Date() },
      },
    });

    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "OTP không hợp lệ hoặc đã hết hạn" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await Users.update(
      {
        PasswordHash: hashedPassword,
        ResetToken: null,
        ResetTokenExpiry: null,
      },
      { where: { Email: email } }
    );

    res.json({ success: true, message: "Đặt lại mật khẩu thành công" });
  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi khi đặt lại mật khẩu",
      detail: err.message,
    });
  }
};
