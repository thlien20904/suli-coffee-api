const nodemailer = require("nodemailer");

// Detect environment: local (dev) vs deploy (production)
const isProduction =
  process.env.NODE_ENV === "production" || process.env.USE_SENDGRID === "true";
console.log(
  `📧 Email helper mode: ${
    isProduction ? "SENDGRID (Production)" : "NODemailer (Local/Dev)"
  }`
);

// --------------------
// Email helper (local/dev: Nodemailer Gmail)
// --------------------
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";
const FRONTEND_URL =process.env.REACT_APP_FRONTEND_URL || "http://localhost:3000";
function createTransport() {
  if (isProduction) {
    console.log("🔧 Skipping Nodemailer in production (using SendGrid)");
    return null; // Not used in production
  }

  console.log("🔧 createTransport STARTED (local/dev)");
  // ✅ Check for Gmail configuration - support both GMAIL_USER and EMAIL_USER
  const gmailUser = process.env.GMAIL_USER || process.env.EMAIL_USER;
  const gmailPass = process.env.GMAIL_PASS || process.env.EMAIL_PASS;
  console.log("🔧 Gmail config check:", {
    user: gmailUser ? "SET (" + gmailUser.substring(0, 5) + "***)" : "NOT_SET",
    pass: gmailPass ? "SET" : "NOT_SET",
  });

  if (gmailUser && gmailPass) {
    console.log("✅ Using Gmail SMTP:", gmailUser);
    try {
      const transport = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
          user: gmailUser,
          pass: gmailPass,
        },
        connectionTimeout: 30000, // Tăng timeout lên 30s
        greetingTimeout: 15000,
        socketTimeout: 30000,
        tls: {
          rejectUnauthorized: false,
        },
        pool: true,
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

  if (isProduction) {
    // Production: Call SendGrid logic from emailServiceSendGrid.js
    try {
      const {
        sendVerificationEmail: sendWithSendGrid,
      } = require("../services/emailServiceSendGrid");
      const result = await sendWithSendGrid(toEmail, token, username);
      return result; // Assume returns true/false
    } catch (err) {
      console.error("❌ SendGrid import/send failed:", err.message);
      return false;
    }
  } else {
    // Local/Dev: Use Nodemailer
    console.log("✅ Using Nodemailer for local/dev");

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
      process.env.GMAIL_USER ||
      process.env.EMAIL_USER ||
      process.env.SMTP_FROM ||
      "noreply@sulicoffee.vn";

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
}

module.exports = {
  sendVerificationEmail,
};
