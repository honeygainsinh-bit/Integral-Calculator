// =============================================================
// MATH QUIZ PRO BACKEND - RESTORED FULL STRUCTURE
// =============================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg'); 

// នាំយក Canvas មកប្រើ (រក្សា registerFont ក្នុង require)
const { registerFont, createCanvas, loadImage } = require('canvas');

const app = express();
const port = process.env.PORT || 3000;

// ==========================================
// 1. SETUP & CONFIGURATION
// ==========================================
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

// ✅ រក្សាប្លុកកូដចុះឈ្មោះ Font Moul ដើម (ដើម្បីកុំឲ្យ Server Crash)
try {
    const fontPath = path.join(__dirname, 'public', 'Moul.ttf');
    registerFont(fontPath, { family: 'Moul' });
    console.log("✅ Font 'Moul' loaded successfully.");
} catch (e) {
    console.warn("⚠️ Warning: Could not find font 'Moul.ttf' in the public folder.");
}

const MODEL_NAME = "gemini-2.5-flash"; 
let totalPlays = 0;           
const uniqueVisitors = new Set();

// Middleware: Log Request
app.use((req, res, next) => {
    // រក្សារចនាសម្ព័ន្ធ Log ដើម
    console.log(`[${new Date().toLocaleTimeString('en-US')}] 📡 ${req.method} ${req.path}`);
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
        // រក្សារចនាសម្ព័ន្ធ Log ដើម
        console.error("❌ Database initialization error:", err.message);
    }
}

// ==========================================
// 3. RATE LIMITER
// ==========================================
const limiter = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, 
    max: 10, 
    message: { error: "Rate limit exceeded", message: "⚠️ Rate limit exceeded (10 times/day)!" },
    keyGenerator: (req) => req.ip,
    skip: (req) => req.ip === process.env.OWNER_IP
});

// ==========================================
// 4. STATIC FILES & HOME ROUTE
// ==========================================
app.use(express.static(path.join(__dirname, 'public'))); 

app.get('/', (req, res) => {
    // រក្សារចនាសម្ព័ន្ធដើម
    res.status(200).send(`
        <div style="font-family: sans-serif; text-align: center; padding-top: 50px;">
            <h1 style="color: #22c55e;">Server is Online 🟢</h1>
            <p>Math Quiz Pro Backend</p>
            <div style="margin-top: 20px; padding: 10px; background: #f0f9ff; display: inline-block; border-radius: 8px;">
                <a href="/admin/requests" style="text-decoration: none; color: #0284c7; font-weight: bold;">👮‍♂️ View Certificate Requests (Admin)</a>
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
    } catch (err) {
        console.error("Submit Request Error:", err.message);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// ✅ Admin HTML View (English Interface)
app.get('/admin/requests', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests ORDER BY request_date DESC LIMIT 50');
        client.release();

        let html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Admin - Certificate Requests</title>
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
            <h1>👮‍♂️ Admin Panel - Certificate Requests</h1>
            <table>
                <thead>
                    <tr>
                        <th>#ID</th>
                        <th>Username</th>
                        <th>Score</th>
                        <th>Request Date</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>`;

        if (result.rows.length === 0) {
            html += `<tr><td colspan="5" style="text-align:center; padding: 20px; color: gray;">No new requests yet.</td></tr>`;
        } else {
            result.rows.forEach(row => {
                const isHighScore = row.score >= 500;
                // English Date Format
                const requestDate = new Date(row.request_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); 
                html += `
                    <tr>
                        <td>${row.id}</td>
                        <td style="font-weight:bold; color: #334155;">${row.username}</td>
                        <td style="color:${isHighScore ? '#16a34a' : '#dc2626'}; font-weight:bold;">${row.score}</td>
                        <td>${requestDate}</td>
                        <td>
                            <a href="/admin/generate-cert/${row.id}" target="_blank" class="btn-gen">🖨️ Generate Certificate</a>
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
// 7. GENERATE CERTIFICATE LOGIC (English & White BG)
// ==========================================
app.get('/admin/generate-cert/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests WHERE id = $1', [id]);
        client.release();

        if (result.rows.length === 0) return res.status(404).send("Not Found");

        const { username, score, request_date } = result.rows[0];

        // --- English Date Format ---
        const dateObj = new Date(request_date);
        const englishDate = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        // --- Setup Canvas (2000x1414) ---
        const width = 2000; 
        const height = 1414;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // ✅ ប្រើផ្ទៃខាងក្រោយពណ៌សសុទ្ធ (ជំនួសរូបភាព Template)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);

        // ==========================================
        // 🎨 DESIGN & TEXT RENDERING (ENGLISH - Using Arial for Stability)
        // ==========================================
        
        ctx.textAlign = 'center';

        // 1. Opening Phrase 
        ctx.font = '45px Arial, sans-serif'; 
        ctx.fillStyle = '#334155'; 
        ctx.fillText("This Certificate of Achievement is Proudly Presented to", width / 2, 450); 

        // 2. Recipient Name (GOLD EFFECT) ✨
        const gradient = ctx.createLinearGradient(width/2 - 250, 0, width/2 + 250, 0);
        gradient.addColorStop(0, "#854d0e");   
        gradient.addColorStop(0.5, "#fde047"); 
        gradient.addColorStop(1, "#854d0e");   

        ctx.shadowColor = "rgba(180, 83, 9, 0.6)"; 
        ctx.shadowBlur = 10;
        
        ctx.font = 'bold 150px Arial, sans-serif'; 
        ctx.fillStyle = gradient;
        ctx.fillText(username.toUpperCase(), width / 2, 650);

        // Reset Shadow
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;

        // 3. Content Title
        ctx.font = '40px Arial, sans-serif';
        ctx.fillStyle = '#1e293b'; 
        ctx.fillText(`For outstanding achievement in the Math Quiz Pro challenge.`, width / 2, 780);

        // 4. Score
        ctx.font = 'bold 50px Arial, sans-serif';
        ctx.fillStyle = '#b91c1c'; 
        ctx.fillText(`Final Score: ${score}`, width / 2, 870);

        // 5. Content Body (English)
        ctx.fillStyle = '#1e293b'; 
        ctx.font = '35px Arial, sans-serif'; 
        const lineHeight = 65; 
        let startY = 1000;

        // Line 1
        ctx.fillText("This recognition serves as evidence of the student's exceptional dedication,", width / 2, startY);
        
        // Line 2
        ctx.fillText("perseverance, and solid fundamental knowledge acquired through rigorous practice.", width / 2, startY + lineHeight);
        
        // Line 3: Wishing
        ctx.fillStyle = '#15803d'; 
        ctx.fillText("We wish you continued success in your academic journey and future endeavors.", width / 2, startY + (lineHeight * 2) + 15);

        // 6. Date
        ctx.fillStyle = '#64748b'; 
        ctx.font = 'bold 30px Arial, sans-serif'; 
        ctx.fillText(`Issued on: ${englishDate}`, width / 2, 1280);

        // 7. Footer
        ctx.font = 'bold 30px "Courier New", monospace';
        ctx.fillStyle = '#0369a1'; 
        
        // Decorative Line
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
        // រក្សារចនាសម្ព័ន្ធ Log ដើម
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
