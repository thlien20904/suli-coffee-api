// config/middlewareSetup.js - Chứa logic setup middleware (Fixed version)
const cors = require("cors");
const express = require("express");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const createCSPMiddleware = require("../cspMiddleware");
const createClickjackingMiddleware = require("../clickjackingMiddleware");
const { securityHeaders } = require("../securityHeaders");
const sequelize = require("./sequelize");
const initModels = require("../models/init-models");
const models = initModels(sequelize);
const { Users } = models;

/**
 * Setup all middleware for the Express app
 * @param {Express} app - Express application
 * @param {Object} io - Socket.IO instance (optional)
 */
function setupMiddleware(app, io = null) {
  console.log("🔧 Setting up middleware...");

  /* ---------------- CORS CONFIGURATION ---------------- */
  // Dynamic CORS origins based on environment
  const allowedOrigins = [
    "http://localhost:3000", // Local development
    "https://suli-coffee-web.vercel.app", // Production frontend
  ];

  console.log("🌐 CORS allowed origins:", allowedOrigins);

  /* ---------------- BASIC MIDDLEWARE ---------------- */
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    })
  );

  app.use(express.json());
  app.use(passport.initialize());
  app.use(express.urlencoded({ extended: true }));

  /* ---------------- SECURITY MIDDLEWARE ---------------- */
  // 🛡️ SECURITY PROTECTION - Skip for demo routes
  app.use((req, res, next) => {
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

    // Apply security headers for all other routes
    return securityHeaders({
      frameAncestors: "'self'",
      enableCSP: true,
      enableClickjackingProtection: true,
    })(req, res, next);
  });

  // 🛡️ Clickjacking Protection Demo Routes
  app.use(createClickjackingMiddleware(path.join(__dirname, "../public")));

  /* ---------------- CSP MIDDLEWARE (CONDITIONAL) ---------------- */
  // ✅ Skip CSP middleware in separate deployment mode
  console.log("⚠️ CSP middleware disabled (separate frontend/backend deployment)");

  // Serve API info at root for production
  app.get("/", (req, res) => {
    res.json({
      message: "SuLi Coffee API Server",
      status: "running",
      mode: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString(),
    });
  });

  /* ---------------- REQUEST LOGGING ---------------- */
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

  /* ---------------- STATIC FILES ---------------- */
  // Serve static images with CORS headers
  app.use(
    "/images/old",
    (req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      next();
    },
    express.static(path.join(__dirname, "../../images"))
  );

  app.use(
    "/images/new",
    (req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      next();
    },
    express.static(path.join(__dirname, "../public/images"))
  );

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

  console.log("✅ Middleware setup completed");
}

/**
 * Setup Passport Google OAuth Strategy
 */
function setupGoogleOAuth() {
  console.log("🔐 Setting up Google OAuth...");

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: getCallbackURL(), // ✅ Use dynamic callback URL
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

  console.log("✅ Google OAuth setup completed");
}

/**
 * Setup Multer for file uploads
 */
function setupFileUpload() {
  const multer = require("multer");

  const storage = multer.diskStorage({
    destination: (req, file, cb) =>
      cb(null, path.join(__dirname, "../public/images")),
    filename: (req, file, cb) =>
      cb(null, Date.now() + path.extname(file.originalname)),
  });

  return multer({ storage });
}

/**
 * Setup database connection
 * @param {Object} sql - SQL instance from config/db
 */
async function setupDatabase(sql) {
  console.log("🗃️  Setting up database connection...");

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
    throw err;
  }
}

/**
 * Helper functions for OAuth URLs - SIMPLE & STABLE VERSION
 */
const getCallbackURL = () => {
  // Specific production detection for Render deployment only
  const isProduction = process.env.RENDER || 
                      process.env.RENDER_SERVICE_ID ||
                      (process.env.NODE_ENV === "production" && process.env.RENDER);
  
  if (isProduction) {
    const prodURL = process.env.GOOGLE_CALLBACK_URL_PROD || "https://suli-coffee.onrender.com/auth/google/callback";
    console.log("🌍 Production deployment detected, using callback:", prodURL);
    return prodURL;
  } else {
    const currentPort = process.env.PORT || "5000";
    const devURL = `http://localhost:${currentPort}/auth/google/callback`;
    console.log("🏠 Detected localhost from request, using:", devURL);
    return devURL;
  }
};

const getFrontendURL = () => {
  // Specific production detection for Render deployment only  
  const isProduction = process.env.RENDER || 
                      process.env.RENDER_SERVICE_ID ||
                      (process.env.NODE_ENV === "production" && process.env.RENDER);
  
  if (isProduction) {
    const prodURL = process.env.FRONTEND_URL || "https://suli-coffee-web.vercel.app";
    console.log("🌍 Production deployment detected, using production frontend:", prodURL);
    return prodURL;
  } else {
    console.log("🏠 Development mode detected, using localhost frontend");
    return "http://localhost:3000";
  }
};

module.exports = {
  setupMiddleware,
  setupGoogleOAuth,
  setupFileUpload,
  setupDatabase,
  getCallbackURL,
  getFrontendURL,
};