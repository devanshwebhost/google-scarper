// save as sendToGoogleSheets.js
import fs from "fs";
import path from "path";
// import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const DATA_FOLDER = "./data"; // your folder with JSON/CSV files
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL; // Your deployed Web App URL

// Helper: read all files
async function readFilesAndSend() {
  const files = fs.readdirSync(DATA_FOLDER);

  for (const file of files) {
    const filePath = path.join(DATA_FOLDER, file);
    const rawData = fs.readFileSync(filePath, "utf-8");
    let jsonData;

    try {
      jsonData = JSON.parse(rawData); // assume JSON files
    } catch (err) {
      console.error(`❌ Failed to parse ${file}:`, err);
      continue;
    }

    console.log(`📤 Sending ${file} to Google Sheets...`);

    // Send data to Google Apps Script
    try {
      const response = await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          sheetName: path.parse(file).name, // new sheet with file name
          data: jsonData,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });

      const result = await response.text();
      console.log(`✅ ${file} -> ${result}`);
    } catch (err) {
      console.error(`❌ Error sending ${file}:`, err);
    }
  }
}

// Run script
readFilesAndSend();
