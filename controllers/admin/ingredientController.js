// backend/controllers/admin/ingredientController.js
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { Op } = require("sequelize");
const sequelize = require("../../config/sequelize");
const initModels = require("../../models/init-models");
const {
  uploadToSupabase,
  deleteFromSupabase,
  isSupabaseUrl,
} = require("../../services/supabaseService");

const models = initModels(sequelize);
const { Ingredient, Food, FoodIngredient } = models;

const HOST = "http://localhost:5000";

// ==================== MULTER UPLOAD ====================
// Use memory storage for Supabase upload
const storage = multer.memoryStorage();

exports.upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only allow image files
    if (file.mimetype.match(/^image\/(jpeg|jpg|png|gif|webp)$/)) {
      cb(null, true);
    } else {
      cb(
        new Error("Chỉ chấp nhận file ảnh (jpeg, jpg, png, gif, webp)!"),
        false
      );
    }
  },
});

// ==================== XỬ LÝ LỖI ====================
const handleControllerError = (err, res, uploadedFile = null) => {
  // Note: No need to delete file for memory storage
  console.error("❌ Lỗi Controller:", err);
  return res
    .status(500)
    .json({ success: false, message: "Đã xảy ra lỗi server." });
};

// ==================== FORMAT IMAGE URL ====================
const formatImageURL = (imgPath) => {
  if (!imgPath) return `${HOST}/images/no-image.png`;
  return imgPath.startsWith("http") ? imgPath : `${HOST}${imgPath}`;
};

// ==================== LẤY TẤT CẢ NGUYÊN LIỆU ====================
exports.getAllIngredients = async (req, res) => {
  try {
    const ingredients = await Ingredient.findAll({
      order: [["IngredientId", "DESC"]],
      include: [
        {
          model: Food,
          as: "Foods", // <-- PHẢI KHỚP VỚI HASMANY Food alias
          attributes: ["FoodName"],
        },
      ],
    });

    const data = ingredients.map((item) => {
      const plain = item.get({ plain: true });
      plain.Foods = plain.Foods?.map((f) => f.FoodName).join(", ") || "";
      plain.ImageURL = formatImageURL(plain.ImageURL);
      return plain;
    });

    res.json({ success: true, data });
  } catch (err) {
    handleControllerError(err, res);
  }
};

// ==================== LẤY NGUYÊN LIỆU THEO ID ====================
exports.getIngredientById = async (req, res) => {
  try {
    const ingredient = await Ingredient.findByPk(req.params.id, {
      include: [
        {
          model: Food,
          as: "Foods", // <-- PHẢI KHỚP
          attributes: ["FoodId", "FoodName"],
        },
      ],
    });

    if (!ingredient)
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy nguyên liệu." });

    const data = ingredient.get({ plain: true });
    const selectedFoods = data.Foods?.map((f) => f.FoodId) || [];
    data.ImageURL = formatImageURL(data.ImageURL);
    delete data.Foods;

    res.json({ success: true, ingredient: data, selectedFoods });
  } catch (err) {
    handleControllerError(err, res);
  }
};

// ==================== THÊM NGUYÊN LIỆU ====================
exports.addIngredient = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { IngredientName, SoLuong, PhanLoai, Foods } = req.body;
    if (!IngredientName || !SoLuong || SoLuong <= 0)
      return res
        .status(400)
        .json({ success: false, message: "Tên hoặc số lượng không hợp lệ." });

    const existing = await Ingredient.findOne({
      where: { IngredientName },
      transaction,
    });
    if (existing)
      return res
        .status(400)
        .json({ success: false, message: "Tên nguyên liệu đã tồn tại." });

    let imageUrl = "/images/no-image.png"; // Default fallback

    // Upload image to Supabase if provided
    if (req.file) {
      const uploadResult = await uploadToSupabase(
        req.file.buffer,
        req.file.originalname,
        "nguyenlieu" // folder name for ingredients
      );
      if (uploadResult.success) {
        imageUrl = uploadResult.url; // Full Supabase URL
      } else {
        await transaction.rollback();
        return res.status(500).json({
          success: false,
          message: `Lỗi upload ảnh: ${uploadResult.error}`,
        });
      }
    }

    const newIngredient = await Ingredient.create(
      {
        IngredientName,
        SoLuong,
        PhanLoai: PhanLoai || "Khác",
        ImageURL: imageUrl,
      },
      { transaction }
    );

    if (Foods) {
      const foodsArr = JSON.parse(Foods);
      if (Array.isArray(foodsArr) && foodsArr.length) {
        await Food.update(
          { IngredientId: newIngredient.IngredientId },
          { where: { FoodId: foodsArr }, transaction }
        );
      }
    }

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: "Thêm nguyên liệu thành công!",
      data: {
        ...newIngredient.get({ plain: true }),
        ImageURL: formatImageURL(imageUrl),
      },
    });
  } catch (err) {
    await transaction.rollback();
    handleControllerError(err, res, req.file);
  }
};

// ==================== CẬP NHẬT NGUYÊN LIỆU ====================
exports.editIngredient = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const ingredient = await Ingredient.findByPk(req.params.id, {
      transaction,
    });
    if (!ingredient)
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy nguyên liệu." });

    const { IngredientName, SoLuong, PhanLoai, Foods } = req.body;
    if (!IngredientName || !SoLuong || SoLuong <= 0)
      return res
        .status(400)
        .json({ success: false, message: "Tên hoặc số lượng không hợp lệ." });

    const existName = await Ingredient.findOne({
      where: { IngredientName, IngredientId: { [Op.ne]: req.params.id } },
      transaction,
    });
    if (existName)
      return res
        .status(400)
        .json({ success: false, message: "Tên nguyên liệu đã tồn tại." });

    const oldImage = ingredient.ImageURL;
    const updateData = {
      IngredientName,
      SoLuong,
      PhanLoai: PhanLoai || "Khác",
    };

    // Upload new image to Supabase if provided
    if (req.file) {
      const uploadResult = await uploadToSupabase(
        req.file.buffer,
        req.file.originalname,
        "nguyenlieu" // folder name for ingredients
      );
      if (uploadResult.success) {
        updateData.ImageURL = uploadResult.url; // Full Supabase URL
      } else {
        await transaction.rollback();
        return res.status(500).json({
          success: false,
          message: `Lỗi upload ảnh: ${uploadResult.error}`,
        });
      }
    }

    await ingredient.update(updateData, { transaction });

    if (Foods) {
      const foodsArr = JSON.parse(Foods);
      if (Array.isArray(foodsArr)) {
        // Cập nhật lại IngredientId của các món ăn
        await Food.update(
          { IngredientId: ingredient.IngredientId },
          { where: { FoodId: foodsArr }, transaction }
        );
      }
    }

    await transaction.commit();

    // Delete old image from Supabase if new image was uploaded and old image exists
    if (req.file && oldImage && oldImage !== "/images/no-image.png") {
      if (isSupabaseUrl(oldImage)) {
        // Delete from Supabase Storage
        await deleteFromSupabase(oldImage);
      } else {
        // Delete from local filesystem (for backward compatibility)
        const oldPath = path.join(__dirname, "../../public", oldImage);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
    }

    res.json({
      success: true,
      message: "Cập nhật nguyên liệu thành công!",
      data: {
        ...ingredient.get({ plain: true }),
        ImageURL: formatImageURL(updateData.ImageURL || oldImage),
      },
    });
  } catch (err) {
    await transaction.rollback();
    handleControllerError(err, res, req.file);
  }
};

// ==================== XÓA NGUYÊN LIỆU ====================
exports.deleteIngredient = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.body;
    const ingredient = await Ingredient.findByPk(id, {
      include: [{ model: Food, as: "Foods" }],
      transaction,
    });

    if (!ingredient)
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy nguyên liệu." });

    if (ingredient.Foods?.length > 0)
      return res.status(400).json({
        success: false,
        message: `Không thể xóa vì nguyên liệu đang được dùng trong ${ingredient.Foods.length} món ăn.`,
      });

    const imageToDelete = ingredient.ImageURL;
    await ingredient.destroy({ transaction });
    await transaction.commit();

    if (imageToDelete && imageToDelete !== "/images/no-image.png") {
      const imagePath = path.join(__dirname, "../../public", imageToDelete);
      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    }

    res.json({ success: true, message: "Xóa nguyên liệu thành công!" });
  } catch (err) {
    await transaction.rollback();
    handleControllerError(err, res);
  }
};
