const express = require("express");
const router = express.Router();
const reportController = require("../../controllers/admin/reportController");

router.get("/revenue", reportController.getRevenue);

module.exports = router;
