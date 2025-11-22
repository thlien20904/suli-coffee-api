// chatbotService.js - Google Gemini Chatbot Service for SuLi Coffee
const axios = require("axios");

class ChatbotService {
  constructor() {
    this.apiKey = null;
    this.apiEndpoint = null;
    this.models = null;
    this.initializeGemini();
  }

  // Lazy load models để tránh circular dependency
  getModels() {
    if (!this.models) {
      const initModels = require("../models/init-models");
      const { sequelize } = require("../config/sequelize");
      this.models = initModels(sequelize);
    }
    return this.models;
  }

  initializeGemini() {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        console.warn("⚠️ GEMINI_API_KEY không được cấu hình trong .env");
        return;
      }

      this.apiKey = apiKey;
      // Sử dụng REST API v1 với gemini-2.5-flash (model mới nhất, miễn phí)
      // Model này hỗ trợ 1M tokens input, 65K output, có thinking capability
      this.apiEndpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

      console.log("✅ Google Gemini AI đã được khởi tạo thành công (REST API v1, model: gemini-2.5-flash)");
    } catch (error) {
      console.error("❌ Lỗi khởi tạo Gemini AI:", error.message);
    }
  }

  // Lấy thông tin từ database
  async getDatabaseInfo() {
    try {
      const models = this.getModels();
      
      // Đếm số cơ sở
      const storeCount = await models.CuaHang.count();
      
      // Lấy danh sách cơ sở (giới hạn 5 để không quá dài)
      const stores = await models.CuaHang.findAll({
        attributes: ['CuaHangName', 'Address', 'Province', 'District', 'Phone'],
        limit: 5
      });
      
      // Đếm số món ăn theo category
      const { sequelize } = require("../config/sequelize");
      const categories = await models.Category.findAll({
        attributes: [
          'CategoryName',
          [sequelize.fn('COUNT', sequelize.col('Foods.FoodId')), 'FoodCount']
        ],
        include: [{
          model: models.Food,
          as: 'Foods',
          attributes: [],
          required: false
        }],
        group: ['Category.CategoryId', 'Category.CategoryName'],
        raw: true
      });
      
      // Lấy top 10 món phổ biến
      const popularFoods = await models.Food.findAll({
        attributes: ['FoodName', 'Price', 'DiscountPrice'],
        include: [{
          model: models.Category,
          as: 'Category',
          attributes: ['CategoryName']
        }],
        limit: 10,
        order: [['FoodId', 'ASC']]
      });
      
      return {
        storeCount,
        stores,
        categories,
        popularFoods
      };
    } catch (error) {
      console.error("❌ Lỗi khi lấy thông tin database:", error.message);
      return null;
    }
  }

  // Context về quán cafe SuLi
  getSystemPrompt(dbInfo = null) {
    let storeInfo = '- Hệ thống: SuLi Coffee có 30 cơ sở trên toàn quốc';
    let menuInfo = '';
    let categoryInfo = '';
    
    if (dbInfo) {
      storeInfo = `- Hệ thống: SuLi Coffee hiện có **${dbInfo.storeCount} cơ sở** trên toàn quốc`;
      
      if (dbInfo.stores && dbInfo.stores.length > 0) {
        storeInfo += '\n\nMỘT SỐ CƠ SỞ TIÊU BIỂU:\n';
        dbInfo.stores.forEach((store, idx) => {
          storeInfo += `${idx + 1}. **${store.CuaHangName}**: ${store.Address}, ${store.District}, ${store.Province} - SĐT: ${store.Phone}\n`;
        });
      }
      
      if (dbInfo.categories && dbInfo.categories.length > 0) {
        categoryInfo = '\n\nDANH MỤC MENU:\n';
        dbInfo.categories.forEach(cat => {
          categoryInfo += `- ${cat.CategoryName}: ${cat.FoodCount} món\n`;
        });
      }
      
      if (dbInfo.popularFoods && dbInfo.popularFoods.length > 0) {
        menuInfo = '\n\nMỘT SỐ MÓN PHỔ BIẾN:\n';
        dbInfo.popularFoods.forEach((food, idx) => {
          const price = food.DiscountPrice || food.Price;
          const categoryName = food.Category?.CategoryName || 'Khác';
          menuInfo += `${idx + 1}. **${food.FoodName}** (${categoryName}) - ${Number(price).toLocaleString('vi-VN')}đ\n`;
        });
      }
    }
    
    return `Bạn là trợ lý ảo thông minh của quán cafe SuLi Coffee, một quán cafe hiện đại và ấm cúng.

THÔNG TIN VỀ QUÁN:
- Tên: SuLi Coffee
${storeInfo}
- Loại hình: Quán cafe hiện đại, phục vụ cả đồ uống và đồ ăn nhẹ
- Đặc sản: Cà phê Việt Nam, trà sữa, bánh ngọt và các món ăn nhẹ
- Phương thức phục vụ: Tại quán, mang đi, và giao hàng tận nơi
- Thanh toán: Tiền mặt, chuyển khoản, VNPay, MoMo${categoryInfo}${menuInfo}
- Giờ mở cửa: 7:00 - 22:00 hàng ngày

DANH MỤC SẢN PHẨM:
1. Đồ uống nóng: Cà phê đen, cà phê sữa, cappuccino, latte, trà nóng
2. Đồ uống lạnh: Cà phê đá, trà sữa, sinh tố, nước ép
3. Đồ ăn nhẹ: Bánh ngọt, bánh mì, sandwich, salad
4. Topping: Trân châu, thạch, pudding, kem cheese

TÍNH NĂNG HỆ THỐNG:
- Đặt hàng online qua website
- Giao hàng tận nơi
- Tích điểm và sử dụng voucher
- Đặt bàn trước
- Thanh toán online

CÁCH TRẢ LỜI:
- Thân thiện, nhiệt tình và chuyên nghiệp
- Trả lời bằng tiếng Việt
- Đưa ra gợi ý cụ thể khi khách hàng phân vân
- Nếu không rõ thông tin, hãy lịch sự đề nghị khách hàng liên hệ trực tiếp
- Luôn kết thúc bằng câu hỏi hoặc lời mời chào để tương tác tiếp

NHIỆM VỤ CỦA BẠN:
- Tư vấn menu và đồ uống
- Hướng dẫn đặt hàng và thanh toán
- Giải đáp thắc mắc về chính sách giao hàng
- Giới thiệu chương trình khuyến mãi
- Hỗ trợ khách hàng với thái độ nhiệt tình`;
  }

  // Xử lý tin nhắn từ khách hàng
  async sendMessage(userMessage, conversationHistory = []) {
    try {
      if (!this.apiKey || !this.apiEndpoint) {
        return {
          success: false,
          message: "Chatbot chưa được cấu hình đúng. Vui lòng liên hệ quản trị viên.",
        };
      }

      // Lấy thông tin từ database
      const dbInfo = await this.getDatabaseInfo();

      // Tạo context từ lịch sử hội thoại với thông tin database
      let fullPrompt = this.getSystemPrompt(dbInfo) + "\n\n";
      
      // Thêm lịch sử hội thoại nếu có
      if (conversationHistory && conversationHistory.length > 0) {
        fullPrompt += "LỊCH SỬ HỘI THOẠI:\n";
        conversationHistory.forEach((msg) => {
          fullPrompt += `${msg.role === "user" ? "Khách hàng" : "Trợ lý"}: ${msg.content}\n`;
        });
        fullPrompt += "\n";
      }

      // Thêm câu hỏi mới
      fullPrompt += `Khách hàng hỏi: ${userMessage}\n\nTrả lời:`;

      // Gọi Gemini REST API v1 bằng axios
      const response = await axios.post(this.apiEndpoint, {
        contents: [{
          parts: [{
            text: fullPrompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        }
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      const botReply = response.data.candidates[0].content.parts[0].text;

      return {
        success: true,
        message: botReply,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("❌ Lỗi khi gọi Gemini API:", error.response?.data || error.message);
      
      if (error.message?.includes("API key")) {
        return {
          success: false,
          message: "Lỗi xác thực API. Vui lòng kiểm tra cấu hình GEMINI_API_KEY.",
        };
      }

      return {
        success: false,
        message: "Xin lỗi, tôi đang gặp sự cố kỹ thuật. Vui lòng thử lại sau hoặc liên hệ trực tiếp với chúng tôi.",
      };
    }
  }

  // Lấy các câu hỏi gợi ý
  getSuggestedQuestions() {
    return [
      "Menu đồ uống của quán có gì?",
      "Giá cà phê sữa đá bao nhiêu?",
      "Quán có giao hàng không?",
      "Làm thế nào để đặt hàng online?",
      "Có chương trình khuyến mãi nào không?",
      "Quán mở cửa lúc mấy giờ?",
      "Thanh toán bằng cách nào?",
      "Có thể đặt bàn trước được không?",
    ];
  }

  // Reset chat session
  resetChat() {
    this.chat = null;
    return { success: true, message: "Đã reset cuộc hội thoại" };
  }
}

// Export singleton instance
module.exports = new ChatbotService();
