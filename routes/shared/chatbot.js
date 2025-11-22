// chatbot.js - Routes cho chatbot API
const express = require("express");
const router = express.Router();
const chatbotController = require("../../controllers/chatbotController");

// POST /api/chatbot/message - Gửi tin nhắn
router.post("/message", chatbotController.sendMessage);

// GET /api/chatbot/suggestions - Lấy câu hỏi gợi ý
router.get("/suggestions", chatbotController.getSuggestedQuestions);

// POST /api/chatbot/reset - Reset cuộc hội thoại
router.post("/reset", chatbotController.resetChat);

// GET /api/chatbot/status - Kiểm tra trạng thái chatbot
router.get("/status", chatbotController.getStatus);

module.exports = router;
