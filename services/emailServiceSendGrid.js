const sgMail = require("@sendgrid/mail");

// ✅ Set API key từ .env
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "thuylien2k4@gmail.com";

if (!SENDGRID_API_KEY) {
  console.error("❌ CRITICAL: SENDGRID_API_KEY not found in .env!");
}

sgMail.setApiKey(SENDGRID_API_KEY);

console.log(
  `📧 SendGrid initialized with FROM_EMAIL: ${FROM_EMAIL.substring(0, 5)}***`
);

// Gửi email xác nhận đăng ký (SendGrid version)
async function sendSignupConfirmation(userEmail, userName) {
  const msg = {
    to: userEmail,
    from: FROM_EMAIL, // Verified sender in SendGrid
    subject: "🎉 Chào mừng bạn đến với SuLi Coffee!",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background: linear-gradient(90deg, #dae4daff, #81c784); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">🎉 Chào mừng đến SuLi Coffee!</h1>
        </div>
        
        <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px;">
          <p style="font-size: 16px; color: #333;">Xin chào <strong>${userName}</strong>,</p>
          
          <p style="font-size: 15px; color: #555; line-height: 1.6;">
            Cảm ơn bạn đã đăng ký tài khoản tại <strong>SuLi Coffee</strong>! 
            Chúng tôi rất vui mừng được chào đón bạn trở thành thành viên của gia đình SuLi.
          </p>
          
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #81c784; margin-top: 0;">✨ Thông tin tài khoản</h3>
            <p style="margin: 10px 0; color: #333;">
              <strong>Email:</strong> ${userEmail}<br>
              <strong>Tên:</strong> ${userName}
            </p>
          </div>
          
          <p style="font-size: 15px; color: #555; line-height: 1.6;">
            🌟 <strong>SuLi Coffee</strong> có hơn <strong>30 cơ sở</strong> trên toàn quốc, 
            với đa dạng các loại đồ uống chất lượng cao và không gian thư giãn tuyệt vời.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://suli-coffee-web.pages.dev/" 
               style="background: linear-gradient(90deg, #81c784, #66bb6a); 
                      color: white; 
                      padding: 15px 40px; 
                      text-decoration: none; 
                      border-radius: 25px; 
                      font-weight: bold;
                      display: inline-block;">
              Bắt đầu đặt hàng ngay
            </a>
          </div>
          
          <p style="font-size: 14px; color: #888; text-align: center; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
            Nếu có thắc mắc, hãy liên hệ với chúng tôi qua email này hoặc gọi hotline: <strong>0366413924</strong>
          </p>
          
          <p style="font-size: 13px; color: #aaa; text-align: center; margin-top: 10px;">
            © 2025 SuLi Coffee - Cà phê chất lượng, phục vụ tận tâm
          </p>
        </div>
      </div>
    `,
  };

  try {
    await sgMail.send(msg);
    console.log(`✅ SendGrid: Email đăng ký gửi đến ${userEmail}`);
    return { success: true };
  } catch (error) {
    console.error(
      "❌ SendGrid: Lỗi gửi email đăng ký:",
      error.response ? error.response.body : error.message
    );
    return { success: false, error: error.message };
  }
}

// Gửi email xác nhận đơn hàng (SendGrid version)
async function sendOrderConfirmation(userEmail, userName, orderDetails) {
  const {
    orderId,
    orderDate,
    items,
    totalAmount,
    shippingAddress,
    phone,
    paymentMethod,
  } = orderDetails;

  const itemsHTML = items
    .map(
      (item) => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">${
        item.FoodName || item.name || "(Không rõ tên)"
      }</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${
        item.Quantity || item.quantity || 1
      }</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${(item.TotalPrice
        ? item.TotalPrice / (item.Quantity || 1)
        : item.price
      ).toLocaleString("vi-VN")}₫</td>
    </tr>
  `
    )
    .join("");

  const msg = {
    to: userEmail,
    from: FROM_EMAIL,
    subject: `✅ Đơn hàng #${orderId} đã được xác nhận - SuLi Coffee`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background: linear-gradient(90deg, #dae4daff, #81c784); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">✅ Đơn hàng đã được xác nhận!</h1>
        </div>
        
        <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px;">
          <p style="font-size: 16px; color: #333;">Xin chào <strong>${userName}</strong>,</p>
          
          <p style="font-size: 15px; color: #555; line-height: 1.6;">
            Cảm ơn bạn đã đặt hàng tại <strong>SuLi Coffee</strong>! 
            Đơn hàng của bạn đã được xác nhận và đang được xử lý.
          </p>
          
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #81c784; margin-top: 0;">📦 Thông tin đơn hàng</h3>
            <p style="margin: 5px 0; color: #333;">
              <strong>Mã đơn hàng:</strong> #${orderId}<br>
              <strong>Ngày đặt:</strong> ${new Date(orderDate).toLocaleString(
                "vi-VN"
              )}<br>
              <strong>Phương thức thanh toán:</strong> ${paymentMethod}
            </p>
          </div>
          
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #81c784; margin-top: 0;">🚚 Địa chỉ giao hàng</h3>
            <p style="margin: 5px 0; color: #333;">
              <strong>Người nhận:</strong> ${userName}<br>
              <strong>Số điện thoại:</strong> ${phone}<br>
              <strong>Địa chỉ:</strong> ${shippingAddress}
            </p>
          </div>
          
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #81c784; margin-top: 0;">📋 Chi tiết đơn hàng</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background: #81c784; color: white;">
                  <th style="padding: 10px; text-align: left;">Sản phẩm</th>
                  <th style="padding: 10px; text-align: center;">SL</th>
                  <th style="padding: 10px; text-align: right;">Giá</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHTML}
              </tbody>
            </table>
            
            <div style="margin-top: 20px; padding-top: 15px; border-top: 2px solid #81c784;">
              <p style="font-size: 18px; color: #333; text-align: right; margin: 5px 0;">
                <strong>Tổng cộng: ${totalAmount.toLocaleString(
                  "vi-VN"
                )}₫</strong>
              </p>
            </div>
          </div>
          
          <p style="font-size: 15px; color: #555; line-height: 1.6;">
            💚 Đơn hàng của bạn sẽ được giao trong thời gian sớm nhất. 
            Cảm ơn bạn đã tin tưởng <strong>SuLi Coffee</strong>!
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://suli-coffee-web.pages.dev/profile/orders" 
               style="background: linear-gradient(90deg, #81c784, #66bb6a); 
                      color: white; 
                      padding: 15px 40px; 
                      text-decoration: none; 
                      border-radius: 25px; 
                      font-weight: bold;
                      display: inline-block;">
              Xem đơn hàng của tôi
            </a>
          </div>
          
          <p style="font-size: 14px; color: #888; text-align: center; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
            Nếu có thắc mắc về đơn hàng, hãy liên hệ với chúng tôi:<br>
            <strong>Hotline:</strong> 0366413924 | <strong>Email:</strong> ${FROM_EMAIL}
          </p>
          
          <p style="font-size: 13px; color: #aaa; text-align: center; margin-top: 10px;">
            © 2025 SuLi Coffee - Cà phê chất lượng, phục vụ tận tâm
          </p>
        </div>
      </div>
    `,
  };

  try {
    await sgMail.send(msg);
    console.log(`✅ SendGrid: Email đơn hàng gửi đến ${userEmail}`);
    return { success: true };
  } catch (error) {
    console.error(
      "❌ SendGrid: Lỗi gửi email đơn hàng:",
      error.response ? error.response.body : error.message
    );
    return { success: false, error: error.message };
  }
}

// ✅ Thêm hàm sendVerificationEmail cho verification flow (SendGrid version)
async function sendVerificationEmail(toEmail, token, username) {
  console.log("📧 sendVerificationEmail STARTED (SendGrid) for:", toEmail);

  const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

  const verifyUrl = `${BACKEND_URL}/api/auth/verify-email?token=${encodeURIComponent(
    token
  )}`;

  const fromEmail =
    process.env.FROM_EMAIL ||
    process.env.GMAIL_USER ||
    process.env.EMAIL_USER ||
    process.env.SMTP_FROM ||
    "noreply@sulicoffee.vn";

  const msg = {
    to: toEmail,
    from: fromEmail,
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
    console.log("📤 Sending email via SendGrid...");
    const info = await Promise.race([
      sgMail.send(msg),
      new Promise(
        (_, reject) =>
          setTimeout(() => reject(new Error("Email send timeout")), 15000) // 15s timeout
      ),
    ]);

    console.log("✅ SendGrid email sent successfully");

    // Log response (SendGrid returns array)
    if (info && info[0]) {
      console.log("📧 SendGrid response:", info[0]);
    }

    return true;
  } catch (sendErr) {
    console.error("❌ SendGrid email send failed:", {
      message: sendErr.message,
      code: sendErr.code,
      response: sendErr.response ? sendErr.response.body : null,
    });
    return false;
  }
}
// Gửi OTP qua SendGrid
async function sendOtpEmail(email, otp) {
  const fromEmail = process.env.FROM_EMAIL || "thuylien2k4@gmail.com";

  const msg = {
    to: email,
    from: fromEmail,
    subject: "Mã OTP đặt lại mật khẩu - SuLi Coffee",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background: linear-gradient(90deg, #81c784, #66bb6a); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">Đặt lại mật khẩu</h1>
        </div>
        <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; text-align: center;">
          <p style="font-size: 16px; color: #333;">Xin chào,</p>
          <p style="font-size: 15px; color: #555; line-height: 1.6;">
            Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản SuLi Coffee.
          </p>
          <div style="background: #f0f8ff; padding: 25px; border-radius: 10px; margin: 25px 0; font-size: 28px; font-weight: bold; color: #2e7d32; letter-spacing: 5px;">
            ${otp}
          </div>
          <p style="color: #d32f2f; font-weight: bold;">Mã OTP có hiệu lực trong 10 phút.</p>
          <p style="color: #777; font-size: 14px; margin-top: 30px;">
            Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.
          </p>
          <hr style="border: 1px solid #eee; margin: 30px 0;">
          <p style="font-size: 13px; color: #aaa; text-align: center;">
            © 2025 SuLi Coffee - Cà phê chất lượng, phục vụ tận tâm
          </p>
        </div>
      </div>
    `,
  };

  try {
    await sgMail.send(msg);
    console.log(`SendGrid: OTP gửi thành công đến ${email}`);
    return { success: true };
  } catch (error) {
    console.error("SendGrid: Lỗi gửi OTP:", error.response?.body || error.message);
    return { success: false, error: error.message };
  }
} 
module.exports = {
  sendSignupConfirmation,
  sendOrderConfirmation,
  sendVerificationEmail,
  sendOtpEmail, // Thêm dòng này
};