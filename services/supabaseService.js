const { createClient } = require("@supabase/supabase-js");

// Khởi tạo Supabase client
const supabaseUrl =
  process.env.SUPABASE_URL || "https://vhkvfmbmmsolqiwrjlxp.supabase.co";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoa3ZmbWJtbXNvbHFpd3JqbHhwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzA3MTgwMSwiZXhwIjoyMDc4NjQ3ODAxfQ.A7MwZQPyEj8LNqHPe3qFj4AGF5xvHhMkptjrLUv5jVY";

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Upload file to Supabase Storage
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} fileName - File name with extension
 * @param {string} folder - Folder in storage (e.g., 'images', 'Avatar', 'Cafe')
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
async function uploadToSupabase(fileBuffer, fileName, folder = "images") {
  try {
    console.log(`📤 Uploading to Supabase: ${folder}/${fileName}`);

    // Tạo unique filename để tránh trùng lặp
    const timestamp = Date.now();
    const uniqueFileName = `${timestamp}_${fileName}`;
    const filePath = `${folder}/${uniqueFileName}`;

    // Upload file
    const { data, error } = await supabase.storage
      .from("images") // bucket name
      .upload(filePath, fileBuffer, {
        contentType: getContentType(fileName),
        upsert: true, // Cho phép overwrite nếu file đã tồn tại
      });

    if (error) {
      console.error("❌ Supabase upload error:", error);
      return { success: false, error: error.message };
    }

    // Tạo public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from("images").getPublicUrl(filePath);

    console.log("✅ Upload successful:", publicUrl);
    return { success: true, url: publicUrl };
  } catch (err) {
    console.error("❌ Upload exception:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Delete file from Supabase Storage
 * @param {string} fileUrl - Full URL or file path
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function deleteFromSupabase(fileUrl) {
  try {
    // Extract file path từ URL
    const filePath = extractFilePathFromUrl(fileUrl);
    if (!filePath) {
      return { success: false, error: "Invalid file URL" };
    }

    const { error } = await supabase.storage.from("images").remove([filePath]);

    if (error) {
      console.error("❌ Supabase delete error:", error);
      return { success: false, error: error.message };
    }

    console.log("✅ File deleted:", filePath);
    return { success: true };
  } catch (err) {
    console.error("❌ Delete exception:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Get content type từ file extension
 */
function getContentType(fileName) {
  const ext = fileName.toLowerCase().split(".").pop();
  const contentTypes = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
  };
  return contentTypes[ext] || "application/octet-stream";
}

/**
 * Extract file path từ Supabase URL
 */
function extractFilePathFromUrl(url) {
  if (!url || typeof url !== "string") return null;

  // Nếu là URL đầy đủ của Supabase
  if (url.includes("supabase.co/storage/v1/object/public/images/")) {
    return url.split("public/images/")[1];
  }

  // Nếu là path tương đối
  if (url.startsWith("/images/")) {
    return url.replace("/images/", "");
  }

  return null;
}

/**
 * Check if URL is Supabase URL
 */
function isSupabaseUrl(url) {
  return url && url.includes("supabase.co/storage/v1/object/public");
}

module.exports = {
  uploadToSupabase,
  deleteFromSupabase,
  isSupabaseUrl,
  supabase,
};
