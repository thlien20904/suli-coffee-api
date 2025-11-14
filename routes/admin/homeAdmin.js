const express = require("express");
const router = express.Router();
const homeAdminController = require("../../controllers/admin/homeAdminController");

/* =====================================================
   📊 DASHBOARD HOME ADMIN
===================================================== */
router.get("/", homeAdminController.getHome);

module.exports = router;
