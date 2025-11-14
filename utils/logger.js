/**
 * utils/logger.js
 * - saveViolation(report): append one report to logs/violations.json
 * - loadViolations(): read logs/violations.json and return array
 * - mergeDataFile(): if data/violations.json exists, merge its entries into logs/violations.json (once)
 */

const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "..", "logs");
const LOG_FILE = path.join(LOG_DIR, "violations.json");
const DATA_FILE = path.join(__dirname, "..", "data", "violations.json");

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Read logs file
function loadViolations() {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    const raw = fs.readFileSync(LOG_FILE, "utf8");
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr;
    return [];
  } catch (err) {
    console.error("Error reading logs file:", err);
    return [];
  }
}

// Append and save
function saveViolation(report) {
  try {
    const arr = loadViolations();
    arr.push(report);
    fs.writeFileSync(LOG_FILE, JSON.stringify(arr, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing logs file:", err);
  }
}

// Pass logs file
const PASS_FILE = path.join(LOG_DIR, "passes.json");

// Load pass logs
function loadPasses() {
  try {
    if (!fs.existsSync(PASS_FILE)) return [];
    const raw = fs.readFileSync(PASS_FILE, "utf8");
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr;
    return [];
  } catch (err) {
    console.error("Error reading pass logs:", err);
    return [];
  }
}

// Save pass log
function savePass(passLog) {
  try {
    const arr = loadPasses();
    arr.push(passLog);
    // Limit to 1000 entries (keep latest)
    if (arr.length > 1000) {
      arr.splice(0, arr.length - 1000);
    }
    fs.writeFileSync(PASS_FILE, JSON.stringify(arr, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing pass log:", err);
  }
}

// If data/violations.json exists (legacy), merge entries into logs file and then (optionally) keep it.
// This prevents losing older reports if user previously stored them in data/
function mergeDataFile() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return;
    // load existing logs
    const existing = loadViolations();
    // naive merge: append items that don't have identical timestamp+document-uri
    const existingKeys = new Set(
      existing.map(
        (e) => (e.timestamp || "") + "||" + (e["document-uri"] || "")
      )
    );
    let added = 0;
    arr.forEach((item) => {
      const key = (item.timestamp || "") + "||" + (item["document-uri"] || "");
      if (!existingKeys.has(key)) {
        existing.push(item);
        added++;
      }
    });
    if (added > 0) {
      fs.writeFileSync(LOG_FILE, JSON.stringify(existing, null, 2), "utf8");
      console.log(
        `Merged ${added} entries from data/violations.json into logs/violations.json`
      );
    }
  } catch (err) {
    console.error("Error merging data file:", err);
  }
}

module.exports = {
  saveViolation,
  loadViolations,
  savePass,
  loadPasses,
  mergeDataFile,
};
