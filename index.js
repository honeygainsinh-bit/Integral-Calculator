// =========================================================================
// MATH QUIZ PRO BACKEND - FINAL PROFESSIONAL EDITION
// =========================================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg'); 

// --- SETUP ---
const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

const MODEL_NAME = "gemini-2.5-flash"; 
let totalPlays = 0;           
const uniqueVisitors = new Set();

// --- LOGGING ---
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString('km-KH')}] 📡 ${req.method} ${req.path}`);
    next();
});

// --- DATABASE ---
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
        console.log("✅ Database initialized.");
        client.release();
    } catch (err) {
        console.error("❌ Database Error:", err.message);
    }
}

// --- RATE LIMIT ---
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
            <h1 style="color: #22c55e;">Server Online 🟢</h1>
            <p>braintest.fun API Service</p>
            <div style="margin-top: 20px; padding: 10px; background: #f0f9ff; display: inline-block; border-radius: 8px;">
                <a href="/admin/requests" style="text-decoration: none; color: #0284c7; font-weight: bold;">👮‍♂️ ចូលមើលសំណើសុំ (Admin)</a>
            </div>
        </div>
    `);
});

// --- API ROUTES ---
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
    if (!username || typeof score !== 'number') {
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
    if (!username || score === undefined) {
        return res.status(400).json({ success: false, message: "Missing data" });
    }
    try {
        const client = await pool.connect();
        await client.query('INSERT INTO certificate_requests (username, score, request_date) VALUES ($1, $2, NOW())', [username, score]);
        client.release();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: "Server Error" }); }
});

// =========================================================================
// ✅ ADMIN PANEL - WITH ACTION BUTTON
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
            <title>Admin - Certificate Requests</title>
            <style>
                body { font-family: 'Hanuman', sans-serif; padding: 20px; background: #f8fafc; }
                table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden; }
                th, td { padding: 15px; border-bottom: 1px solid #e2e8f0; text-align: left; }
                th { background: #0f172a; color: white; }
                .btn-gen { 
                    background: #2563eb; color: white; text-decoration: none; 
                    padding: 8px 15px; border-radius: 6px; font-weight: bold; 
                    display: inline-block; transition: all 0.2s;
                }
                .btn-gen:hover { background: #1d4ed8; transform: translateY(-1px); }
            </style>
        </head>
        <body>
            <h1>👮‍♂️ Admin Panel - បញ្ជីឈ្មោះអ្នកស្នើសុំ</h1>
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>ឈ្មោះ (Username)</th>
                        <th>ពិន្ទុ (Score)</th>
                        <th>កាលបរិច្ឆេទ</th>
                        <th>សកម្មភាព</th>
                    </tr>
                </thead>
                <tbody>`;

        if (result.rows.length === 0) {
            html += `<tr><td colspan="5" style="text-align:center; padding: 20px;">គ្មានទិន្នន័យ។</td></tr>`;
        } else {
            result.rows.forEach(row => {
                html += `
                    <tr>
                        <td>${row.id}</td>
                        <td style="font-weight:bold;">${row.username}</td>
                        <td style="color:#dc2626; font-weight:bold;">${row.score}</td>
                        <td>${new Date(row.request_date).toLocaleDateString('km-KH')}</td>
                        <td>
                            <a href="/admin/generate-cert/${row.id}" target="_blank" class="btn-gen">🌐 មើល Design</a>
                        </td>
                    </tr>`;
            });
        }
        html += `</tbody></table></body></html>`;
        res.send(html);
    } catch (err) { res.status(500).send("Admin Error"); }
});

// =========================================================================
// ✅ GENERATE CERTIFICATE LOGIC (PROFESSIONAL STANDARD)
// =========================================================================
app.get('/admin/generate-cert/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests WHERE id = $1', [id]);
        client.release();

        if (result.rows.length === 0) return res.status(404).send("Not Found");
        const { username, score } = result.rows[0];

        // 1. កាលបរិច្ឆេទស្តង់ដារ (Standard Date Format)
        const dateObj = new Date();
        const formattedDate = dateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });

        // 2. សារជូនពរ & លើកទឹកចិត្ត (High Standard English Message)
        const formalMessage = `This official certificate is proudly presented to acknowledge your exceptional mathematical proficiency and unwavering dedication to self-improvement. Your hard work has set a new standard of excellence. We wish you continued success in your future academic endeavors. Verified by: braintest.fun`;

        // 3. Encode Data for URL
        const encodedUsername = encodeURIComponent(username.toUpperCase());
        const scoreText = encodeURIComponent(`Score: ${score}`);
        const dateText = encodeURIComponent(`Date: ${formattedDate}`);
        const encouragementText = encodeURIComponent(formalMessage);

        // 4. Validate ENV
        const BASE_URL = process.env.EXTERNAL_IMAGE_API;
        if (!BASE_URL) return res.status(500).send("Error: EXTERNAL_IMAGE_API missing.");

        // 5. Construct Professional Design URL
        // - Username: Center, Gold, Large
        // - Score: Center, Red, Medium
        // - Date: Center, Gray, Medium (Above footer)
        // - Footer: Center, White, Small, Long Message
        const finalUrl = BASE_URL + 
            `&txt-align=center&txt-size=110&txt-color=FFD700&txt=${encodedUsername}&txt-fit=max&w=1800` + 
            `&mark-align=center&mark-size=60&mark-color=FF4500&mark-y=850&mark-txt=${scoreText}` +
            `&mark-align=center&mark-size=40&mark-color=BBBBBB&mark-y=1120&mark-txt=${dateText}` +
            `&mark-align=center&mark-size=28&mark-color=FFFFFF&mark-y=1320&mark-txt=${encouragementText}`;

        // 6. Redirect to Imgix
        res.redirect(finalUrl);

    } catch (err) {
        console.error("Cert Gen Error:", err.message);
        res.status(500).send("Error generating certificate.");
    }
});

async function startServer() {
    if (!process.env.DATABASE_URL) return;
    await initializeDatabase();
    app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
}

startServer();
