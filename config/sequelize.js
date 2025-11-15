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
    timezone: "+07:00",
    pool: {
      max: 5,        // Giảm từ 10 → 5 cho Supabase free tier (15 connections limit)
      min: 0,        // số connection tối thiểu
      acquire: 30000, // thời gian tối đa (ms) để lấy connection
      idle: 10000,   // thời gian connection idle tối đa trước khi release
    },
    retry: {
      max: 3, // retry 3 lần nếu bị lỗi connection
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
    const testResult = await sequelize.query("SELECT 1 as test", { type: sequelize.QueryTypes.SELECT });
    console.log("✅ Sequelize test query OK:", testResult);
    
  } catch (err) {
    console.error("❌ SEQUELIZE CONNECTION ERROR:");
    console.error("❌ Error Name:", err.name);
    console.error("❌ Error Message:", err.message);
    console.error("❌ Full Error:", err);
    console.error("→ DB host:", process.env.DB_HOST, "port:", process.env.DB_PORT);
    console.error("→ Kiểm tra: username/password, SSL, pooler Supabase có đang chạy?");
  }
})();

module.exports = sequelize;
