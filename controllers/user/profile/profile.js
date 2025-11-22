// controllers/user/profile/profile.js
const {
  Users,
  upload,
  uploadToSupabase,
  deleteFromSupabase,
  isSupabaseUrl,
  path,
  fs,
} = require("./config");

const getProfile = async (req, res) => {
  try {
    const user = await Users.findByPk(req.user.id, {
      attributes: [
        "Id",
        "Username",
        "Email",
        "FullName",
        "Phone",
        "Address",
        "Province",
        "District",
        "Ward",
        "Role",
        "AvatarUrl",
        "CreatedDate",
      ],
    });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy người dùng!" });
    }

    res.json({ success: true, data: user });
  } catch (err) {
    console.error("PROFILE ERROR:", err);
    res
      .status(500)
      .json({ success: false, message: "Lỗi server khi lấy thông tin user" });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { id, Username, Email, FullName, Phone, Address, Province, District, Ward } = req.body;
    const file = req.file;

    console.log("📝 UPDATE PROFILE REQUEST DATA:", {
      id,
      Username,
      Email,
      FullName,
      Phone,
      Address,
      Province,
      District,
      Ward,
    });

    if (req.user.id !== parseInt(id) && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "Bạn không có quyền chỉnh sửa!" });
    }

    const user = await Users.findByPk(id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy người dùng!" });
    }

    const errors = {};

    // Validate Username (nếu cung cấp)
    if (Username !== undefined) {
      if (!Username || !/^[a-zA-Z0-9_.-]{3,30}$/.test(Username.trim())) {
        errors.Username = "Username phải 3–30 ký tự, chỉ a-z, A-Z, 0-9, _ . -";
      }
    }

    // Validate Email (nếu cung cấp)
    if (Email !== undefined) {
      if (!Email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(Email.trim())) {
        errors.Email = "Email không đúng định dạng.";
      }
    }

    // Validate các field khác (giữ nguyên)
    if (FullName !== undefined && (!FullName || FullName.trim().length < 3))
      errors.FullName = "FullName phải ≥ 3 ký tự";
    if (Phone !== undefined && (!Phone || !/^(0[3|5|7|8|9])[0-9]{8,9}$/.test(Phone.trim()))) {
      errors.Phone = "Số điện thoại không hợp lệ (9-10 số)";
    }
    if (Address !== undefined && Address && Address.trim().length < 5)
      errors.Address = "Địa chỉ chi tiết phải ≥ 5 ký tự";
    if (Province !== undefined && (!Province || !Province.trim()))
      errors.Province = "Tỉnh/thành không hợp lệ";
    if (District !== undefined && (!District || !District.trim()))
      errors.District = "Quận/huyện không hợp lệ";
    if (Ward !== undefined && (!Ward || !Ward.trim()))
      errors.Ward = "Phường/xã không hợp lệ";

    if (Object.keys(errors).length > 0) {
      return res
        .status(400)
        .json({ success: false, message: Object.values(errors).join("\n") });
    }

    // Check trùng Username/Email (nếu thay đổi)
    const { Op } = require('sequelize'); // Import nếu chưa có ở config
    const checkFields = [];
    if (Username !== undefined && Username !== user.Username) {
      checkFields.push({ Username: Username.trim() });
    }
    if (Email !== undefined && Email !== user.Email) {
      checkFields.push({ Email: Email.trim() });
    }

    if (checkFields.length > 0) {
      const exists = await Users.findOne({
        where: {
          [Op.or]: checkFields,
          Id: { [Op.ne]: id }
        },
      });

      if (exists) {
        if (Username !== undefined && exists.Username === Username.trim()) {
          errors.Username = "Username đã tồn tại.";
        }
        if (Email !== undefined && exists.Email === Email.trim()) {
          errors.Email = "Email đã tồn tại.";
        }
        if (Object.keys(errors).length > 0) {
          return res.status(409).json({
            success: false,
            message: "Username hoặc Email đã tồn tại.",
            errors: Object.values(errors).join("\n")
          });
        }
      }
    }

    // Xử lý upload avatar (giữ nguyên)
    let avatarUrl = user.AvatarUrl || "";
    if (file) {
      const uploadResult = await uploadToSupabase(
        file.buffer,
        file.originalname,
        "Avatar"
      );
      if (!uploadResult.success) {
        return res
          .status(500)
          .json({
            success: false,
            message: `Lỗi upload avatar: ${uploadResult.error}`,
          });
      }
      avatarUrl = uploadResult.url;

      if (user.AvatarUrl && isSupabaseUrl(user.AvatarUrl)) {
        await deleteFromSupabase(user.AvatarUrl);
      } else if (user.AvatarUrl && user.AvatarUrl.trim()) {
        const oldPath = path.join(__dirname, "../../../public", user.AvatarUrl);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
    }

    // Update fields (chỉ nếu cung cấp)
    if (Username !== undefined) user.Username = Username.trim();
    if (Email !== undefined) user.Email = Email.trim();
    if (FullName !== undefined) user.FullName = FullName.trim();
    if (Phone !== undefined) user.Phone = Phone.trim();
    if (Address !== undefined) user.Address = Address.trim();
    if (Province !== undefined) user.Province = Province.trim();
    if (District !== undefined) user.District = District.trim();
    if (Ward !== undefined) user.Ward = Ward.trim();
    user.AvatarUrl = avatarUrl;

    await user.save();

    res.json({
      success: true,
      message: "Cập nhật thành công!",
      data: { 
        avatarUrl: avatarUrl !== user.AvatarUrl ? avatarUrl : undefined,
        ...(Username !== undefined && Username !== user.Username && { Username: user.Username }),
        ...(Email !== undefined && Email !== user.Email && { Email: user.Email }),
      },
    });
  } catch (err) {
    console.error("UPDATE USER ERROR:", err);
    res
      .status(500)
      .json({ success: false, message: "Có lỗi xảy ra khi cập nhật." });
  }
};

const getAvatar = async (req, res) => {
  try {
    const user = await Users.findByPk(req.user.id, {
      attributes: ["AvatarUrl"],
    });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy người dùng!" });
    }
    res.json({ success: true, data: { avatarUrl: user.AvatarUrl } });
  } catch (err) {
    res.status(500).json({ success: false, message: "Lỗi khi lấy avatar" });
  }
};

module.exports = { getProfile, updateProfile, getAvatar };
