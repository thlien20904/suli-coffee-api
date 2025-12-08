const { Sequelize } = require("sequelize");
require("dotenv").config();

console.log("ENV:", {
  DB_NAME: process.env.DB_NAME,
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_HOST: process.env.DB_HOST,
  DB_PORT: process.env.DB_PORT,
  DB_SSL: process.env.DB_SSL,
});

const sequelize = new Sequelize(
  process.env.DB_NAME || "postgres",
  process.env.DB_USER || "postgres",
  process.env.DB_PASSWORD || "",
  {
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
    dialect: "postgres",
    logging: false,
    dialectOptions: {
      ssl:
        process.env.DB_SSL === "true"
          ? { require: true, rejectUnauthorized: false }
          : false,
    },
    timezone: "+00:00",
    pool: {
      max: 3, // Giảm xuống 3 để tránh vượt giới hạn Supabase
      min: 1, // Giữ ít nhất 1 connection
      acquire: 60000, // Tăng thời gian timeout
      idle: 5000, // Giảm idle time để giải phóng connection nhanh hơn
      evict: 1000, // Kiểm tra connection mỗi 1s
    },
    retry: {
      max: 5, // Tăng retry attempts
      backoffBase: 1000,
      backoffExponent: 2,
    },
    // Thêm error handling
    hooks: {
      beforeConnect: () => {
        console.log("🔄 Connecting to PostgreSQL...");
      },
      afterDisconnect: () => {
        console.log("🔌 Disconnected from PostgreSQL");
      },
    },
  }
);

// ✅ Kiểm tra kết nối với enhanced testing
(async () => {
  try {
    console.log("🔍 Testing Sequelize connection...");
    await sequelize.authenticate();
    console.log("✅ Kết nối PostgreSQL (Sequelize) thành công!");

    // Test query để đảm bảo pool hoạt động
    const testResult = await sequelize.query("SELECT 1 as test", {
      type: sequelize.QueryTypes.SELECT,
    });
    console.log("✅ Sequelize test query OK:", testResult);

    // Periodic health check
    setInterval(async () => {
      try {
        await sequelize.query("SELECT 1", {
          type: sequelize.QueryTypes.SELECT,
        });
      } catch (error) {
        console.log("⚠️ Database health check failed:", error.message);
      }
    }, 30000); // Check every 30 seconds
  } catch (err) {
    console.error("❌ SEQUELIZE CONNECTION ERROR:");
    console.error("❌ Error Name:", err.name);
    console.error("❌ Error Message:", err.message);
    console.error("❌ Full Error:", err);
    console.error(
      "→ DB host:",
      process.env.DB_HOST,
      "port:",
      process.env.DB_PORT
    );
    console.error(
      "→ Kiểm tra: username/password, SSL, pooler Supabase có đang chạy?"
    );
  }
})();

module.exports = sequelize;
