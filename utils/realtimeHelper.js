// realtimeHelper.js - Helper functions to emit real-time events

/**
 * Get socketManager from Express app
 * @param {Express.Request} req
 * @returns {Object|null} socketManager or null
 */
function getSocketManager(req) {
  try {
    return req.app.get("socketManager");
  } catch (err) {
    console.error("❌ Failed to get socketManager:", err);
    return null;
  }
}

/**
 * Emit order update to user
 * @param {Express.Request} req
 * @param {number} userId
 * @param {Object} orderData
 */
function emitOrderUpdate(req, userId, orderData) {
  const sm = getSocketManager(req);
  if (sm) {
    sm.emitToUser(userId, "order:update", orderData);
    sm.emitToAdmins("order:new", orderData); // Admin cũng nhận
  }
}

/**
 * Emit order status change
 * @param {Express.Request} req
 * @param {number} userId
 * @param {Object} data - { orderId, status, message }
 */
function emitOrderStatusChange(req, userId, data) {
  const sm = getSocketManager(req);
  if (sm) {
    sm.emitToUser(userId, "order:status", data);
    sm.emitToAdmins("order:status-change", { ...data, userId });
  }
}

/**
 * Emit new order notification to admins
 * @param {Express.Request} req
 * @param {Object} orderData
 */
function emitNewOrderToAdmin(req, orderData) {
  const sm = getSocketManager(req);
  if (sm) {
    sm.emitToAdmins("order:new", orderData);
  }
}

/**
 * Emit voucher update to user
 * @param {Express.Request} req
 * @param {number} userId
 * @param {Object} voucherData
 */
function emitVoucherUpdate(req, userId, voucherData) {
  const sm = getSocketManager(req);
  if (sm) {
    sm.emitToUser(userId, "voucher:update", voucherData);
  }
}

/**
 * Emit cart update to user
 * @param {Express.Request} req
 * @param {number} userId
 * @param {Object} cartData
 */
function emitCartUpdate(req, userId, cartData) {
  const sm = getSocketManager(req);
  if (sm) {
    sm.emitToUser(userId, "cart:update", cartData);
  }
}

/**
 * Emit product update to all users
 * @param {Express.Request} req
 * @param {Object} productData
 */
function emitProductUpdate(req, productData) {
  const sm = getSocketManager(req);
  if (sm) {
    sm.emitToAllUsers("product:update", productData);
  }
}

/**
 * Emit admin notification (for admin dashboard)
 * @param {Express.Request} req
 * @param {Object} data - { type, title, message, data }
 */
function emitAdminNotification(req, data) {
  const sm = getSocketManager(req);
  if (sm) {
    sm.emitToAdmins("notification", {
      timestamp: new Date().toISOString(),
      ...data,
    });
  }
}

/**
 * Emit user notification
 * @param {Express.Request} req
 * @param {number} userId
 * @param {Object} data - { type, title, message }
 */
function emitUserNotification(req, userId, data) {
  const sm = getSocketManager(req);
  if (sm) {
    sm.emitToUser(userId, "notification", {
      timestamp: new Date().toISOString(),
      ...data,
    });
  }
}

/**
 * Get connection statistics
 * @param {Express.Request} req
 * @returns {Object} stats
 */
function getConnectionStats(req) {
  const sm = getSocketManager(req);
  return sm ? sm.getStats() : { admin: 0, users: 0, anonymous: 0, total: 0 };
}

module.exports = {
  getSocketManager,
  emitOrderUpdate,
  emitOrderStatusChange,
  emitNewOrderToAdmin,
  emitVoucherUpdate,
  emitCartUpdate,
  emitProductUpdate,
  emitAdminNotification,
  emitUserNotification,
  getConnectionStats,
};
