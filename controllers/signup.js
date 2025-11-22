const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { Op } = require("sequelize"); // Import Op để fix lỗi Op.or
const { sendSignupConfirmation } = require("../services/emailService");
require("dotenv").config();

exports.signup = async (req, res) => {
  const { username, email, password, fullName, phone, address } = req.body;
  try {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      console.log("❌ Invalid email format:", email);
      return res.status(400).json({ 
        message: "Email không hợp lệ! Vui lòng nhập đúng định dạng email." 
      });
    }

    // Kiểm tra username đã tồn tại
    const existedUsername = await User.findOne({
      where: { Username: username },
    });
    if (existedUsername) {
      return res.status(400).json({ message: "Tên đăng nhập đã tồn tại!" });
    }

    // Kiểm tra email đã tồn tại
    const existedEmail = await User.findOne({ where: { Email: email } });
    if (existedEmail) {
      return res.status(400).json({ message: "Email đã được sử dụng!" });
    }

    // Hash password
    const passwordHash = await bcryptjs.hash(password, 12);
    console.log("Hashed password for registration:", passwordHash);

    // Lưu user vào DB
    const user = await User.create({
      Username: username,
      Email: email,
      PasswordHash: passwordHash,
      FullName: fullName,
      Phone: phone,
      Address: address,
      Role: "User",
    });

    // Tạo token JWT
    const token = jwt.sign(
      { id: user.Id, role: user.Role },
      process.env.JWT_SECRET,
      { expiresIn: "48h" }
    );

    // Gửi email xác nhận đăng ký (không chặn response)
    try {
      await sendSignupConfirmation(user.Email, user.FullName);
      console.log("✅ Email xác nhận đã gửi đến:", user.Email);
    } catch (emailErr) {
      console.error("❌ Lỗi gửi email xác nhận:", emailErr.message);
      if (emailErr.code === 'EAUTH') {
        console.error("❌ Lỗi xác thực Gmail - Kiểm tra EMAIL_USER và EMAIL_PASS trong .env");
      } else if (emailErr.code === 'EENVELOPE') {
        console.error("❌ Email nhận không hợp lệ:", user.Email);
      } else if (emailErr.responseCode === 550) {
        console.error("❌ Email không tồn tại hoặc bị từ chối:", user.Email);
      }
      // Không throw error, vẫn cho đăng ký thành công
    }

    res.status(201).json({
      message: "Đăng ký thành công! Vui lòng đăng nhập.",
      token,
      user: { id: user.Id, email: user.Email, role: user.Role },
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ message: "Có lỗi xảy ra: " + error.message });
  }
};
