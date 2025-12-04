Require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg'); 

// === TEMPORARILY DISABLED: CANVAS LIBRARY ===
// const { registerFont, createCanvas, loadImage } = require('canvas'); 
// ============================================

const app = express();
const port = process.env.PORT || 3000;

// ==========================================
// 1. SETUP & CONFIGURATION
// ==========================================
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

// === TEMPORARILY DISABLED: FONT REGISTER ===
/*
try {
    const fontPath = path.join(__dirname, 'public', 'Moul.ttf');
    // registerFont(fontPath, { family: 'Moul' });
    console.log("✅ Font 'Moul' setup skipped for testing.");
} catch (e) {
    // console.warn("⚠️ Warning: Font 'Moul' not found.");
}
*/
// ============================================

const MODEL_NAME = "gemini-2.5-flash"; 
let totalPlays = 0;           
const uniqueVisitors = new Set();

app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] 📡 ${req.method} ${req.path}`);
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

        console.log("✅ Database initialized and connected.");
        client.release();
    } catch (err) {
        console.error("❌ Database initialization error (Check DATABASE_URL):", err.message);
        // Throw the error so startServer knows to potentially halt.
        throw new Error("DB Initialization Failed"); 
    }
}

// ==========================================
// 3. RATE LIMITER
// ==========================================
const limiter = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, 
    max: 10, 
    message: { error: "Rate limit exceeded" },
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
            <h1 style="color: #16a34a;">Server Online (Canvas Test Mode) 🟢</h1>
            <p>If you see this, your database and environment are likely correct.</p>
            <div style="margin-top: 20px; padding: 10px; background: #fef9c3; display: inline-block; border-radius: 8px; border: 1px solid #fde047;">
                <p style="color: #a16207; font-weight: bold;">⚠️ Certificate generation is temporarily disabled.</p>
                <p style="font-size: 0.9em; margin: 5px 0 0;">Check /admin/requests route status.</p>
            </div>
        </div>
    `);
});

// ==========================================
// 5. API ROUTES
// ==========================================

app.get('/stats', (req, res) => res.json({ total_plays: totalPlays, unique_players: uniqueVisitors.size }));

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
        console.error("Gemini API Error (Check GEMINI_API_KEY):", error.message);
        res.status(500).json({ error: "AI Generation Failed" });
    }
});

app.post('/api/leaderboard/submit', async (req, res) => {
    const { username, score, difficulty } = req.body;
    if (!username || typeof score !== 'number') return res.status(400).json({ success: false });
    try {
        const client = await pool.connect();
        await client.query('INSERT INTO leaderboard(username, score, difficulty) VALUES($1, $2, $3)', [username, score, difficulty]);
        client.release();
        res.status(201).json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/leaderboard/top', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT username, score, difficulty FROM leaderboard ORDER BY score DESC LIMIT 100');
        client.release();
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/submit-request', async (req, res) => {
    const { username, score } = req.body;
    if (!username || score === undefined) return res.status(400).json({ success: false });
    try {
        const client = await pool.connect();
        await client.query('INSERT INTO certificate_requests (username, score, request_date) VALUES ($1, $2, NOW())', [username, score]);
        client.release();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// ✅ Admin Panel
app.get('/admin/requests', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests ORDER BY request_date DESC LIMIT 50');
        client.release();

        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Admin - Certificate Requests (TEST MODE)</title>
            <style>
                body { font-family: sans-serif; padding: 20px; background: #f8fafc; }
                table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden; }
                th, td { padding: 15px; border-bottom: 1px solid #e2e8f0; text-align: left; }
                th { background: #1e40af; color: white; }
                .btn-disabled { background: #9ca3af; color: white; padding: 8px 12px; border-radius: 6px; text-decoration: none; pointer-events: none; }
            </style>
        </head>
        <body>
            <h1>⚠️ Certificate Management (TEST MODE)</h1>
            <p style="color: #dc2626; font-weight: bold;">Route /admin/generate-cert/id ត្រូវបានបិទជាបណ្ដោះអាសន្ន។</p>
            <table>
                <thead><tr><th>ID</th><th>Username</th><th>Score</th><th>Date</th><th>Action</th></tr></thead>
                <tbody>`;
        
        if(result.rows.length === 0) html += `<tr><td colspan="5" style="text-align:center; padding:20px;">No requests found.</td></tr>`;

        result.rows.forEach(row => {
            html += `<tr>
                <td>${row.id}</td>
                <td><b>${row.username}</b></td>
                <td>${row.score}</td>
                <td>${new Date(row.request_date).toLocaleDateString()}</td>
                <td><span class="btn-disabled">🖨️ Disabled (Testing)</span></td>
            </tr>`;
        });
        html += `</tbody></table></body></html>`;
        res.send(html);
    } catch (err) { res.status(500).send("Error connecting to database."); }
});

// =================================================================
// ⚠️ 7. GENERATE CERTIFICATE ROUTE IS TEMPORARILY DISABLED FOR TESTING
// =================================================================
/*
app.get('/admin/generate-cert/:id', async (req, res) => {
    // This route logic is skipped.
    res.status(503).send("Certificate Generation is disabled for deployment troubleshooting.");
});
*/
// =================================================================

// ==========================================
// 8. START SERVER
// ==========================================
async function startServer() {
    try {
        if (!process.env.DATABASE_URL) {
            console.error("🛑 CRITICAL: DATABASE_URL is missing. Please set it.");
            // We use process.exit(1) here to explicitly stop execution cleanly if a critical variable is missing.
            return process.exit(1); 
        }
        
        await initializeDatabase();

        app.listen(port, () => {
            console.log(`🚀 Server running on port ${port} in Test Mode.`);
            console.log(`🔗 Admin: http://localhost:${port}/admin/requests`);
        });
    } catch (error) {
        console.error("❌ Fatal Error during Startup:", error.message);
        process.exit(1); // Exit with status 1 if DB initialization failed.
    }
}

startServer();
