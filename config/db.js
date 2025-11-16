const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Hàm sql template cho truy vấn dạng sql`SELECT ...`
function sql(strings, ...values) {
  const text = strings.reduce(
    (prev, curr, i) =>
      prev + curr + (values[i] !== undefined ? `$${i + 1}` : ""),
    ""
  );
  return pool.query(text, values).then((res) => res.rows);
}

module.exports = sql;
