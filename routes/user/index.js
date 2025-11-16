// routes/user/index.js - User routes aggregator
const express = require("express");
const router = express.Router();

// Import user routes
const address = require("./address");
const addressesUser = require("./addressesUser");
const auth = require("./auth");
const cartUser = require("./cartUser");
const homeUser = require("./homeUser");
const ordersUser = require("./ordersUser");
const password = require("./password");
const productsUser = require("./productsUser");
const profile = require("./profile");
const storesUser = require("./StoresUser");

// Mount routes
router.use("/address", address);
router.use("/addresses", addressesUser);
router.use("/auth", auth);
router.use("/cart", cartUser);
router.use("/home", homeUser);
router.use("/orders", ordersUser);
router.use("/password", password);
router.use("/products", productsUser);
router.use("/profile", profile);
router.use("/stores", storesUser);

module.exports = router;
