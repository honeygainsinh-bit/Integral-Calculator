// =========================================================================
// ឯកសារកម្ម: MATH QUIZ PRO BACKEND SERVER (FINAL VERSION)
// គោលបំណង: API, Database, Admin Panel (With Button), & Imgix Redirect
// =========================================================================

// --- 1. REQUIRE DEPENDENCIES ---
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg'); 

// --- 2. SETUP & CONFIGURATION ---
const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

const MODEL_NAME = "gemini-2.5-flash"; 
let totalPlays = 0;           
const uniqueVisitors = new Set();

// Middleware: Log Request
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString('km-KH')}] 📡 ${req.method} ${req.path}`);
    next();
});

// =========================================================================
// 3. DATABASE CONFIGURATION
// =========================================================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function initializeDatabase() {
    try {
        const client = await pool.connect();
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS leaderboard (
                id SERIAL PRIMARY KEY,
                username VARCHAR(25) NOT NULL,
                score INTEGER NOT NULL,
                difficulty VARCHAR(15) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS certificate_requests (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                score INTEGER NOT NULL,
                status VARCHAR(20) DEFAULT 'Pending',
                request_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("✅ Database initialized: Leaderboard & Requests ready.");
        client.release();
    } catch (err) {
        console.error("❌ Database initialization error:", err.message);
    }
}

// =========================================================================
// 4. RATE LIMITER & STATIC FILES
// =========================================================================
const limiter = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, 
    max: 10, 
    message: { error: "Rate limit exceeded", message: "⚠️ អស់ចំនួនកំណត់ហើយ (10ដង/ថ្ងៃ)!" },
    keyGenerator: (req) => req.ip,
    skip: (req) => req.ip === process.env.OWNER_IP
});

app.use(express.static(path.join(__dirname, 'public'))); 

app.get('/', (req, res) => {
    res.status(200).send(`
        <div style="font-family: sans-serif; text-align: center; padding-top: 50px;">
            <h1 style="color: #22c55e;">Server is Online 🟢</h1>
            <p>Math Quiz Pro Backend</p>
            <div style="margin-top: 20px; padding: 10px; background: #f0f9ff; display: inline-block; border-radius: 8px;">
                <a href="/admin/requests" style="text-decoration: none; color: #0284c7; font-weight: bold;">👮‍♂️ ចូលមើលសំណើសុំ (Admin)</a>
            </div>
        </div>
    `);
});

// =========================================================================
// 5. API ROUTES (Core Logic)
// =========================================================================
app.get('/stats', (req, res) => {
    res.json({ total_plays: totalPlays, unique_players: uniqueVisitors.size });
});

app.post('/api/generate-problem', limiter, async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: "Prompt required" });
        totalPlays++; uniqueVisitors.add(req.ip);
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const result = await model.generateContent(prompt);
        res.json({ text: result.response.text() });
    } catch (error) { res.status(500).json({ error: "AI Generation Failed" }); }
});

app.post('/api/leaderboard/submit', async (req, res) => {
    const { username, score, difficulty } = req.body;
    if (!username || typeof score !== 'number' || score <= 0 || username.trim().length < 3) {
        return res.status(400).json({ success: false, message: "Invalid data." });
    }
    try {
        const client = await pool.connect();
        await client.query('INSERT INTO leaderboard(username, score, difficulty) VALUES($1, $2, $3)', [username.trim().substring(0, 25), score, difficulty]);
        client.release();
        res.status(201).json({ success: true, message: "Score saved." });
    } catch (err) { res.status(500).json({ success: false, message: "DB Error" }); }
});

app.get('/api/leaderboard/top', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT username, score, difficulty FROM leaderboard ORDER BY score DESC LIMIT 1000');
        client.release();
        res.json(result.rows);
    } catch (err) { res.status(500).json({ success: false, message: "DB Error" }); }
});

app.post('/api/submit-request', async (req, res) => {
    const { username, score } = req.body;
    if (!username || score === undefined || score === null) {
        return res.status(400).json({ success: false, message: "Missing username or score" });
    }
    try {
        const client = await pool.connect();
        await client.query('INSERT INTO certificate_requests (username, score, request_date) VALUES ($1, $2, NOW())', [username, score]);
        client.release();
        console.log(`📩 Certificate Request: ${username} (Score: ${score})`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: "Server Error" }); }
});

// =========================================================================
// 6. ADMIN PANEL (WITH BUTTON "បង្កើត CERTIFICATE") 👮‍♂️
// =========================================================================
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
            <title>Admin - សំណើសុំ</title>
            <style>
                body { font-family: 'Hanuman', sans-serif; padding: 20px; background: #f1f5f9; }
                h1 { color: #1e3a8a; }
                table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden; }
                th, td { padding: 15px; border-bottom: 1px solid #e2e8f0; text-align: left; }
                th { background: #3b82f6; color: white; }
                tr:hover { background: #f8fafc; }
                .btn-gen { 
                    background: #2563eb; color: white; text-decoration: none; 
                    padding: 8px 12px; border-radius: 6px; font-weight: bold; font-size: 0.9rem;
                    display: inline-flex; align-items: center; gap: 5px;
                    transition: background 0.2s;
                }
                .btn-gen:hover { background: #1d4ed8; }
            </style>
        </head>
        <body>
            <h1>👮‍♂️ Admin Panel - បញ្ជីឈ្មោះអ្នកស្នើសុំ</h1>
            <table>
                <thead>
                    <tr>
                        <th>#ID</th>
                        <th>ឈ្មោះ (Username)</th>
                        <th>ពិន្ទុ (Score)</th>
                        <th>កាលបរិច្ឆេទ</th>
                        <th>សកម្មភាព</th> </tr>
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
                            <a href="/admin/generate-cert/${row.id}" target="_blank" class="btn-gen">🌐 មើល Design</a> 
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

// =========================================================================
// 7. GENERATE CERTIFICATE LOGIC (IMGIX REDIRECT) 🎨
// =========================================================================
app.get('/admin/generate-cert/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests WHERE id = $1', [id]);
        client.release();

        if (result.rows.length === 0) return res.status(404).send("Not Found");
        const { username, score } = result.rows[0];

        // 1. រៀបចំទិន្នន័យ (កាលបរិច្ឆេទ & សារ)
        const dateObj = new Date();
        const formattedDate = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        
        const encodedUsername = encodeURIComponent(username.toUpperCase());
        const scoreText = encodeURIComponent(`Score: ${score}`);
        const dateText = encodeURIComponent(`Date Issued: ${formattedDate}`);
        
        // សារលើកតម្កើងសមត្ថភាពខ្ពស់ និង website
        const encouragementText = encodeURIComponent(`This distinguished certificate serves as an enduring testament to your exceptional intellectual acuity and unwavering dedication. May your scholarly pursuits reach new pinnacles. Presented by: braintest.fun`); 

        // 2. យក Base URL ពី Environment Variable
        const EXTERNAL_API_ENDPOINT = process.env.EXTERNAL_IMAGE_API;
        if (!EXTERNAL_API_ENDPOINT) {
             return res.status(500).send("Error: EXTERNAL_IMAGE_API environment variable is not set.");
        }
        
        // 3. កសាង Full Imgix URL (បញ្ចូល Parameters)
        const finalImgixUrl = EXTERNAL_API_ENDPOINT + 
            `&txt-align=center` + `&txt-size=100` + `&txt-color=FFD700` + `&txt=${encodedUsername}` +
            `&txt-fit=max` + `&w=2000` + `&h=1414` +
            `&mark-align=center` + `&mark-size=50` + `&mark-color=FF4500` + `&mark-x=0` + `&mark-y=850` + `&mark-txt=${scoreText}` +
            `&mark-align=center` + `&mark-size=35` + `&mark-color=CCCCCC` + `&mark-x=0` + `&mark-y=1150` + `&mark-txt=${dateText}` +
            `&mark-align=center` + `&mark-size=30` + `&mark-color=FFFFFF` + `&mark-x=0` + `&mark-y=1300` + `&mark-txt=${encouragementText}`;

        // 4. Redirect (បង្ហាញរូបភាព)
        res.redirect(finalImgixUrl); 

    } catch (err) {
        console.error("Generate Cert Error:", err.message);
        res.status(500).send("Error generating certificate.");
    }
});

// =========================================================================
// 8. START SERVER
// =========================================================================
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
