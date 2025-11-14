// clickjackingMiddleware.js
/**
 * 🎯 CLICKJACKING PROTECTION DEMO
 *
 * Middleware này demo cách phòng chống clickjacking attack:
 * 1. Protected pages - Không thể nhúng vào iframe (DENY)
 * 2. Attacker pages - Demo tấn công clickjacking
 * 3. Vulnerable pages - Không có protection (để test)
 *
 * Routes:
 * - /clickjacking - Home page giới thiệu
 * - /clickjacking/protected - Trang được bảo vệ (không nhúng được)
 * - /clickjacking/vulnerable - Trang dễ bị tấn công (không có header)
 * - /clickjacking/attack - Trang tấn công (nhúng victim)
 * - /clickjacking/sameorigin - Chỉ cho phép same-origin
 */

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

function createClickjackingMiddleware(publicPath) {
  const router = express.Router();
  const DEMO_PATH = path.join(publicPath, "clickjacking");

  // Tạo thư mục nếu chưa có
  if (!fs.existsSync(DEMO_PATH)) {
    fs.mkdirSync(DEMO_PATH, { recursive: true });
  }

  // Helper: Generate nonce cho CSP
  function generateNonce() {
    return crypto.randomBytes(16).toString("base64");
  }

  /* ---------------- HOME PAGE (No CSP, chỉ demo clickjacking) ---------------- */
  router.get("/clickjacking", (req, res) => {
    // Không set CSP để HTML inline scripts hoạt động bình thường
    res.sendFile(path.join(DEMO_PATH, "index.html"));
  });

  /* ---------------- PROTECTED PAGE (DENY + CSP) ---------------- */
  router.get("/clickjacking/protected", (req, res) => {
    // 🔥 KẾT HỢP: Clickjacking + CSP Protection
    const nonce = generateNonce();

    // 1. Chặn iframe (Clickjacking Protection)
    res.setHeader("X-Frame-Options", "DENY");

    // 2. CSP kết hợp: frame-ancestors + script-src
    res.setHeader(
      "Content-Security-Policy",
      `frame-ancestors 'none'; script-src 'self' 'nonce-${nonce}'; object-src 'none'; base-uri 'self';`
    );

    // Đọc file và thay nonce
    const filePath = path.join(DEMO_PATH, "protected.html");
    fs.readFile(filePath, "utf8", (err, data) => {
      if (err) {
        return res.status(500).send("Error loading page");
      }
      // Thay {{NONCE}} bằng nonce thật
      const html = data.replace(/{{NONCE}}/g, nonce);
      res.send(html);
    });
  });

  /* ---------------- SAMEORIGIN PAGE ---------------- */
  router.get("/clickjacking/sameorigin", (req, res) => {
    // Set SAMEORIGIN headers
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Content-Security-Policy", "frame-ancestors 'self'");
    res.sendFile(path.join(DEMO_PATH, "sameorigin.html"));
  });

  /* ---------------- VULNERABLE PAGE (No Protection) ---------------- */
  router.get("/clickjacking/vulnerable", (req, res) => {
    // ⚠️ KHÔNG set bất kỳ header nào - để demo tấn công
    res.sendFile(path.join(DEMO_PATH, "vulnerable.html"));
  });

  /* ---------------- ATTACKER PAGES ---------------- */
  router.get("/clickjacking/attack-protected", (req, res) => {
    res.sendFile(path.join(DEMO_PATH, "attack-protected.html"));
  });

  router.get("/clickjacking/attack-vulnerable", (req, res) => {
    res.sendFile(path.join(DEMO_PATH, "attack-vulnerable.html"));
  });

  /* ---------------- API: Simulate sensitive action ---------------- */
  router.post(
    "/clickjacking/api/delete-account",
    express.json(),
    (req, res) => {
      console.log("⚠️ DELETE ACCOUNT ACTION triggered!");
      res.json({
        success: true,
        message: "Account deleted! (This is a demo, nothing actually deleted)",
        timestamp: new Date().toISOString(),
      });
    }
  );

  router.post(
    "/clickjacking/api/transfer-money",
    express.json(),
    (req, res) => {
      const { amount, to } = req.body;
      console.log(`💸 TRANSFER MONEY: ${amount} to ${to}`);
      res.json({
        success: true,
        message: `Transferred $${amount} to ${to} (demo only)`,
        timestamp: new Date().toISOString(),
      });
    }
  );

  return router;
}

module.exports = createClickjackingMiddleware;
