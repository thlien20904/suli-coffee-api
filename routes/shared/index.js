// routes/shared/index.js - Shared routes aggregator
const express = require("express");
const router = express.Router();

// Import shared routes
const categories = require("./categories");
const coupons = require("./coupons");

// Mount routes
router.use("/categories", categories);
router.use("/coupons", coupons);

module.exports = router;
