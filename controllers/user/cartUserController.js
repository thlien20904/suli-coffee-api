const sequelize = require("../../config/sequelize");
const initModels = require("../../models/init-models");
const models = initModels(sequelize);
const { Op } = require("sequelize");
const jwt = require("jsonwebtoken");

const { GioHang, GioHang_Topping, Food, Size, Topping, Users } = models;

// =========================
// IMAGE URL FORMATTING
// =========================
const HOST = process.env.API_URL || "http://localhost:5000";
const formatImage = (img) =>
  !img
    ? `${HOST}/images/no-image.png`
    : img.startsWith("http")
    ? img
    : `${HOST}${img}`;

// =========================
// MIDDLEWARE XÁC THỰC JWT
// =========================
// Flexible authentication middleware: if a Bearer token is provided it will be verified;
// if no token is present the middleware will attempt to read a numeric userId from
// req.body.userId or req.query.userId and set req.user = { id: <userId> } for testing.
// The middleware never returns 401/403 itself so controllers can decide how to handle
// missing user information (this keeps behavior compatible with local testing).
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.split(" ")[1];

  if (!token) {
    // No token: allow through and set req.user if userId passed in body/query
    const uid = parseInt(req.body?.userId || req.query?.userId, 10);
    if (uid && Number.isInteger(uid)) {
      req.user = { id: uid };
    }
    return next();
  }

  jwt.verify(
    token,
    process.env.JWT_SECRET || "dev_secret_fallback",
    (err, user) => {
      if (err) {
        // Invalid token: don't block request here; controllers will handle absence of req.user
        console.warn("Invalid JWT provided to authenticateToken:", err.message);
        return next();
      }
      req.user = user;
      next();
    }
  );
};

// Middleware: optional authentication — accept request with Bearer token OR with userId in body/query
const authenticateTokenOptional = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.split(" ")[1];

  if (token) {
    return jwt.verify(
      token,
      process.env.JWT_SECRET || "dev_secret_fallback",
      (err, user) => {
        if (err)
          return res
            .status(403)
            .json({ success: false, message: "Token không hợp lệ!" });
        req.user = user;
        next();
      }
    );
  }

  // No token: try to read userId from body/query
  const uid = parseInt(req.body?.userId || req.query?.userId, 10);
  if (uid && Number.isInteger(uid)) {
    req.user = { id: uid };
    return next();
  }

  return res
    .status(401)
    .json({ success: false, message: "Bạn chưa đăng nhập!" });
};

// =========================
// HELPER: SO SÁNH MẢNG TOPPING
// =========================
const equalArrayNumbers = (a = [], b = []) => {
  const aa = a.map(Number).sort((x, y) => x - y);
  const bb = b.map(Number).sort((x, y) => x - y);
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return false;
  return true;
};

// =========================
// HELPER: ĐỊNH DẠNG ITEM GIỎ HÀNG
// =========================
const formatCartItem = (item) => ({
  GioHangID: item.GioHangID,
  SoLuong: item.SoLuong,
  TotalPrice: parseFloat(item.TotalPrice),
  FoodId: item.Food.FoodId,
  FoodName: item.Food.FoodName,
  Price: parseFloat(item.Food.Price),
  DiscountPrice: item.Food.DiscountPrice
    ? parseFloat(item.Food.DiscountPrice)
    : null,
  ImageURL: formatImage(item.Food.ImageURL),
  // Return Size as nested object to match frontend shape used in Checkout.js
  Size: item.Size
    ? {
        SizeID: item.Size.SizeID,
        SizeName: item.Size.SizeName,
        ExtraPrice: item.Size.ExtraPrice ? parseFloat(item.Size.ExtraPrice) : 0,
      }
    : null,
  // Toppings array normalized to match frontend expected shape
  Toppings:
    item.GioHang_Toppings?.map((gt) => ({
      ToppingID: gt.Topping.ToppingID,
      ToppingName: gt.Topping.ToppingName,
      ToppingPrice: parseFloat(gt.Topping.ToppingPrice),
    })) || [],
});

// =========================
// THÊM SẢN PHẨM VÀO GIỎ HÀNG
// =========================
exports.addToCart = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    console.log("ADD TO CART REQ BODY:", req.body);
    const foodId = parseInt(req.body.productId ?? req.body.foodId, 10);
    const soLuong = parseInt(req.body.quantity ?? req.body.soLuong, 10);
    let sizeId = req.body.sizeId ?? req.body.SizeId ?? null;
    // Support multiple formats from frontend: array of ids or comma-separated string
    let toppingIds = [];
    if (Array.isArray(req.body.toppingIds)) {
      toppingIds = req.body.toppingIds.map(Number);
    } else if (
      typeof req.body.toppingIds === "string" &&
      req.body.toppingIds.trim() !== ""
    ) {
      toppingIds = req.body.toppingIds.split(",").map((s) => Number(s.trim()));
    }

    if (!foodId || !soLuong || soLuong <= 0) {
      return res.status(400).json({
        success: false,
        message: "Thiếu hoặc sai thông tin sản phẩm / số lượng",
      });
    }

    sizeId = sizeId === 0 ? null : parseInt(sizeId, 10) || null;
    // Support optional userId provided in body/query for local testing when token is absent
    const userId =
      req.user?.id || parseInt(req.body.userId || req.query.userId, 10);
    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "Thiếu userId (hoặc token)" });
    }

    // 1. Lấy food
    const food = await Food.findByPk(foodId, {
      attributes: ["FoodId", "Price", "DiscountPrice", "Stock"],
      transaction: t,
    });
    if (!food) {
      return res
        .status(404)
        .json({ success: false, message: "Sản phẩm không tồn tại" });
    }

    if (food.Stock !== null && food.Stock < soLuong) {
      return res
        .status(400)
        .json({ success: false, message: "Số lượng vượt quá tồn kho" });
    }

    const basePrice =
      food.DiscountPrice && food.DiscountPrice > 0
        ? food.DiscountPrice
        : food.Price;

    // 2. Lấy size
    let sizePrice = 0;
    if (sizeId) {
      const size = await Size.findByPk(sizeId, { transaction: t });
      if (!size) {
        return res
          .status(400)
          .json({ success: false, message: "Size không hợp lệ" });
      }
      sizePrice = Number(size.ExtraPrice || 0);
    }

    // 3. Tổng topping
    let toppingTotal = 0;
    const safeToppingIds = toppingIds.filter((x) => Number.isInteger(x));
    console.log("SAFE TOPPING IDS:", safeToppingIds);
    if (safeToppingIds.length > 0) {
      const toppings = await Topping.findAll({
        where: { ToppingID: safeToppingIds },
        attributes: ["ToppingPrice"],
        transaction: t,
      });
      toppingTotal = toppings.reduce(
        (sum, t) => sum + Number(t.ToppingPrice || 0),
        0
      );
    }

    const itemTotalPrice = (basePrice + sizePrice + toppingTotal) * soLuong;

    // 4. Tìm giỏ trùng
    const existingCarts = await GioHang.findAll({
      where: {
        Id: userId,
        FoodId: foodId,
        SizeID: sizeId ?? null,
      },
      include: [
        {
          model: GioHang_Topping,
          as: "GioHang_Toppings",
          attributes: ["ToppingID"],
        },
      ],
      transaction: t,
    });

    let matchedCart = null;
    for (const cart of existingCarts) {
      const existingIds = cart.GioHang_Toppings.map((t) => t.ToppingID);
      if (equalArrayNumbers(existingIds, safeToppingIds)) {
        matchedCart = cart;
        break;
      }
    }

    let newCart = null;
    if (matchedCart) {
      await matchedCart.update(
        {
          SoLuong: matchedCart.SoLuong + soLuong,
          TotalPrice: Number(matchedCart.TotalPrice) + itemTotalPrice,
        },
        { transaction: t }
      );
    } else {
      newCart = await GioHang.create(
        {
          Id: userId,
          FoodId: foodId,
          SoLuong: soLuong,
          SizeID: sizeId,
          TotalPrice: itemTotalPrice,
        },
        { transaction: t }
      );

      if (safeToppingIds.length > 0) {
        const records = safeToppingIds.map((tid) => ({
          GioHangID: newCart.GioHangID,
          ToppingID: tid,
        }));
        const created = await GioHang_Topping.bulkCreate(records, {
          transaction: t,
        });
        // created is an array of instances on success; log count for diagnostics
        console.log(
          "CREATED GIOHANG_TOPPING RECORDS:",
          Array.isArray(created) ? created.length : created
        );
        // Also verify rows exist (within same transaction)
        try {
          const verify = await GioHang_Topping.findAll({
            where: { GioHangID: newCart.GioHangID },
            transaction: t,
          });
          console.log(
            `VERIFY GIOHANG_TOPPING rows for GioHangID=${newCart.GioHangID}:`,
            verify.length
          );
        } catch (vErr) {
          console.warn(
            "VERIFY GIOHANG_TOPPING FAILED:",
            vErr && vErr.message ? vErr.message : vErr
          );
        }
      }
    }

    await t.commit();
    // Fetch the cart item that was added/updated to return to client for verification
    const cartId =
      (matchedCart && matchedCart.GioHangID) ||
      (typeof newCart !== "undefined" && newCart.GioHangID) ||
      null;
    let returnedItem = null;
    if (cartId) {
      const found = await GioHang.findByPk(cartId, {
        include: [
          {
            model: Food,
            as: "Food",
            attributes: [
              "FoodId",
              "FoodName",
              "Price",
              "DiscountPrice",
              "ImageURL",
            ],
          },
          {
            model: Size,
            as: "Size",
            attributes: ["SizeID", "SizeName", "ExtraPrice"],
          },
          {
            model: GioHang_Topping,
            as: "GioHang_Toppings",
            include: [
              {
                model: Topping,
                as: "Topping",
                attributes: ["ToppingID", "ToppingName", "ToppingPrice"],
              },
            ],
          },
        ],
      });
      if (found) returnedItem = formatCartItem(found);
    }

    const totalQty = await GioHang.sum("SoLuong", { where: { Id: userId } });
    const cartCount = totalQty ?? 0;

    res.json({
      success: true,
      message: "Đã thêm vào giỏ hàng!",
      cartCount,
      item: returnedItem,
    });
  } catch (err) {
    try {
      if (t && typeof t.rollback === "function" && !t.finished)
        await t.rollback();
    } catch (rbErr) {
      console.warn("Rollback skipped or failed:", rbErr && rbErr.message);
    }
    console.error("ADD TO CART ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi thêm vào giỏ!",
      detail: err.message,
    });
  }
};

// =========================
// LẤY GIỎ HÀNG
// =========================
exports.getCart = async (req, res) => {
  try {
    const userId = req.user?.id || parseInt(req.query.userId, 10);
    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "Thiếu userId (hoặc token)" });
    }

    const items = await GioHang.findAll({
      where: { Id: userId },
      attributes: ["GioHangID", "SoLuong", "TotalPrice"],
      include: [
        {
          model: Food,
          as: "Food",
          attributes: [
            "FoodId",
            "FoodName",
            "Price",
            "DiscountPrice",
            "ImageURL",
          ],
          include: [
            {
              model: require("../../models/init-models")(sequelize).Category,
              as: "Category",
              attributes: ["CategoryId", "CategoryName"],
            },
          ],
        },
        {
          model: Size,
          as: "Size",
          attributes: ["SizeID", "SizeName", "ExtraPrice"],
          required: false,
        },
        {
          model: GioHang_Topping,
          as: "GioHang_Toppings",
          attributes: ["ToppingID"], // <--- SỬA LẠI
          include: [
            {
              model: Topping,
              as: "Topping",
              attributes: ["ToppingID", "ToppingName", "ToppingPrice"],
            },
          ],
        },
      ],
      order: [["GioHangID", "DESC"]],
    });

    const cart = items.map(formatCartItem);

    res.json({
      success: true,
      message: "Lấy giỏ hàng thành công!",
      cart,
    });
  } catch (err) {
    console.error("GET CART ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy giỏ hàng!",
      detail: err.message,
    });
  }
};

// =========================
// CẬP NHẬT SỐ LƯỢNG
// =========================
exports.updateCart = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    console.log("UPDATE CART REQ:", { userId: req.user?.id, body: req.body });
    const { gioHangId, quantity } = req.body;
    const qty = parseInt(quantity, 10);
    const userId =
      req.user?.id || parseInt(req.body.userId || req.query.userId, 10);
    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "Thiếu userId (hoặc token)" });
    }

    if (!gioHangId || isNaN(qty) || qty < 1) {
      return res
        .status(400)
        .json({ success: false, message: "Dữ liệu không hợp lệ" });
    }

    const cartItem = await GioHang.findByPk(gioHangId, {
      include: [
        { model: Food, as: "Food", attributes: ["Price", "DiscountPrice"] },
        { model: Size, as: "Size", attributes: ["ExtraPrice"] },
        {
          model: GioHang_Topping,
          as: "GioHang_Toppings",
          include: [
            { model: Topping, as: "Topping", attributes: ["ToppingPrice"] },
          ],
        },
      ],
      transaction: t,
    });

    if (!cartItem) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy sản phẩm trong giỏ" });
    }
    if (cartItem.Id !== userId) {
      return res
        .status(403)
        .json({ success: false, message: "Không có quyền" });
    }

    const base =
      cartItem.Food.DiscountPrice && cartItem.Food.DiscountPrice > 0
        ? Number(cartItem.Food.DiscountPrice)
        : Number(cartItem.Food.Price);

    const sizeExtra = cartItem.Size ? Number(cartItem.Size.ExtraPrice || 0) : 0;
    const topSum = cartItem.GioHang_Toppings.reduce(
      (s, gt) => s + Number(gt.Topping.ToppingPrice || 0),
      0
    );

    const newTotal = (base + sizeExtra + topSum) * qty;

    await cartItem.update(
      { SoLuong: qty, TotalPrice: newTotal },
      { transaction: t }
    );
    await t.commit();

    const totalQty = await GioHang.sum("SoLuong", { where: { Id: userId } });
    const cartCount = totalQty ?? 0;

    res.json({
      success: true,
      message: "Cập nhật số lượng thành công!",
      newItemTotal: newTotal,
      cartCount,
    });
  } catch (err) {
    try {
      if (t && typeof t.rollback === "function" && !t.finished)
        await t.rollback();
    } catch (rbErr) {
      console.warn("Rollback skipped or failed:", rbErr && rbErr.message);
    }
    console.error("UPDATE CART ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi cập nhật!",
      detail: err.message,
    });
  }
};

// =========================
// XÓA ITEM KHỎI GIỎ
// =========================
exports.deleteCart = async (req, res) => {
  try {
    console.log("DELETE CART REQ:", { userId: req.user?.id, body: req.body });
    const { gioHangId } = req.body;
    const userId =
      req.user?.id || parseInt(req.body.userId || req.query.userId, 10);
    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "Thiếu userId (hoặc token)" });
    }

    if (!gioHangId) {
      return res
        .status(400)
        .json({ success: false, message: "Thiếu gioHangId" });
    }

    const cartItem = await GioHang.findByPk(gioHangId);
    if (!cartItem) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy sản phẩm" });
    }
    if (cartItem.Id !== userId) {
      return res
        .status(403)
        .json({ success: false, message: "Không có quyền" });
    }

    await GioHang_Topping.destroy({ where: { GioHangID: gioHangId } });
    await cartItem.destroy();
    // Recalculate totals using Model.sum to avoid aggregate GROUP BY / ORDER BY issues on MSSQL
    const cartCount =
      (await GioHang.sum("SoLuong", { where: { Id: userId } })) || 0;
    const totalPrice =
      (await GioHang.sum("TotalPrice", { where: { Id: userId } })) || 0;

    res.json({
      success: true,
      message: "Xóa sản phẩm thành công!",
      cartCount,
      totalPrice,
    });
  } catch (err) {
    console.error("DELETE CART ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi xóa!",
      detail: err.message,
    });
  }
};

// Export middleware
module.exports.authenticateToken = authenticateToken;
module.exports.authenticateTokenOptional = authenticateTokenOptional;

// =========================
// CẬP NHẬT TUỲ CHỌN (SIZE/TOPPING) CHO MỘT ITEM TRONG GIỎ
// =========================
exports.updateOptions = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    console.log("UPDATE OPTIONS REQ:", {
      userId: req.user?.id,
      body: req.body,
    });
    let { gioHangId, sizeId, toppingIds } = req.body;
    // Ensure numeric ids
    gioHangId = parseInt(gioHangId, 10);
    sizeId = sizeId ? parseInt(sizeId, 10) : null;
    const userId =
      req.user?.id || parseInt(req.body.userId || req.query.userId, 10);
    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "Thiếu userId (hoặc token)" });
    }

    if (!gioHangId)
      return res
        .status(400)
        .json({ success: false, message: "Thiếu gioHangId" });

    const cartItem = await GioHang.findByPk(gioHangId, {
      include: [
        {
          model: Food,
          as: "Food",
          attributes: ["Price", "DiscountPrice", "Stock"],
        },
        {
          model: GioHang_Topping,
          as: "GioHang_Toppings",
          attributes: ["ToppingID"],
          include: [
            { model: Topping, as: "Topping", attributes: ["ToppingPrice"] },
          ],
        },
        { model: Size, as: "Size", attributes: ["ExtraPrice"] },
      ],
      transaction: t,
    });

    if (!cartItem)
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy item" });
    if (cartItem.Id !== userId)
      return res
        .status(403)
        .json({ success: false, message: "Không có quyền" });

    // Validate size
    let sizeExtra = 0;
    let newSizeId = null;
    if (sizeId) {
      const sz = await Size.findByPk(sizeId, { transaction: t });
      if (!sz)
        return res
          .status(400)
          .json({ success: false, message: "Size không hợp lệ" });
      sizeExtra = Number(sz.ExtraPrice || 0);
      newSizeId = sz.SizeID;
    }

    // Validate toppings and compute topping sum
    const safeToppingIds = Array.isArray(toppingIds)
      ? toppingIds.map(Number)
      : [];
    let toppingTotal = 0;
    if (safeToppingIds.length > 0) {
      const tops = await Topping.findAll({
        where: { ToppingID: safeToppingIds },
        transaction: t,
      });
      toppingTotal = tops.reduce((s, x) => s + Number(x.ToppingPrice || 0), 0);
    }

    const base =
      cartItem.Food.DiscountPrice && cartItem.Food.DiscountPrice > 0
        ? Number(cartItem.Food.DiscountPrice)
        : Number(cartItem.Food.Price);
    const newTotalPrice =
      (base + sizeExtra + toppingTotal) * (cartItem.SoLuong || 1);

    // Update GioHang record
    await cartItem.update(
      { SizeID: newSizeId, TotalPrice: newTotalPrice },
      { transaction: t }
    );

    // Replace toppings
    await GioHang_Topping.destroy({
      where: { GioHangID: gioHangId },
      transaction: t,
    });
    if (safeToppingIds.length > 0) {
      const records = safeToppingIds.map((tid) => ({
        GioHangID: gioHangId,
        ToppingID: tid,
      }));
      await GioHang_Topping.bulkCreate(records, { transaction: t });
    }

    await t.commit();

    // Return updated item formatted
    const updated = await GioHang.findByPk(gioHangId, {
      include: [
        {
          model: Food,
          as: "Food",
          attributes: [
            "FoodId",
            "FoodName",
            "Price",
            "DiscountPrice",
            "ImageURL",
          ],
        },
        {
          model: Size,
          as: "Size",
          attributes: ["SizeID", "SizeName", "ExtraPrice"],
        },
        {
          model: GioHang_Topping,
          as: "GioHang_Toppings",
          include: [
            {
              model: Topping,
              as: "Topping",
              attributes: ["ToppingID", "ToppingName", "ToppingPrice"],
            },
          ],
        },
      ],
    });

    res.json({
      success: true,
      message: "Cập nhật tuỳ chọn thành công",
      item: formatCartItem(updated),
    });
  } catch (err) {
    try {
      if (t && typeof t.rollback === "function" && !t.finished)
        await t.rollback();
    } catch (rbErr) {
      console.warn("Rollback skipped or failed:", rbErr && rbErr.message);
    }
    console.error("UPDATE OPTIONS ERROR:", err);
    res
      .status(500)
      .json({
        success: false,
        message: "Lỗi khi cập nhật tuỳ chọn",
        detail: err.message,
      });
  }
};
