// server.js - Main server file chứa toàn bộ API và logic
const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const dotenv = require("dotenv");
const cors = require("cors");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const jwt = require("jsonwebtoken");
const path = require("path");
const { initializeSocketIO } = require("./socketManager");
const { setupMiddleware } = require("./config/middleware");
const sequelize = require("./config/sequelize");
const initModels = require("./models/init-models");
const { Users } = initModels(sequelize);

// Load environment variables
dotenv.config();

// Khởi tạo app và server
const app = express();
const server = http.createServer(app);

// CORS configuration
const allowedOrigins = [
  "http://localhost:3000", // Dev local
  process.env.FRONTEND_URL || "https://suli-coffee-web.vercel.app",
];

// Setup middleware
console.log("🚀 Setting up Express app with all configurations...");
setupMiddleware(app, allowedOrigins);

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
app.set("socketManager", socketManager);

// Debug logs
console.log("🌐 CORS Allowed Origins:", allowedOrigins);
console.log("📡 FRONTEND_URL from env:", process.env.FRONTEND_URL);

// Global error handlers
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err && err.stack ? err.stack : err);
});
process.on("unhandledRejection", (reason, p) => {
  console.error("UNHANDLED REJECTION at:", p, "reason:", reason);
});

// ================== GOOGLE OAUTH ROUTES ==================
const { getFrontendURL, getCallbackURL } = require("./config/middleware");

// Debug endpoint để check OAuth config
app.get("/debug/oauth-config", (req, res) => {
  const callbackURL = getCallbackURL();
  const frontendURL = getFrontendURL();

  res.json({
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      VERCEL: process.env.VERCEL,
      RENDER: process.env.RENDER,
      VERCEL_URL: process.env.VERCEL_URL,
    },
    oauth: {
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID?.substring(0, 20) + "...",
      GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL,
      GOOGLE_CALLBACK_URL_PROD: process.env.GOOGLE_CALLBACK_URL_PROD,
      detectedCallbackURL: callbackURL,
      detectedFrontendURL: frontendURL,
    },
    currentHost: req.get("host"),
    userAgent: req.get("User-Agent"),
    fullURL: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
  });
});

app.get(
  "/auth/google",
  (req, res, next) => {
    console.log("[Google OAuth] Initiating Google authentication...");
    console.log("[Google OAuth] Callback URL will be:", getCallbackURL());
    next();
  },
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
    prompt: "select_account",
  })
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${getFrontendURL()}/login?error=auth_failed`,
    session: false,
  }),
  (req, res) => {
    try {
      console.log("[Google OAuth Callback] User data:", req.user);

      if (!req.user) {
        console.error("[Google OAuth Callback] No user data received!");
        return res.redirect(`${getFrontendURL()}/login?error=no_user_data`);
      }

      const token = jwt.sign(
        {
          id: req.user.Id,
          role: (req.user.Role || "user").toLowerCase(),
          username: req.user.Username,
          email: req.user.Email,
          avatar: req.user.AvatarUrl || null,
        },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      console.log(
        "[Google OAuth Callback] JWT created, redirecting to frontend..."
      );
      const frontendUrl = getFrontendURL();
      res.redirect(
        `${frontendUrl}/login?token=${token}&role=${(
          req.user.Role || "user"
        ).toLowerCase()}&avatar=${encodeURIComponent(req.user.AvatarUrl || "")}`
      );
    } catch (err) {
      console.error("[Google OAuth Callback] Error:", err);
      res.redirect(`${getFrontendURL()}/login?error=callback_error`);
    }
  }
);

// ================== API ROUTES ==================
console.log("🛤️  Setting up API routes...");

// Load routes
const adminRoutes = require("./routes/admin");
const userRoutes = require("./routes/user");
const sharedRoutes = require("./routes/shared");
const authRoutes = require("./routes/user/auth"); // Add direct auth route

// Mount routes
app.use("/api/admin", adminRoutes);
app.use("/api/user", userRoutes);
app.use("/api", sharedRoutes);
app.use("/api/auth", authRoutes); // Mount auth directly for frontend compatibility

// API current user
app.get("/api/current_user", async (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader) return res.json(null);

    const token = authHeader.split(" ")[1];
    if (!token) return res.json(null);

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await Users.findByPk(decoded.id);

    if (!user) return res.json(null);

    res.json({
      id: user.Id,
      username: user.Username,
      email: user.Email,
      role: user.Role?.toLowerCase() || "user",
      avatar: user.AvatarUrl,
    });
  } catch (err) {
    console.error("Current user error:", err);
    res.json(null);
  }
});

console.log("✅ App setup completed!");

/* ---------------- START SERVER ---------------- */
const PORT = process.env.PORT || 5000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server is running on 0.0.0.0:${PORT}`);
});
