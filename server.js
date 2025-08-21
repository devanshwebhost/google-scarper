require("dotenv").config();
const express = require("express");
const { GoogleSearch } = require("google-search-results-nodejs");
const axios = require("axios");
const cors = require("cors");
const fs = require("fs");              
const path = require("path");          

const app = express();
app.use(express.json());
app.use(cors());

// 🔑 Keys from .env
const SERPAPI_KEY = process.env.SERP_API;

const client = new GoogleSearch(SERPAPI_KEY);

// ✅ Allowed IPs (tumhare PC + future me mobile bhi add kar sakte ho)
// const allowedIPs = ["10.30.113.203"];

// // Middleware: check client IP
// app.use((req, res, next) => {
//   const clientIP = req.ip.replace("::ffff:", ""); // normalize IPv4
//   console.log("📡 Request from:", clientIP);

//   if (allowedIPs.includes(clientIP)) {
//     return next(); // ✅ allow
//   } else {
//     return res.status(403).json({ error: "Access denied: Unauthorized IP" });
//   }
// });

app.use((req, res, next) => {
  let clientIP = req.ip;

  // IPv4 normalize
  if (clientIP.startsWith("::ffff:")) {
    clientIP = clientIP.replace("::ffff:", "");
  }

  // Localhost (IPv6 & IPv4) allow
  const allowedIPs = ["10.30.113.203", "127.0.0.1", "::1"];

  console.log("📡 Request from:", clientIP);

  if (allowedIPs.includes(clientIP)) {
    return next();
  } else {
    return res.status(403).json({ error: "Access denied: Unauthorized IP" });
  }
});


function extractEmails(text) {
  return text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
}

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
          const page = await axios.get(r.link, {
            headers: { "User-Agent": "Mozilla/5.0" }
          });
          const html = page.data;

          resultObj.emails = extractEmails(html) || [];
        } catch (err) {
          console.log("❌ Failed to scrape:", r.link);
        }

        results.push(resultObj);
      }
    }

    // ✅ Save results into /data folder as JSON file
    try {
      const dataDir = path.join(__dirname, "data");
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir);
      }

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

app.listen(3000, () =>
  console.log("🚀 Server running on http://localhost:3000")
);
