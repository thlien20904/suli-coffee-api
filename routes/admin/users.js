const express = require("express");
const router = express.Router();
const usersController = require("../../controllers/admin/usersController");

// =========================
// 📌 LẤY DANH SÁCH USERS
// =========================
router.get("/", usersController.getAllUsers);

// =========================
// 📌 LẤY USER THEO ID
// =========================
router.get("/:id", usersController.getUserById);

// =========================
// 📌 CẤM USER
// =========================
router.patch("/:id/ban", usersController.banUser);

// =========================
// 📌 BỎ CẤM USER
// =========================
router.patch("/:id/unban", usersController.unbanUser);

module.exports = router;
