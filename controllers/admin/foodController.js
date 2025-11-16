// controllers/admin/foodController.js
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
const { Food, Category, FoodIngredient, Ingredient, GioHang, OrderDetails } =
  models;

const HOST = process.env.API_URL || "http://localhost:5000";

// ------------------- MULTER UPLOAD (Memory Storage for Supabase) -------------------
const storage = multer.memoryStorage();
exports.upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"));
    }
  },
});

// ------------------- ERROR HANDLER -------------------
const handleError = (err, res, file) => {
  if (file && file.path) fs.unlinkSync(file.path);
  console.error("❌ Lỗi Controller:", err);
  return res.status(500).json({ success: false, message: "Server error." });
};

// ------------------- FORMAT IMAGE URL -------------------
const formatImage = (img) =>
  !img
    ? `${HOST}/images/no-image.png`
    : img.startsWith("http")
    ? img
    : `${HOST}${img}`;

// ------------------- GET ALL FOODS -------------------
exports.getAllFoods = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search?.trim() || "";
    const sort = req.query.sort?.trim() || "";
    const offset = (page - 1) * limit;

    const where = search ? { FoodName: { [Op.like]: `%${search}%` } } : {};
    const order =
      sort === "Price asc"
        ? [["Price", "ASC"]]
        : sort === "Price desc"
        ? [["Price", "DESC"]]
        : [["FoodId", "DESC"]];

    const { count, rows } = await Food.findAndCountAll({
      where,
      order,
      limit,
      offset,
      include: [
        { model: Category, as: "Category", attributes: ["CategoryName"] },
        {
          model: FoodIngredient,
          as: "FoodIngredients",
          include: [
            {
              model: Ingredient,
              as: "Ingredient",
              attributes: ["IngredientName"],
            },
          ],
        },
      ],
      distinct: true,
    });

    const data = rows.map((f) => {
      const plain = f.get({ plain: true });
      return {
        ...plain,
        ImageURL: formatImage(plain.ImageURL),
        Ingredients: (plain.FoodIngredients || []).map(
          (fi) => fi.Ingredient.IngredientName
        ),
      };
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
    handleError(err, res);
  }
};

// ------------------- GET FOOD BY ID -------------------
exports.getFoodById = async (req, res) => {
  try {
    const food = await Food.findByPk(req.params.id, {
      include: [
        {
          model: FoodIngredient,
          as: "FoodIngredients",
          include: [
            {
              model: Ingredient,
              as: "Ingredient",
              attributes: ["IngredientName"],
            },
          ],
        },
        { model: Category, as: "Category", attributes: ["CategoryName"] },
      ],
    });
    if (!food)
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy món ăn." });

    const data = food.get({ plain: true });
    data.ImageURL = formatImage(data.ImageURL);
    data.Ingredients = (data.FoodIngredients || []).map((fi) => ({
      IngredientId: fi.IngredientId,
      IngredientName: fi.Ingredient.IngredientName,
      Quantity: fi.Quantity,
    }));
    delete data.FoodIngredients;

    res.json({ success: true, data });
  } catch (err) {
    handleError(err, res);
  }
};

// ------------------- ADD FOOD -------------------
exports.addFood = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const {
      FoodName,
      Price,
      Discount = 0,
      CategoryId,
      Ingredients,
      Stock,
      Description,
      Status = true,
    } = req.body;

    if (!FoodName || !Price)
      return res.status(400).json({
        success: false,
        message: "Tên món ăn và giá không được để trống.",
      });

    const exist = await Food.findOne({ where: { FoodName }, transaction: t });
    if (exist)
      return res
        .status(400)
        .json({ success: false, message: "Tên món ăn đã tồn tại." });

    let imageUrl =
      "https://vhkvfmbmmsolqiwrjlxp.supabase.co/storage/v1/object/public/images/no-image.png";

    // Upload image to Supabase if provided
    if (req.file) {
      const uploadResult = await uploadToSupabase(
        req.file.buffer,
        req.file.originalname,
        "Cafe" // folder name
      );

      if (uploadResult.success) {
        imageUrl = uploadResult.url;
        console.log("✅ Food image uploaded to Supabase:", imageUrl);
      } else {
        console.error("❌ Failed to upload food image:", uploadResult.error);
        return res.status(500).json({
          success: false,
          message: "Lỗi upload ảnh: " + uploadResult.error,
        });
      }
    }

    const food = await Food.create(
      {
        FoodName,
        Price,
        Discount,
        CategoryId,
        Stock,
        Description,
        Status: Status === "true" || Status === true,
        ImageURL: imageUrl,
      },
      { transaction: t }
    );

    // ------------------- Parse Ingredients -------------------
    let ingArr = [];
    if (Ingredients) {
      try {
        ingArr =
          typeof Ingredients === "string"
            ? JSON.parse(Ingredients)
            : Ingredients;
        if (!Array.isArray(ingArr)) ingArr = [];
      } catch {
        ingArr = [];
      }
    }

    if (ingArr.length)
      await FoodIngredient.bulkCreate(
        ingArr.map((id) => ({
          FoodId: food.FoodId,
          IngredientId: id,
          Quantity: 1,
        })),
        { transaction: t }
      );

    await t.commit();

    res.status(201).json({
      success: true,
      message: "Thêm món ăn thành công!",
      data: {
        ...food.get({ plain: true }),
        ImageURL: formatImage(imageUrl),
      },
    });
  } catch (err) {
    await t.rollback();
    if (req.file) fs.unlinkSync(req.file.path);
    handleError(err, res);
  }
};

// ==================== EDIT FOOD ====================
exports.editFood = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const food = await Food.findByPk(req.params.id, { transaction: t });
    if (!food)
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy món ăn." });

    const {
      FoodName,
      Price,
      Discount = 0,
      CategoryId,
      Ingredients,
      Stock,
      Description,
      Status = true,
    } = req.body;

    if (!FoodName || !Price)
      return res
        .status(400)
        .json({ success: false, message: "Tên món ăn và giá không hợp lệ." });

    const exist = await Food.findOne({
      where: { FoodName, FoodId: { [Op.ne]: req.params.id } },
      transaction: t,
    });

    if (exist)
      return res
        .status(400)
        .json({ success: false, message: "Tên món ăn đã tồn tại." });

    const oldImage = food.ImageURL;
    const updateData = {
      FoodName,
      Price,
      Discount,
      CategoryId,
      Stock,
      Description,
      Status: Status === "true" || Status === true,
    };

    // Upload new image to Supabase if provided
    if (req.file) {
      const uploadResult = await uploadToSupabase(
        req.file.buffer,
        req.file.originalname,
        "Cafe"
      );

      if (uploadResult.success) {
        updateData.ImageURL = uploadResult.url;
        console.log("✅ Food image updated on Supabase:", uploadResult.url);

        // Delete old image từ Supabase nếu không phải default image
        if (
          oldImage &&
          isSupabaseUrl(oldImage) &&
          !oldImage.includes("no-image.png")
        ) {
          await deleteFromSupabase(oldImage);
          console.log("🗑️ Old food image deleted from Supabase");
        }
      } else {
        console.error("❌ Failed to upload food image:", uploadResult.error);
        return res.status(500).json({
          success: false,
          message: "Lỗi upload ảnh: " + uploadResult.error,
        });
      }
    }

    await food.update(updateData, { transaction: t });

    // Xóa nguyên liệu cũ
    await FoodIngredient.destroy({
      where: { FoodId: food.FoodId },
      transaction: t,
    });

    // ------------------- Parse Ingredients -------------------
    let ingArr = [];
    if (Ingredients) {
      try {
        ingArr =
          typeof Ingredients === "string"
            ? JSON.parse(Ingredients)
            : Ingredients;
        if (!Array.isArray(ingArr)) ingArr = [];
      } catch {
        ingArr = [];
      }
    }

    if (ingArr.length)
      await FoodIngredient.bulkCreate(
        ingArr.map((id) => ({
          FoodId: food.FoodId,
          IngredientId: id,
          Quantity: 1,
        })),
        { transaction: t }
      );

    await t.commit();

    res.json({
      success: true,
      message: "Cập nhật món ăn thành công!",
      data: {
        ...food.get({ plain: true }),
        ImageURL: formatImage(updateData.ImageURL || oldImage),
      },
    });
  } catch (err) {
    await t.rollback();
    if (req.file) fs.unlinkSync(req.file.path);
    handleError(err, res);
  }
};

// ------------------- DELETE FOOD -------------------
exports.deleteFood = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.body;
    const food = await Food.findByPk(id, { transaction: t });
    if (!food)
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy món ăn." });

    const orderCount = await OrderDetails.count({
      where: { FoodId: id },
      transaction: t,
    });
    if (orderCount > 0)
      return res.status(400).json({
        success: false,
        message: `Không thể xóa vì món ăn đang có trong ${orderCount} đơn hàng.`,
      });

    const cartCount = await GioHang.count({
      where: { FoodId: id },
      transaction: t,
    });
    if (cartCount > 0)
      return res.status(400).json({
        success: false,
        message: "Không thể xóa vì món ăn đang có trong giỏ hàng.",
      });

    const imageToDelete = food.ImageURL;
    await FoodIngredient.destroy({ where: { FoodId: id }, transaction: t });
    await food.destroy({ transaction: t });

    await t.commit();

    if (imageToDelete && imageToDelete !== "/images/no-image.png") {
      const imagePath = path.join(__dirname, "../../public", imageToDelete);
      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    }

    res.json({ success: true, message: "Xóa món ăn thành công!" });
  } catch (err) {
    await t.rollback();
    handleError(err, res);
  }
};
