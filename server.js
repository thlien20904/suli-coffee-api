// server.js - Main server file (simplified)
const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const dotenv = require("dotenv");
const passport = require("passport");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");

// Import configurations
const sql = require("./config/db");
const sequelize = require("./config/sequelize");
const { initializeSocketIO } = require("./socketManager");
const {
  setupMiddleware,
  setupGoogleOAuth,
  setupFileUpload,
  setupDatabase,
  getCallbackURL,
  getFrontendURL,
} = require("./config/middlewareSetup");

// Import models
const initModels = require("./models/init-models");
const { Users } = initModels(sequelize);

// Load environment variables
dotenv.config();

// 🛡️ Global error handlers for database issues
process.on("uncaughtException", (error) => {
  console.error("🚨 Uncaught Exception:", error.message);
  if (
    error.message.includes("db_termination") ||
    error.message.includes("Connection terminated")
  ) {
    console.log(
      "🔄 Database connection issue detected, attempting to reconnect..."
    );
    // Don't exit process, let the connection pool handle reconnection
  } else {
    console.error("💥 Critical error, shutting down gracefully...");
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("🚨 Unhandled Rejection at:", promise, "reason:", reason);
  if (reason?.message?.includes("db_termination")) {
    console.log("🔄 Database rejection detected, will retry...");
  }
});

// Print environment info for debugging
console.log("ENV:", {
  DB_NAME: process.env.DB_NAME,
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD?.substring(0, 3) + "***",
  DB_HOST: process.env.DB_HOST,
  DB_PORT: process.env.DB_PORT,
  DB_SSL: process.env.DB_SSL,
});

console.log("🔍 Testing Sequelize connection...");

/* ---------------- APP INITIALIZATION ---------------- */
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = new socketIO.Server(server, {
  cors: {
    origin: "http://localhost:3000",
    credentials: true,
  },
});

// Initialize Socket.IO with real-time features
console.log("🔌 Initializing Socket.IO real-time features...");
const socketManager = initializeSocketIO(io);
app.set("socketManager", socketManager);

/* ---------------- GLOBAL ERROR HANDLERS ---------------- */
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err && err.stack ? err.stack : err);
});
process.on("unhandledRejection", (reason, p) => {
  console.error("UNHANDLED REJECTION at:", p, "reason:", reason);
});

/* ---------------- SETUP CONFIGURATIONS ---------------- */
// Setup middleware
setupMiddleware(app, io);

// Setup Google OAuth
setupGoogleOAuth();

// Setup file upload
const upload = setupFileUpload();

// Setup database
setupDatabase(sql);

/* ---------------- GOOGLE OAUTH ROUTES ---------------- */
// Debug endpoint
app.get("/debug/oauth-config", (req, res) => {
  const callbackURL = getCallbackURL();
  const frontendURL = getFrontendURL();

  res.json({
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      RENDER: process.env.RENDER,
      VERCEL: process.env.VERCEL,
      VERCEL_URL: process.env.VERCEL_URL,
      LOCAL_DEV: process.env.LOCAL_DEV,
      HOST: req.get("host"),
      HOSTNAME: req.hostname,
    },
    oauth: {
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID?.substring(0, 20) + "...",
      GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL,
      GOOGLE_CALLBACK_URL_PROD: process.env.GOOGLE_CALLBACK_URL_PROD,
      FRONTEND_URL: process.env.FRONTEND_URL,
      detectedCallbackURL: callbackURL,
      detectedFrontendURL: frontendURL,
    },
    request: {
      currentHost: req.get("host"),
      userAgent: req.get("User-Agent"),
      fullURL: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
      origin: req.get("origin"),
      referer: req.get("referer"),
    },
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

/* ---------------- API ROUTES ---------------- */
console.log("🛤️  Setting up API routes...");

// Import all route modules
const authRouter = require("./routes/user/auth");
const profileRouter = require("./routes/user/profile");
const productsUserRouter = require("./routes/user/productsUser");
const cartUserRouter = require("./routes/user/cartUser");
const ordersUserRouter = require("./routes/user/ordersUser");
const StoresUserRouter = require("./routes/user/StoresUser");
const addressesUserRouter = require("./routes/user/addressesUser");
const homeRouter = require("./routes/user/homeUser");
const addressRouter = require("./routes/user/address");
const passwordRouter = require("./routes/user/password");

const FoodRouter = require("./routes/admin/Food");
const homeAdminRouter = require("./routes/admin/homeAdmin");
const authAdminRoutes = require("./routes/admin/authAdmin");
const ingredientRouter = require("./routes/admin/ingredient");
const categoryRouter = require("./routes/admin/category");
const exportRouter = require("./routes/admin/export");
const paymentRouter = require("./routes/admin/payment");
const userRouter = require("./routes/admin/users");
const staffRouter = require("./routes/admin/staff");
const roleRouter = require("./routes/admin/role");
const invoiceRouter = require("./routes/admin/invoice");
const orderAdminRouter = require("./routes/admin/order");
const reportRouter = require("./routes/admin/report");
const voucherRouter = require("./routes/admin/voucher");

const webhooksRouter = require("./routes/webhooks");
const chatbotRouter = require("./routes/shared/chatbot");

// Mount user routes
app.use("/api/auth", authRouter);
app.use("/api/profile", profileRouter);
app.use("/api/products", productsUserRouter);
app.use("/api/cart", cartUserRouter);
app.use("/api/orders", ordersUserRouter);
app.use("/api/Stores", StoresUserRouter);
app.use("/api/addresses", addressesUserRouter);
app.use("/api/home", homeRouter);
app.use("/api/address", addressRouter);
app.use("/api/password", passwordRouter);

// Mount chatbot routes (shared between user and admin)
app.use("/api/chatbot", chatbotRouter);

// Mount admin routes
app.use("/api/admin/home", homeAdminRouter);
app.use("/api/admin/foods", FoodRouter);
app.use("/api/admin/auth", authAdminRoutes);
app.use("/api/admin/ingredients", ingredientRouter);
app.use("/api/admin/categories", categoryRouter);
app.use("/api/admin/export", exportRouter);
app.use("/api/admin/payment", paymentRouter);
app.use("/api/admin/users", userRouter);
app.use("/api/admin/staff", staffRouter);
app.use("/api/admin/roles", roleRouter);
app.use("/api/admin/invoice", invoiceRouter);
app.use("/api/admin/orders", orderAdminRouter);
app.use("/api/admin/report", reportRouter);
app.use("/api/admin/voucher", voucherRouter);

// Mount webhooks

app.use("/api/webhooks", webhooksRouter);

// Mount CSP demo middleware
const createCSPMiddleware = require("./cspMiddleware");
app.use(
  createCSPMiddleware(null, { publicPath: path.join(__dirname, "public"), io })
);

/* ---------------- API ENDPOINTS ---------------- */
// Current user endpoint
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

// CSP demo route
app.get("/csp", (req, res) => {
  const filePath = path.join(__dirname, "public/index.html");
  if (!fs.existsSync(filePath)) return res.status(404).send("Not found");
  const html = fs.readFileSync(filePath, "utf8");
  res.send(html);
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    mode: process.env.NODE_ENV || "development",
  });
});

console.log("✅ App setup completed!");

/* ---------------- START SERVER ---------------- */
const PORT = process.env.PORT || 5000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`📡 Frontend URL: ${getFrontendURL()}`);
});
