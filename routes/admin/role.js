const express = require("express");
const { poolPromise } = require("../../config/db");
const sql = require("mssql");

const router = express.Router();

// Lấy danh sách role
router.get("/", async (req, res) => {
  try {
    const pool = await poolPromise;
    const rs = await pool
      .request()
      .query("SELECT * FROM AccRole ORDER BY RoleId DESC");
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    console.error("❌ Lỗi lấy role:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// Thêm role
router.post("/add", async (req, res) => {
  try {
    const { RoleName } = req.body;
    const pool = await poolPromise;

    // Check trùng
    const check = await pool
      .request()
      .input("RoleName", sql.NVarChar, RoleName.trim())
      .query(
        "SELECT COUNT(*) AS count FROM AccRole WHERE LOWER(RoleName)=LOWER(@RoleName)"
      );
    if (check.recordset[0].count > 0)
      return res.json({ success: false, message: "Role đã tồn tại" });

    await pool
      .request()
      .input("RoleName", sql.NVarChar, RoleName.trim())
      .query("INSERT INTO AccRole (RoleName) VALUES (@RoleName)");

    res.json({ success: true, message: "Thêm role thành công!" });
  } catch (err) {
    console.error("❌ Lỗi thêm role:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

module.exports = router;
