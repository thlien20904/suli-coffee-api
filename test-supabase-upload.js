// Test Supabase upload functionality
const {
  uploadToSupabase,
  deleteFromSupabase,
  isSupabaseUrl,
} = require("./services/supabaseService");
const fs = require("fs");
const path = require("path");

async function testSupabaseUpload() {
  console.log("🧪 Testing Supabase upload service...");

  try {
    // Test isSupabaseUrl function
    console.log("\n1. Testing URL detection:");
    console.log(
      "   Supabase URL detected:",
      isSupabaseUrl(
        "https://vhkvfmbmmsolqiwrjlxp.supabase.co/storage/v1/object/public/images/test.jpg"
      )
    );
    console.log("   Local path detected:", isSupabaseUrl("/images/test.jpg"));
    console.log(
      "   Localhost URL detected:",
      isSupabaseUrl("http://localhost:3001/images/test.jpg")
    );

    // Test file upload (you can uncomment and use a real image file if available)

    const testImagePath = path.join(
      __dirname,
      "../public/images/1760635526688.png"
    );
    if (fs.existsSync(testImagePath)) {
      console.log("\n2. Testing file upload:");
      const fileBuffer = fs.readFileSync(testImagePath);

      const uploadResult = await uploadToSupabase(
        fileBuffer,
        "test-upload.png",
        "test"
      );
      if (uploadResult.success) {
        console.log("   ✅ Upload successful:", uploadResult.url);

        // Test delete
        console.log("\n3. Testing file deletion:");
        const deleteResult = await deleteFromSupabase(uploadResult.url);
        console.log("   ✅ Delete result:", deleteResult);
      } else {
        console.error("   ❌ Upload failed:", uploadResult.error);
      }
    } else {
      console.log("\n2. Test image not found at:", testImagePath);
    }

    console.log("\n✅ Supabase service tests completed!");
    console.log(
      "💡 Uncomment the file upload test section to test with a real image file."
    );
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

// Run the test
if (require.main === module) {
  testSupabaseUpload();
}

module.exports = { testSupabaseUpload };
