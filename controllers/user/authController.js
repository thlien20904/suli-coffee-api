const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
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

// --------------------
// Email helper
// --------------------
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// Create a nodemailer transport using environment variables
function createTransport() {
  console.log("🔧 createTransport STARTED");
  // Check for Gmail configuration first (most common for dev)
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_PASS;
  console.log("🔧 Gmail config check:", {
    user: gmailUser ? "SET" : "NOT_SET",
    pass: gmailPass ? "SET" : "NOT_SET",
  });

  if (gmailUser && gmailPass) {
    console.log("✅ Using Gmail SMTP:", gmailUser);
    try {
      const transport = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: gmailUser,
          pass: gmailPass,
        },
        connectionTimeout: 10000, // 10s timeout
        greetingTimeout: 5000, // 5s timeout
        socketTimeout: 10000, // 10s timeout
      });
      console.log("✅ Gmail transport created successfully");
      return transport;
    } catch (err) {
      console.error("❌ Gmail transport creation failed:", err.message);
      // Don't fallback to Ethereal, return null to fail fast
      return null;
    }
  }

  // Fallback to generic SMTP config
  console.log("🔧 Checking generic SMTP config...");
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT
    ? Number(process.env.SMTP_PORT)
    : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && port && user && pass) {
    console.log("✅ Using generic SMTP");
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465, false for other ports
      auth: { user, pass },
    });
  }

  // NO Ethereal fallback - fail fast instead of hanging
  console.error(
    "❌ NO SMTP CONFIG - Please set GMAIL_USER/GMAIL_PASS in .env file"
  );
  return null;
}

async function sendVerificationEmail(toEmail, token, username) {
  console.log("📧 sendVerificationEmail STARTED for:", toEmail);

  const transporter = createTransport();

  if (!transporter) {
    console.error("❌ No transporter available");
    return false;
  }

  console.log("✅ Transporter ready, preparing email...");

  const verifyUrl = `${BACKEND_URL}/api/auth/verify-email?token=${encodeURIComponent(
    token
  )}`;

  const fromEmail =
    process.env.GMAIL_USER || process.env.SMTP_FROM || "noreply@sulicoffee.vn";

  const mailOptions = {
    from: `"SuLi Coffee" <${fromEmail}>`,
    to: toEmail,
    subject: "Xác nhận email đăng ký tài khoản SuLi Coffee",
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Xác nhận email</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4;padding:20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:#d81b60;padding:30px 20px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:bold;">SuLi Coffee</h1>
              <p style="color:#ffffff;margin:8px 0 0 0;font-size:14px;">Hệ thống quản lý & đặt hàng</p>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding:40px 30px;">
              <h2 style="color:#333333;margin:0 0 20px 0;font-size:22px;">Xin chào ${
                username || "Quý khách"
              },</h2>
              
              <p style="color:#666666;line-height:1.6;margin:0 0 20px 0;font-size:15px;">
                Vui lòng thông báo bạn vừa đăng ký thành công tài khoản tại <strong>SuLi Coffee</strong>. 
                Vui lòng click vào đường dẫn sau để kích hoạt tài khoản!
              </p>
              
              <!-- Button -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:30px 0;">
                <tr>
                  <td align="center">
                    <a href="${verifyUrl}" 
                       style="display:inline-block;padding:14px 40px;background-color:#d81b60;color:#ffffff;text-decoration:none;border-radius:4px;font-size:16px;font-weight:600;letter-spacing:0.5px;">
                      Kích hoạt tài khoản
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="color:#999999;font-size:13px;line-height:1.6;margin:20px 0 0 0;">
                <strong>*Nếu Quý khách không gửi yêu cầu này, vui lòng liên hệ ngay với chúng tôi!*</strong>
              </p>
              
              <p style="color:#666666;font-size:14px;line-height:1.6;margin:20px 0 0 0;">
                Mọi thắc mắc và góp ý, xin vui lòng liên hệ với chúng tôi qua:<br>
                <strong>Email:</strong> <a href="mailto:support@sulicoffee.vn" style="color:#d81b60;text-decoration:none;">support@sulicoffee.vn</a><br>
                <strong>Hotline:</strong> 1900 55 55 77
              </p>
              
              <hr style="border:none;border-top:1px solid #eeeeee;margin:30px 0;">
              
              <p style="color:#999999;font-size:12px;line-height:1.5;margin:0;">
                Nếu nút bên trên không hoạt động, vui lòng sao chép và dán đường dẫn sau vào trình duyệt:<br>
                <a href="${verifyUrl}" style="color:#d81b60;word-break:break-all;">${verifyUrl}</a>
              </p>
              
              <p style="color:#999999;font-size:12px;margin:15px 0 0 0;">
                Link sẽ hết hạn trong <strong>24 giờ</strong>.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color:#f9f9f9;padding:20px 30px;text-align:center;border-top:1px solid #eeeeee;">
              <p style="color:#999999;font-size:12px;margin:0 0 8px 0;">
                Trân trọng,
              </p>
              <p style="color:#666666;font-size:13px;font-weight:600;margin:0 0 15px 0;">
                SuLi Coffee Team
              </p>
              <p style="color:#999999;font-size:11px;margin:0;">
                <em>*Quý khách vui lòng không trả lời email này*</em>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
  };

  try {
    console.log("📤 Sending email...");
    const info = await Promise.race([
      transporter.sendMail(mailOptions),
      new Promise(
        (_, reject) =>
          setTimeout(() => reject(new Error("Email send timeout")), 15000) // 15s timeout
      ),
    ]);

    console.log("✅ Email sent successfully, messageId:", info.messageId);

    // If transporter is ethereal (created above), log preview URL
    const testAccount = transporter._etherealAccount;
    if (testAccount) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.info("📧 Email preview URL (Ethereal):", previewUrl);
    }

    return true;
  } catch (sendErr) {
    console.error("❌ Email send failed:", {
      message: sendErr.message,
      code: sendErr.code,
      response: sendErr.response,
    });
    return false;
  }
}

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
