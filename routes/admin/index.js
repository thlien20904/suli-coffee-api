// routes/admin/index.js - Admin routes aggregator
const express = require("express");
const router = express.Router();

// Import admin routes
const authAdmin = require("./authAdmin");
const category = require("./category");
const food = require("./Food");
const homeAdmin = require("./homeAdmin");
const ingredient = require("./ingredient");
const invoice = require("./invoice");
const order = require("./order");
const payment = require("./payment");
const report = require("./report");
const staff = require("./staff");
const users = require("./users");
const voucher = require("./voucher");
const exportRoutes = require("./export");

// Mount routes
router.use("/auth", authAdmin);
router.use("/categories", category);
router.use("/foods", food);
router.use("/home", homeAdmin);
router.use("/ingredients", ingredient);
router.use("/invoices", invoice);
router.use("/orders", order);
router.use("/payments", payment);
router.use("/reports", report);
router.use("/staff", staff);
router.use("/users", users);
router.use("/voucher", voucher);
router.use("/export", exportRoutes);

module.exports = router;
