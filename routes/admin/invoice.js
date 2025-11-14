const express = require("express");
const router = express.Router();
const invoiceController = require("../../controllers/admin/invoiceController");

/* =====================================================
   1️⃣ LẤY DANH SÁCH HÓA ĐƠN
===================================================== */
router.get("/", invoiceController.getInvoices);

/* =====================================================
   2️⃣ LẤY CHI TIẾT 1 HÓA ĐƠN
===================================================== */
router.get("/:id", invoiceController.getInvoiceById);

module.exports = router;
