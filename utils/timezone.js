/**
 * Lấy thời gian hiện tại theo múi giờ Việt Nam (UTC+7)
 * @returns {Date} Date object đã được điều chỉnh sang múi giờ Việt Nam
 */
function getVietnamTime() {
  const now = new Date();
  // Lấy UTC timestamp và cộng thêm 7 giờ
  const vietnamTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return vietnamTime;
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
  // Lấy offset hiện tại của date (tính bằng phút)
  const offset = date.getTimezoneOffset();
  // Convert sang Việt Nam (UTC+7 = -420 phút)
  const vietnamOffset = -420;
  const diffMinutes = vietnamOffset - offset;
  return new Date(date.getTime() + diffMinutes * 60 * 1000);
}

module.exports = {
  getVietnamTime,
  toVietnamTime,
};
