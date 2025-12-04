/**
 * ==========================================
 *  BRAINTEST MATH QUIZ - BACKEND SERVER
 *  Developed for: braintest.fun
 *  Updated: December 2025 (Fixed Date Error)
 * ==========================================
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg'); 
const { registerFont, createCanvas, loadImage } = require('canvas');
const fs = require('fs'); 

const app = express();
const port = process.env.PORT || 3000;

// ==========================================
// 1. SYSTEM CONFIGURATION & FONT LOADING
// ==========================================

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

// 📥 FONT LOADING
const fontName = 'CustomCertFont';
const fontPath = path.join(__dirname, 'public', 'font.ttf');

try {
    if (fs.existsSync(fontPath)) {
        registerFont(fontPath, { family: fontName });
        console.log(`✅ SUCCESS: Font loaded from ${fontPath}`);
    } else {
        console.error(`❌ CRITICAL: 'font.ttf' missing in public folder.`);
    }
} catch (error) {
    console.error("⚠️ Font Load Error:", error.message);
}

// 🤖 AI CONFIGURATION
const MODEL_NAME = "gemini-2.5-flash"; 
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 📊 TRACKING VARIABLES
let totalPlays = 0;           
const uniqueVisitors = new Set();

// Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString('en-US')}] 📡 ${req.method} ${req.originalUrl}`);
    next();
});

// ==========================================
// 2. DATABASE CONNECTION
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
                username VARCHAR(50) NOT NULL,
                score INTEGER NOT NULL,
                difficulty VARCHAR(20) NOT NULL,
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

// ==========================================
// 3. RATE LIMITING
// ==========================================
const quizLimiter = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, // 8 hours
    max: 10, // 10 requests per 8 hours
    message: { error: "Rate limit exceeded", message: "⚠️ Limit reached (10 times/8h)." },
    keyGenerator: (req) => req.ip,
    skip: (req) => req.ip === process.env.OWNER_IP 
});

// ==========================================
// 4. MAIN ROUTES
// ==========================================

app.use(express.static(path.join(__dirname, 'public'))); 

app.get('/', (req, res) => {
    res.send(`
        <div style="font-family: sans-serif; text-align: center; padding-top: 50px;">
            <h1 style="color: #22c55e;">System Online 🟢</h1>
            <a href="/admin/requests" style="background:#0284c7;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;font-weight:bold;">👮‍♂️ Admin Panel</a>
        </div>
    `);
});

app.get('/stats', (req, res) => {
    res.json({ total_plays: totalPlays, unique_players: uniqueVisitors.size });
});

// ==========================================
// 5. API ROUTES
// ==========================================

app.post('/api/generate-problem', quizLimiter, async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: "No prompt" });

        totalPlays++;
        uniqueVisitors.add(req.ip);

        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const result = await model.generateContent(prompt);
        res.json({ text: result.response.text() });

    } catch (error) {
        console.error("AI Error:", error);
        res.status(500).json({ error: "AI Failed" });
    }
});

app.post('/api/leaderboard/submit', async (req, res) => {
    const { username, score, difficulty } = req.body;
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

// ==========================================
// 6. ADMIN PANEL (FIXED DATE ERROR)
// ==========================================
app.get('/admin/requests', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests ORDER BY request_date DESC LIMIT 50');
        client.release();
        
        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Admin Dashboard</title>
            <style>
                body { font-family: sans-serif; padding: 20px; background: #f1f5f9; }
                table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                th, td { padding: 15px; border-bottom: 1px solid #ddd; text-align: left; }
                th { background: #3b82f6; color: white; }
                tr:hover { background: #f8fafc; }
                a { text-decoration: none; background: #22c55e; color: white; padding: 8px 12px; border-radius: 4px; }
            </style>
        </head>
        <body>
            <h1>👮‍♂️ Certificate Requests</h1>
            <table><tr><th>ID</th><th>Name</th><th>Score</th><th>Date</th><th>Action</th></tr>`;
        
        if(result.rows.length === 0) html += `<tr><td colspan="5" style="text-align:center;">No requests.</td></tr>`;
        
        result.rows.forEach(row => {
            // ✅ FIX: ប្រើ toLocaleString បែបស្តង់ដារជំនួស dateStyle/timeStyle
            const dateStr = new Date(row.request_date).toLocaleString('en-US', {
                year: 'numeric', 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            html += `<tr>
                <td>#${row.id}</td>
                <td><strong>${row.username}</strong></td>
                <td style="color:${row.score>=500?'green':'red'}">${row.score}</td>
                <td>${dateStr}</td>
                <td><a href="/admin/generate-cert/${row.id}" target="_blank">🖨️ Print</a></td>
            </tr>`;
        });
        html += `</table></body></html>`;
        res.send(html);

    } catch (err) {
        console.error("Admin Panel Error:", err);
        res.status(500).send("Error loading admin panel: " + err.message);
    }
});

// ==========================================
// 7. CERTIFICATE GENERATOR
// ==========================================
app.get('/admin/generate-cert/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests WHERE id = $1', [id]);
        client.release();

        if (result.rows.length === 0) return res.status(404).send("Not Found");

        const { username, score, request_date } = result.rows[0];
        const dateStr = new Date(request_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        const width = 2000; const height = 1414;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        try {
            const image = await loadImage(path.join(__dirname, 'public', 'certificate-template.png'));
            ctx.drawImage(image, 0, 0, width, height);
        } catch (e) {
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0, width, height);
        }

        ctx.textAlign = 'center';

        // Title
        ctx.fillStyle = '#1e3a8a'; ctx.font = `bold 110px "${fontName}", serif`; 
        ctx.fillText("CERTIFICATE", width / 2, 350);
        
        ctx.fillStyle = '#ca8a04'; ctx.font = `bold 45px "${fontName}", sans-serif`; 
        ctx.letterSpacing = "15px"; ctx.fillText("OF EXCELLENCE", width / 2, 430); ctx.letterSpacing = "0px"; 

        // Presented To
        ctx.fillStyle = '#64748b'; ctx.font = `italic 40px "${fontName}", serif`; 
        ctx.fillText("This prestigious award is presented to", width / 2, 560); 

        // Name
        ctx.save();
        const gradient = ctx.createLinearGradient(width/2-300, 0, width/2+300, 0);
        gradient.addColorStop(0, "#854d0e"); gradient.addColorStop(0.2, "#facc15"); gradient.addColorStop(1, "#854d0e");
        ctx.fillStyle = gradient;
        ctx.shadowColor = "rgba(0,0,0,0.2)"; ctx.shadowBlur = 10; ctx.shadowOffsetY = 5;
        ctx.font = `bold 160px "${fontName}", sans-serif`; 
        ctx.fillText(username.toUpperCase(), width / 2, 720);
        ctx.restore(); 

        ctx.beginPath(); ctx.moveTo(width/2-350, 760); ctx.lineTo(width/2+350, 760);
        ctx.lineWidth = 4; ctx.strokeStyle = '#ca8a04'; ctx.stroke();

        // Body
        ctx.fillStyle = '#334155'; ctx.font = `40px "${fontName}", serif`;
        ctx.fillText("In recognition of your outstanding intellectual acuity", width / 2, 880);
        ctx.fillText("and exceptional performance demonstrated in the", width / 2, 940);
        ctx.fillText("Advanced Mathematics Challenge.", width / 2, 1000);

        // Score
        ctx.fillStyle = '#dc2626'; ctx.font = `bold 60px "${fontName}", sans-serif`;
        ctx.fillText(`ACHIEVEMENT SCORE: ${score}`, width / 2, 1120);

        // Footer
        const footerY = 1280; ctx.lineWidth = 3; ctx.strokeStyle = '#0f172a';

        // Left
        ctx.beginPath(); ctx.moveTo(350, footerY); ctx.lineTo(650, footerY); ctx.stroke();
        ctx.fillStyle = '#0f172a'; ctx.font = `bold 30px "${fontName}", sans-serif`; 
        ctx.fillText("CHHEANG SINHSINH", 500, footerY + 50); 
        ctx.fillStyle = '#64748b'; ctx.font = `italic 25px "${fontName}", serif`; 
        ctx.fillText("Founder & Administrator", 500, footerY + 90); 

        // Center
        ctx.fillStyle = '#475569'; ctx.font = `bold 30px "${fontName}", sans-serif`;
        ctx.fillText(dateStr, width / 2, footerY + 50);

        // Right
        ctx.beginPath(); ctx.moveTo(1350, footerY); ctx.lineTo(1650, footerY); ctx.stroke();
        ctx.fillStyle = '#2563eb'; ctx.font = `bold 35px "${fontName}", sans-serif`; 
        ctx.fillText("website : braintest.fun", 1500, footerY + 50); 
        ctx.fillStyle = '#64748b'; ctx.font = `italic 25px "${fontName}", serif`; 
        ctx.fillText("Official Platform", 1500, footerY + 90); 

        const buffer = canvas.toBuffer('image/png');
        res.set('Content-Type', 'image/png');
        res.send(buffer);

    } catch (err) {
        console.error("Cert Gen Error:", err);
        res.status(500).send("Error generating certificate.");
    }
});

// ==========================================
// 8. START SERVER
// ==========================================
async function startServer() {
    if (!process.env.DATABASE_URL) return console.error("🛑 CRITICAL: DATABASE_URL missing.");
    await initializeDatabase();
    app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
}

startServer();
