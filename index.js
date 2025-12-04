  require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg'); 
// នាំយក Canvas មកប្រើ
const { registerFont, createCanvas, loadImage } = require('canvas');

const app = express();
const port = process.env.PORT || 3000;

// ==========================================
// 1. SETUP & CONFIGURATION
// ==========================================
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

// ចុះឈ្មោះ Font ខ្មែរ (Moul)
try {
    const fontPath = path.join(__dirname, 'public', 'Moul.ttf');
    registerFont(fontPath, { family: 'Moul' });
    console.log("✅ Font 'Moul' loaded successfully.");
} catch (e) {
    console.warn("⚠️ Warning: រកមិនឃើញ Font 'Moul.ttf' ក្នុង folder public។");
}

const MODEL_NAME = "gemini-2.5-flash"; 

// Tracking Variables
let totalPlays = 0;           
const uniqueVisitors = new Set();

// Middleware: Log Request
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString('km-KH')}] 📡 ${req.method} ${req.path}`);
    next();
});

// ==========================================
// 2. DATABASE CONFIGURATION
// ==========================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function initializeDatabase() {
    try {
        const client = await pool.connect();
        
        // Table Leaderboard
        await client.query(`
            CREATE TABLE IF NOT EXISTS leaderboard (
                id SERIAL PRIMARY KEY,
                username VARCHAR(25) NOT NULL,
                score INTEGER NOT NULL,
                difficulty VARCHAR(15) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Table Certificate Requests
        await client.query(`
            CREATE TABLE IF NOT EXISTS certificate_requests (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                score INTEGER NOT NULL,
                status VARCHAR(20) DEFAULT 'Pending',
                request_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("✅ Database initialized: Tables ready.");
        client.release();
    } catch (err) {
        console.error("❌ Database initialization error:", err.message);
    }
}

// ==========================================
// 3. RATE LIMITER
// ==========================================
const limiter = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, 
    max: 10, 
    message: { error: "Rate limit exceeded", message: "⚠️ អស់ចំនួនកំណត់ហើយ (10ដង/ថ្ងៃ)!" },
    keyGenerator: (req) => req.ip,
    skip: (req) => req.ip === process.env.OWNER_IP
});

// ==========================================
// 4. STATIC FILES & HOME ROUTE
// ==========================================
app.use(express.static(path.join(__dirname, 'public'))); 

app.get('/', (req, res) => {
    res.status(200).send(`
        <div style="font-family: sans-serif; text-align: center; padding-top: 50px;">
            <h1 style="color: #22c55e;">Server is Online 🟢</h1>
            <p>Math Quiz Pro Backend</p>
            <div style="margin-top: 20px; padding: 10px; background: #f0f9ff; display: inline-block; border-radius: 8px;">
                <a href="/admin/requests" style="text-decoration: none; color: #0284c7; font-weight: bold;">👮‍♂️ ចូលមើលសំណើសុំលិខិតសរសើរ (Admin)</a>
            </div>
        </div>
    `);
});

// ==========================================
// 5. API ROUTES (General & Leaderboard)
// ==========================================

app.get('/stats', (req, res) => {
    res.json({ total_plays: totalPlays, unique_players: uniqueVisitors.size });
});

app.post('/api/generate-problem', limiter, async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: "Prompt required" });

        totalPlays++;
        uniqueVisitors.add(req.ip);

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const result = await model.generateContent(prompt);
        res.json({ text: result.response.text() });

    } catch (error) {
        console.error("Gemini Error:", error.message);
        res.status(500).json({ error: "AI Generation Failed" });
    }
});

app.post('/api/leaderboard/submit', async (req, res) => {
    const { username, score, difficulty } = req.body;
    if (!username || typeof score !== 'number' || score <= 0 || username.trim().length < 3) {
        return res.status(400).json({ success: false, message: "Invalid data." });
    }
    try {
        const client = await pool.connect();
        await client.query('INSERT INTO leaderboard(username, score, difficulty) VALUES($1, $2, $3)', 
            [username.trim().substring(0, 25), score, difficulty]);
        client.release();
        res.status(201).json({ success: true, message: "Score saved." });
    } catch (err) {
        res.status(500).json({ success: false, message: "DB Error" });
    }
});

app.get('/api/leaderboard/top', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT username, score, difficulty FROM leaderboard ORDER BY score DESC LIMIT 1000');
        client.release();
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ success: false, message: "DB Error" });
    }
});

// ==========================================
// 6. CERTIFICATE REQUEST API
// ==========================================

// ✅ API ទទួលសំណើ (អនុញ្ញាតឱ្យ Score 0)
app.post('/api/submit-request', async (req, res) => {
    const { username, score } = req.body;
    
    // FIX: Score អាចស្មើ 0 បាន
    if (!username || score === undefined || score === null) {
        return res.status(400).json({ success: false, message: "Missing username or score" });
    }

    try {
        const client = await pool.connect();
        await client.query('INSERT INTO certificate_requests (username, score, request_date) VALUES ($1, $2, NOW())', [username, score]);
        client.release();
        console.log(`📩 Certificate Request: ${username} (Score: ${score})`);
        res.json({ success: true });
    } catch (err) {
        console.error("Submit Request Error:", err.message);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// ✅ Admin HTML View
app.get('/admin/requests', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests ORDER BY request_date DESC LIMIT 50');
        client.release();

        let html = `
        <!DOCTYPE html>
        <html lang="km">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Admin - សំណើសុំលិខិតសរសើរ</title>
            <style>
                body { font-family: sans-serif; padding: 20px; background: #f1f5f9; }
                h1 { color: #1e3a8a; }
                table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden; }
                th, td { padding: 15px; border-bottom: 1px solid #e2e8f0; text-align: left; }
                th { background: #3b82f6; color: white; }
                tr:hover { background: #f8fafc; }
                .btn-gen { 
                    background: #2563eb; color: white; text-decoration: none; 
                    padding: 8px 12px; border-radius: 6px; font-weight: bold; font-size: 0.9rem;
                    display: inline-flex; align-items: center; gap: 5px;
                }
                .btn-gen:hover { background: #1d4ed8; }
            </style>
        </head>
        <body>
            <h1>👮‍♂️ Admin Panel - សំណើសុំលិខិតសរសើរ</h1>
            <table>
                <thead>
                    <tr>
                        <th>#ID</th>
                        <th>ឈ្មោះ (Username)</th>
                        <th>ពិន្ទុ (Score)</th>
                        <th>កាលបរិច្ឆេទ</th>
                        <th>សកម្មភាព (Action)</th>
                    </tr>
                </thead>
                <tbody>`;

        if (result.rows.length === 0) {
            html += `<tr><td colspan="5" style="text-align:center; padding: 20px; color: gray;">មិនទាន់មានសំណើថ្មីៗទេ។</td></tr>`;
        } else {
            result.rows.forEach(row => {
                const isHighScore = row.score >= 500;
                html += `
                    <tr>
                        <td>${row.id}</td>
                        <td style="font-weight:bold; color: #334155;">${row.username}</td>
                        <td style="color:${isHighScore ? '#16a34a' : '#dc2626'}; font-weight:bold;">${row.score}</td>
                        <td>${new Date(row.request_date).toLocaleDateString('km-KH')}</td>
                        <td>
                            <a href="/admin/generate-cert/${row.id}" target="_blank" class="btn-gen">🖨️ បង្កើតលិខិត</a>
                        </td>
                    </tr>`;
            });
        }
        html += `</tbody></table></body></html>`;
        res.send(html);
    } catch (err) {
        res.status(500).send("Error loading admin panel.");
    }
});



     
     // ==========================================
// 7. GENERATE CERTIFICATE (AUTO BACKGROUND & BORDER)
// ==========================================
app.get('/admin/generate-cert/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests WHERE id = $1', [id]);
        client.release();

        if (result.rows.length === 0) return res.status(404).send("Not Found");

        const { username, score, request_date } = result.rows[0];

        // --- កាលបរិច្ឆេទខ្មែរ ---
        const dateObj = new Date(request_date);
        const day = dateObj.getDate().toString().padStart(2, '0');
        const months = ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"];
        const month = months[dateObj.getMonth()];
        const year = dateObj.getFullYear();
        const khmerDate = `ថ្ងៃទី ${day} ខែ ${month} ឆ្នាំ ${year}`;

        // --- Setup Canvas (2000x1414) ---
        const width = 2000; 
        const height = 1414;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // ==========================================
        // 🎨 ជំហានទី ១: គូរ BACKGROUND & ស៊ុម (មិនប្រើរូបភាពក្រៅ)
        // ==========================================
        
        // 1.1 ដាក់ផ្ទៃពណ៌ Dark Navy (ខៀវចាស់ខ្លាំង) - ធានាថាអក្សរពណ៌ស លេចធ្លោ
        ctx.fillStyle = '#0f172a'; // Dark Slate Blue
        ctx.fillRect(0, 0, width, height);

        // 1.2 គូរស៊ុមពណ៌មាស (Gold Border)
        // ស៊ុមក្រៅ
        ctx.strokeStyle = '#fbbf24'; // Amber-400
        ctx.lineWidth = 20;
        ctx.strokeRect(50, 50, width - 100, height - 100);

        // ស៊ុមក្នុងតូច
        ctx.strokeStyle = '#f59e0b'; // Amber-600
        ctx.lineWidth = 5;
        ctx.strokeRect(80, 80, width - 160, height - 160);

        // ==========================================
        // 🎨 ជំហានទី ២: សរសេរអក្សរ
        // ==========================================
        
        ctx.textAlign = 'center';

        // 2.1 ចំណងជើងធំ "បណ្ណសរសើរ"
        ctx.font = '120px "Moul"';
        ctx.fillStyle = '#fbbf24'; // ពណ៌មាស
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 10;
        ctx.fillText("បណ្ណសរសើរ", width / 2, 300);
        
        ctx.shadowBlur = 0; // Reset Shadow

        // 2.2 ឃ្លាផ្តើម
        ctx.font = '40px "Moul"'; 
        ctx.fillStyle = '#cbd5e1'; // ពណ៌ប្រផេះស្រាល
        ctx.fillText("សូមប្រគល់ជូនដោយក្ដីគោរពចំពោះ", width / 2, 450); 

        // 2.3 ឈ្មោះអ្នកទទួល (Username) - ធំ ពណ៌មាស Gradient
        const gradient = ctx.createLinearGradient(width/2 - 300, 0, width/2 + 300, 0);
        gradient.addColorStop(0, "#fcd34d");   // មាសស្រាល
        gradient.addColorStop(0.5, "#ffffff"); // ស
        gradient.addColorStop(1, "#fcd34d");   // មាសស្រាល

        ctx.font = '150px "Moul"'; 
        ctx.fillStyle = gradient;
        // ដាក់ Shadow អោយឈ្មោះផុស
        ctx.shadowColor = "rgba(251, 191, 36, 0.5)"; 
        ctx.shadowBlur = 40;
        ctx.fillText(username, width / 2, 650);
        
        ctx.shadowBlur = 0; // Reset

        // 2.4 ពិន្ទុ (Score)
        ctx.font = 'bold 50px "Arial", sans-serif';
        ctx.fillStyle = '#38bdf8'; // ពណ៌ផ្ទៃមេឃភ្លឺ
        ctx.fillText(`ពិន្ទុសរុប: ${score}`, width / 2, 780);

        // 2.5 ខ្លឹមសារ (Body Text) - ពណ៌ស
        ctx.fillStyle = '#ffffff'; 
        ctx.font = '36px "Moul"'; 
        const lineHeight = 80; 
        let startY = 920;

        ctx.fillText("ប្អូនបានបញ្ចេញសមត្ថភាព និងចូលរួមយ៉ាងសកម្មក្នុងការដោះស្រាយលំហាត់គណិតវិទ្យាថ្នាក់ទី ១២", width / 2, startY);
        ctx.fillText("នៅលើគេហទំព័រ braintest.fun ប្រកបដោយភាពត្រឹមត្រូវ និងទទួលបានលទ្ធផលល្អប្រសើរ។", width / 2, startY + lineHeight);
        ctx.fillText("យើងសូមជូនពរឱ្យប្អូនទទួលបានជោគជ័យក្នុងការសិក្សា និងគ្រប់ភារកិច្ច។", width / 2, startY + (lineHeight * 2));

        // ==========================================
        // 🎨 ជំហានទី ៣: ផ្នែកខាងក្រោម (Footer)
        // ==========================================

        // 3.1 កាលបរិច្ឆេទ (ខាងឆ្វេង)
        ctx.textAlign = 'left';
        ctx.fillStyle = '#94a3b8'; // Slate-400
        ctx.font = '30px "Moul"'; 
        ctx.fillText("រាជធានីភ្នំពេញ, " + khmerDate, 150, 1250);

        // 3.2 ឈ្មោះគេហទំព័រ (កណ្តាល)
        ctx.textAlign = 'center';
        ctx.font = 'bold 35px "Courier New", sans-serif';
        ctx.fillStyle = '#fbbf24'; // ពណ៌មាស
        ctx.fillText("braintest.fun", width / 2, 1250);

        // 3.3 QR Code Placeholder (បើចង់ដាក់ តែកន្លែងនេះដាក់ Logo ឬ Text "Approved")
        ctx.textAlign = 'right';
        ctx.fillStyle = '#22c55e'; // ពណ៌បៃតង
        ctx.font = 'bold 40px "Arial"';
        ctx.fillText("✔ APPROVED", width - 150, 1250);

        // Output Image
        const buffer = canvas.toBuffer('image/png');
        res.set('Content-Type', 'image/png');
        res.send(buffer);

    } catch (err) {
        console.error("Gen Cert Error:", err);
        res.status(500).send("Failed to generate certificate.");
    }
});
   
  

// ==========================================
// 8. START SERVER
// ==========================================
async function startServer() {
    if (!process.env.DATABASE_URL) {
        console.error("🛑 CRITICAL: DATABASE_URL is missing.");
        return;
    }
    await initializeDatabase();
    app.listen(port, () => {
        console.log(`🚀 Server running on port ${port}`);
        console.log(`🔗 Admin: http://localhost:${port}/admin/requests`);
    });
}

startServer();
