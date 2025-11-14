const express = require("express");
const router = express.Router();
const reportController = require("../../controllers/admin/reportController");

router.get("/revenue", reportController.getRevenue);
router.get("/banchay", reportController.getTopSellingFoods);

module.exports = router;
