// ghnService.js - GHN (Giao Hàng Nhanh) API Integration
const axios = require("axios");
require("dotenv").config();

const GHN_API_BASE =
  process.env.GHN_API_BASE ||
  "https://dev-online-gateway.ghn.vn/shiip/public-api";
const GHN_TOKEN = process.env.GHN_TOKEN;
const GHN_SHOP_ID = process.env.GHN_SHOP_ID;

// ✅ Cấu hình cửa hàng mặc định: SuLiCoffee - Cầu Giấy, Hà Nội
const DEFAULT_STORE = {
  fromDistrictId: parseInt(process.env.GHN_DEFAULT_FROM_DISTRICT_ID) || 1485, // Cầu Giấy
  fromWardCode: process.env.GHN_DEFAULT_FROM_WARD_CODE || "1A0601", // Dịch Vọng
  fromName: process.env.GHN_DEFAULT_FROM_NAME || "SuLiCoffee",
  fromPhone: process.env.GHN_DEFAULT_FROM_PHONE || "0366413924",
  fromAddress:
    process.env.GHN_DEFAULT_FROM_ADDRESS ||
    "2 Trần Đăng Ninh, Dịch Vọng, Cầu Giấy, Hà Nội",
};

/**
 * Tính phí ship GHN
 * @param {Object} params
 * @returns {Promise<number>} - Phí ship (VNĐ)
 */
async function calculateGHNShippingFee(params) {
  const { toDistrictId, toWardCode, items = [] } = params;

  if (!toDistrictId || !toWardCode)
    throw new Error("Thiếu thông tin địa chỉ giao hàng");
  if (!items.length) throw new Error("Thiếu thông tin sản phẩm");

  // Format items cho GHN
  const ghnItems = items.map((item) => ({
    name: item.name || "Sản phẩm",
    code: item.code || item.foodId || "",
    quantity: item.quantity || 1,
    length: item.length || 15,
    width: item.width || 10,
    height: item.height || 20,
    weight: item.weight || 500,
  }));

  // Tính tổng khối lượng
  const totalWeight = ghnItems.reduce(
    (sum, item) => sum + item.weight * item.quantity,
    0
  );

  // Chọn service_type_id tự động
  const serviceTypeId = totalWeight <= 2000 && items.length === 1 ? 2 : 5;

  // Tính kích thước theo GHN nếu là Hàng nặng
  const length =
    serviceTypeId === 2 ? 15 : Math.max(...ghnItems.map((i) => i.length));
  const width =
    serviceTypeId === 2 ? 10 : Math.max(...ghnItems.map((i) => i.width));
  const height =
    serviceTypeId === 2
      ? 20
      : ghnItems.reduce((sum, i) => sum + i.height * i.quantity, 0);

  // Payload gửi GHN
  const payload = {
    service_type_id: serviceTypeId,
    from_district_id: DEFAULT_STORE.fromDistrictId,
    from_ward_code: DEFAULT_STORE.fromWardCode,
    to_district_id: parseInt(toDistrictId),
    to_ward_code: String(toWardCode),
    length,
    width,
    height,
    weight: totalWeight,
    insurance_value: 0,
    coupon: null,
    items: serviceTypeId === 2 ? undefined : ghnItems,
  };

  console.log("\n📦 ===== GHN SHIPPING FEE CALCULATION =====");
  console.log(
    "From District:",
    DEFAULT_STORE.fromDistrictId,
    "| To District:",
    toDistrictId
  );
  console.log("To Ward Code:", toWardCode);
  console.log("Service Type:", serviceTypeId === 2 ? "Hàng nhẹ" : "Hàng nặng");
  console.log("Total Weight:", totalWeight, "g | Items:", items.length);
  console.log("Dimensions (L×W×H):", `${length}×${width}×${height} cm`);

  // ⚠️ Warning nếu district có vẻ không hợp lệ
  if (toDistrictId === 1454) {
    console.warn(
      "⚠️  WARNING: District 1454 (Ba Đình) không tồn tại trong GHN!"
    );
    console.warn("⚠️  Vui lòng update Master Data từ GHN API");
  }

  try {
    const response = await axios.post(
      `${GHN_API_BASE}/v2/shipping-order/fee`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Token: GHN_TOKEN,
          ShopId: GHN_SHOP_ID,
        },
      }
    );

    if (response.data.code !== 200) {
      console.error("❌ GHN API Error:", response.data);
      throw new Error(response.data.message || "GHN API error");
    }

    const shippingFee = response.data.data.total;
    console.log("✅ GHN Shipping Fee:", shippingFee.toLocaleString(), "VNĐ");
    console.log("==========================================\n");
    return shippingFee;
  } catch (error) {
    console.error(
      "❌ GHN Calculate Shipping Error:",
      error.response?.data || error.message
    );
    throw error;
  }
}

/**
 * Tạo đơn hàng GHN
 */
async function createGHNOrder(orderData) {
  const {
    toName,
    toPhone,
    toAddress,
    toWardCode,
    toDistrictId,
    toProvinceName,
    toDistrictName,
    toWardName,
    toLatitude,
    toLongitude,
    items = [],
    codAmount = 0,
    content = "Đồ uống",
    note = "",
    requiredNote = "KHONGCHOXEMHANG",
    paymentTypeId = 2,
  } = orderData;

  if (!toName || !toPhone || !toAddress || !toDistrictId || !toWardCode)
    throw new Error("Thiếu thông tin người nhận");
  if (!items.length) throw new Error("Thiếu thông tin sản phẩm");

  // Format items
  const ghnItems = items.map((item) => ({
    name: item.name || "Sản phẩm",
    code: item.code || item.foodId || "",
    quantity: item.quantity || 1,
    price: item.price || 0,
    length: item.length || 15,
    width: item.width || 10,
    height: item.height || 20,
    weight: item.weight || 500,
    category: { level1: item.category || "Đồ uống" },
  }));

  const totalWeight = ghnItems.reduce(
    (sum, item) => sum + item.weight * item.quantity,
    0
  );

  // ✅ Chọn service_type_id tự động
  const serviceTypeId = totalWeight > 3000 || items.length > 1 ? 5 : 2;

  // Payload GHN
  const payload =
    serviceTypeId === 2
      ? {
          service_type_id: 2,
          payment_type_id: paymentTypeId,
          note,
          required_note: requiredNote,
          return_phone: DEFAULT_STORE.fromPhone,
          return_address: DEFAULT_STORE.fromAddress,
          return_district_id: DEFAULT_STORE.fromDistrictId,
          return_ward_code: DEFAULT_STORE.fromWardCode,
          client_order_code: orderData.clientOrderCode || "",
          from_name: DEFAULT_STORE.fromName,
          from_phone: DEFAULT_STORE.fromPhone,
          from_address: DEFAULT_STORE.fromAddress,
          from_ward_name: "Dịch Vọng",
          from_district_name: "Cầu Giấy",
          from_province_name: "Hà Nội",
          to_name: toName,
          to_phone: toPhone,
          to_address: `${
            toWardName || toDistrictName
          }, ${toDistrictName}, Hà Nội`,
          to_ward_code: String(toWardCode),
          to_district_id: parseInt(toDistrictId),
          to_ward_name: toWardName || "",
          to_district_name: toDistrictName || "",
          to_province_name: toProvinceName || "",
          ...(toLatitude && toLongitude
            ? {
                to_latitude: parseFloat(toLatitude),
                to_longitude: parseFloat(toLongitude),
              }
            : {}),
          cod_amount: codAmount,
          content,
          weight: totalWeight,
          length: 15,
          width: 10,
          height: 20,
          insurance_value: codAmount > 3000000 ? codAmount : 0,
          coupon: null,
        }
      : {
          service_type_id: 5,
          payment_type_id: paymentTypeId,
          note,
          required_note: requiredNote,
          return_phone: DEFAULT_STORE.fromPhone,
          return_address: DEFAULT_STORE.fromAddress,
          return_district_id: DEFAULT_STORE.fromDistrictId,
          return_ward_code: DEFAULT_STORE.fromWardCode,
          client_order_code: orderData.clientOrderCode || "",
          from_name: DEFAULT_STORE.fromName,
          from_phone: DEFAULT_STORE.fromPhone,
          from_address: DEFAULT_STORE.fromAddress,
          from_ward_name: "Dịch Vọng",
          from_district_name: "Cầu Giấy",
          from_province_name: "Hà Nội",
          to_name: toName,
          to_phone: toPhone,
          to_address: `${
            toWardName || toDistrictName
          }, ${toDistrictName}, Hà Nội`,
          to_ward_code: String(toWardCode),
          to_district_id: parseInt(toDistrictId),
          to_ward_name: toWardName || "",
          to_district_name: toDistrictName || "",
          to_province_name: toProvinceName || "",
          ...(toLatitude && toLongitude
            ? {
                to_latitude: parseFloat(toLatitude),
                to_longitude: parseFloat(toLongitude),
              }
            : {}),
          cod_amount: codAmount,
          content,
          weight: totalWeight,
          insurance_value: codAmount > 3000000 ? codAmount : 0,
          coupon: null,
          items: ghnItems, // bắt buộc cho hàng nặng
        };

  console.log("\n🚀 ===== GHN CREATE ORDER REQUEST =====");
  console.log(
    "Service Type:",
    serviceTypeId === 2 ? "Hàng nhẹ (2)" : "Hàng nặng (5)"
  );
  console.log(
    "From:",
    DEFAULT_STORE.fromName,
    "- District:",
    DEFAULT_STORE.fromDistrictId
  );
  console.log("To:", toName, "- District:", toDistrictId, "Ward:", toWardCode);
  console.log("COD Amount:", codAmount);
  console.log("Items:", ghnItems.length);
  console.log("Full Payload:", JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(
      `${GHN_API_BASE}/v2/shipping-order/create`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Token: GHN_TOKEN,
          ShopId: GHN_SHOP_ID,
        },
      }
    );

    console.log("✅ GHN API Response Code:", response.data.code);
    console.log("Response Data:", JSON.stringify(response.data, null, 2));

    if (response.data.code !== 200) {
      console.error("❌ GHN Create Order Error:", response.data);
      throw new Error(response.data.message || "GHN create order failed");
    }

    console.log("====================================\n");

    return {
      success: true,
      ghnOrderCode: response.data.data.order_code,
      sortingCode: response.data.data.sort_code,
      transId: response.data.data.trans_id,
      totalFee: response.data.data.total_fee,
      expectedDeliveryTime: response.data.data.expected_delivery_time,
    };
  } catch (error) {
    console.error(
      "❌ GHN Create Order Exception:",
      error.response?.data || error.message
    );
    console.log("====================================\n");
    throw error;
  }
}

/**
 * Lấy chi tiết đơn hàng GHN
 */
async function getGHNOrderDetail(orderCode) {
  try {
    const response = await axios.post(
      `${GHN_API_BASE}/v2/shipping-order/detail`,
      { order_code: orderCode },
      {
        headers: {
          "Content-Type": "application/json",
          Token: GHN_TOKEN,
        },
      }
    );

    if (response.data.code !== 200) {
      throw new Error(
        response.data.message || "Failed to get GHN order detail"
      );
    }

    return response.data.data;
  } catch (error) {
    console.error(
      "❌ Get GHN Order Detail Error:",
      error.response?.data || error.message
    );
    throw error;
  }
}

/**
 * Lấy chi tiết đơn hàng GHN theo client_order_code
 */
async function getGHNOrderByClientCode(clientOrderCode) {
  try {
    const response = await axios.post(
      `${GHN_API_BASE}/v2/shipping-order/detail-by-client-code`,
      { client_order_code: clientOrderCode },
      {
        headers: {
          "Content-Type": "application/json",
          Token: GHN_TOKEN,
        },
      }
    );

    if (response.data.code !== 200) {
      throw new Error(
        response.data.message || "Failed to get GHN order by client code"
      );
    }

    return response.data.data;
  } catch (error) {
    console.error(
      "❌ Get GHN Order By Client Code Error:",
      error.response?.data || error.message
    );
    throw error;
  }
}

/**
 * Đồng bộ trạng thái đơn từ GHN
 * GHN Status: ready_to_pick, picking, cancel, delivered, return, etc.
 */
function mapGHNStatusToLocal(ghnStatus) {
  const statusMap = {
    ready_to_pick: 1, // Chờ xác nhận
    picking: 2, // Đang xử lý
    delivering: 3, // Đang giao
    delivered: 4, // Đã giao
    cancel: 5, // Đã hủy
    return: 5, // Trả hàng -> Đã hủy
    returned: 5, // Đã trả hàng -> Đã hủy
  };
  return statusMap[ghnStatus] || 1;
}

/**
 * Hủy đơn hàng GHN
 */
async function cancelGHNOrder(orderCode) {
  try {
    await axios.post(
      `${GHN_API_BASE}/v2/switch-status/cancel`,
      { order_codes: [orderCode] },
      {
        headers: {
          "Content-Type": "application/json",
          Token: GHN_TOKEN,
          ShopId: GHN_SHOP_ID,
        },
      }
    );
    console.log("✅ GHN Order Cancelled:", orderCode);
    return true;
  } catch (error) {
    console.error(
      "❌ GHN Cancel Order Error:",
      error.response?.data || error.message
    );
    throw error;
  }
}

module.exports = {
  calculateGHNShippingFee,
  createGHNOrder,
  cancelGHNOrder,
  getGHNOrderDetail,
  getGHNOrderByClientCode,
  mapGHNStatusToLocal,
  DEFAULT_STORE,
};
