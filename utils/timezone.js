/**
 * Lấy thời gian hiện tại theo múi giờ Việt Nam (UTC+7)
 * Tự động phát hiện server timezone và convert đúng
 * @returns {Date} Date object UTC đã được điều chỉnh sang giờ Việt Nam
 */
function getVietnamTime() {
  // Tạo date string theo timezone Việt Nam
  const now = new Date();
  const vietnamTimeString = now.toLocaleString('en-US', { 
    timeZone: 'Asia/Ho_Chi_Minh' 
  });
  // Parse lại thành Date object
  return new Date(vietnamTimeString);
}

/**
 * Convert bất kỳ Date object nào sang múi giờ Việt Nam
 * @param {Date} date - Date object cần convert
 * @returns {Date} Date object đã được điều chỉnh sang múi giờ Việt Nam
 */
function toVietnamTime(date) {
  if (!(date instanceof Date)) {
    date = new Date(date);
  }
  const vietnamTimeString = date.toLocaleString('en-US', { 
    timeZone: 'Asia/Ho_Chi_Minh' 
  });
  return new Date(vietnamTimeString);
}

module.exports = {
  getVietnamTime,
  toVietnamTime,
};
