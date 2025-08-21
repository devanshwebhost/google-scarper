require("dotenv").config();
const express = require("express");
const { GoogleSearch } = require("google-search-results-nodejs");
const axios = require("axios");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const archiver = require('archiver');

const app = express();
app.use(express.json());
app.use(cors());

// --- 🖥️ NEW API ENDPOINTS FOR VIEWING DATA FILES ---
// ==========================================================

const dataDirectory = path.join(__dirname, 'data');

// Endpoint 1: Lists all .json filenames in the /data directory
app.get('/api/files', (req, res) => {
    // Check if the data directory exists
    if (!fs.existsSync(dataDirectory)) {
        // If not, create it and return an empty array
        fs.mkdirSync(dataDirectory);
        return res.json([]);
    }

    fs.readdir(dataDirectory, (err, files) => {
        if (err) {
            console.error("❌ Failed to read data directory:", err);
            return res.status(500).json({ error: "Failed to read data directory" });
        }
        // Filter the results to only include .json files
        const jsonFiles = files.filter(file => path.extname(file).toLowerCase() === '.json');
        res.json(jsonFiles);
    });
});

// Endpoint 2: Gets the content of a specific JSON file
app.get('/api/data/:filename', (req, res) => {
    const { filename } = req.params;

    // 🛡️ SECURITY: Basic check to prevent users from accessing files outside the /data directory
    if (filename.includes('..') || filename.includes('/')) {
        return res.status(400).json({ error: 'Invalid filename provided.' });
    }

    const filePath = path.join(dataDirectory, filename);

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error(`❌ File not found or read error: ${filePath}`, err);
            return res.status(404).json({ error: "File not found." });
        }
        // Send the raw JSON content from the file
        res.setHeader('Content-Type', 'application/json');
        res.send(data);
    });
});

// ==========================================================
// --- END OF NEW SECTION ---

// ==========================================================
app.get('/api/download-all', (req, res) => {
    const archive = archiver('zip', {
        zlib: { level: 9 } // Sets the compression level.
    });

    // Tell the browser that this is a zip file download.
    res.attachment('all_scraper_data.zip');

    // Pipe the archive data to the response
    archive.pipe(res);

    // Find all .json files in the data directory
    const jsonFiles = fs.readdirSync(dataDirectory)
        .filter(file => path.extname(file).toLowerCase() === '.json');

    // Add each file to the archive
    jsonFiles.forEach(file => {
        const filePath = path.join(dataDirectory, file);
        archive.file(filePath, { name: file });
    });

    // Finalize the archive (this sends the zip to the user)
    archive.finalize();
});

// 🔑 Keys from .env
const SERPAPI_KEY = process.env.SERP_API;
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL; // Add your deployed Apps Script URL here

const client = new GoogleSearch(SERPAPI_KEY);

// ✅ Allowed IPs
app.use((req, res, next) => {
  let clientIP = req.ip;
  if (clientIP.startsWith("::ffff:")) clientIP = clientIP.replace("::ffff:", "");
  const allowedIPs = ["10.30.113.203", "127.0.0.1", "::1"];
  console.log("📡 Request from:", clientIP);
  if (allowedIPs.includes(clientIP)) return next();
  else return res.status(403).json({ error: "Access denied: Unauthorized IP" });
});

function extractEmails(text) {
  return text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
}

// ---------------- Scraper API ----------------
app.post("/search", async (req, res) => {
  const { site, location, category, num } = req.body;
  const query = `site:${site} ${location} ${category}`;
  const params = { engine: "google", q: query, num: Math.min(num, 1000) };

  client.json(params, async (data) => {
    console.log("🔍 Raw SerpAPI Response:", JSON.stringify(data, null, 2));

    const results = [];

    if (data.organic_results) {
      for (let r of data.organic_results) {
        let resultObj = {
          title: r.title || "",
          link: r.link || "",
          snippet: r.snippet || "",
          emails: [],
          website: "",
          location: ""
        };

        try {
          const page = await axios.get(r.link, { headers: { "User-Agent": "Mozilla/5.0" } });
          const html = page.data;
          resultObj.emails = extractEmails(html) || [];
        } catch (err) {
          console.log("❌ Failed to scrape:", r.link);
        }

        results.push(resultObj);
      }
    }

    // ✅ Save results to /data folder
    try {
      const dataDir = path.join(__dirname, "data");
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

      const fileName = query.replace(/[^a-zA-Z0-9]/g, "_") + "_" + Date.now() + ".json";
      const filePath = path.join(dataDir, fileName);

      fs.writeFileSync(filePath, JSON.stringify(results, null, 2), "utf-8");
      console.log("💾 Data saved locally at:", filePath);
    } catch (err) {
      console.error("❌ Failed to save local JSON:", err.message);
    }

    res.json(results);
  });
});

// ---------------- Auto-update to Google Sheets ----------------
const processedFilePath = path.join(__dirname, "processed.json");

// Helper: read processed.json
function readProcessed() {
  if (!fs.existsSync(processedFilePath)) {
    // agar file nahi hai to create karo with empty sentFiles
    const initial = { sentFiles: [] };
    fs.writeFileSync(processedFilePath, JSON.stringify(initial, null, 2), "utf-8");
    return initial;
  }

  try {
    const data = JSON.parse(fs.readFileSync(processedFilePath, "utf-8"));
    // ensure sentFiles array exists
    if (!data.sentFiles) data.sentFiles = [];
    return data;
  } catch (err) {
    console.error("❌ Failed to read processed.json, resetting it.", err);
    const initial = { sentFiles: [] };
    fs.writeFileSync(processedFilePath, JSON.stringify(initial, null, 2), "utf-8");
    return initial;
  }
}


// Helper: update processed.json
function updateProcessed(fileName) {
  const data = readProcessed();

  if (!data.sentFiles.includes(fileName)) {
    data.sentFiles.push(fileName);          // push file name
    fs.writeFileSync(processedFilePath, JSON.stringify(data, null, 2), "utf-8");
    console.log(`🟢 Updated processed.json with: ${fileName}`);
  }
}



// Modified sendDataToSheets
async function sendDataToSheets() {
  const DATA_FOLDER = path.join(__dirname, "data");
  const PROCESSED_FILE = path.join(__dirname, "done.json");

  // Load already processed files safely
  let processedFiles = [];
  if (fs.existsSync(PROCESSED_FILE)) {
    try {
      const content = fs.readFileSync(PROCESSED_FILE, "utf-8").trim();
      processedFiles = content ? JSON.parse(content) : []; // Handle empty file
    } catch (err) {
      console.error("⚠️ processed.json corrupted, resetting...");
      processedFiles = [];
    }
  }

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
      const response = await axios.post(GOOGLE_SCRIPT_URL, {
        sheetName: path.parse(file).name,
        data: jsonData,
      }, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      console.log(`✅ ${file} -> ${response.data}`);

      // ✅ Mark file as processed
      processedFiles.push(file);
      fs.writeFileSync(PROCESSED_FILE, JSON.stringify(processedFiles, null, 2));
      console.log(`📁 Added ${file} to processed.json`);
    } catch (err) {
      console.error(`❌ Error sending ${file}:`, err);
    }
  }
}

// 🔹 Run sendDataToSheets every 5 minutes
setInterval(() => {
  console.log("⏰ Running scheduled update to Google Sheets...");
  sendDataToSheets();
},300000); // 5 minutes

// ---------------- Start Server ----------------
app.listen(3000, () => console.log("🚀 Server running on http://localhost:3000"));
