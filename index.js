// =============================================================
// MATH QUIZ PRO - FINAL STABLE FIX (REMOVING CANVAS)
// =============================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg'); 

// 🚫 1. លុបការ Require Canvas ចេញទាំងអស់
// const { registerFont, createCanvas, loadImage } = require('canvas');

const app = express();
const port = process.env.PORT || 3000;

// ==========================================
// CONFIGURATION
// ==========================================
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

// 🚫 2. លុប Font Registration ចេញ
// try { ... } catch (e) { ... }

const MODEL_NAME = "gemini-2.5-flash"; 
let totalPlays = 0;           
const uniqueVisitors = new Set();

app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString('en-US')}] 📡 ${req.method} ${req.path}`);
    next();
});

// ==========================================
// DATABASE SETUP
// ==========================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function initializeDatabase() {
    try {
        if (!process.env.DATABASE_URL) return;
        const client = await pool.connect();
        
        await client.query(`CREATE TABLE IF NOT EXISTS leaderboard (id SERIAL PRIMARY KEY, username VARCHAR(25) NOT NULL, score INTEGER NOT NULL, difficulty VARCHAR(15) NOT NULL, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);`);
        await client.query(`CREATE TABLE IF NOT EXISTS certificate_requests (id SERIAL PRIMARY KEY, username VARCHAR(50) NOT NULL, score INTEGER NOT NULL, status VARCHAR(20) DEFAULT 'Pending', request_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);`);

        console.log("✅ Database tables ready.");
        client.release();
    } catch (err) {
        console.error("❌ Database Init Error:", err.message);
    }
}

// ==========================================
// ROUTES & API
// ==========================================
app.use(express.static(path.join(__dirname, 'public'))); 

app.get('/', (req, res) => {
    res.status(200).send(`
        <div style="font-family: sans-serif; text-align: center; padding-top: 50px;">
            <h1 style="color: #22c55e;">Server is Online 🟢</h1>
            <p>Math Quiz Pro Backend</p>
            <div style="margin-top: 20px; padding: 10px; background: #f0f9ff; display: inline-block; border-radius: 8px;">
                <a href="/admin/requests" style="text-decoration: none; color: #0284c7; font-weight: bold;">👮‍♂️ Admin Panel</a>
            </div>
        </div>
    `);
});

const limiter = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, max: 10, 
    keyGenerator: (req) => req.ip, skip: (req) => req.ip === process.env.OWNER_IP
});

app.get('/stats', (req, res) => res.json({ total_plays: totalPlays, unique_players: uniqueVisitors.size }));

app.post('/api/generate-problem', limiter, async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: "Required" });
        totalPlays++; uniqueVisitors.add(req.ip);
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const result = await model.generateContent(prompt);
        res.json({ text: result.response.text() });
    } catch (error) { res.status(500).json({ error: "AI Error" }); }
});

app.post('/api/leaderboard/submit', async (req, res) => {
    try {
        const { username, score, difficulty } = req.body;
        const client = await pool.connect();
        await client.query('INSERT INTO leaderboard(username, score, difficulty) VALUES($1, $2, $3)', [username, score, difficulty]);
        client.release();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/leaderboard/top', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT username, score, difficulty FROM leaderboard ORDER BY score DESC LIMIT 1000');
        client.release();
        res.json(result.rows);
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/submit-request', async (req, res) => {
    try {
        const { username, score } = req.body;
        const client = await pool.connect();
        await client.query('INSERT INTO certificate_requests (username, score, request_date) VALUES ($1, $2, NOW())', [username, score]);
        client.release();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/admin/requests', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests ORDER BY request_date DESC LIMIT 50');
        client.release();
        let html = `<h1>Requests</h1><table border="1"><thead><tr><th>ID</th><th>User</th><th>Score</th><th>Action</th></tr></thead><tbody>`;
        result.rows.forEach(r => {
            html += `<tr><td>${r.id}</td><td>${r.username}</td><td>${r.score}</td><td><a href="/admin/generate-cert/${r.id}">Generate</a></td></tr>`;
        });
        res.send(html + "</tbody></table>");
    } catch (err) { res.status(500).send("DB Error"); }
});

// ==========================================
// 🚫 3. GENERATE CERTIFICATE (HTML REPLACEMENT)
// ==========================================
app.get('/admin/generate-cert/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests WHERE id = $1', [id]);
        client.release();

        if (result.rows.length === 0) return res.status(404).send("Not Found");
        const { username, score, request_date } = result.rows[0];
        const dateStr = new Date(request_date).toLocaleDateString('en-US');

        // ✅ ជំនួស Canvas ដោយ HTML Message
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head><title>Certificate Preview</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #fff;">
                <div style="border: 5px solid gold; padding: 30px;">
                    <h1>CERTIFICATE PREVIEW (HTML)</h1>
                    <p style="font-size: 24px; color: #555;">This Certificate of Achievement is Proudly Presented to</p>
                    <h2 style="font-size: 60px; color: #C49A0A;">${username.toUpperCase()}</h2>
                    <p style="font-size: 20px;">For outstanding achievement in the Math Quiz Pro challenge.</p>
                    <p style="font-size: 30px; color: #b91c1c;">Final Score: ${score}</p>
                    <p style="margin-top: 40px; color: #777;">Issued on: ${dateStr}</p>
                    <p style="color: #0369a1;">Website: braintest.fun</p>
                </div>
                <p style="color: red; margin-top: 20px;">NOTE: Image generation failed due to missing server dependencies.</p>
            </body>
            </html>
        `);

    } catch (err) {
        console.error("Cert Gen Error:", err);
        res.status(500).send("Error processing certificate request.");
    }
});

// ==========================================
// START SERVER
// ==========================================
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
    initializeDatabase();
});
