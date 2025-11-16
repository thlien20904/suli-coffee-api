const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { poolPromise, sql } = require("../../config/db");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

// Middleware xác thực admin
const adminAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader)
    return res.status(401).json({ success: false, message: "Chưa đăng nhập" });

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "Không có quyền admin" });
    }
    req.user = decoded;
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ success: false, message: "Token không hợp lệ" });
  }
};

// POST /api/admin/auth/change-password
router.post("/change-password", adminAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: "Thiếu dữ liệu" });
    }

    const pool = await poolPromise;

    // Lấy admin từ DB
    const rs = await pool
      .request()
      .input("Uid", sql.Int, req.user.id)
      .query(`SELECT TOP 1 UserID, Password FROM Users WHERE UserID=@Uid`);

    const admin = rs.recordset[0];
    if (!admin) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy admin" });
    }

    // Kiểm tra mật khẩu cũ
    const isMatch = await bcrypt.compare(oldPassword, admin.Password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ success: false, message: "Mật khẩu cũ không đúng" });
    }

    // Hash mật khẩu mới và cập nhật
    const hashed = await bcrypt.hash(newPassword, 10);
    await pool
      .request()
      .input("Uid", sql.Int, req.user.id)
      .input("Pwd", sql.NVarChar, hashed)
      .query(`UPDATE Users SET Password=@Pwd WHERE UserID=@Uid`);

    res.json({ success: true, message: "Đổi mật khẩu thành công!" });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ success: false, message: "Lỗi máy chủ" });
  }
});

module.exports = router;
