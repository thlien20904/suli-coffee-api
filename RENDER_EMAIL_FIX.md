# 🚨 LỖI EMAIL TRÊN RENDER.COM - GIẢI PHÁP

## ❌ VẤN ĐỀ:

```
Error: Connection timeout
code: 'ETIMEDOUT'
```

**Nguyên nhân:** Render.com free tier **BLOCK SMTP ports 587/465**

Gmail SMTP yêu cầu port 587 (TLS) hoặc 465 (SSL) → Render.com chặn → Timeout

---

## ✅ GIẢI PHÁP 1: SỬ DỤNG SMTP RELAY (KHUYẾN NGHỊ)

### **A. SendGrid (Free 100 emails/day)**

**Bước 1:** Đăng ký https://sendgrid.com (Free tier)

**Bước 2:** Tạo API Key

1. Dashboard → Settings → API Keys
2. Create API Key → Full Access
3. Copy key: `SG.xxxxx`

**Bước 3:** Thêm vào Render Environment Variables:

```
SENDGRID_API_KEY=SG.xxxxxx
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
```

**Bước 4:** Cài package:

```bash
npm install @sendgrid/mail
```

**Bước 5:** Update `emailService.js`:

```javascript
const sgMail = require("@sendgrid/mail");

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.log("✅ Using SendGrid for emails");
}

async function sendSignupConfirmation(userEmail, userName) {
  if (process.env.SENDGRID_API_KEY) {
    // Use SendGrid
    const msg = {
      to: userEmail,
      from: process.env.SENDGRID_FROM_EMAIL || "noreply@sulicoffee.com",
      subject: "🎉 Chào mừng bạn đến với SuLi Coffee!",
      html: `...your HTML template...`,
    };

    try {
      await sgMail.send(msg);
      console.log(`✅ SendGrid email sent to: ${userEmail}`);
      return { success: true };
    } catch (error) {
      console.error("❌ SendGrid error:", error);
      return { success: false, error: error.message };
    }
  } else {
    // Fallback to nodemailer
    // ...existing code...
  }
}
```

---

### **B. Mailgun (Free 5000 emails/month)**

**Bước 1:** Đăng ký https://mailgun.com

**Bước 2:** Get API Key & Domain

- Dashboard → Sending → Domain Settings
- Copy: API Key, Domain

**Bước 3:** Thêm vào Render:

```
MAILGUN_API_KEY=key-xxxxx
MAILGUN_DOMAIN=sandboxxxxxx.mailgun.org
```

**Bước 4:** Cài package:

```bash
npm install mailgun.js form-data
```

**Bước 5:** Update code:

```javascript
const formData = require("form-data");
const Mailgun = require("mailgun.js");

const mailgun = new Mailgun(formData);
const mg = mailgun.client({
  username: "api",
  key: process.env.MAILGUN_API_KEY,
});

async function sendEmail(to, subject, html) {
  try {
    await mg.messages.create(process.env.MAILGUN_DOMAIN, {
      from: "SuLi Coffee <noreply@sulicoffee.com>",
      to: [to],
      subject: subject,
      html: html,
    });
    return { success: true };
  } catch (error) {
    console.error("Mailgun error:", error);
    return { success: false };
  }
}
```

---

## ✅ GIẢI PHÁP 2: SỬ DỤNG GMAIL SMTP VỚI PORT 465 (SSL)

**Bước 1:** Thử đổi sang port 465:

Update `emailService.js`:

```javascript
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465, // SSL port
  secure: true, // true for 465
  auth: {
    user: emailUser,
    pass: emailPass,
  },
  connectionTimeout: 30000,
  tls: {
    rejectUnauthorized: false,
  },
});
```

**Lưu ý:** Port 465 cũng có thể bị block trên Render free tier.

---

## ✅ GIẢI PHÁP 3: AWS SES (PAY-AS-YOU-GO)

**Chi phí:** $0.10 / 1000 emails

**Bước 1:** AWS Console → SES → Verify email

**Bước 2:** Get SMTP credentials

**Bước 3:** Thêm vào Render:

```
AWS_SES_SMTP_HOST=email-smtp.us-east-1.amazonaws.com
AWS_SES_SMTP_PORT=587
AWS_SES_SMTP_USER=AKIAXXXX
AWS_SES_SMTP_PASS=xxxxx
```

**Bước 4:** Update emailService.js:

```javascript
const transporter = nodemailer.createTransport({
  host: process.env.AWS_SES_SMTP_HOST,
  port: parseInt(process.env.AWS_SES_SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.AWS_SES_SMTP_USER,
    pass: process.env.AWS_SES_SMTP_PASS,
  },
});
```

---

## ✅ GIẢI PHÁP 4: UPGRADE RENDER PLAN

**Chi phí:** $7/month (Starter plan)

Render Starter plan không bị chặn SMTP ports.

---

## 🎯 KHUYẾN NGHỊ:

**Cho Production:**

1. **SendGrid** (Free 100 emails/day) - Đủ cho test/startup
2. **Mailgun** (Free 5000 emails/month) - Tốt hơn cho scale
3. **AWS SES** - Tốt nhất cho enterprise

**Cho Development:**

- Gmail SMTP vẫn OK trên localhost

---

## 📝 IMPLEMENTATION NHANH - SENDGRID

**File: `backend/services/emailServiceSendGrid.js`**

```javascript
const sgMail = require("@sendgrid/mail");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendOrderConfirmation(userEmail, userName, orderDetails) {
  const msg = {
    to: userEmail,
    from: process.env.SENDGRID_FROM_EMAIL || "noreply@sulicoffee.com",
    subject: `✅ Đơn hàng #${orderDetails.orderId} đã được xác nhận`,
    html: `...your HTML...`,
  };

  try {
    await sgMail.send(msg);
    return { success: true };
  } catch (error) {
    console.error("SendGrid error:", error);
    return { success: false, error: error.message };
  }
}

module.exports = { sendOrderConfirmation };
```

**Update Render Environment:**

```
SENDGRID_API_KEY=SG.xxxxx
SENDGRID_FROM_EMAIL=noreply@sulicoffee.com
USE_SENDGRID=true
```

**Update existing code:**

```javascript
let emailService;
if (process.env.USE_SENDGRID === 'true') {
  emailService = require('./emailServiceSendGrid');
} else {
  emailService = require('./emailService');
}

// Use it
await emailService.sendOrderConfirmation(...);
```

---

## 🧪 TEST LOCAL VỚI SENDGRID:

```bash
# .env
SENDGRID_API_KEY=SG.xxxxx
USE_SENDGRID=true

# Test
node -e "
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
sgMail.send({
  to: 'test@example.com',
  from: 'noreply@sulicoffee.com',
  subject: 'Test',
  text: 'Test email'
}).then(() => console.log('✅ Sent')).catch(e => console.error('❌', e));
"
```

---

**Tóm tắt:**

- Render.com block SMTP → Phải dùng SMTP relay hoặc upgrade plan
- SendGrid/Mailgun là giải pháp miễn phí tốt nhất
- Code hiện tại đã tăng timeout nhưng không giải quyết được vấn đề block port
