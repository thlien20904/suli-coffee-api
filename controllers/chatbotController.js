// chatbotController.js - Controller xử lý chatbot requests
const chatbotService = require("../services/chatbotService");

// Gửi tin nhắn và nhận phản hồi từ chatbot
const sendMessage = async (req, res) => {
  try {
    const { message, conversationHistory } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "Tin nhắn không được để trống",
      });
    }

    // Giới hạn độ dài tin nhắn
    if (message.length > 1000) {
      return res.status(400).json({
        success: false,
        error: "Tin nhắn quá dài. Vui lòng giới hạn dưới 1000 ký tự",
      });
    }

    // Gọi service để xử lý
    const response = await chatbotService.sendMessage(
      message,
      conversationHistory || []
    );

    return res.json(response);
  } catch (error) {
    console.error("❌ Lỗi trong chatbotController.sendMessage:", error);
    return res.status(500).json({
      success: false,
      error: "Đã xảy ra lỗi khi xử lý tin nhắn. Vui lòng thử lại sau.",
    });
  }
};

// Lấy các câu hỏi gợi ý
const getSuggestedQuestions = (req, res) => {
  try {
    const questions = chatbotService.getSuggestedQuestions();
    return res.json({
      success: true,
      questions,
    });
  } catch (error) {
    console.error("❌ Lỗi trong chatbotController.getSuggestedQuestions:", error);
    return res.status(500).json({
      success: false,
      error: "Không thể lấy câu hỏi gợi ý",
    });
  }
};

// Reset cuộc hội thoại
const resetChat = (req, res) => {
  try {
    const result = chatbotService.resetChat();
    return res.json(result);
  } catch (error) {
    console.error("❌ Lỗi trong chatbotController.resetChat:", error);
    return res.status(500).json({
      success: false,
      error: "Không thể reset cuộc hội thoại",
    });
  }
};

// Kiểm tra trạng thái chatbot
const getStatus = (req, res) => {
  try {
    const isConfigured = !!process.env.GEMINI_API_KEY;
    return res.json({
      success: true,
      status: isConfigured ? "active" : "not_configured",
      message: isConfigured
        ? "Chatbot đang hoạt động"
        : "Chatbot chưa được cấu hình GEMINI_API_KEY",
    });
  } catch (error) {
    console.error("❌ Lỗi trong chatbotController.getStatus:", error);
    return res.status(500).json({
      success: false,
      error: "Không thể kiểm tra trạng thái chatbot",
    });
  }
};

module.exports = {
  sendMessage,
  getSuggestedQuestions,
  resetChat,
  getStatus,
};
