const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { Op } = require("sequelize"); // Import Op để fix lỗi Op.or
require("dotenv").config();

exports.signup = async (req, res) => {
  const { username, email, password, fullName, phone, address } = req.body;
  try {
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
