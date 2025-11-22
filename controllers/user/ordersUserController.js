const {
  authenticateToken,
  getStores,
  getUserAddresses,
  getGHNLocations,
  calculateShippingFee,
  saveUserAddress,
  geocodeAddress, // ✅ Thêm hàm mới
} = require("./orders/orderUtils");
const { formatItem, prepareOrder } = require("./orders/prepareOrder");
const { placeOrder } = require("./orders/placeOrder");
const [confirmQRAuth, confirmQRPayment] = require("./orders/confirmQRPayment");
const { vnpayReturn, reOrder } = require("./orders/vnpayReturn");
const {
  savePending,
  getPendingOrders,
  getOrderById,
  autoCancelPendingOrders,
  cancelPendingOrder,
} = require("./orders/pending");

module.exports = {
  authenticateToken,
  formatItem,
  prepareOrder,
  placeOrder,
  confirmQRPayment,
  vnpayReturn,
  reOrder,
  savePending,
  getPendingOrders,
  getOrderById,
  autoCancelPendingOrders,
  cancelPendingOrder,
  getStores,
  getUserAddresses,
  getGHNLocations,
  calculateShippingFee,
  saveUserAddress,
  geocodeAddress, // ✅ Export hàm mới
};
