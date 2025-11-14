// Temporary fix - fallback to local upload when Supabase fails
const {
  uploadToSupabase,
  deleteFromSupabase,
  isSupabaseUrl,
} = require("../../services/supabaseService");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

/**
 * Hybrid upload function - tries Supabase first, falls back to local
 */
async function hybridUpload(
  fileBuffer,
  fileName,
  folder,
  fallbackDir = "../../public/images"
) {
  try {
    // Try Supabase first
    const supabaseResult = await uploadToSupabase(fileBuffer, fileName, folder);
    if (supabaseResult.success) {
      console.log("✅ Uploaded to Supabase:", supabaseResult.url);
      return { success: true, url: supabaseResult.url, type: "supabase" };
    }

    console.log(
      "⚠️ Supabase failed, falling back to local:",
      supabaseResult.error
    );

    // Fallback to local upload
    const uploadPath = path.join(__dirname, fallbackDir);
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    const fileExt = path.extname(fileName).toLowerCase();
    const uniqueName = crypto.randomUUID() + fileExt;
    const filePath = path.join(uploadPath, uniqueName);

    fs.writeFileSync(filePath, fileBuffer);
    const localUrl = `/images/${uniqueName}`;

    console.log("✅ Uploaded to local storage:", localUrl);
    return { success: true, url: localUrl, type: "local" };
  } catch (error) {
    console.error("❌ Both Supabase and local upload failed:", error);
    return { success: false, error: error.message };
  }
}

module.exports = { hybridUpload };
