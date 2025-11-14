const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
require("dotenv").config();

exports.login = async (req, res) => {
  const { username, password } = req.body;
  try {
    console.log(
      "Attempting login for username:",
      username,
      "with password:",
      JSON.stringify(password)
    );
    const user = await User.findOne({ where: { Username: username } });
    if (!user) {
      console.log("User not found for username:", username);
      return res.status(400).json({ message: "Username không tồn tại" });
    }
    console.log(
      "User found - PasswordHash:",
      JSON.stringify(user.PasswordHash),
      "Type:",
      typeof user.PasswordHash,
      "Length:",
      user.PasswordHash.length
    );

    let isValid = false;
    try {
      if (user.PasswordHash && user.PasswordHash.startsWith("$2")) {
        isValid = await bcryptjs.compare(password, user.PasswordHash);
        console.log("bcryptjs compare result:", isValid);
      } else {
        const trimmedHash = user.PasswordHash ? user.PasswordHash.trim() : "";
        isValid = password === trimmedHash;
        console.log(
          "Plaintext compare result:",
          isValid,
          "Trimmed hash:",
          JSON.stringify(trimmedHash),
          "Input password:",
          JSON.stringify(password)
        );
        if (isValid) {
          const newPasswordHash = await bcryptjs.hash(password, 12);
          console.log("Generated new bcryptjs hash:", newPasswordHash);
          const [updatedRows] = await User.update(
            { PasswordHash: newPasswordHash },
            { where: { Id: user.Id } }
          );
          console.log("DB update result - Rows affected:", updatedRows);
          if (updatedRows === 0) {
            console.error(
              "Failed to update password hash in DB for user:",
              username
            );
            return res
              .status(500)
              .json({ message: "Lỗi cập nhật mật khẩu trong DB" });
          }
          const updatedUser = await User.findOne({ where: { Id: user.Id } });
          console.log(
            "Verified updated PasswordHash:",
            updatedUser.PasswordHash
          );
        }
      }
    } catch (error) {
      console.error("bcryptjs compare error:", error.message);
      return res
        .status(500)
        .json({ message: "Lỗi xử lý mật khẩu: " + error.message });
    }

    if (!isValid) {
      console.log("Invalid credentials for username:", username);
      return res.status(400).json({ message: "Sai thông tin đăng nhập!" });
    }

    const role = user.Role?.trim() || "NoRole";
    console.log("Login successful - Username:", user.Username, "Role:", role);

    const token = jwt.sign(
      { id: user.Id, role: user.Role },
      process.env.JWT_SECRET,
      { expiresIn: "48h" }
    );
    res.json({
      message: "Đăng nhập thành công",
      token,
      user: {
        id: user.Id,
        username: user.Username,
        role: user.Role,
        avatarUrl: user.AvatarUrl,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Lỗi server: " + error.message });
  }
};
