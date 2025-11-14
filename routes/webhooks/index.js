const express = require("express");
const router = express.Router();
const ghnWebhookController = require("../../controllers/webhooks/ghnWebhookController");

/* =====================================================
   GHN WEBHOOK - Nhận thông báo khi đơn hàng thay đổi trạng thái
===================================================== */
router.post("/ghn", ghnWebhookController.handleGHNWebhook);

module.exports = router;
