// =============================================================
// MATH QUIZ PRO BACKEND - STABLE VERSION (FINAL)
// =============================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg'); 

// ✅ 1. Load Canvas with Safety
let createCanvas, loadImage, registerFont;
try {
    const canvasModule = require('canvas');
    createCanvas = canvasModule.createCanvas;
    loadImage = canvasModule.loadImage;
    registerFont = canvasModule.registerFont;
} catch (err) {
    console.error("⚠️ CRITICAL: Could not load 'canvas' module. Certificates will fail, but Server will run.");
}

const app = express();
// ✅ 2. Port Configuration (Standard)
const port = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

// ==========================================
// 🛡️ FONT REGISTRATION (SAFE MODE)
// ==========================================
// យើងព្យាយាមចុះឈ្មោះ Font ប៉ុន្តែបើបរាជ័យ យើងមិនឲ្យ Server Crash ទេ
if (registerFont) {
    try {
        const fontPath = path.join(__dirname, 'public', 'Moul.ttf');
        // Check if we are really registering it, or just wrap in try/catch to be safe
        registerFont(fontPath, { family: 'Moul' });
        console.log("✅ Font 'Moul' registered successfully (Legacy Mode).");
    } catch (e) {
        console.log("ℹ️ Note: Font 'Moul.ttf' skipped. Using standard fonts. (This is fine)");
    }
}

const MODEL_NAME = "gemini-2.5-flash"; 
let totalPlays = 0;           
const uniqueVisitors = new Set();

app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString('en-US')}] 📡 ${req.method} ${req.path}`);
    next();
});

// ==========================================
// 💾 DATABASE CONFIGURATION (SAFE MODE)
// ==========================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Function to initialize DB without crashing the app
async function initializeDatabase() {
    try {
        if (!process.env.DATABASE_URL) {
            console.warn("⚠️ DATABASE_URL is missing. Skipping DB init.");
            return;
        }
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

        console.log("✅ Database initialized successfully.");
        client.release();
    } catch (err) {
        console.error("⚠️ Database Warning: Connection failed, but Server is still running.", err.message);
    }
}

// ==========================================
// 🚦 RATE LIMITER
// ==========================================
const limiter = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, 
    max: 10, 
    message: { error: "Rate limit exceeded" },
    keyGenerator: (req) => req.ip,
    skip: (req) => req.ip === process.env.OWNER_IP
});

app.use(express.static(path.join(__dirname, 'public'))); 

app.get('/', (req, res) => {
    res.status(200).send("Server is Online 🟢");
});

// ==========================================
// 🔌 API ROUTES
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

// Admin View (English)
app.get('/admin/requests', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests ORDER BY request_date DESC LIMIT 50');
        client.release();
        
        // Simple HTML Table
        let rows = result.rows.map(row => `
            <tr>
                <td>${row.id}</td>
                <td><b>${row.username}</b></td>
                <td>${row.score}</td>
                <td><a href="/admin/generate-cert/${row.id}" target="_blank">🖨️ Generate</a></td>
            </tr>
        `).join('');

        res.send(`<h1>Admin Panel</h1><table border="1" cellpadding="10" style="border-collapse:collapse; width:100%;">${rows}</table>`);
    } catch (err) {
        res.status(500).send("DB Error");
    }
});

// ==========================================
// 🎨 GENERATE CERTIFICATE (ENGLISH & WHITE BG)
// ==========================================
app.get('/admin/generate-cert/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests WHERE id = $1', [id]);
        client.release();

        if (result.rows.length === 0) return res.status(404).send("Not Found");
        const { username, score, request_date } = result.rows[0];

        // Canvas Setup (2000x1414)
        const width = 2000; 
        const height = 1414;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // ✅ 1. BACKGROUND: Solid White
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);

        // ✅ 2. TEXT RENDERING: English + Arial (Standard)
        const dateStr = new Date(request_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        
        ctx.textAlign = 'center';

        // Title
        ctx.fillStyle = '#334155'; 
        ctx.font = '45px Arial, sans-serif'; 
        ctx.fillText("This Certificate of Achievement is Proudly Presented to", width / 2, 450); 

        // Name (Big & Gold)
        ctx.font = 'bold 150px Arial, sans-serif'; 
        ctx.fillStyle = '#ca8a04'; // Gold-ish color (Flat color is safer)
        ctx.fillText(username.toUpperCase(), width / 2, 650);

        // Subtitle
        ctx.fillStyle = '#1e293b'; 
        ctx.font = '40px Arial, sans-serif';
        ctx.fillText("For outstanding achievement in the Math Quiz Pro challenge.", width / 2, 780);

        // Score
        ctx.fillStyle = '#b91c1c'; 
        ctx.font = 'bold 50px Arial, sans-serif';
        ctx.fillText(`Final Score: ${score}`, width / 2, 870);

        // Body
        ctx.fillStyle = '#1e293b'; 
        ctx.font = '35px Arial, sans-serif'; 
        ctx.fillText("This recognition serves as evidence of dedication and solid knowledge.", width / 2, 1000);
        
        // Date
        ctx.fillStyle = '#64748b'; 
        ctx.font = 'bold 30px Arial, sans-serif'; 
        ctx.fillText(`Issued on: ${dateStr}`, width / 2, 1280);

        // Footer
        ctx.fillStyle = '#0369a1'; 
        ctx.font = 'bold 30px "Courier New", monospace';
        ctx.fillText("Website: braintest.fun", width / 2, 1360); 

        // Output
        const buffer = canvas.toBuffer('image/png');
        res.set('Content-Type', 'image/png');
        res.send(buffer);

    } catch (err) {
        console.error("Certificate Error:", err);
        res.status(500).send("Error generating certificate.");
    }
});

// ==========================================
// 🚀 START SERVER (SAFE STARTUP)
// ==========================================
// Start listening immediately. Do not await DB.
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
    // Initialize DB in background
    initializeDatabase();
});
