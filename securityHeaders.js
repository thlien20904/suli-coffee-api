// securityHeaders.js
/**
 * 🛡️ SECURITY HEADERS MIDDLEWARE - Bảo vệ toàn bộ dự án
 *
 * Tích hợp 2 phần chính:
 * 1. Content Security Policy (CSP) - Chặn inline JS, chỉ cho phép nonce/hash
 * 2. Clickjacking Protection - Ngăn trang bị nhúng vào iframe lạ
 *
 * Cách sử dụng:
 * const securityHeaders = require('./securityHeaders');
 * app.use(securityHeaders());
 */

const crypto = require("crypto");

/**
 * Tạo nonce ngẫu nhiên cho mỗi request
 */
function generateNonce() {
  return crypto.randomBytes(16).toString("base64");
}

/**
 * Security Headers Middleware
 * @param {Object} options - Cấu hình tùy chọn
 * @param {string} options.reportUri - Endpoint nhận CSP violation reports
 * @param {string} options.frameAncestors - Cho phép nhúng từ origin nào ('self', 'none', hoặc URL)
 * @param {boolean} options.enableCSP - Bật/tắt CSP (mặc định: true)
 * @param {boolean} options.enableClickjackingProtection - Bật/tắt clickjacking protection (mặc định: true)
 */
function securityHeaders(options = {}) {
  const {
    reportUri = "/csp-report",
    frameAncestors = "'self'", // Mặc định chỉ cho phép same-origin
    enableCSP = true,
    enableClickjackingProtection = true,
  } = options;

  return function (req, res, next) {
    // Skip nếu là static files hoặc API endpoints (tùy chọn)
    const skipPaths = ["/images/", "/static/", "/api/"];
    const shouldSkip = skipPaths.some((path) => req.path.startsWith(path));

    if (!shouldSkip) {
      // 🛡️ PHẦN 1: CLICKJACKING PROTECTION
      if (enableClickjackingProtection) {
        // X-Frame-Options (legacy, hỗ trợ rộng rãi)
        // DENY = không cho nhúng ở đâu cả
        // SAMEORIGIN = chỉ cho nhúng trên cùng origin
        if (frameAncestors === "'none'") {
          res.setHeader("X-Frame-Options", "DENY");
        } else if (frameAncestors === "'self'") {
          res.setHeader("X-Frame-Options", "SAMEORIGIN");
        }
        // Nếu có URL cụ thể thì không set X-Frame-Options (dùng CSP frame-ancestors thôi)
      }

      // 🛡️ PHẦN 2: CONTENT SECURITY POLICY (bao gồm frame-ancestors)
      if (enableCSP) {
        const nonce = generateNonce();
        req.nonce = nonce; // Lưu nonce vào request để dùng trong views

        const scriptHash = process.env.HASH_CSP; // Load từ .env nếu có

        const cspDirectives = [
          "default-src 'self'",
          `script-src 'self' 'nonce-${nonce}' ${
            scriptHash ? `'${scriptHash}'` : ""
          } 'unsafe-inline' 'unsafe-eval'`,
          "style-src 'self' https: 'unsafe-inline'",
          "img-src * data: blob:",
          "connect-src 'self' ws://localhost:5000 wss://localhost:5000",
          "font-src 'self' https: data:",
          "object-src 'none'",
          "base-uri 'self'",
          "upgrade-insecure-requests",
        ];

        // ✅ QUAN TRỌNG: frame-ancestors (Clickjacking Protection trong CSP)
        // frame-ancestors 'none' = DENY (không cho nhúng)
        // frame-ancestors 'self' = SAMEORIGIN (chỉ nhúng cùng origin)
        // frame-ancestors 'self' https://trusted.com = cho phép nhiều origin
        cspDirectives.push(`frame-ancestors ${frameAncestors}`);

        // Report-uri để nhận violations
        if (reportUri) {
          cspDirectives.push(`report-uri ${reportUri}`);
        }

        res.setHeader("Content-Security-Policy", cspDirectives.join("; "));
      }

      // 🛡️ PHẦN 3: CÁC SECURITY HEADERS BỔ SUNG
      // Ngăn browser đoán MIME type
      res.setHeader("X-Content-Type-Options", "nosniff");

      // Bật XSS filter trên các browser cũ
      res.setHeader("X-XSS-Protection", "1; mode=block");

      // HTTPS Strict Transport Security (nếu dùng HTTPS)
      // res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");

      // Referrer Policy
      res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

      // Permissions Policy (giới hạn features như camera, microphone...)
      res.setHeader(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=()"
      );
    }

    next();
  };
}

/**
 * Middleware riêng cho demo pages (có thể override settings)
 */
function demoSecurityHeaders(customOptions = {}) {
  return function (req, res, next) {
    const nonce = generateNonce();
    req.nonce = nonce;

    const { frameAncestors = "'self'", reportUri = "/csp-report" } =
      customOptions;

    const cspDirectives = [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'`,
      "style-src 'self' 'unsafe-inline'",
      "img-src * data:",
      "object-src 'none'",
      "base-uri 'none'",
      `frame-ancestors ${frameAncestors}`,
      "upgrade-insecure-requests",
      `report-uri ${reportUri}`,
    ];

    res.setHeader("Content-Security-Policy", cspDirectives.join("; "));

    // X-Frame-Options
    if (frameAncestors === "'none'") {
      res.setHeader("X-Frame-Options", "DENY");
    } else if (frameAncestors === "'self'") {
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
    }

    next();
  };
}

module.exports = {
  securityHeaders,
  demoSecurityHeaders,
  generateNonce,
};
