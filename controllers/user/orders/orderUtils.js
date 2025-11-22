// orderUtils.js
const axios = require("axios"); // ✅ Thêm dòng này
const { sequelize, models, Op } = require("./config"); // dùng config.js cùng cấp
const jwt = require("jsonwebtoken");

// Nếu cần destructure thêm các model
const { CuaHang, DeliveryAddresses, FoodDimensions } = models;

// ✅ Hàm tính khoảng cách giữa 2 tọa độ bằng công thức Haversine (km)
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Bán kính Trái Đất (km)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/// Hàm lấy tọa độ từ địa chỉ bằng Google Maps Geocoding API
async function getCoordinatesFromAddress(address, ward, district, province) {
  try {
    const fullAddress = `${address}, ${ward}, ${district}, ${province}, Vietnam`;
    const encodedAddress = encodeURIComponent(fullAddress);
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.warn("Thiếu GOOGLE_MAPS_API_KEY, trả về tọa độ mặc định.");
      return { latitude: null, longitude: null };
    }
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`;
    console.log("Calling Google Maps API:", url); // Debug
    const response = await axios.get(url);

    if (response.data.status !== "OK" || !response.data.results.length) {
      console.warn(`Không tìm thấy tọa độ cho địa chỉ: ${fullAddress}`);
      return { latitude: null, longitude: null };
    }

    const { lat, lng } = response.data.results[0].geometry.location;
    return { latitude: lat, longitude: lng };
  } catch (err) {
    console.error("Geocoding error:", err.message);
    return { latitude: null, longitude: null };
  }
}

// Hàm lấy thông tin tỉnh, quận, phường từ GHN API
async function getGHNLocationNames(provinceId, districtId, wardCode) {
  try {
    const apiBase = process.env.GHN_API;
    const token = process.env.GHN_TOKEN;
    if (!apiBase) throw new Error("Thiếu GHN_API trong file .env!");
    if (!token) throw new Error("Thiếu GHN_TOKEN trong file .env!");

    console.log("Calling GHN API for province:", provinceId);
    const provinceRes = await axios.get(`${apiBase}/province`, {
      headers: { Token: token },
    });
    const province = provinceRes.data.data.find(
      (p) => p.ProvinceID === parseInt(provinceId)
    );

    console.log("Calling GHN API for district:", districtId);
    const districtRes = await axios.get(
      `${apiBase}/district?province_id=${provinceId}`,
      { headers: { Token: token } }
    );
    const district = districtRes.data.data.find(
      (d) => d.DistrictID === parseInt(districtId)
    );

    console.log("Calling GHN API for ward:", wardCode);
    const wardRes = await axios.get(
      `${apiBase}/ward?district_id=${districtId}`,
      { headers: { Token: token } }
    );
    const ward = wardRes.data.data.find((w) => w.WardCode === String(wardCode));

    return {
      province: province?.ProvinceName || "",
      district: district?.DistrictName || "",
      ward: ward?.WardName || "",
    };
  } catch (err) {
    console.error("GHN location error:", err.message, err.stack);
    return { province: "", district: "", ward: "" };
  }
}
// =================== AUTH TOKEN ===================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.split(" ")[1];
  if (!token)
    return res
      .status(401)
      .json({ success: false, message: "Bạn chưa đăng nhập!" });

  jwt.verify(
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
};

// =================== 1. LẤY DANH SÁCH CỬA HÀNG ===================
const getStores = async (req, res) => {
  try {
    // Lấy tọa độ người dùng từ query params (optional)
    const { userLat, userLng, maxDistance = 15 } = req.query;

    console.log("🔍 getStores called with params:", {
      userLat,
      userLng,
      maxDistance,
    });

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

    console.log(`📦 Found ${stores.length} stores in database`);

    // ✅ Nếu có tọa độ user, filter cửa hàng trong bán kính maxDistance (km)
    let filteredStores = stores;
    if (userLat && userLng) {
      const lat = parseFloat(userLat);
      const lng = parseFloat(userLng);
      const maxDist = parseFloat(maxDistance);

      console.log(
        "📍 Filtering stores by distance. User location:",
        { lat, lng },
        "Max distance:",
        maxDist
      );

      if (!isNaN(lat) && !isNaN(lng) && !isNaN(maxDist)) {
        filteredStores = stores
          .map((store) => {
            if (!store.Latitude || !store.Longitude) {
              return { ...store.toJSON(), distance: null };
            }
            const distance = getDistance(
              lat,
              lng,
              store.Latitude,
              store.Longitude
            );
            return { ...store.toJSON(), distance: distance.toFixed(2) };
          })
          .filter(
            (store) =>
              store.distance === null || parseFloat(store.distance) <= maxDist
          )
          .sort((a, b) => {
            // Sắp xếp theo khoảng cách (gần nhất lên đầu)
            if (a.distance === null) return 1;
            if (b.distance === null) return -1;
            return parseFloat(a.distance) - parseFloat(b.distance);
          });

        console.log(
          `✅ Filtered ${filteredStores.length}/${stores.length} stores within ${maxDist}km`
        );
      }
    }

    res.json({ success: true, data: filteredStores });
  } catch (err) {
    console.error("GET STORES ERROR:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// =================== 2. LẤY ĐỊA CHỈ NGƯỜI DÙNG ===================
const getUserAddresses = async (req, res) => {
  try {
    const addresses = await DeliveryAddresses.findAll({
      where: { UserId: req.user.id },
      attributes: [
        "DeliveryAddressId",
        "Address",
        "Province",
        "ProvinceId",
        "District",
        "DistrictId",
        "Ward",
        "WardCode",
        "ReceiverName",
        "Phone",
        "IsDefault",
      ],
      order: [
        ["IsDefault", "DESC"],
        ["CreatedDate", "DESC"],
      ],
    });
    res.json({ success: true, data: addresses });
  } catch (err) {
    console.error("GET ADDRESSES ERROR:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// Cập nhật saveUserAddress
const saveUserAddress = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      address,
      province,
      provinceId,
      district,
      districtId,
      ward,
      wardCode,
      receiverName,
      phone,
      isDefault = false,
    } = req.body;

    if (!address || !province || !district || !ward || !phone) {
      return res
        .status(400)
        .json({ success: false, message: "Thiếu thông tin địa chỉ!" });
    }

    // Kiểm tra định dạng số điện thoại
    if (!/^[0][0-9]{9}$/.test(phone)) {
      return res
        .status(400)
        .json({ success: false, message: "Số điện thoại không hợp lệ!" });
    }

    const existing = await DeliveryAddresses.findOne({
      where: { UserId: req.user.id, Address: address, Phone: phone },
      transaction,
    });

    if (existing) {
      await transaction.commit();
      return res.json({
        success: true,
        message: "Địa chỉ đã tồn tại!",
        addressId: existing.DeliveryAddressId,
      });
    }

    // Lấy tọa độ từ địa chỉ
    const { latitude, longitude } = await getCoordinatesFromAddress(
      address,
      ward,
      district,
      province
    );

    const newAddr = await DeliveryAddresses.create(
      {
        UserId: req.user.id,
        Address: address,
        Province: province,
        ProvinceId: parseInt(provinceId) || null,
        District: district,
        DistrictId: parseInt(districtId) || null,
        Ward: ward,
        WardCode: wardCode ? String(wardCode) : null,
        ReceiverName: receiverName,
        Phone: phone,
        IsDefault: isDefault,
        Latitude: latitude,
        Longitude: longitude,
        CreatedDate: new Date(),
      },
      { transaction }
    );

    if (isDefault) {
      await DeliveryAddresses.update(
        { IsDefault: false },
        {
          where: {
            UserId: req.user.id,
            DeliveryAddressId: { [Op.ne]: newAddr.DeliveryAddressId },
          },
          transaction,
        }
      );
    }

    await transaction.commit();
    res.json({
      success: true,
      message: "Lưu địa chỉ thành công!",
      addressId: newAddr.DeliveryAddressId,
    });
  } catch (err) {
    await transaction.rollback();
    console.error("SAVE ADDRESS ERROR:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
};

// =================== 4. TÍNH PHÍ SHIP ===================
// ✅ Import GHN Service
const { calculateGHNShippingFee } = require("../../../services/ghnService");

// ✅ Cache cho phí ship (tránh call API nhiều lần)
const shippingCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const calculateShippingFee = async (req, res) => {
  try {
    const {
      cuaHangId, // User vẫn chọn cửa hàng (nhưng không dùng để tính ship)
      address,
      provinceId,
      districtId,
      wardCode,
      items,
      userId,
    } = req.body;

    // ✅ OPTIMIZATION: Validate sớm
    if (!items?.length) {
      return res.status(400).json({
        success: false,
        message: "Thiếu thông tin sản phẩm!",
      });
    }

    // ✅ OPTIMIZATION: Kiểm tra địa chỉ đầy đủ trước
    if (!address?.trim() || !provinceId || !districtId || !wardCode) {
      return res.json({
        success: true,
        shippingFee: 10000,
        distance: 0,
        message: "Vui lòng nhập đầy đủ địa chỉ",
      });
    }

    // ✅ Check cache trước
    const cacheKey = `shipping_${districtId}_${wardCode}_${items.length}`;
    const cached = shippingCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log("✅ Using cached shipping fee:", cached.fee);
      return res.json({
        success: true,
        shippingFee: cached.fee,
        distance: 0,
        message: "Phí ship từ GHN (cached)",
      });
    }

    // ✅ Tính phí ship bằng GHN API
    try {
      // ✅ FIX: Giới hạn quantity tối đa 10 cho mỗi item để tránh weight quá lớn
      // (Coffee/drinks không nên ship số lượng quá lớn một lúc)
      const ghnItems = items.map((item) => {
        const safeQuantity = Math.min(item.quantity || 1, 10);
        return {
          name: item.FoodName || item.name || "Sản phẩm",
          quantity: safeQuantity,
          weight: 500, // Fix cứng 500g/sản phẩm
        };
      });

      let shippingFee = await calculateGHNShippingFee({
        toDistrictId: districtId,
        toWardCode: wardCode,
        items: ghnItems,
      });

      // ✅ FIX: Giới hạn phí ship hợp lý cho coffee/drinks
      // - Trong nội thành (< 5km): 15k-30k
      // - Ngoại thành (5-15km): 30k-60k
      // - Xa (> 15km): 60k-80k
      const MAX_SHIPPING_FEE = 40000; // Giảm từ 200k xuống 80k
      if (shippingFee > MAX_SHIPPING_FEE) {
        console.warn(
          `⚠️  Shipping fee ${shippingFee.toLocaleString()}đ exceeds max ${MAX_SHIPPING_FEE.toLocaleString()}đ. Using max value.`
        );
        console.warn(
          "   This might indicate GHN API returned incorrect value (insurance/cod amount instead of shipping fee)"
        );
        shippingFee = MAX_SHIPPING_FEE;
      }

      // ✅ Cache kết quả
      shippingCache.set(cacheKey, {
        fee: shippingFee,
        timestamp: Date.now(),
      });

      return res.json({
        success: true,
        shippingFee,
        distance: 0,
        message: "Phí ship từ GHN",
      });
    } catch (ghnError) {
      console.error("❌ GHN API Error:", ghnError.message);
      // ✅ Fallback về phí mặc định nếu GHN lỗi
      return res.json({
        success: true,
        shippingFee: 30000, // Phí mặc định nếu GHN lỗi
        distance: 0,
        message: "Phí ship mặc định (GHN tạm thời không khả dụng)",
      });
    }
  } catch (err) {
    console.error("CALCULATE SHIPPING FEE ERROR:", err.stack);
    res
      .status(500)
      .json({ success: false, message: "Lỗi server", error: err.message });
  }
};

// ✅ Geocode địa chỉ sử dụng OpenStreetMap Nominatim (miễn phí, không cần API key)
const geocodeAddress = async (req, res) => {
  try {
    const { address, ward, district, province } = req.body;

    if (!address || !province) {
      return res.status(400).json({
        success: false,
        message: "Thiếu thông tin địa chỉ!",
      });
    }

    const fullAddress = `${address}, ${ward || ""}, ${
      district || ""
    }, ${province}, Vietnam`;
    console.log("🔍 Geocoding address:", fullAddress);

    // Sử dụng Nominatim API (OpenStreetMap) - miễn phí
    const encodedAddress = encodeURIComponent(fullAddress);
    const url = `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=1`;

    const response = await axios.get(url, {
      headers: {
        "User-Agent": "SuLi-Coffee-App/1.0", // Nominatim yêu cầu User-Agent
      },
    });

    if (response.data && response.data.length > 0) {
      const { lat, lon } = response.data[0];
      console.log("✅ Geocoded coordinates:", { lat, lon });
      return res.json({
        success: true,
        data: {
          latitude: parseFloat(lat),
          longitude: parseFloat(lon),
        },
      });
    } else {
      // ✅ Fallback: Thử geocode với district + province (ít chi tiết hơn)
      console.warn(
        "⚠️ Không tìm thấy tọa độ cho địa chỉ đầy đủ, thử với district..."
      );
      const fallbackAddress = `${district || ""}, ${province}, Vietnam`;
      const fallbackUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        fallbackAddress
      )}&format=json&limit=1`;

      try {
        const fallbackResponse = await axios.get(fallbackUrl, {
          headers: { "User-Agent": "SuLi-Coffee-App/1.0" },
        });

        if (fallbackResponse.data && fallbackResponse.data.length > 0) {
          const { lat, lon } = fallbackResponse.data[0];
          console.log("✅ Geocoded using district fallback:", { lat, lon });
          return res.json({
            success: true,
            data: {
              latitude: parseFloat(lat),
              longitude: parseFloat(lon),
            },
          });
        }
      } catch (fallbackErr) {
        console.error("Fallback geocode error:", fallbackErr.message);
      }

      // ✅ Last resort: Tọa độ mặc định cho các tỉnh/thành phố lớn
      const defaultCoordinates = {
        "Hà Nội": { latitude: 21.0285, longitude: 105.8542 },
        "Thành phố Hà Nội": { latitude: 21.0285, longitude: 105.8542 },
        "Hồ Chí Minh": { latitude: 10.8231, longitude: 106.6297 },
        "Thành phố Hồ Chí Minh": { latitude: 10.8231, longitude: 106.6297 },
        "Đà Nẵng": { latitude: 16.0544, longitude: 108.2022 },
        "Thành phố Đà Nẵng": { latitude: 16.0544, longitude: 108.2022 },
      };

      for (const [cityName, coords] of Object.entries(defaultCoordinates)) {
        if (province && province.includes(cityName)) {
          console.log(`✅ Using default coordinates for ${cityName}:`, coords);
          return res.json({
            success: true,
            data: coords,
          });
        }
      }

      console.warn("⚠️ Không tìm thấy tọa độ cho địa chỉ:", fullAddress);
      return res.json({
        success: false,
        message: "Không tìm thấy tọa độ cho địa chỉ này",
      });
    }
  } catch (err) {
    console.error("GEOCODE ERROR:", err.message);
    res.status(500).json({
      success: false,
      message: "Lỗi khi geocode địa chỉ",
      error: err.message,
    });
  }
};

module.exports = {
  authenticateToken,
  getStores,
  getUserAddresses,
  saveUserAddress,
  calculateShippingFee,
  geocodeAddress, // ✅ Thêm hàm mới
};
