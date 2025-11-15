const sequelize = require("../../config/sequelize");
const initModels = require("../../models/init-models");
const models = initModels(sequelize);
const { CuaHang } = models;
const { Op } = require("sequelize");

// helper convert store data
const parseStoreWithDistance = (store) => ({
  ...store.dataValues,
  Latitude: parseFloat(store.Latitude),
  Longitude: parseFloat(store.Longitude),
  distance: (() => {
    let d =
      typeof store.distance === "number"
        ? store.distance
        : typeof store.dataValues.distance === "number"
        ? store.dataValues.distance
        : undefined;
    if (typeof d === "number") {
      // Nếu distance = 0 nhưng lat/lng không trùng hoàn toàn thì trả về tối thiểu 0.01
      if (d === 0) {
        // Kiểm tra lat/lng user và store
        // Nếu lat/lng trùng hoàn toàn thì giữ 0, nếu không thì trả về 0.01
        // (Ở đây không có lat/lng user, nên chỉ fix về 0.01 nếu distance = 0)
        return 0.01;
      }
      return Math.round(d * 100) / 100;
    }
    return undefined;
  })(),
});

// =========================
// Lấy danh sách tất cả cửa hàng
exports.getAllStores = async (req, res) => {
  try {
    const stores = await CuaHang.findAll({
      order: [["CuaHangId", "DESC"]],
      attributes: [
        "CuaHangId",
        "CuaHangName",
        "Address",
        "Opening_Hours",
        "Image_URL",
        "Phone",
        "Latitude",
        "Longitude",
      ],
    });
    res.json({ success: true, data: stores.map(parseLatLng) });
  } catch (err) {
    console.error("❌ Lỗi lấy danh sách cửa hàng:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// Lấy chi tiết 1 cửa hàng
exports.getStoreById = async (req, res) => {
  try {
    const store = await CuaHang.findByPk(req.params.id, {
      attributes: [
        "CuaHangId",
        "CuaHangName",
        "Address",
        "Opening_Hours",
        "Image_URL",
        "Phone",
        "Latitude",
        "Longitude",
      ],
    });
    if (!store)
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy cửa hàng!" });

    res.json({ success: true, data: parseLatLng(store) });
  } catch (err) {
    console.error("❌ Lỗi lấy chi tiết cửa hàng:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// Tìm kiếm theo tên hoặc địa chỉ
exports.searchStores = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query)
      return res
        .status(400)
        .json({ success: false, message: "Vui lòng cung cấp từ khóa" });

    const stores = await CuaHang.findAll({
      where: {
        [Op.or]: [
          { CuaHangName: { [Op.like]: `%${query}%` } },
          { Address: { [Op.like]: `%${query}%` } },
        ],
      },
      order: [["CuaHangId", "DESC"]],
      attributes: [
        "CuaHangId",
        "CuaHangName",
        "Address",
        "Opening_Hours",
        "Image_URL",
        "Phone",
        "Latitude",
        "Longitude",
      ],
    });

    res.json({ success: true, data: stores.map(parseLatLng) });
  } catch (err) {
    console.error("❌ Lỗi tìm kiếm cửa hàng:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// =========================
// 📌 LẤY DANH SÁCH CỬA HÀNG THEO KHOẢNG CÁCH
// =========================
exports.getStoresSortedByDistance = async (req, res) => {
  try {
    const { lat, lng } = req.query;
    console.log("[API] /nearest-all - lat:", lat, "lng:", lng);
    if (!lat || !lng) {
      console.log("[API] /nearest-all - Thiếu tọa độ");
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp tọa độ (lat, lng)",
      });
    }

    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);
    if (isNaN(userLat) || isNaN(userLng)) {
      console.log("[API] /nearest-all - Tọa độ không hợp lệ", lat, lng);
      return res.status(400).json({
        success: false,
        message: "Tọa độ không hợp lệ",
      });
    }

    const storesList = await CuaHang.findAll({
      where: {
        Latitude: { [Op.ne]: null },
        Longitude: { [Op.ne]: null },
      },
      limit: 100, // 🚀 Limit để tăng performance
      attributes: [
        "CuaHangId",
        "CuaHangName",
        "Address",
        "Opening_Hours",
        "Image_URL",
        "Phone",
        "Latitude",
        "Longitude",
      ],
    });

    // 🚀 Tối ưu tính khoảng cách - Pre-calculate constants
    const DEG_TO_RAD = Math.PI / 180;
    const userLatRad = userLat * DEG_TO_RAD;
    const cosUserLat = Math.cos(userLatRad);

    const storesWithDistance = storesList
      .map((store) => {
        const dLat = (userLat - store.Latitude) * DEG_TO_RAD;
        const dLng = (userLng - store.Longitude) * DEG_TO_RAD;
        const a =
          Math.sin(dLat * 0.5) * Math.sin(dLat * 0.5) +
          cosUserLat *
            Math.cos(store.Latitude * DEG_TO_RAD) *
            Math.sin(dLng * 0.5) *
            Math.sin(dLng * 0.5);
        const distance = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return {
          ...store.dataValues,
          distance: Math.round(distance * 100) / 100,
        };
      })
      .sort((a, b) => a.distance - b.distance); // Sort tất cả trước

    // 🔧 Nếu không có cửa hàng trong 15km, lấy 5 cửa hàng gần nhất
    const nearbyStores = storesWithDistance.filter((s) => s.distance < 15);
    const finalStores =
      nearbyStores.length > 0
        ? nearbyStores.slice(0, 20)
        : storesWithDistance.slice(0, 5); // Fallback: 5 cửa hàng gần nhất

    console.log(
      `✅ [API] /nearest-all - Trả về ${finalStores.length} cửa hàng (${nearbyStores.length} trong 15km)`
    );

    res.json({
      success: true,
      data: finalStores.map(parseStoreWithDistance),
    });
  } catch (err) {
    console.error("❌ Lỗi sắp xếp cửa hàng theo khoảng cách:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// =========================
// 📌 LẤY CỬA HÀNG GẦN NHẤT
// =========================
exports.getNearestStore = async (req, res) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng)
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp tọa độ (lat, lng)",
      });

    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);
    if (isNaN(userLat) || isNaN(userLng))
      return res.status(400).json({
        success: false,
        message: "Tọa độ không hợp lệ",
      });

    const storesList = await CuaHang.findAll({
      where: {
        Latitude: { [Op.ne]: null },
        Longitude: { [Op.ne]: null },
      },
      attributes: [
        "CuaHangId",
        "CuaHangName",
        "Address",
        "Opening_Hours",
        "Image_URL",
        "Phone",
        "Latitude",
        "Longitude",
      ],
    });

    // Tính khoảng cách bằng JS (Haversine)
    const toRad = (x) => (x * Math.PI) / 180;
    const R = 6371;
    const storesWithDistance = storesList.map((store) => {
      const dLat = toRad(userLat - store.Latitude);
      const dLng = toRad(userLng - store.Longitude);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(store.Latitude)) *
          Math.cos(toRad(userLat)) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;
      return {
        ...store,
        distance,
      };
    });

    // Sắp xếp theo khoảng cách tăng dần
    storesWithDistance.sort((a, b) => a.distance - b.distance);

    if (!storesWithDistance.length)
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy cửa hàng nào",
      });

    res.json({
      success: true,
      data: parseStoreWithDistance(storesWithDistance[0]),
    });
  } catch (err) {
    console.error("❌ Lỗi tìm cửa hàng gần nhất:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};
