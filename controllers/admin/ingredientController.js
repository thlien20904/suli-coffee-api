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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search?.trim() || "";
    const sort = req.query.sort?.trim() || "";
    const offset = (page - 1) * limit;

    const where = search
      ? { IngredientName: { [Op.like]: `%${search}%` } }
      : {};
    const order =
      sort === "SoLuong asc"
        ? [["SoLuong", "ASC"]]
        : sort === "SoLuong desc"
        ? [["SoLuong", "DESC"]]
        : [["IngredientId", "DESC"]];

    const { count, rows } = await Ingredient.findAndCountAll({
      where,
      order,
      limit,
      offset,
      include: [
        {
          model: FoodIngredient,
          as: "FoodIngredients", // Alias cho Ingredient hasMany FoodIngredient
          include: [
            {
              model: Food,
              as: "Food", // Alias cho FoodIngredient belongsTo Food
              attributes: ["FoodName"],
            },
          ],
        },
      ],
      distinct: true,
    });

    const data = rows.map((item) => {
      const plain = item.get({ plain: true });
      plain.Foods =
        (plain.FoodIngredients || [])
          .map((fi) => fi.Food.FoodName)
          .join(", ") || "";
      plain.ImageURL = formatImageURL(plain.ImageURL);
      delete plain.FoodIngredients; // Clean up
      return plain;
    });

    res.json({
      success: true,
      data,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    });
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
          model: FoodIngredient,
          as: "FoodIngredients",
          include: [
            {
              model: Food,
              as: "Food",
              attributes: ["FoodId", "FoodName"],
            },
          ],
        },
      ],
    });

    if (!ingredient)
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy nguyên liệu." });

    const data = ingredient.get({ plain: true });
    data.ImageURL = formatImageURL(data.ImageURL);
    data.Foods = (data.FoodIngredients || []).map((fi) => ({
      FoodId: fi.Food.FoodId,
      FoodName: fi.Food.FoodName,
      Quantity: fi.Quantity || 1, // Giả sử có Quantity trong FoodIngredient
    }));
    delete data.FoodIngredients;

    res.json({ success: true, data });
  } catch (err) {
    handleControllerError(err, res);
  }
};

// ==================== THÊM NGUYÊN LIỆU ====================
exports.addIngredient = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { IngredientName, SoLuong, PhanLoai = "Khác" } = req.body;

    // Validate
    if (!IngredientName?.trim() || !SoLuong || SoLuong <= 0)
      return res
        .status(400)
        .json({
          success: false,
          message: "Tên nguyên liệu và số lượng phải hợp lệ (>0).",
        });

    const exist = await Ingredient.findOne({
      where: { IngredientName: IngredientName.trim() },
      transaction: t,
    });
    if (exist)
      return res
        .status(400)
        .json({ success: false, message: "Tên nguyên liệu đã tồn tại." });

    let imageUrl = `${HOST}/images/no-image.png`; // Default local fallback, but use Supabase no-image if possible

    // Upload image to Supabase if provided
    if (req.file) {
      const uploadResult = await uploadToSupabase(
        req.file.buffer,
        req.file.originalname,
        "nguyenlieu" // folder name for ingredients
      );

      if (uploadResult.success) {
        imageUrl = uploadResult.url;
        console.log("✅ Ingredient image uploaded to Supabase:", imageUrl);
      } else {
        console.error(
          "❌ Failed to upload ingredient image:",
          uploadResult.error
        );
        return res.status(500).json({
          success: false,
          message: "Lỗi upload ảnh: " + uploadResult.error,
        });
      }
    }

    const ingredient = await Ingredient.create(
      {
        IngredientName: IngredientName.trim(),
        SoLuong: parseInt(SoLuong),
        PhanLoai,
        ImageURL: imageUrl,
      },
      { transaction: t }
    );

    // Parse Foods (array FoodId) and create FoodIngredient
    let foodsArr = [];
    if (req.body.Foods) {
      try {
        foodsArr =
          typeof req.body.Foods === "string"
            ? JSON.parse(req.body.Foods)
            : req.body.Foods;
        if (!Array.isArray(foodsArr)) foodsArr = [];
      } catch {
        foodsArr = [];
      }
    }

    if (foodsArr.length)
      await FoodIngredient.bulkCreate(
        foodsArr.map((foodId) => ({
          IngredientId: ingredient.IngredientId,
          FoodId: foodId,
          Quantity: 1, // Default, có thể parse từ body nếu cần
        })),
        { transaction: t }
      );

    await t.commit();

    res.status(201).json({
      success: true,
      message: "Thêm nguyên liệu thành công!",
      data: {
        ...ingredient.get({ plain: true }),
        ImageURL: formatImageURL(imageUrl),
      },
    });
  } catch (err) {
    await t.rollback();
    handleControllerError(err, res);
  }
};

// ==================== CẬP NHẬT NGUYÊN LIỆU ====================
exports.editIngredient = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const ingredient = await Ingredient.findByPk(req.params.id, {
      transaction: t,
    });
    if (!ingredient)
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy nguyên liệu." });

    const { IngredientName, SoLuong, PhanLoai = "Khác", Foods } = req.body;

    // Validate
    if (!IngredientName?.trim() || !SoLuong || SoLuong <= 0)
      return res
        .status(400)
        .json({
          success: false,
          message: "Tên nguyên liệu và số lượng phải hợp lệ (>0).",
        });

    const exist = await Ingredient.findOne({
      where: {
        IngredientName: IngredientName.trim(),
        IngredientId: { [Op.ne]: req.params.id },
      },
      transaction: t,
    });
    if (exist)
      return res
        .status(400)
        .json({ success: false, message: "Tên nguyên liệu đã tồn tại." });

    const oldImage = ingredient.ImageURL;
    const updateData = {
      IngredientName: IngredientName.trim(),
      SoLuong: parseInt(SoLuong),
      PhanLoai,
    };

    // Upload new image to Supabase if provided
    if (req.file) {
      const uploadResult = await uploadToSupabase(
        req.file.buffer,
        req.file.originalname,
        "nguyenlieu"
      );

      if (uploadResult.success) {
        updateData.ImageURL = uploadResult.url;
        console.log(
          "✅ Ingredient image updated on Supabase:",
          uploadResult.url
        );

        // Delete old image from Supabase if not default
        if (
          oldImage &&
          isSupabaseUrl(oldImage) &&
          !oldImage.includes("no-image.png")
        ) {
          await deleteFromSupabase(oldImage);
          console.log("🗑️ Old ingredient image deleted from Supabase");
        }
      } else {
        console.error(
          "❌ Failed to upload ingredient image:",
          uploadResult.error
        );
        return res.status(500).json({
          success: false,
          message: "Lỗi upload ảnh: " + uploadResult.error,
        });
      }
    }

    await ingredient.update(updateData, { transaction: t });

    // Xóa FoodIngredient cũ
    await FoodIngredient.destroy({
      where: { IngredientId: ingredient.IngredientId },
      transaction: t,
    });

    // Parse Foods and bulkCreate new
    let foodsArr = [];
    if (Foods) {
      try {
        foodsArr = typeof Foods === "string" ? JSON.parse(Foods) : Foods;
        if (!Array.isArray(foodsArr)) foodsArr = [];
      } catch {
        foodsArr = [];
      }
    }

    if (foodsArr.length)
      await FoodIngredient.bulkCreate(
        foodsArr.map((foodId) => ({
          IngredientId: ingredient.IngredientId,
          FoodId: foodId,
          Quantity: 1,
        })),
        { transaction: t }
      );

    await t.commit();

    res.json({
      success: true,
      message: "Cập nhật nguyên liệu thành công!",
      data: {
        ...ingredient.get({ plain: true }),
        ImageURL: formatImageURL(updateData.ImageURL || oldImage),
      },
    });
  } catch (err) {
    await t.rollback();
    handleControllerError(err, res);
  }
};

// ==================== XÓA NGUYÊN LIỆU ====================
exports.deleteIngredient = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.body; // Giữ nguyên như food (body.id), nhưng nên unify sang params.id sau
    const ingredient = await Ingredient.findByPk(id, { transaction: t });
    if (!ingredient)
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy nguyên liệu." });

    // Check ràng buộc: Đếm số Food dùng nguyên liệu này qua FoodIngredient
    const foodCount = await FoodIngredient.count({
      where: { IngredientId: id },
      transaction: t,
    });
    if (foodCount > 0)
      return res.status(400).json({
        success: false,
        message: `Không thể xóa vì nguyên liệu đang được dùng trong ${foodCount} món ăn.`,
      });

    const imageToDelete = ingredient.ImageURL;
    await ingredient.destroy({ transaction: t });
    await t.commit();

    // Xóa ảnh: Unify với Supabase hoặc local
    if (imageToDelete && imageToDelete !== `${HOST}/images/no-image.png`) {
      if (isSupabaseUrl(imageToDelete)) {
        await deleteFromSupabase(imageToDelete);
        console.log("🗑️ Ingredient image deleted from Supabase");
      } else {
        // Local fallback
        const imagePath = path.join(
          __dirname,
          "../../public",
          imageToDelete.replace(HOST, "")
        );
        if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
      }
    }

    res.json({ success: true, message: "Xóa nguyên liệu thành công!" });
  } catch (err) {
    await t.rollback();
    handleControllerError(err, res);
  }
};
