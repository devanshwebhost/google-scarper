import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const DATA_FOLDER = "./data"; 
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL; 
const PROCESSED_FILE = "./processed.json"; // ✅ track processed files

// Load already processed files safely
let processedFiles = [];
if (fs.existsSync(PROCESSED_FILE)) {
  try {
    const content = fs.readFileSync(PROCESSED_FILE, "utf-8").trim();
    processedFiles = content ? JSON.parse(content) : []; // agar empty ho to []
  } catch (err) {
    console.error("⚠️ processed.json corrupted, resetting...");
    processedFiles = [];
  }
}

async function readFilesAndSend() {
  const files = fs.readdirSync(DATA_FOLDER);

  for (const file of files) {
    if (processedFiles.includes(file)) {
      console.log(`⏭ Skipping already processed: ${file}`);
      continue;
    }

    const filePath = path.join(DATA_FOLDER, file);
    const rawData = fs.readFileSync(filePath, "utf-8");
    let jsonData;

    try {
      jsonData = JSON.parse(rawData);
    } catch (err) {
      console.error(`❌ Failed to parse ${file}:`, err);
      continue;
    }

    console.log(`📤 Sending ${file} to Google Sheets...`);

    try {
      const response = await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          sheetName: path.parse(file).name,
          data: jsonData,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });

      const result = await response.text();
      console.log(`✅ ${file} -> ${result}`);

      // ✅ Mark file as processed
      processedFiles.push(file);
      fs.writeFileSync(PROCESSED_FILE, JSON.stringify(processedFiles, null, 2));
    } catch (err) {
      console.error(`❌ Error sending ${file}:`, err);
    }
  }
}

readFilesAndSend();
