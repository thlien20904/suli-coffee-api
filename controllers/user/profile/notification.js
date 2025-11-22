// controllers/user/profile/notification.js
const { Notifications } = require("./config");


// =========================
// 📌 LẤY DANH SÁCH THÔNG BÁO (Giữ nguyên)
// =========================
const getNotifications = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 4;
    const offset = (page - 1) * pageSize;

    const notifications = await Notifications.findAll({
      where: { UserId: req.user.id },
      attributes: ["NotificationId", "Title", "Message", "IsRead", "CreatedAt"],
      order: [["CreatedAt", "DESC"]],
      offset,
      limit: pageSize,
    });

    const total = await Notifications.count({
      where: { UserId: req.user.id },
    });

    res.json({
      success: true,
      data: {
        notifications,
        total,
        currentPage: page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error("GET NOTIFICATIONS ERROR:", err);
    res
      .status(500)
      .json({ success: false, message: "Lỗi khi lấy danh sách thông báo." });
  }
};

// =========================
// 📌 ĐÁNH DẤU THÔNG BÁO LÀ ĐÃ ĐỌC (Giữ nguyên)
// =========================
const readNotification = async (req, res) => {
  try {
    const { notificationId } = req.body;
    if (!notificationId) {
      return res.json({ success: false, message: "Thiếu notificationId!" });
    }

    const notification = await Notifications.findOne({
      where: { NotificationId: notificationId, UserId: req.user.id },
    });

    if (!notification) {
      return res.json({ success: false, message: "Không tìm thấy thông báo!" });
    }

    await notification.update({ IsRead: true });

    res.json({ success: true, message: "Đã đánh dấu là đã đọc!" });
  } catch (err) {
    console.error("READ NOTIFICATION ERROR:", err);
    res
      .status(500)
      .json({ success: false, message: "Lỗi khi cập nhật thông báo." });
  }
};

// =========================
// 📌 ĐÁNH DẤU TẤT CẢ THÔNG BÁO LÀ ĐÃ ĐỌC (Giữ nguyên)
// =========================
const readAllNotifications = async (req, res) => {
  try {
    await Notifications.update(
      { IsRead: true },
      { where: { UserId: req.user.id } }
    );

    res.json({
      success: true,
      message: "Đã đánh dấu tất cả thông báo là đã đọc!",
    });
  } catch (err) {
    console.error("READ ALL NOTIFICATIONS ERROR:", err);
    res
      .status(500)
      .json({ success: false, message: "Lỗi khi cập nhật tất cả thông báo." });
  }
};

// =========================
// 📌 XÓA MỘT THÔNG BÁO (Giữ nguyên)
// =========================
const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Notifications.destroy({
      where: { NotificationId: id, UserId: req.user.id },
    });

    if (result === 0) {
      return res.json({ success: false, message: "Không tìm thấy thông báo." });
    }

    res.json({ success: true, message: "Đã xóa thông báo thành công!" });
  } catch (err) {
    console.error("DELETE NOTIFICATION ERROR:", err);
    res.status(500).json({ success: false, message: "Lỗi khi xóa thông báo." });
  }
};

module.exports = {
  getNotifications,
  readNotification,
  readAllNotifications,
  deleteNotification,
};