// routes/address.js
const express = require("express");
const router = express.Router();
const axios = require("axios");

const GHN_TOKEN = process.env.GHN_TOKEN;
const GHN_API =
  "https://dev-online-gateway.ghn.vn/shiip/public-api/master-data";
router.get("/test", (req, res) => {
  res.json({ success: true, message: "Route working!" });
});

// --- Lấy tỉnh ---
router.get("/provinces", async (req, res) => {
  try {
    const response = await axios.get(`${GHN_API}/province`, {
      headers: { Token: GHN_TOKEN, "Content-Type": "application/json" },
    });
    console.log("GHN response:", response.data);
    res.json({ success: true, data: response.data.data });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ success: false, message: "Lỗi lấy danh sách tỉnh" });
  }
});

// --- Lấy quận/huyện theo province_id ---
router.get("/districts/:provinceId", async (req, res) => {
  try {
    const provinceId = req.params.provinceId;
    const response = await axios.get(
      `${GHN_API}/district?province_id=${provinceId}`,
      {
        headers: { Token: GHN_TOKEN, "Content-Type": "application/json" },
      }
    );
    res.json({ success: true, data: response.data.data });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Lỗi lấy danh sách quận/huyện" });
  }
});

// --- Lấy xã/phường theo district_id ---
router.get("/wards/:districtId", async (req, res) => {
  try {
    const districtId = req.params.districtId;
    const response = await axios.get(
      `${GHN_API}/ward?district_id=${districtId}`,
      {
        headers: { Token: GHN_TOKEN, "Content-Type": "application/json" },
      }
    );
    res.json({ success: true, data: response.data.data });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Lỗi lấy danh sách xã/phường" });
  }
});

module.exports = router;
