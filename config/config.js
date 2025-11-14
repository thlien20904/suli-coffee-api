require("dotenv").config();

module.exports = {
  development: {
    username: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "postgres",
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
    dialect: "postgres",
    dialectOptions: {
      ssl:
        process.env.DB_SSL === "true"
          ? { require: true, rejectUnauthorized: false }
          : false,
    },
    logging: false,
  },
  test: {
    username: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "postgres",
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
    dialect: "postgres",
    dialectOptions: {
      ssl:
        process.env.DB_SSL === "true"
          ? { require: true, rejectUnauthorized: false }
          : false,
    },
    logging: false,
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
    dialect: "postgres",
    dialectOptions: {
      ssl:
        process.env.DB_SSL === "true"
          ? { require: true, rejectUnauthorized: false }
          : false,
    },
    logging: false,
  },
};
