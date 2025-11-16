// routes/admin/export.js
const express = require("express");
const router = express.Router();
const { poolPromise } = require("../../config/db");
const ExcelJS = require("exceljs");

// ================== EXPORT NGUYÊN LIỆU RA EXCEL ==================
router.get("/", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT IngredientId, IngredientName, SoLuong, PhanLoai, ImageURL, LastUpdated
      FROM Ingredient
      ORDER BY IngredientId ASC
    `);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Nguyên liệu");

    // Header
    worksheet.columns = [
      { header: "ID", key: "IngredientId", width: 10 },
      { header: "Tên nguyên liệu", key: "IngredientName", width: 30 },
      { header: "Số lượng", key: "SoLuong", width: 15 },
      { header: "Phân loại", key: "PhanLoai", width: 20 },
      { header: "Hình ảnh", key: "ImageURL", width: 40 },
      { header: "Ngày cập nhật", key: "LastUpdated", width: 20 },
    ];

    // Thêm dữ liệu
    result.recordset.forEach((item) => {
      worksheet.addRow({
        ...item,
        LastUpdated: item.LastUpdated
          ? new Date(item.LastUpdated).toLocaleDateString("vi-VN")
          : "",
      });
    });

    // Style header
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF000000" },
      };
      cell.alignment = { horizontal: "center" };
    });

    // Xuất file
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=NguyenLieu.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("❌ Lỗi export:", err);
    res.status(500).json({ success: false, message: "Không thể export Excel" });
  }
});

module.exports = router;
