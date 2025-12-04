// =============================================================
// MATH QUIZ PRO BACKEND - FINAL STABLE FIX (FLAT COLOR)
// =============================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg'); 
// នាំយក Canvas មកប្រើ (រក្សា registerFont នៅក្នុង require)
const { registerFont, createCanvas, loadImage } = require('canvas');

const app = express();
const port = process.env.PORT || 3000;

// ==========================================
// CONFIGURATION
// ==========================================
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

// ✅ FONT REGISTRATION (NON-BLOCKING)
try {
    const fontPath = path.join(__dirname, 'public', 'Moul.ttf');
    registerFont(fontPath, { family: 'Moul' });
    console.log("✅ Font 'Moul' registered.");
} catch (e) {
    console.warn("⚠️ Font registration skipped. Server is alive.");
}

const MODEL_NAME = "gemini-2.5-flash"; 
let totalPlays = 0;           
const uniqueVisitors = new Set();

// Log Requests
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
    windowMs: 8 * 60 * 60 * 1000, 
    max: 10, 
    message: { error: "Rate limit exceeded" },
    keyGenerator: (req) => req.ip,
    skip: (req) => req.ip === process.env.OWNER_IP
});

app.get('/stats', (req, res) => {
    res.json({ total_plays: totalPlays, unique_players: uniqueVisitors.size });
});

app.post('/api/generate-problem', limiter, async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: "Required" });

        totalPlays++;
        uniqueVisitors.add(req.ip);

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const result = await model.generateContent(prompt);
        res.json({ text: result.response.text() });

    } catch (error) {
        console.error("Gemini Error:", error.message);
        res.status(500).json({ error: "AI Error" });
    }
});

app.post('/api/leaderboard/submit', async (req, res) => {
    try {
        const { username, score, difficulty } = req.body;
        const client = await pool.connect();
        await client.query('INSERT INTO leaderboard(username, score, difficulty) VALUES($1, $2, $3)', [username, score, difficulty]);
        client.release();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/leaderboard/top', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT username, score, difficulty FROM leaderboard ORDER BY score DESC LIMIT 1000');
        client.release();
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/submit-request', async (req, res) => {
    try {
        const { username, score } = req.body;
        const client = await pool.connect();
        await client.query('INSERT INTO certificate_requests (username, score, request_date) VALUES ($1, $2, NOW())', [username, score]);
        client.release();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.get('/admin/requests', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests ORDER BY request_date DESC LIMIT 50');
        client.release();

        let html = `
        <!DOCTYPE html>
        <html>
        <head><title>Admin</title><style>body{font-family:sans-serif;padding:20px;} table{width:100%;border-collapse:collapse;} th,td{padding:10px;border:1px solid #ddd;}</style></head>
        <body>
            <h1>Certificate Requests</h1>
            <table><thead><tr><th>ID</th><th>User</th><th>Score</th><th>Date</th><th>Action</th></tr></thead><tbody>`;
        
        result.rows.forEach(row => {
            const date = new Date(row.request_date).toLocaleDateString('en-US');
            html += `<tr>
                <td>${row.id}</td>
                <td><b>${row.username}</b></td>
                <td>${row.score}</td>
                <td>${date}</td>
                <td><a href="/admin/generate-cert/${row.id}" target="_blank">🖨️ Generate</a></td>
            </tr>`;
        });
        html += `</tbody></table></body></html>`;
        res.send(html);
    } catch (err) {
        res.status(500).send("Error loading admin");
    }
});

// ==========================================
// 🎨 GENERATE CERTIFICATE (FLAT COLOR FIX)
// ==========================================
app.get('/admin/generate-cert/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests WHERE id = $1', [id]);
        client.release();

        if (result.rows.length === 0) return res.status(404).send("Not Found");
        const { username, score, request_date } = result.rows[0];
        const englishDate = new Date(request_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        // Canvas Setup (2000x1414)
        const width = 2000; 
        const height = 1414;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // 1. BACKGROUND: SOLID WHITE (FIX FOR BLACK IMAGE)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);

        // 2. TEXT RENDERING (ENGLISH & ARIAL)
        ctx.textAlign = 'center';

        // Title
        ctx.font = '45px Arial, sans-serif'; 
        ctx.fillStyle = '#334155';
        ctx.fillText("This Certificate of Achievement is Proudly Presented to", width / 2, 450); 

        // Name (FLAT GOLD COLOR - Safest for Rendering)
        ctx.font = 'bold 150px Arial, sans-serif'; 
        ctx.fillStyle = '#C49A0A'; // Flat Gold/Bronze Color
        ctx.fillText(username.toUpperCase(), width / 2, 650);
        
        // Content
        ctx.font = '40px Arial, sans-serif';
        ctx.fillStyle = '#1e293b'; 
        ctx.fillText(`For outstanding achievement in the Math Quiz Pro challenge.`, width / 2, 780);

        // Score
        ctx.font = 'bold 50px Arial, sans-serif';
        ctx.fillStyle = '#b91c1c'; 
        ctx.fillText(`Final Score: ${score}`, width / 2, 870);

        // Body Lines
        ctx.fillStyle = '#1e293b'; 
        ctx.font = '35px Arial, sans-serif'; 
        const lineHeight = 65; 
        let startY = 1000;
        ctx.fillText("This recognition serves as evidence of the student's exceptional dedication,", width / 2, startY);
        ctx.fillText("perseverance, and solid fundamental knowledge acquired through rigorous practice.", width / 2, startY + lineHeight);
        
        // Wishing
        ctx.fillStyle = '#15803d'; 
        ctx.fillText("We wish you continued success in your academic journey and future endeavors.", width / 2, startY + (lineHeight * 2) + 15);

        // Date
        ctx.fillStyle = '#64748b'; 
        ctx.font = 'bold 30px Arial, sans-serif'; 
        ctx.fillText(`Issued on: ${englishDate}`, width / 2, 1280);

        // Footer
        ctx.font = 'bold 30px "Courier New", monospace';
        ctx.fillStyle = '#0369a1'; 
        
        ctx.beginPath();
        ctx.moveTo(width / 2 - 180, 1315);
        ctx.lineTo(width / 2 + 180, 1315);
        ctx.strokeStyle = '#94a3b8'; 
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.fillText("Website: braintest.fun", width / 2, 1360); 

        // Output
        const buffer = canvas.toBuffer('image/png');
        res.set('Content-Type', 'image/png');
        res.send(buffer);

    } catch (err) {
        console.error("Gen Cert Error:", err);
        res.status(500).send("Failed to generate certificate.");
    }
});

// ==========================================
// START SERVER
// ==========================================
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
    initializeDatabase();
});
