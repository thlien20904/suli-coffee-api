const nodemailer = require("nodemailer");

// ✅ Detect service: SendGrid cho production/Vercel, Gmail cho dev
const useSendGrid =
  process.env.USE_SENDGRID === "true" || process.env.NODE_ENV === "production";
console.log(
  `📧 Email service mode: ${
    useSendGrid ? "SENDGRID (Production)" : "GMAIL (Development)"
  }`
);

let sendSignupConfirmation;
let sendOrderConfirmation;

if (useSendGrid) {
  // Import SendGrid functions nếu production
  const sendGridService = require("./emailServiceSendGrid");
  sendSignupConfirmation = sendGridService.sendSignupConfirmation;
  sendOrderConfirmation = sendGridService.sendOrderConfirmation;
  console.log("✅ Switched to SendGrid API");
} else {
  // ✅ Fallback: Tạo transporter với Gmail cho dev/localhost
  const emailUser = process.env.GMAIL_USER || process.env.EMAIL_USER;
  const emailPass = process.env.GMAIL_PASS || process.env.EMAIL_PASS;

  if (!emailUser || !emailPass) {
    console.error(
      "❌ CRITICAL: No email credentials found in environment variables!"
    );
    console.error(
      "   Please set GMAIL_USER/GMAIL_PASS or EMAIL_USER/EMAIL_PASS in .env"
    );
  }

  const transportConfig = {
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: emailUser,
      pass: emailPass,
    },
    connectionTimeout: 30000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
    tls: {
      rejectUnauthorized: false,
    },
    pool: true,
    maxConnections: 5,
    maxMessages: 10,
  };

  const transporter = nodemailer.createTransporter(transportConfig);

  console.log(
    `📧 Gmail initialized with: ${
      emailUser ? emailUser.substring(0, 5) + "***" : "NOT_SET"
    }`
  );

  // Verify SMTP (non-blocking)
  if (emailUser && emailPass) {
    transporter.verify(function (error, success) {
      if (error) {
        console.error("❌ SMTP Connection Error:", error.code, error.message);
        if (error.code === "ETIMEDOUT") {
          console.error(
            "   🚨 SMTP port blocked (Vercel/Render). Switch to SendGrid!"
          );
        }
      } else {
        console.log("✅ Gmail SMTP ready");
      }
    });
  }

  // Gửi email xác nhận đăng ký (Gmail version)
  sendSignupConfirmation = async (userEmail, userName) => {
    const mailOptions = {
      from: `"SuLi Coffee" <${emailUser}>`,
      to: userEmail,
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
      await transporter.sendMail(mailOptions);
      console.log(`✅ Gmail: Email đăng ký gửi đến ${userEmail}`);
      return { success: true };
    } catch (error) {
      console.error("❌ Gmail: Lỗi gửi email đăng ký:", error);
      return { success: false, error: error.message };
    }
  };

  // Gửi email xác nhận đơn hàng (Gmail version)
  sendOrderConfirmation = async (userEmail, userName, orderDetails) => {
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
          item.name
        }</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${
          item.quantity
        }</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${item.price.toLocaleString(
          "vi-VN"
        )}₫</td>
      </tr>
    `
      )
      .join("");

    const mailOptions = {
      from: `"SuLi Coffee" <${emailUser}>`,
      to: userEmail,
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
              <strong>Hotline:</strong> 0366413924 | <strong>Email:</strong> ${emailUser}
            </p>
            
            <p style="font-size: 13px; color: #aaa; text-align: center; margin-top: 10px;">
              © 2025 SuLi Coffee - Cà phê chất lượng, phục vụ tận tâm
            </p>
          </div>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`✅ Gmail: Email đơn hàng gửi đến ${userEmail}`);
      return { success: true };
    } catch (error) {
      console.error("❌ Gmail: Lỗi gửi email đơn hàng:", error);
      return { success: false, error: error.message };
    }
  };
}

module.exports = {
  sendSignupConfirmation,
  sendOrderConfirmation,
};
