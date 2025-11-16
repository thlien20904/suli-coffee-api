// server.js - Main server file chỉ khởi tạo server và Socket.IO
const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const dotenv = require("dotenv");
const { initializeSocketIO } = require("./socketManager");
const { setupApp } = require("./config/serverSetup");

// Load environment variables
dotenv.config();

// Khởi tạo app và server
const app = express();
const server = http.createServer(app);

// SỬA CORS: Đơn giản hóa - dùng URL mặc định stable + env variable
const allowedOrigins = [
  "http://localhost:3000", // Dev local
  process.env.FRONTEND_URL || "https://suli-coffee-web.vercel.app",
];

// Khởi tạo Socket.IO
const io = new socketIO.Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

// Initialize Socket.IO với real-time features
console.log("🔌 Initializing Socket.IO real-time features...");
const socketManager = initializeSocketIO(io);

// Export socketManager để các routes khác sử dụng
app.set("socketManager", socketManager);

// Debug log
console.log("🌐 CORS Allowed Origins:", allowedOrigins);
console.log("📡 FRONTEND_URL from env:", process.env.FRONTEND_URL);

// Global error handlers
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err && err.stack ? err.stack : err);
});
process.on("unhandledRejection", (reason, p) => {
  console.error("UNHANDLED REJECTION at:", p, "reason:", reason);
});

// Setup toàn bộ app với tất cả middleware và routes
setupApp(app, io, allowedOrigins);

/* ---------------- START SERVER ---------------- */
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});
