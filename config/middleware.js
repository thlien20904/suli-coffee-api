// config/middleware.js - Chỉ chứa middleware setup
const cors = require("cors");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const express = require("express");
const path = require("path");
const jwt = require("jsonwebtoken");
const createCSPMiddleware = require("../cspMiddleware");
const createClickjackingMiddleware = require("../clickjackingMiddleware");
const { securityHeaders } = require("../securityHeaders");
const initModels = require("../models/init-models");
const sequelize = require("./sequelize");
const { Users } = initModels(sequelize);

// Helper functions cho OAuth
const getCallbackURL = () => {
  const isProduction =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL ||
    process.env.RENDER ||
    process.env.VERCEL_URL;

  if (isProduction) {
    const prodURL =
      process.env.GOOGLE_CALLBACK_URL_PROD ||
      "https://suli-coffee.onrender.com/auth/google/callback";
    console.log("🌍 Production mode detected, using:", prodURL);
    return prodURL;
  } else {
    // Development: sử dụng PORT hiện tại thay vì hardcode
    const currentPort = process.env.PORT || "5000";
    const devURL = `http://localhost:${currentPort}/auth/google/callback`;
    console.log("🏠 Development mode detected, using:", devURL);
    return devURL;
  }
};

const getFrontendURL = () => {
  const isProduction =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL ||
    process.env.RENDER ||
    process.env.VERCEL_URL;

  if (isProduction) {
    return process.env.FRONTEND_URL || "https://suli-coffee-web.vercel.app";
  } else {
    return "http://localhost:3000";
  }
};

// Setup CORS
const setupCORS = (app, allowedOrigins) => {
  console.log("🌐 Setting up CORS with origins:", allowedOrigins);

  app.use(
    cors({
      origin: (origin, callback) => {
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

// Setup basic middleware
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
const setupSecurity = (app) => {
  console.log("🛡️ Setting up security middleware...");

  app.use((req, res, next) => {
    if (
      req.path.startsWith("/clickjacking") ||
      req.path.startsWith("/csp") ||
      req.path.includes("demo")
    ) {
      return next();
    }

    securityHeaders(req, res, () => {
      createCSPMiddleware()(req, res, () => {
        createClickjackingMiddleware()(req, res, next);
      });
    });
  });
};

// Setup static files
const setupStaticFiles = (app) => {
  console.log("📁 Setting up static files...");

  app.use(
    "/uploads",
    (req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      next();
    },
    express.static(path.join(__dirname, "../uploads"))
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
};

// Setup Passport Google OAuth
const setupPassport = () => {
  console.log("🔐 Setting up Passport Google OAuth...");

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

          let user = await Users.findOne({ where: { Email: email } });
          console.log("[Google OAuth Strategy] Existing user found:", !!user);

          if (!user) {
            console.log("[Google OAuth Strategy] Creating new user...");
            user = await Users.create({
              Username: username,
              Email: email,
              Password: "google_oauth_user",
              Role: "User",
              AvatarUrl: avatar,
              IsActive: true,
              CreatedDate: new Date(),
            });
            console.log("[Google OAuth Strategy] New user created:", user.Id);
          } else {
            console.log(
              "[Google OAuth Strategy] Updating existing user avatar..."
            );
            if (avatar && user.AvatarUrl !== avatar) {
              await user.update({ AvatarUrl: avatar });
            }
          }

          console.log("[Google OAuth Strategy] Returning user data:", {
            Id: user.Id,
            Username: user.Username,
            Email: user.Email,
            Role: user.Role,
            AvatarUrl: user.AvatarUrl,
          });

          return done(null, {
            Id: user.Id,
            Username: user.Username,
            Email: user.Email,
            Role: user.Role,
            AvatarUrl: user.AvatarUrl,
          });
        } catch (err) {
          console.error("[Google OAuth Strategy] Error:", err);
          return done(err, null);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    done(null, user);
  });

  passport.deserializeUser((user, done) => {
    done(null, user);
  });
};

// Main setup function
const setupMiddleware = (app, allowedOrigins) => {
  setupCORS(app, allowedOrigins);
  setupBasicMiddleware(app);
  setupSecurity(app);
  setupStaticFiles(app);
  setupPassport();
};

module.exports = {
  setupMiddleware,
  getFrontendURL,
  getCallbackURL,
};
