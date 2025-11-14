// cspMiddleware.js
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");

// Logger utils
const {
  saveViolation,
  loadViolations,
  savePass,
  loadPasses,
  mergeDataFile,
} = require("./utils/logger");

/**
 * createCSPMiddleware(frontendBuildPath, options)
 * - frontendBuildPath: đường dẫn tới thư mục build của React
 * - options.host: host dùng cho report-uri và connect-src
 * - options.publicPath: đường dẫn chứa các file demo (blocked.html, hash.html, nonce_template.html)
 * - options.io: socket.io instance để emit real-time logs
 */
function createCSPMiddleware(frontendBuildPath, options = {}) {
  const router = express.Router();
  const HOST = options.host || `http://localhost:5000`;
  const PUBLIC_PATH = options.publicPath || path.join(__dirname, "public");
  const io = options.io;

  // Middleware body parser để đọc JSON body
  router.use(express.json());
  router.use(express.urlencoded({ extended: true }));

  // Load/merge logs from files
  mergeDataFile();
  let cspViolations = loadViolations();
  let cspPasses = loadPasses();
  console.log(
    `📦 Loaded ${cspViolations.length} violations, ${cspPasses.length} passes from disk`
  );

  const generateNonce = () => crypto.randomBytes(16).toString("base64");

  /* ---------------- Demo routes ---------------- */

  // CSP Demo Home Page
  router.get("/csp", (req, res) => {
    res.sendFile(path.join(PUBLIC_PATH, "index.html"));
  });

  router.get("/blocked", (req, res) => {
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'", // ✅ Cho phép inline styles
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
      `report-uri ${HOST}/csp-report`,
    ].join("; ");
    res.setHeader("Content-Security-Policy", csp);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.sendFile(path.join(PUBLIC_PATH, "blocked.html"));
  });

  router.get("/hash", (req, res) => {
    const htmlPath = path.join(PUBLIC_PATH, "hash.html");
    // Load hash từ .env (generate bằng: node scripts/build-hash.js)
    const scriptHash = process.env.HASH_CSP;

    if (!scriptHash) {
      console.warn(
        "⚠️ HASH_CSP not found in .env! Run: node scripts/build-hash.js"
      );
    }

    const csp = [
      "default-src 'self'",
      `script-src 'self' ${scriptHash ? `'${scriptHash}'` : ""}`, // Chỉ thêm hash nếu có
      "style-src 'self' 'unsafe-inline'", // ✅ Cho phép inline styles
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
      `report-uri ${HOST}/csp-report`,
    ].join("; ");

    res.setHeader("Content-Security-Policy", csp);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    console.log("📝 /hash CSP:", csp.substring(0, 100) + "...");
    res.sendFile(htmlPath);
  });

  router.get("/nonce", (req, res) => {
    const nonce = generateNonce();
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'`,
      "style-src 'self' 'unsafe-inline'", // ✅ Cho phép inline styles
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
      `report-uri ${HOST}/csp-report`,
    ].join("; ");
    res.setHeader("Content-Security-Policy", csp);
    res.setHeader("Content-Type", "text/html; charset=utf-8");

    const tplPath = path.join(PUBLIC_PATH, "nonce_template.html");
    fs.readFile(tplPath, "utf8", (err, html) => {
      if (err) return res.status(500).send("Server error");
      res.send(html.replace(/{{NONCE}}/g, nonce));
    });
  });

  // 🧪 CSP Test Suite - Test inline scripts với nonce/hash
  router.get("/csp-test", (req, res) => {
    const nonce = generateNonce();
    const scriptHash = process.env.HASH_CSP; // Load từ .env nếu có

    const csp = [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' ${
        scriptHash ? `'${scriptHash}'` : ""
      }`,
      "style-src 'self' 'unsafe-inline'",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
      `report-uri ${HOST}/csp-report`,
    ].join("; ");

    res.setHeader("Content-Security-Policy", csp);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    console.log(
      "🧪 CSP Test Suite - Nonce:",
      nonce,
      "Hash:",
      scriptHash || "not configured"
    );

    const testPath = path.join(PUBLIC_PATH, "csp_test.html");
    fs.readFile(testPath, "utf8", (err, html) => {
      if (err) return res.status(500).send("Server error");
      res.send(html.replace(/{{NONCE}}/g, nonce));
    });
  });

  /* ---------------- CSP Reporting ---------------- */
  router.post(
    "/csp-report",
    express.json({ type: ["application/json", "application/csp-report"] }),
    (req, res) => {
      try {
        const body = req.body;
        let reportObj = null;

        // Browser gửi { "csp-report": {...} }
        if (body && body["csp-report"]) {
          reportObj = body["csp-report"];
        }
        // Hoặc gửi trực tiếp object
        else if (body && Object.keys(body).length > 0) {
          reportObj = body;
        }

        if (reportObj) {
          reportObj.timestamp = new Date().toLocaleString("vi-VN");
          reportObj.status = "fail"; // Mark as violation
          cspViolations.push(reportObj);
          // Limit memory to 1000 entries (keep latest)
          if (cspViolations.length > 1000) {
            cspViolations.shift();
          }
          saveViolation(reportObj);
          if (io) io.emit("newViolation", reportObj);
          console.log(
            "⚠️ CSP violation:",
            reportObj["violated-directive"] ||
              reportObj["effective-directive"] ||
              "unknown"
          );
        } else {
          console.warn("⚠️ Empty CSP report body:", body);
        }
      } catch (err) {
        console.error("❌ Error handling csp-report:", err);
      }
      res.status(204).end();
    }
  );

  // Log pass (khi script chạy thành công)
  router.post("/api/log-pass", (req, res) => {
    try {
      const { page, directive, timestamp } = req.body;
      const passLog = {
        page: page || "unknown",
        directive: directive || "unknown",
        timestamp: timestamp || new Date().toLocaleString("vi-VN"),
        status: "pass",
      };
      cspPasses.push(passLog);
      // Limit memory to 1000 entries
      if (cspPasses.length > 1000) {
        cspPasses.shift();
      }
      savePass(passLog);
      console.log("✅ Script pass:", page);
      if (io) io.emit("scriptPass", passLog);
    } catch (err) {
      console.error("Error logging pass:", err);
    }
    res.status(204).end();
  });

  /* ---------------- Socket.IO initial data emit ---------------- */
  if (io) {
    io.on("connection", (socket) => {
      console.log("🔌 Client connected, sending initial logs...");
      // Send all historical data to new client
      socket.emit("initLogs", {
        violations: cspViolations,
        passes: cspPasses,
      });
    });
  }

  /* ---------------- Dashboard / API ---------------- */
  // Real-time dashboard routes
  router.get("/report-log-realtime", (req, res) =>
    res.sendFile(path.join(PUBLIC_PATH, "report_log_realtime.html"))
  );

  router.get("/analyze-realtime", (req, res) =>
    res.sendFile(path.join(PUBLIC_PATH, "analyze_realtime.html"))
  );

  // Legacy routes (without Socket.IO)
  router.get("/report-log", (req, res) =>
    res.sendFile(path.join(PUBLIC_PATH, "report_log.html"))
  );

  router.get("/analyze", (req, res) => {
    const file = path.join(PUBLIC_PATH, "analyze.html");
    if (fs.existsSync(file)) return res.sendFile(file);
    res.status(404).send("Analyzer not available");
  });

  // API endpoints
  router.get("/api/logs", (req, res) => res.json(cspViolations));

  router.post("/api/log-pass", (req, res) => {
    const body = req.body;
    if (body) {
      cspPasses.push(body);
      console.log("✅ Script pass:", body.page);
    }
    res.status(204).end();
  });

  router.get("/api/logs-full", (req, res) =>
    res.json({ fail: cspViolations, pass: cspPasses })
  );

  /* ---------------- Serve static files từ backend/public (cho CSP demo) ---------------- */
  router.use(express.static(PUBLIC_PATH));

  /* ---------------- Serve static files (CSS, JS, images) NHƯNG KHÔNG serve index.html ---------------- */
  router.use(
    express.static(frontendBuildPath, {
      index: false, // ✅ QUAN TRỌNG: Không tự động serve index.html
    })
  );

  /* ---------------- Catch-all route (React) với nonce per request ---------------- */
  router.get(/^(?!\/api|\/images|\/auth).*$/, async (req, res, next) => {
    try {
      const nonce = generateNonce();

      const csp = [
        "default-src 'self'",
        // `script-src 'self' 'nonce-${nonce}'`,
        `script-src 'self' 'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval'`,

        "style-src 'self' https: 'unsafe-inline'", // ✅ Cho phép inline styles
        "img-src * data: blob:", // cho phép ảnh backend + blob/data
        `connect-src 'self' ws://localhost:5000 https://accounts.google.com https://*.googleapis.com`, // ✅ Cho phép Google OAuth
        "font-src 'self' https: data:",
        "object-src 'none'",
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "form-action 'self' https://accounts.google.com", // ✅ Cho phép submit form tới Google
        "upgrade-insecure-requests",
        `report-uri ${HOST}/csp-report`,
      ].join("; ");

      res.setHeader("Content-Security-Policy", csp);

      const indexPath = path.join(frontendBuildPath, "index.html");
      let html = await fs.promises.readFile(indexPath, "utf8");
      html = html.replace(/__NONCE__/g, nonce);

      res.status(200).send(html);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = createCSPMiddleware;
