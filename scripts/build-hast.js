// scripts/build-hash.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config();

const htmlPath = path.join(__dirname, "../public/hash.html");

// Đọc file HTML
const html = fs.readFileSync(htmlPath, "utf8");

// Lấy phần bên trong <script>...</script>
const match = html.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
if (!match) {
  console.error("❌ Không tìm thấy script trong hash.html");
  process.exit(1);
}

const scriptContent = match[1].replace(/\r\n/g, "\n");

// Tính SHA256 base64
const hash = crypto
  .createHash("sha256")
  .update(scriptContent, "utf8")
  .digest("base64");

// Ghi hash vào file .env
const envPath = path.join(__dirname, "../.env");
let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
envContent = envContent.replace(/HASH_CSP=.*/g, ""); // xoá dòng cũ nếu có
envContent += `\nHASH_CSP=sha256-${hash}\n`;

fs.writeFileSync(envPath, envContent.trim() + "\n");
console.log("✅ CSP hash saved to .env:", `sha256-${hash}`);
