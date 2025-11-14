// server.js
const express = require("express");
const cors = require("cors");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const dotenv = require("dotenv");
const multer = require("multer");
const path = require("path");
const jwt = require("jsonwebtoken");
const { expressjwt } = require("express-jwt"); // v8.5.1
const sequelize = require("./config/sequelize");
const initModels = require("./models/init-models");
const models = initModels(sequelize);
const bcrypt = require("bcryptjs");
const { Users } = models;
const createCSPMiddleware = require("./cspMiddleware");
const createClickjackingMiddleware = require("./clickjackingMiddleware");
const { securityHeaders } = require("./securityHeaders"); // 🛡️ Import security headers
//const frontendBuildPath = path.join(__dirname, "../frontend/build");
const http = require("http");
const socketIO = require("socket.io");
const { initializeSocketIO } = require("./socketManager");

// Khởi tạo app trước
const app = express();

// Tạo server từ app
const server = http.createServer(app);

// Tạo socket.io
const io = new socketIO.Server(server, {
  cors: {
    origin: "http://localhost:3000",
    credentials: true,
  },
});

// Initialize Socket.IO với real-time features
const socketManager = initializeSocketIO(io);

// Export socketManager để các routes khác sử dụng
app.set("socketManager", socketManager);

// Database helper (mssql)
const sql = require("./db"); // hoặc import sql from './db.js' nếu dùng ES module

dotenv.config();

// Global error handlers
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err && err.stack ? err.stack : err);
});
process.on("unhandledRejection", (reason, p) => {
  console.error("UNHANDLED REJECTION at:", p, "reason:", reason);
});

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
// Middleware này bảo vệ mọi route với:
// 1. CSP chặn inline JS (chỉ cho phép nonce/hash)
// 2. Clickjacking Protection (X-Frame-Options + frame-ancestors)
// 3. Các security headers bổ sung (X-Content-Type-Options, X-XSS-Protection, etc.)
app.use((req, res, next) => {
  // Skip demo routes (để demo có thể tự set headers riêng)
  if (
    req.path.startsWith("/clickjacking") ||
    req.path.startsWith("/csp-test") ||
    req.path.startsWith("/csp") ||
    req.path.startsWith("/report-log") ||
    req.path.startsWith("/analyze") || // Skip analyze & analyze-realtime
    req.path.startsWith("/blocked") ||
    req.path.startsWith("/hash") ||
    req.path.startsWith("/nonce")
  ) {
    return next();
  }

  // Áp dụng security headers cho tất cả routes khác
  return securityHeaders({
    frameAncestors: "'self'", // Chỉ cho phép same-origin (SAMEORIGIN)
    enableCSP: true,
    enableClickjackingProtection: true,
  })(req, res, next);
});

// 🛡️ Clickjacking Protection Demo Routes (có headers riêng cho demo)
app.use(createClickjackingMiddleware(path.join(__dirname, "public")));

// ✅ CSP middleware serve frontend build (đã có express.static bên trong)
//app.use(createCSPMiddleware(frontendBuildPath, { io }));

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
// Ảnh cũ
app.use(
  "/images/old",
  (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(path.join(__dirname, "../images"))
);

// Ảnh mới upload
app.use(
  "/images/new",
  (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(path.join(__dirname, "public/images"))
);

// Nếu muốn mount chung /images cho cả hai
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

/* ---------------- ROUTES ---------------- */
// Success route
app.get("/successful", async (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ success: false, message: "Không có token xác thực!" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "dev_secret_fallback"
    );

    const user = await Users.findOne({ where: { Id: decoded.id } });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy người dùng!" });
    }

    res.json({ success: true, message: "Đặt hàng thành công!" });
  } catch (err) {
    console.error("SUCCESS ROUTE ERROR:", err);
    return res
      .status(401)
      .json({ success: false, message: "Token hết hạn hoặc không hợp lệ!" });
  }
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
    await sql`SELECT 1`;
    console.log("✅ Connected to PostgreSQL");
  } catch (err) {
    console.error("❌ Database connection failed:", err);
  }
};
connectDB();

/* ---------------- GOOGLE OAUTH ROUTES ---------------- */
app.get(
  "/auth/google",
  (req, res, next) => {
    console.log("[Google OAuth] Initiating Google authentication...");
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
    failureRedirect: "http://localhost:3000/login?error=auth_failed",
    session: false,
  }),
  (req, res) => {
    try {
      console.log("[Google OAuth Callback] User data:", req.user);

      if (!req.user) {
        console.error("[Google OAuth Callback] No user data received!");
        return res.redirect("http://localhost:3000/login?error=no_user_data");
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
      res.redirect(
        `http://localhost:3000/login?token=${token}&role=${(
          req.user.Role || "user"
        ).toLowerCase()}&avatar=${encodeURIComponent(req.user.AvatarUrl || "")}`
      );
    } catch (err) {
      console.error("[Google OAuth Callback] Error:", err);
      res.redirect("http://localhost:3000/login?error=callback_error");
    }
  }
);

/* ---------------- API CURRENT USER ---------------- */
app.get("/api/current_user", async (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader) return res.json(null);

    const token = authHeader.split(" ")[1];
    if (!token) return res.json(null);

    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) return res.json(null);

      // PostgreSQL query
      const user =
        await sql`SELECT "Id", "Username", "Email", "Role", "AvatarUrl" FROM "Users" WHERE "Id" = ${decoded.id}`;
      if (!user || user.length === 0) return res.json(null);
      res.json({
        ...user[0],
        role: (user[0].Role || "user").toLowerCase(),
        avatar: decoded.avatar || null,
      });
    });
  } catch (err) {
    res.json(null);
  }
});

const passwordRouter = require("./routes/user/password");
app.use("/api/password", passwordRouter);

// Route serve CSP demo
app.get("/csp", (req, res) => {
  const filePath = path.join(__dirname, "public/index.html"); // đường dẫn tới file index.html của CSP demo
  if (!fs.existsSync(filePath)) return res.status(404).send("Not found");

  // Nếu muốn thêm nonce từ middleware CSP (nếu đã setup)
  // const nonce = res.locals.nonce || '';
  // let html = fs.readFileSync(filePath, 'utf8').replace(/__NONCE__/g, nonce);

  const html = fs.readFileSync(filePath, "utf8");
  res.send(html);
});
/* ---------------- START SERVER ---------------- */
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});
