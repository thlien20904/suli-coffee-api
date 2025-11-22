// controllers/user/profile/review.js
const multer = require("multer"); // ← THÊM ĐỂ HANDLE MulterError
const {
  OrderReviews,
  Orders,
  OrderDetails,
  Food,
  Size,
  OrderDetails_Topping,
  Topping,
  CuaHang,
  sequelize,
  uploadToSupabase,
  reviewUpload, // ← LẤY TỪ CONFIG ĐÃ SỬA
} = require("./config"); // ← ĐÚNG ĐƯỜNG DẪN

const getReviewableItems = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id;

    const order = await Orders.findOne({
      where: { OrderId: orderId, UserId: userId },
      attributes: ["OrderId", "CuaHangId"],
    });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Đơn hàng không tồn tại!" });
    }

    const defaultShopInfo = {
      CuaHangName: "SuLi Coffee HCM Nguyễn Trãi",
      Address: "120 Nguyễn Trãi",
      Ward: "Phường 5",
      District: "Quận 5",
      Province: "TP Hồ Chí Minh",
    };

    let shopInfo = defaultShopInfo;

    if (order.CuaHangId) {
      const shop = await CuaHang.findByPk(order.CuaHangId, {
        attributes: ["CuaHangName", "Address", "Ward", "District", "Province"],
      });
      if (shop) {
        shopInfo = {
          CuaHangName: shop.CuaHangName || defaultShopInfo.CuaHangName,
          Address: shop.Address || defaultShopInfo.Address,
          Ward: shop.Ward || defaultShopInfo.Ward,
          District: shop.District || defaultShopInfo.District,
          Province: shop.Province || defaultShopInfo.Province,
        };
      }
    }

    const details = await OrderDetails.findAll({
      where: { OrderId: orderId },
      include: [
        { model: Food, as: "Food", attributes: ["FoodName", "ImageURL"] },
        { model: Size, as: "Size", attributes: ["SizeName"] },
        {
          model: OrderDetails_Topping,
          as: "OrderDetails_Toppings",
          include: [
            { model: Topping, as: "Topping", attributes: ["ToppingName"] },
          ],
        },
        {
          model: OrderReviews,
          as: "OrderReviews",
          where: { UserId: userId },
          required: false,
          attributes: ["ReviewId", "Rating", "Comment", "Images", "Videos"],
          include: [
            {
              model: require("./config").Users,
              as: "User",
              attributes: ["Username", "FullName", "AvatarUrl"], // ✅ FIX: Avatar -> AvatarUrl
            },
          ],
        },
      ],
    });

    const items = details.map((d) => {
      const review = d.OrderReviews?.[0];
      return {
        OrderDetailId: d.OrderDetailId,
        FoodName: d.Food?.FoodName || "Sản phẩm",
        ImageUrl: d.Food?.ImageURL || "/placeholder.jpg",
        SizeName: d.Size?.SizeName || null,
        Toppings:
          d.OrderDetails_Toppings?.map(
            (t) => t.Topping?.ToppingName || ""
          ).filter(Boolean) || [],
        review: review
          ? {
              ReviewId: review.ReviewId,
              Rating: review.Rating,
              Comment: review.Comment,
              Images: review.Images,
              Videos: review.Videos,
              User: {
                Username: review.User?.Username || "Anonymous",
                FullName: review.User?.FullName || "",
                AvatarUrl: review.User?.AvatarUrl || null, // ✅ FIX: Avatar -> AvatarUrl
              },
            }
          : null,
      };
    });

    res.json({
      success: true,
      data: { orderId, shopInfo, items },
    });
  } catch (err) {
    console.error("getReviewableItems error:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

const submitReview = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const reviewsJson = req.body.reviews;
    if (!reviewsJson)
      return res
        .status(400)
        .json({ success: false, message: "Thiếu dữ liệu đánh giá" });

    const reviews = JSON.parse(reviewsJson);
    const orderId = req.body.orderId;
    const userId = req.user.id;
    const shopRating = parseInt(req.body.shopRating) || 5; // ✅ THÊM: Rating dịch vụ bán
    const shippingRating = parseInt(req.body.shippingRating) || 5; // ✅ THÊM: Rating vận chuyển
    // ✅ req.files là ARRAY khi dùng .any() (không phải object như .fields())
    const filesArray = req.files || [];

    console.log("📂 Total files received:", filesArray.length);
    console.log("📝 Body fields:", Object.keys(req.body));

    // ✅ Organize files by fieldname: { 'images_1': [file1, file2], 'videos_2': [file3], ... }
    const filesMap = {};
    for (const file of filesArray) {
      const fieldName = file.fieldname;

      // Validate field name pattern
      if (!/^(images|videos)_\d+$/.test(fieldName)) {
        console.error(`❌ Invalid field name: ${fieldName}`);
        return res.status(400).json({
          success: false,
          message: `Field không hợp lệ: ${fieldName}. Chỉ chấp nhận images_[số] hoặc videos_[số]`,
        });
      }

      const isImage = fieldName.startsWith("images_");
      const isVideo = fieldName.startsWith("videos_");

      // =========================
      // ✅ VALIDATE ĐỊNH DẠNG FILE - CHỈ CHẤP NHẬN FORMAT PHỔ BIẾN
      // =========================
      const validImageExt = [".jpg", ".jpeg", ".png"]; // ❌ Không chấp nhận .gif, .webp, .svg, .psd
      const validVideoExt = [".mp4", ".mov", ".avi"]; // ❌ Không chấp nhận .wmv, .webm, .gif

      const ext = "." + file.originalname.split(".").pop().toLowerCase();

      if (isImage && !validImageExt.includes(ext)) {
        return res.status(400).json({
          success: false,
          message: `Ảnh "${
            file.originalname
          }" không đúng định dạng! Chỉ chấp nhận: JPG, JPEG, PNG. Định dạng hiện tại: ${ext.toUpperCase()}`,
        });
      }

      if (isVideo && !validVideoExt.includes(ext)) {
        return res.status(400).json({
          success: false,
          message: `Video "${
            file.originalname
          }" không đúng định dạng! Chỉ chấp nhận: MP4, MOV, AVI. Định dạng hiện tại: ${ext.toUpperCase()}`,
        });
      }
      // =========================
      // ✅ VALIDATE FILE SIZE
      // =========================
      if (isImage && file.size > 5 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          message: `Ảnh "${file.originalname}" vượt quá 5MB (${(
            file.size /
            1024 /
            1024
          ).toFixed(2)}MB).`,
        });
      }

      if (isVideo && file.size > 50 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          message: `Video "${file.originalname}" vượt quá 50MB (${(
            file.size /
            1024 /
            1024
          ).toFixed(2)}MB).`,
        });
      }

      if (!filesMap[fieldName]) {
        filesMap[fieldName] = [];
      }
      filesMap[fieldName].push(file);
      console.log(
        `  - ${fieldName}: ${file.originalname} (${(file.size / 1024).toFixed(
          2
        )} KB)`
      );
    }

    // ✅ VALIDATE SỐ LƯỢNG ẢNH VÀ VIDEO CHO MỐI SẢN PHẨM
    for (const r of reviews) {
      const { OrderDetailId } = r;
      const imagesField = filesMap[`images_${OrderDetailId}`] || [];
      const videosField = filesMap[`videos_${OrderDetailId}`] || [];

      if (imagesField.length > 6) {
        return res.status(400).json({
          success: false,
          message: `Sản phẩm OrderDetailId ${OrderDetailId} có ${imagesField.length} ảnh. Tối đa chỉ được 6 ảnh/sản phẩm!`,
        });
      }

      if (videosField.length > 1) {
        return res.status(400).json({
          success: false,
          message: `Sản phẩm OrderDetailId ${OrderDetailId} có ${videosField.length} video. Tối đa chỉ được 1 video/sản phẩm!`,
        });
      }
    }

    const result = [];

    for (const r of reviews) {
      const { OrderDetailId, Rating, Comment } = r;

      let images = [];
      let videos = [];

      // ✅ XỬ LÝ ẢNH: Lấy từ filesMap
      const imagesField = filesMap[`images_${OrderDetailId}`] || [];
      console.log(
        `🖼️ Processing ${imagesField.length} image(s) for OrderDetailId ${OrderDetailId}`
      );

      for (const f of imagesField) {
        if (f.buffer && f.originalname) {
          const up = await uploadToSupabase(
            f.buffer,
            f.originalname,
            "reviews"
          );
          if (up.success) {
            images.push(up.url);
            console.log(`  ✅ Uploaded: ${up.url}`);
          } else {
            console.error(
              `  ❌ Upload failed for ${f.originalname}:`,
              up.error
            );
          }
        }
      }

      // ✅ XỬ LÝ VIDEO: Chỉ lấy file đầu tiên (max 1 video/item)
      const videosField = filesMap[`videos_${OrderDetailId}`] || [];
      if (videosField.length > 0) {
        const f = videosField[0];
        console.log(
          `🎥 Processing video for OrderDetailId ${OrderDetailId}: ${f.originalname}`
        );

        if (f.buffer && f.originalname) {
          const up = await uploadToSupabase(
            f.buffer,
            f.originalname,
            "reviews"
          );
          if (up.success) {
            videos = [up.url];
            console.log(`  ✅ Uploaded: ${up.url}`);
          } else {
            console.error(`  ❌ Upload failed:`, up.error);
          }
        }
      }

      const existing = await OrderReviews.findOne({
        where: { OrderDetailId, UserId: userId },
        transaction: t,
      });

      if (existing) {
        // ✅ UPDATE: MERGE MẢNG ẢNH/VIDEO MỚI VỚI CŨ (NẾU KHÔNG CÓ MỚI THÌ GIỮ CŨ)
        const updatedImages =
          images.length > 0 ? images : existing.Images || [];
        const updatedVideos =
          videos.length > 0 ? videos : existing.Videos || [];

        await existing.update(
          {
            Rating,
            Comment: Comment?.trim() || null,
            Images: Array.isArray(updatedImages) ? updatedImages : null, // ✅ ĐẢM BẢO JSONB LÀ MẢNG
            Videos: Array.isArray(updatedVideos) ? updatedVideos : null, // ✅ ĐẢM BẢO JSONB LÀ MẢNG
            ShopRating: shopRating, // ✅ THÊM: Update rating dịch vụ bán
            ShippingRating: shippingRating, // ✅ THÊM: Update rating vận chuyển
            UpdatedDate: new Date(), // ✅ CẬP NHẬT TIMESTAMP
          },
          { transaction: t }
        );
        result.push({ OrderDetailId, action: "updated" });
      } else {
        await OrderReviews.create(
          {
            OrderId: orderId,
            OrderDetailId,
            UserId: userId,
            Rating,
            Comment: Comment?.trim() || null,
            Images: images.length > 0 ? images : null, // ✅ NULL HOẶC MẢNG URL CHO JSONB
            Videos: videos.length > 0 ? videos : null, // ✅ NULL HOẶC MẢNG URL CHO JSONB
            ShopRating: shopRating, // ✅ THÊM: Rating dịch vụ bán
            ShippingRating: shippingRating, // ✅ THÊM: Rating vận chuyển
            CreatedDate: new Date(),
            UpdatedDate: new Date(),
          },
          { transaction: t }
        );
        result.push({ OrderDetailId, action: "created" });
      }
    }

    await t.commit();
    res.json({
      success: true,
      message: "Đánh giá thành công! +200 xu",
      data: result,
    });
  } catch (err) {
    await t.rollback();
    console.error("❌ SUBMIT REVIEW ERROR:", err);
    console.error("Error stack:", err.stack);

    // ✅ BETTER ERROR HANDLING
    if (err instanceof multer.MulterError) {
      return res.status(400).json({
        success: false,
        message: `Lỗi upload file: ${err.message}. Kiểm tra kích thước file (<50MB) và số lượng (<20 files).`,
      });
    }

    if (err.message?.includes("Supabase") || err.message?.includes("upload")) {
      return res.status(500).json({
        success: false,
        message: `Lỗi upload lên cloud storage: ${err.message}`,
      });
    }

    res.status(500).json({
      success: false,
      message: "Lỗi gửi đánh giá: " + (err.message || "Unknown error"),
    });
  }
};

const checkReviewed = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id;
    const total = await OrderDetails.count({ where: { OrderId: orderId } });
    const reviewed = await OrderReviews.count({
      where: { OrderId: orderId, UserId: userId },
    });
    res.json({
      success: true,
      data: { reviewed: reviewed === total && total > 0 },
    });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

module.exports = {
  getReviewableItems,
  submitReview: [reviewUpload, submitReview], // ← DÙNG CHUNG reviewUpload TỪ CONFIG
  checkReviewed,
};
