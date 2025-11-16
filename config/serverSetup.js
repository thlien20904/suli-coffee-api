// config/serverSetup.js - Chứa tất cả logic API và middleware
const express = require("express");
const cors = require("cors");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const dotenv = require("dotenv");
const multer = require("multer");
const path = require("path");
const jwt = require("jsonwebtoken");
const { expressjwt } = require("express-jwt");
const sequelize = require("./sequelize");
const initModels = require("../models/init-models");
const models = initModels(sequelize);
const bcrypt = require("bcryptjs");
const { Users } = models;
const createCSPMiddleware = require("../cspMiddleware");
const createClickjackingMiddleware = require("../clickjackingMiddleware");
const { securityHeaders } = require("../securityHeaders");
const sql = require("./db"); // Database helper (PostgreSQL)

dotenv.config();

// Export models để server.js có thể sử dụng
module.exports.models = models;

// Setup CORS với dynamic origins
const setupCORS = (app, allowedOrigins) => {
  console.log("🌐 Setting up CORS with origins:", allowedOrigins);

  app.use(
    cors({
      origin: (origin, callback) => {
        // Cho phép nếu origin match hoặc không có origin (như Postman/direct call)
        if (!origin || allowedOrigins.includes(origin)) {
          console.log(`✅ CORS allowed origin: ${origin || "no-origin"}`);
          callback(null, true);
        } else {
          console.log(`❌ CORS blocked origin: ${origin}`);
          callback(new Error("Not allowed by CORS"));
        }
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );
};

// Setup basic app middleware
const setupBasicMiddleware = (app) => {
  app.use(express.json());
  app.use(passport.initialize());
  app.use(express.urlencoded({ extended: true }));

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
};

// Setup security middleware
const setupSecurity = (app, io) => {
  console.log("🛡️ Setting up security middleware...");

  // Security protection cho toàn bộ dự án
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

  // Clickjacking Protection Demo Routes
  app.use(
    "/clickjacking",
    createClickjackingMiddleware(path.join(__dirname, "../public"))
  );

  // CSP middleware
  app.use(
    createCSPMiddleware(path.join(__dirname, "../public"), {
      io,
      backendUrl: process.env.BACKEND_URL || "http://localhost:5000",
    })
  );
};

// Setup static files
const setupStaticFiles = (app) => {
  console.log("📁 Setting up static files...");

  // Ảnh cũ
  app.use(
    "/images/old",
    (req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      next();
    },
    express.static(path.join(__dirname, "../../images"))
  );

  // Ảnh mới upload
  app.use(
    "/images/new",
    (req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      next();
    },
    express.static(path.join(__dirname, "../public/images"))
  );

  // Chung /images cho cả hai
  app.use(
    "/images",
    (req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      next();
    },
    express.static(path.join(__dirname, "../../images")),
    express.static(path.join(__dirname, "../public/images"))
  );
};

// Setup Passport Google OAuth
const setupPassport = () => {
  console.log("🔐 Setting up Passport Google OAuth...");

  // Dynamic callback URL để hỗ trợ cả local và production
  const getCallbackURL = () => {
    // Tự động detect production environment
    const isProduction =
      process.env.NODE_ENV === "production" ||
      process.env.RENDER || // Render.com environment
      (process.env.PORT && !process.env.PORT.startsWith("500")); // Production thường không dùng port 5000-5999

    if (isProduction) {
      // Production: sử dụng render.com domain
      const prodURL =
        process.env.GOOGLE_CALLBACK_URL_PROD ||
        "https://suli-coffee.onrender.com/auth/google/callback";
      console.log("🌍 Production mode detected, using:", prodURL);
      return prodURL;
    } else {
      // Development: sử dụng localhost
      const devURL =
        process.env.GOOGLE_CALLBACK_URL ||
        "http://localhost:5000/auth/google/callback";
      console.log("🏠 Development mode detected, using:", devURL);
      return devURL;
    }
  };

  const callbackURL = getCallbackURL();
  console.log("🔗 Final Google OAuth Callback URL:", callbackURL);

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: callbackURL,
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
};

// Setup Multer
const setupMulter = () => {
  const storage = multer.diskStorage({
    destination: (req, file, cb) =>
      cb(null, path.join(__dirname, "../public/images")),
    filename: (req, file, cb) =>
      cb(null, Date.now() + path.extname(file.originalname)),
  });
  return multer({ storage });
};

// Connect Database
const connectDB = async () => {
  try {
    // Test PostgreSQL connection
    await sql`SELECT 1`;
    console.log("✅ Connected to PostgreSQL");
  } catch (err) {
    console.error("❌ Database connection failed:", err);
  }
};

// Setup all API routes
const setupRoutes = (app) => {
  console.log("🛤️  Setting up API routes...");

  // Import all routers
  const authRouter = require("../routes/user/auth");
  const profileRouter = require("../routes/user/profile");
  const productsUserRouter = require("../routes/user/productsUser");
  const cartUserRouter = require("../routes/user/cartUser");
  const ordersUserRouter = require("../routes/user/ordersUser");
  const StoresUserRouter = require("../routes/user/StoresUser");
  const addressesUserRouter = require("../routes/user/addressesUser");
  const homeRouter = require("../routes/user/homeUser");
  const addressRouter = require("../routes/user/address");
  const passwordRouter = require("../routes/user/password");

  const FoodRouter = require("../routes/admin/Food");
  const homeAdminRouter = require("../routes/admin/homeAdmin");
  const authAdminRoutes = require("../routes/admin/authAdmin");
  const ingredientRouter = require("../routes/admin/ingredient");
  const categoryRouter = require("../routes/admin/category");
  const exportRouter = require("../routes/admin/export");
  const paymentRouter = require("../routes/admin/payment");
  const userRouter = require("../routes/admin/users");
  const staffRouter = require("../routes/admin/staff");
  const roleRouter = require("../routes/admin/role");
  const invoiceRouter = require("../routes/admin/invoice");
  const orderAdminRouter = require("../routes/admin/order");
  const reportRouter = require("../routes/admin/report");
  const voucherRouter = require("../routes/admin/voucher");
  const webhooksRouter = require("../routes/webhooks");

  // User routes
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
  app.use("/api/webhooks", webhooksRouter);
};

// Setup special routes (success, oauth, etc.)
const setupSpecialRoutes = (app) => {
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

  // Google OAuth routes
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
      failureRedirect: `${
        process.env.FRONTEND_URL || "http://localhost:3000"
      }/login?error=auth_failed`,
      session: false,
    }),
    (req, res) => {
      try {
        console.log("[Google OAuth Callback] User data:", req.user);

        if (!req.user) {
          console.error("[Google OAuth Callback] No user data received!");
          return res.redirect(
            `${
              process.env.FRONTEND_URL || "http://localhost:3000"
            }/login?error=no_user_data`
          );
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
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
        res.redirect(
          `${frontendUrl}/login?token=${token}&role=${(
            req.user.Role || "user"
          ).toLowerCase()}&avatar=${encodeURIComponent(
            req.user.AvatarUrl || ""
          )}`
        );
      } catch (err) {
        console.error("[Google OAuth Callback] Error:", err);
        res.redirect(
          `${
            process.env.FRONTEND_URL || "http://localhost:3000"
          }/login?error=callback_error`
        );
      }
    }
  );

  // API current user
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

  // Root route - serve CSP demo homepage
  app.get("/", (req, res) => {
    const fs = require("fs");
    const filePath = path.join(__dirname, "../public/index.html");
    if (!fs.existsSync(filePath)) {
      return res.json({
        message: "SuLi Coffee API Server",
        status: "running",
        endpoints: {
          api: "/api/*",
          csp_demo: "/csp",
          clickjacking_demo: "/clickjacking",
        },
      });
    }

    const html = fs.readFileSync(filePath, "utf8");
    res.send(html);
  });

  // Route serve CSP demo
  app.get("/csp", (req, res) => {
    const fs = require("fs");
    const filePath = path.join(__dirname, "../public/index.html");
    if (!fs.existsSync(filePath)) return res.status(404).send("Not found");

    const html = fs.readFileSync(filePath, "utf8");
    res.send(html);
  });
};

// Main setup function
const setupApp = (app, io, allowedOrigins) => {
  console.log("🚀 Setting up Express app with all configurations...");

  // Setup các thành phần theo thứ tự
  setupCORS(app, allowedOrigins);
  setupBasicMiddleware(app);
  setupSecurity(app, io);
  setupStaticFiles(app);
  setupPassport();
  setupRoutes(app);
  setupSpecialRoutes(app);

  // Connect DB
  connectDB();

  console.log("✅ App setup completed!");
};

module.exports = {
  setupApp,
  setupCORS,
  setupBasicMiddleware,
  setupSecurity,
  setupStaticFiles,
  setupPassport,
  setupMulter,
  setupRoutes,
  setupSpecialRoutes,
  connectDB,
  models,
};
