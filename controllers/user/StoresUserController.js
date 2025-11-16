const sequelize = require("../../config/sequelize");
const initModels = require("../../models/init-models");
const models = initModels(sequelize);
const { CuaHang } = models;
const { Op } = require("sequelize");

// helper convert store data (thêm fallback Image_URL như products)
const parseStoreWithDistance = (store) => {
  const raw = store.dataValues || store; // 🔹 FIX: Handle nếu input là plain object
  return {
    ...raw,
    Latitude: parseFloat(raw.Latitude || 0),
    Longitude: parseFloat(raw.Longitude || 0),
    Image_URL: raw.Image_URL || "/images/no-image.png", // 🔹 THÊM: Fallback local
    distance: (() => {
      let d = typeof store.distance === "number" ? store.distance : typeof raw.distance === "number" ? raw.distance : undefined;
      if (typeof d === "number") {
        return d === 0 ? 0.01 : Math.round(d * 100) / 100;
      }
      return undefined;
    })(),
  };
};

// =========================
// Lấy danh sách tất cả cửa hàng
exports.getAllStores = async (req, res) => {
  try {
    const stores = await CuaHang.findAll({
      order: [["CuaHangId", "DESC"]],
      attributes: ["CuaHangId", "CuaHangName", "Address", "Opening_Hours", "Image_URL", "Phone", "Latitude", "Longitude"],
    });
    res.json({ success: true, data: stores.map(parseStoreWithDistance) }); // 🔹 FIX: parseLatLng → parseStoreWithDistance
  } catch (err) {
    console.error("❌ Lỗi lấy danh sách cửa hàng:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// Lấy chi tiết 1 cửa hàng
exports.getStoreById = async (req, res) => {
  try {
    const store = await CuaHang.findByPk(req.params.id, {
      attributes: ["CuaHangId", "CuaHangName", "Address", "Opening_Hours", "Image_URL", "Phone", "Latitude", "Longitude"],
    });
    if (!store) return res.status(404).json({ success: false, message: "Không tìm thấy cửa hàng!" });
    res.json({ success: true, data: parseStoreWithDistance(store) }); // 🔹 FIX: parseLatLng → parseStoreWithDistance
  } catch (err) {
    console.error("❌ Lỗi lấy chi tiết cửa hàng:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// Tìm kiếm theo tên hoặc địa chỉ
exports.searchStores = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ success: false, message: "Vui lòng cung cấp từ khóa" });
    const stores = await CuaHang.findAll({
      where: {
        [Op.or]: [{ CuaHangName: { [Op.like]: `%${query}%` } }, { Address: { [Op.like]: `%${query}%` } }],
      },
      order: [["CuaHangId", "DESC"]],
      attributes: ["CuaHangId", "CuaHangName", "Address", "Opening_Hours", "Image_URL", "Phone", "Latitude", "Longitude"],
    });
    res.json({ success: true, data: stores.map(parseStoreWithDistance) }); // 🔹 FIX: parseLatLng → parseStoreWithDistance
  } catch (err) {
    console.error("❌ Lỗi tìm kiếm cửa hàng:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// 📌 LẤY DANH SÁCH CỬA HÀNG THEO KHOẢNG CÁCH
exports.getStoresSortedByDistance = async (req, res) => {
  try {
    const { lat, lng } = req.query;
    console.log("[API] /nearest-all - lat:", lat, "lng:", lng);
    if (!lat || !lng) return res.status(400).json({ success: false, message: "Vui lòng cung cấp tọa độ" });
    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);
    if (isNaN(userLat) || isNaN(userLng)) return res.status(400).json({ success: false, message: "Tọa độ không hợp lệ" });

    const storesList = await CuaHang.findAll({
      where: { Latitude: { [Op.ne]: null }, Longitude: { [Op.ne]: null } },
      attributes: ["CuaHangId", "CuaHangName", "Address", "Opening_Hours", "Image_URL", "Phone", "Latitude", "Longitude"],
      limit: 100,
    });
    console.log(`[API] Fetched ${storesList.length} stores from DB`);

    // Tính distance với try-catch
    const DEG_TO_RAD = Math.PI / 180;
    const userLatRad = userLat * DEG_TO_RAD;
    const cosUserLat = Math.cos(userLatRad);
    let storesWithDistance = [];
    storesList.forEach((store) => {
      try {
        const storeLat = parseFloat(store.Latitude);
        const storeLng = parseFloat(store.Longitude);
        if (isNaN(storeLat) || isNaN(storeLng)) return; // Skip invalid
        const dLat = (userLat - storeLat) * DEG_TO_RAD;
        const dLng = (userLng - storeLng) * DEG_TO_RAD;
        const a = Math.sin(dLat / 2) ** 2 + cosUserLat * Math.cos(storeLat * DEG_TO_RAD) * Math.sin(dLng / 2) ** 2;
        const distance = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        storesWithDistance.push({ ...store.dataValues, distance: Math.round(distance * 100) / 100 });
      } catch (storeErr) {
        console.warn(`[API] Skip store ${store.CuaHangId}:`, storeErr.message);
      }
    });
    storesWithDistance.sort((a, b) => a.distance - b.distance);
    console.log(`[API] Calculated distances for ${storesWithDistance.length} stores`);

    // 🔹 FIX: Filter <15km, fallback 5 gần nhất nếu rỗng
    let finalStores = storesWithDistance.filter(s => s.distance < 15).slice(0, 20);
    if (finalStores.length === 0) {
      finalStores = storesWithDistance.slice(0, 5);
      console.log('[API] Fallback: No stores <15km, using top 5 nearest');
    }
    console.log(`[API] Returning ${finalStores.length} stores`);

    res.json({ success: true, data: finalStores.map(parseStoreWithDistance) });
  } catch (err) {
    console.error("❌ Lỗi /nearest-all:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// 📌 LẤY CỬA HÀNG GẦN NHẤT
exports.getNearestStore = async (req, res) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) return res.status(400).json({ success: false, message: "Vui lòng cung cấp tọa độ" });
    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);
    if (isNaN(userLat) || isNaN(userLng)) return res.status(400).json({ success: false, message: "Tọa độ không hợp lệ" });

    const storesList = await CuaHang.findAll({
      where: { Latitude: { [Op.ne]: null }, Longitude: { [Op.ne]: null } },
      attributes: ["CuaHangId", "CuaHangName", "Address", "Opening_Hours", "Image_URL", "Phone", "Latitude", "Longitude"],
    });

    const toRad = (x) => x * Math.PI / 180;
    const R = 6371;
    let storesWithDistance = [];
    storesList.forEach((store) => {
      try {
        const storeLat = parseFloat(store.Latitude);
        const storeLng = parseFloat(store.Longitude);
        if (isNaN(storeLat) || isNaN(storeLng)) return;
        const dLat = toRad(userLat - storeLat);
        const dLng = toRad(userLng - storeLng);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(storeLat)) * Math.cos(toRad(userLat)) * Math.sin(dLng / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;
        storesWithDistance.push({ ...store.dataValues, distance });
      } catch (storeErr) {
        console.warn(`[API] Skip nearest store ${store.CuaHangId}:`, storeErr);
      }
    });

    storesWithDistance.sort((a, b) => a.distance - b.distance);
    if (!storesWithDistance.length) return res.status(404).json({ success: false, message: "Không tìm thấy cửa hàng" });

    res.json({ success: true, data: parseStoreWithDistance(storesWithDistance[0]) });
  } catch (err) {
    console.error("❌ Lỗi nearest store:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};