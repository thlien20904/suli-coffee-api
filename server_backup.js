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
const multer = require("multer");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const createCSPMiddleware = require("./cspMiddleware");
const createClickjackingMiddleware = require("./clickjackingMiddleware");
const { securityHeaders } = require("./securityHeaders");
const sql = require("./config/db");
const { initializeSocketIO } = require("./socketManager");
const { setupMiddleware } = require("./config/middleware");
const sequelize = require("./config/sequelize");
const initModels = require("./models/init-models");
const models = initModels(sequelize);
const { Users } = models;
const frontendBuildPath = path.join(__dirname, "../frontend/build");

// Load environment variables
dotenv.config();

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

// Khởi tạo app và server
const app = express();
const server = http.createServer(app);

// Khởi tạo Socket.IO
const io = new socketIO.Server(server, {
  cors: {
    origin: "http://localhost:3000",
    credentials: true,
  },
});

// Initialize Socket.IO với real-time features
console.log("🔌 Initializing Socket.IO real-time features...");
const socketManager = initializeSocketIO(io);
app.set("socketManager", socketManager);

// CORS configuration
const allowedOrigins = [
  "http://localhost:3000", // Dev local
  process.env.FRONTEND_URL || "https://suli-coffee-web.vercel.app",
];

// Debug logs
console.log("🌐 CORS Allowed Origins:", allowedOrigins);
console.log("📡 FRONTEND_URL from env:", process.env.FRONTEND_URL);

// Setup middleware
console.log("🚀 Setting up Express app with all configurations...");

/* ---------------- MIDDLEWARE ---------------- */
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());
app.use(passport.initialize());
app.use(express.urlencoded({ extended: true }));

// 🛡️ SECURITY PROTECTION - Áp dụng cho TOÀN BỘ DỰ ÁN
app.use((req, res, next) => {
  // Skip demo routes
  if (
    req.path.startsWith("/clickjacking") ||
    req.path.startsWith("/csp-test") ||
    req.path.startsWith("/csp") ||
    req.path.startsWith("/report-log") ||
    req.path.startsWith("/analyze") ||
    req.path.startsWith("/blocked") ||
    req.path.startsWith("/hash") ||
    req.path.startsWith("/nonce")
  ) {
    return next();
  }

  // Áp dụng security headers cho tất cả routes khác
  return securityHeaders({
    frameAncestors: "'self'",
    enableCSP: true,
    enableClickjackingProtection: true,
  })(req, res, next);
});

// 🛡️ Clickjacking Protection Demo Routes
app.use(createClickjackingMiddleware(path.join(__dirname, "public")));

// ✅ CSP middleware serve frontend build
app.use(createCSPMiddleware(frontendBuildPath, { io }));

// Request logger
app.use((req, res, next) => {
  try {
    const preview =
      req.body && Object.keys(req.body).length
        ? JSON.stringify(req.body).slice(0, 200)
        : "";
    console.log(
      `--> ${req.method} ${req.path} ${preview ? "- body:" + preview : ""}`
    );
  } catch (e) {
    console.log("--> request logging error", e && e.message);
  }
  next();
});

// Serve ảnh tĩnh
app.use(
  "/images/old",
  (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(path.join(__dirname, "../images"))
);

app.use(
  "/images/new",
  (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(path.join(__dirname, "public/images"))
);

app.use(
  "/images",
  (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(path.join(__dirname, "../images")),
  express.static(path.join(__dirname, "public/images"))
);

// Global error handlers
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err && err.stack ? err.stack : err);
});
process.on("unhandledRejection", (reason, p) => {
  console.error("UNHANDLED REJECTION at:", p, "reason:", reason);
});

// Passport Google OAuth
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log("[Google OAuth Strategy] Profile received:", profile);
        const email = profile.emails[0].value;
        const username = profile.displayName;
        const avatar = profile.photos?.[0]?.value || null;

        console.log("[Google OAuth Strategy] Extracted data:", {
          email,
          username,
          avatar,
        });

        let user = await Users.findOne({ where: { Email: email } });
        console.log("[Google OAuth Strategy] Existing user found:", !!user);

        if (!user) {
          console.log("[Google OAuth Strategy] Creating new user...");
          user = await Users.create({
            Username: username,
            Email: email,
            PasswordHash: await bcrypt.hash("google", 10),
            Role: "User",
            AvatarUrl: avatar,
          });
          console.log(
            "[Google OAuth Strategy] New user created:",
            user.toJSON()
          );
        } else {
          console.log("[Google OAuth Strategy] Updating existing user...");
          await Users.update(
            { Username: username, AvatarUrl: avatar },
            { where: { Email: email } }
          );
          user = await Users.findOne({ where: { Email: email } });
          console.log("[Google OAuth Strategy] User updated:", user.toJSON());
        }

        return done(null, user.toJSON());
      } catch (err) {
        console.error("[Google OAuth Strategy] Error:", err);
        return done(err, null);
      }
    }
  )
);

/* ---------------- MULTER ---------------- */
const storage = multer.diskStorage({
  destination: (req, file, cb) =>
    cb(null, path.join(__dirname, "public/images")),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

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

/* ---------------- IMPORT ROUTERS ---------------- */
const authRouter = require("./routes/user/auth");
const profileRouter = require("./routes/user/profile");
const productsUserRouter = require("./routes/user/productsUser");
const cartUserRouter = require("./routes/user/cartUser");
const ordersUserRouter = require("./routes/user/ordersUser");
const StoresUserRouter = require("./routes/user/StoresUser");
const addressesUserRouter = require("./routes/user/addressesUser");
const homeRouter = require("./routes/user/homeUser");
const addressRouter = require("./routes/user/address");

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

/* ---------------- USE ROUTERS ---------------- */
app.use("/api/auth", authRouter);
app.use("/api/profile", profileRouter);
app.use("/api/products", productsUserRouter);
app.use("/api/cart", cartUserRouter);
app.use("/api/orders", ordersUserRouter);
app.use("/api/Stores", StoresUserRouter);
app.use("/api/addresses", addressesUserRouter);
app.use("/api/home", homeRouter);
app.use("/api/address", addressRouter);

// Admin routes
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

// Webhooks
const webhooksRouter = require("./routes/webhooks");
app.use("/api/webhooks", webhooksRouter);

/* ---------------- CONNECT DB ---------------- */
const connectDB = async () => {
  try {
    // Test PostgreSQL connection
    await sql`SELECT 1 as test`;
    console.log("✅ Connected to PostgreSQL");

    // Test Sequelize connection
    const result = await sequelize.query("SELECT 1 as test");
    console.log("✅ Sequelize test query OK:", result[0]);
    console.log("✅ CORS allowed origin: http://localhost:3000");
  } catch (err) {
    console.error("❌ Database connection failed:", err);
  }
};
connectDB();

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

const passwordRouter = require("./routes/user/password");
app.use("/api/password", passwordRouter);

// Route serve CSP demo
app.get("/csp", (req, res) => {
  const filePath = path.join(__dirname, "public/index.html");
  if (!fs.existsSync(filePath)) return res.status(404).send("Not found");
  const html = fs.readFileSync(filePath, "utf8");
  res.send(html);
});

console.log("✅ App setup completed!");

/* ---------------- START SERVER ---------------- */
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});
