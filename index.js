require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const rateLimit = require("express-rate-limit");
const { Pool } = require("pg");
const { registerFont, createCanvas } = require("canvas");

// --- Configuration ---
const app = express();
const port = process.env.PORT || 3000;
const GEMINI_MODEL = "gemini-2.5-flash";
const uniqueVisitors = new Set();

// --- Load Font (Moul) ---
try {
    registerFont(path.join(__dirname, "public", "Moul.ttf"), { family: "Moul" });
    console.log("✅ Font 'Moul' loaded successfully.");
} catch (e) {
    console.warn("⚠️ Font Error: Could not load Moul.ttf");
}

// --- Database Connection ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- Rate Limiter ---
const apiLimiter = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, // 8 Hours
    max: 10, // Limit each IP to 10 requests per windowMs
    message: { error: "Limit Exceeded" },
    keyGenerator: (req) => req.ip,
    skip: (req) => req.ip === process.env.OWNER_IP
});

// --- Middleware ---
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- Security Script (Anti-Debug/Anti-RightClick for Admin) ---
const securityScript = `
<script>
    !function(){
        setInterval(()=>{
            var start = new Date();
            debugger;
            if (new Date() - start > 100) {
                document.body.innerHTML = '<div style="background:#000;color:red;height:100vh;display:flex;justify-content:center;align-items:center;font-size:50px;font-weight:bold;">SYSTEM LOCKED</div>';
            }
        }, 50);
        document.addEventListener("contextmenu", e => e.preventDefault());
        document.addEventListener("keydown", e => {
            if (e.keyCode == 123 || (e.ctrlKey && (e.keyCode == 85 || e.keyCode == 73 || e.keyCode == 74))) {
                e.preventDefault();
                return false;
            }
        });
    }();
</script>
<style>*{user-select:none;-webkit-user-select:none;cursor:default}</style>
`;

// =========================================
// ROUTES
// =========================================

// 1. Home Route
app.get("/", (req, res) => {
    res.send(`<body style="background:#000;color:#0f0;display:flex;justify-content:center;align-items:center;height:100vh;font-family:monospace"><h1>SYSTEM ONLINE</h1>${securityScript}</body>`);
});

// 2. Stats
app.get("/stats", (req, res) => res.json({ users: uniqueVisitors.size }));

// 3. Generate Math Problem (AI)
app.post("/api/generate-problem", apiLimiter, async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.sendStatus(400);

        uniqueVisitors.add(req.ip);
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
        const result = await model.generateContent(prompt);
        
        res.json({ text: result.response.text() });
    } catch (e) {
        console.error("AI Error:", e);
        res.sendStatus(500);
    }
});

// 4. Submit to Leaderboard
app.post("/api/leaderboard/submit", async (req, res) => {
    const { username, score, difficulty } = req.body;
    try {
        const client = await pool.connect();
        await client.query(
            "INSERT INTO leaderboard(username, score, difficulty) VALUES($1, $2, $3)",
            [username.substring(0, 25), score, difficulty]
        );
        client.release();
        res.json({ success: true });
    } catch (e) {
        res.sendStatus(500);
    }
});

// 5. Get Leaderboard
app.get("/api/leaderboard/top", async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query(
            "SELECT username, score, difficulty FROM leaderboard ORDER BY score DESC LIMIT 1000"
        );
        client.release();
        res.json(result.rows);
    } catch (e) {
        res.sendStatus(500);
    }
});

// 6. Submit Certificate Request
app.post("/api/submit-request", async (req, res) => {
    const { username, score } = req.body;
    try {
        const client = await pool.connect();
        await client.query(
            "INSERT INTO certificate_requests(username, score, request_date) VALUES($1, $2, NOW())",
            [username, score]
        );
        client.release();
        res.json({ success: true });
    } catch (e) {
        res.sendStatus(500);
    }
});

// 7. Admin Panel (View Requests)
app.get("/admin/requests", async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query(
            "SELECT * FROM certificate_requests ORDER BY request_date DESC LIMIT 50"
        );
        client.release();

        let html = `${securityScript}
        <table border="1" style="width:100%;border-collapse:collapse;font-family:sans-serif">
            <thead>
                <tr style="background:#333;color:#fff">
                    <th>ID</th><th>Name</th><th>Score</th><th>Action</th>
                </tr>
            </thead>
            <tbody>`;
            
        result.rows.forEach(row => {
            html += `<tr>
                <td>${row.id}</td>
                <td><b>${row.username}</b></td>
                <td>${row.score}</td>
                <td><a href="/admin/generate-cert/${row.id}" target="_blank" style="color:blue;font-weight:bold">PRINT</a></td>
            </tr>`;
        });
        
        res.send(html + "</tbody></table>");
    } catch (e) {
        res.sendStatus(500);
    }
});

// 8. Generate Certificate (Canvas) - The Complex Part
app.get("/admin/generate-cert/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const client = await pool.connect();
        const result = await client.query("SELECT * FROM certificate_requests WHERE id=$1", [id]);
        client.release();

        if (result.rows.length === 0) return res.sendStatus(404);

        const { username, score, request_date } = result.rows[0];
        const dateObj = new Date(request_date);
        const khmerMonths = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"];
        const dateString = `ថ្ងៃទី ${dateObj.getDate().toString().padStart(2, "0")} ខែ ${khmerMonths[dateObj.getMonth()]} ឆ្នាំ ${dateObj.getFullYear()}`;

        // --- Canvas Setup ---
        const width = 2000;
        const height = 1414;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext("2d");

        // 1. Background (White)
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, width, height);

        // 2. Watermark (Rotated)
        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.rotate(-Math.PI / 6);
        ctx.font = 'bold 150px Arial';
        ctx.fillStyle = "rgba(200, 200, 200, 0.1)"; // Very faint gray
        ctx.textAlign = "center";
        ctx.fillText("Math Quiz Pro", 0, 0);
        ctx.restore();

        // 3. Borders (Gold)
        ctx.lineWidth = 40;
        ctx.strokeStyle = "#B45309"; // Dark Gold
        ctx.strokeRect(40, 40, 1920, 1334);

        ctx.lineWidth = 10;
        ctx.strokeStyle = "#F59E0B"; // Light Gold
        ctx.strokeRect(90, 90, 1820, 1234);

        // 4. Headers
        ctx.textAlign = "center";
        
        // "Certificate" Title
        ctx.fillStyle = "#1E3A8A"; // Dark Blue
        ctx.font = '70px "Moul"';
        ctx.fillText("លិខិតសរសើរ", 1000, 300);

        // "Presented To"
        ctx.font = '40px "Moul"';
        ctx.fillStyle = "#475569"; // Slate Gray
        ctx.fillText("ប្រគល់ជូនដោយសេចក្តីគោរពចំពោះ", 1000, 400);

        // 5. Recipient Name (Golden Gradient & Shadow)
        const gradient = ctx.createLinearGradient(600, 0, 1400, 0);
        gradient.addColorStop(0, "#854d0e");   // Dark
        gradient.addColorStop(0.4, "#fde047"); // Bright
        gradient.addColorStop(0.6, "#fef08a"); // Very Bright
        gradient.addColorStop(1, "#854d0e");   // Dark

        ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
        ctx.shadowBlur = 20;
        ctx.fillStyle = gradient;
        ctx.font = '200px "Moul"'; // BIG SIZE
        ctx.fillText(username, 1000, 650);
        ctx.shadowBlur = 0; // Reset shadow

        // 6. Score
        ctx.fillStyle = "#DC2626"; // Red
        ctx.font = 'bold 60px Arial';
        ctx.fillText(`ពិន្ទុសរុប: ${score}`, 1000, 780);

        // 7. Body Text
        ctx.fillStyle = "#334155";
        ctx.font = '45px "Moul"';
        let bodyY = 920;
        ctx.fillText("ប្អូនបានបញ្ចេញសមត្ថភាព និងចូលរួមយ៉ាងសកម្មក្នុងការដោះស្រាយលំហាត់គណិតវិទ្យា", 1000, bodyY);
        ctx.fillText("និងទទួលបានលទ្ធផលគួរជាទីមោទកៈ នៅលើគេហទំព័រ braintest.fun ។", 1000, bodyY + 80);

        ctx.fillStyle = "#059669"; // Green
        ctx.fillText("សូមជូនពរឱ្យប្អូនបន្តភាពជោគជ័យ និងក្លាយជាធនធានមនុស្សដ៏ល្អ។", 1000, bodyY + 190);

        // 8. Footer (Date & Website)
        ctx.textAlign = "right";
        
        // Date
        ctx.fillStyle = "#000";
        ctx.font = "35px Arial";
        ctx.fillText(dateString, 1750, 1220);

        // Website Link
        ctx.fillStyle = "#0284c7"; // Link Blue
        ctx.font = 'bold 35px Courier New';
        ctx.fillText("ទទួលបានពី: www.braintest.fun", 1750, 1280);

        // Output
        const buffer = canvas.toBuffer("image/png");
        res.set("Content-Type", "image/png");
        res.send(buffer);

    } catch (e) {
        console.error("Cert Gen Error:", e);
        res.sendStatus(500);
    }
});

// =========================================
// SERVER START
// =========================================
(async () => {
    if (process.env.DATABASE_URL) {
        try {
            const client = await pool.connect();
            // Init Leaderboard Table
            await client.query(`
                CREATE TABLE IF NOT EXISTS leaderboard (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(25) NOT NULL,
                    score INTEGER NOT NULL,
                    difficulty VARCHAR(15) NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            `);
            // Init Requests Table
            await client.query(`
                CREATE TABLE IF NOT EXISTS certificate_requests (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(50) NOT NULL,
                    score INTEGER NOT NULL,
                    status VARCHAR(20) DEFAULT 'Pending',
                    request_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            `);
            client.release();
            console.log("✅ Database Tables Ready");
        } catch (e) {
            console.error("❌ DB Init Error:", e.message);
        }
    }
    
    app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
})();
