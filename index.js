/**
 * ==========================================
 *  BRAINTEST MATH QUIZ - BACKEND SERVER
 *  Developed for: braintest.fun
 *  Updated: Dark Mode Certificate Fix
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
// 1. SYSTEM CONFIGURATION
// ==========================================

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

// 📥 FONT LOADING
// សំខាន់៖ បើមិនមាន font.ttf ទេ វានឹងប្រើ sans-serif ជំនួស
const fontName = 'CustomCertFont';
const fontPath = path.join(__dirname, 'public', 'font.ttf');

try {
    if (fs.existsSync(fontPath)) {
        registerFont(fontPath, { family: fontName });
        console.log(`✅ SUCCESS: Font loaded from ${fontPath}`);
    } else {
        console.warn(`⚠️ WARNING: 'font.ttf' not found. Using system fonts.`);
    }
} catch (error) {
    console.error("⚠️ Font Load Error:", error.message);
}

// 🤖 AI CONFIGURATION
const MODEL_NAME = "gemini-2.5-flash"; 
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 📊 TRACKING
let totalPlays = 0;           
const uniqueVisitors = new Set();

app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString('en-US')}] 📡 ${req.method} ${req.originalUrl}`);
    next();
});

// ==========================================
// 2. DATABASE
// ==========================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } 
});

async function initializeDatabase() {
    try {
        const client = await pool.connect();
        
        // Leaderboard Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS leaderboard (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                score INTEGER NOT NULL,
                difficulty VARCHAR(20) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Certificate Requests Table
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
// 3. ROUTES
// ==========================================
const limiter = rateLimit({ windowMs: 8*60*60*1000, max: 10, keyGenerator: (req)=>req.ip, skip: (req)=>req.ip===process.env.OWNER_IP });
app.use(express.static(path.join(__dirname, 'public'))); 

app.get('/', (req, res) => {
    res.send(`<div style="font-family:sans-serif;text-align:center;padding-top:50px;"><h1 style="color:#22c55e;">System Online 🟢</h1><a href="/admin/requests" style="background:#0284c7;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Go to Admin</a></div>`);
});

app.get('/stats', (req, res) => res.json({ total_plays: totalPlays, unique_players: uniqueVisitors.size }));

app.post('/api/generate-problem', limiter, async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: "No prompt" });
        totalPlays++; uniqueVisitors.add(req.ip);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const result = await model.generateContent(prompt);
        res.json({ text: result.response.text() });
    } catch (error) { res.status(500).json({ error: "AI Failed" }); }
});

app.post('/api/leaderboard/submit', async (req, res) => {
    try { const client = await pool.connect(); await client.query('INSERT INTO leaderboard(username, score, difficulty) VALUES($1, $2, $3)', [req.body.username, req.body.score, req.body.difficulty]); client.release(); res.status(201).json({ success: true }); } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/leaderboard/top', async (req, res) => {
    try { const client = await pool.connect(); const result = await client.query('SELECT username, score, difficulty FROM leaderboard ORDER BY score DESC LIMIT 100'); client.release(); res.json(result.rows); } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/submit-request', async (req, res) => {
    try { const client = await pool.connect(); await client.query('INSERT INTO certificate_requests (username, score, request_date) VALUES ($1, $2, NOW())', [req.body.username, req.body.score]); client.release(); res.json({ success: true }); } catch (err) { res.status(500).json({ success: false }); }
});

// Admin Panel (Fixed Date)
app.get('/admin/requests', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests ORDER BY request_date DESC LIMIT 50');
        client.release();
        
        let html = `<html><body style="font-family:sans-serif;padding:20px;"><h1>Admin Panel</h1><table border="1" cellpadding="10" style="width:100%;border-collapse:collapse;"><tr><th>ID</th><th>Name</th><th>Score</th><th>Date</th><th>Action</th></tr>`;
        result.rows.forEach(row => {
            const dateStr = new Date(row.request_date).toLocaleString('en-US');
            html += `<tr><td>${row.id}</td><td><b>${row.username}</b></td><td>${row.score}</td><td>${dateStr}</td><td><a href="/admin/generate-cert/${row.id}" target="_blank">🖨️ Print</a></td></tr>`;
        });
        html += `</table></body></html>`;
        res.send(html);
    } catch (err) { res.status(500).send("Error"); }
});

// ==========================================
// 4. CERTIFICATE GENERATOR (DARK MODE FIX 🌑)
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

        // Load Background
        try {
            const image = await loadImage(path.join(__dirname, 'public', 'certificate-template.png'));
            ctx.drawImage(image, 0, 0, width, height);
        } catch (e) {
            // បើអត់មានរូប ប្រើផ្ទៃខ្មៅជំនួស
            ctx.fillStyle = '#111827'; 
            ctx.fillRect(0,0, width, height);
        }

        ctx.textAlign = 'center';

        // NOTE: យើងប្រើពណ៌ "ស" (White) និង "មាស" (Gold) ដើម្បីអោយឃើញលើផ្ទៃខ្មៅ

        // 1. TITLE
        ctx.fillStyle = '#FFFFFF'; // ពណ៌ស (White)
        ctx.font = `bold 110px "${fontName}", serif`; 
        ctx.fillText("CERTIFICATE", width / 2, 350);
        
        ctx.fillStyle = '#FACC15'; // ពណ៌មាសភ្លឺ (Bright Gold)
        ctx.font = `bold 45px "${fontName}", sans-serif`; 
        ctx.letterSpacing = "15px"; 
        ctx.fillText("OF EXCELLENCE", width / 2, 430); 
        ctx.letterSpacing = "0px"; 

        // 2. PRESENTED TO
        ctx.fillStyle = '#E2E8F0'; // ពណ៌ប្រផេះភ្លឺ (Light Grey)
        ctx.font = `italic 40px "${fontName}", serif`; 
        ctx.fillText("This prestigious award is presented to", width / 2, 560); 

        // 3. NAME (GOLD GRADIENT)
        ctx.save();
        const gradient = ctx.createLinearGradient(width/2-300, 0, width/2+300, 0);
        gradient.addColorStop(0, "#CA8A04");    // Dark Gold
        gradient.addColorStop(0.5, "#FEF08A");  // Light Gold
        gradient.addColorStop(1, "#CA8A04");    // Dark Gold
        
        ctx.fillStyle = gradient;
        // Glow Effect
        ctx.shadowColor = "rgba(250, 204, 21, 0.4)"; 
        ctx.shadowBlur = 15;
        
        ctx.font = `bold 160px "${fontName}", sans-serif`; 
        ctx.fillText(username.toUpperCase(), width / 2, 720);
        ctx.restore(); 

        // Underline
        ctx.beginPath(); ctx.moveTo(width/2-350, 760); ctx.lineTo(width/2+350, 760);
        ctx.lineWidth = 4; ctx.strokeStyle = '#FACC15'; ctx.stroke();

        // 4. BODY TEXT
        ctx.fillStyle = '#F1F5F9'; // ពណ៌សស្រាល (Off-white)
        ctx.font = `40px "${fontName}", serif`;
        ctx.fillText("In recognition of your outstanding intellectual acuity", width / 2, 880);
        ctx.fillText("and exceptional performance demonstrated in the", width / 2, 940);
        ctx.fillText("Advanced Mathematics Challenge.", width / 2, 1000);

        // 5. SCORE
        ctx.fillStyle = '#F87171'; // ពណ៌ក្រហមភ្លឺ (Light Red)
        ctx.font = `bold 60px "${fontName}", sans-serif`;
        ctx.fillText(`ACHIEVEMENT SCORE: ${score}`, width / 2, 1120);

        // 6. FOOTER
        const footerY = 1280; 
        ctx.lineWidth = 3; 
        ctx.strokeStyle = '#FFFFFF'; // បន្ទាត់ពណ៌ស

        // Left
        ctx.beginPath(); ctx.moveTo(350, footerY); ctx.lineTo(650, footerY); ctx.stroke();
        ctx.fillStyle = '#FFFFFF'; ctx.font = `bold 30px "${fontName}", sans-serif`; 
        ctx.fillText("CHHEANG SINHSINH", 500, footerY + 50); 
        ctx.fillStyle = '#94A3B8'; ctx.font = `italic 25px "${fontName}", serif`; 
        ctx.fillText("Founder & Administrator", 500, footerY + 90); 

        // Center Date
        ctx.fillStyle = '#CBD5E1'; ctx.font = `bold 30px "${fontName}", sans-serif`;
        ctx.fillText(dateStr, width / 2, footerY + 50);

        // Right
        ctx.beginPath(); ctx.moveTo(1350, footerY); ctx.lineTo(1650, footerY); ctx.stroke();
        ctx.fillStyle = '#60A5FA'; // ពណ៌ខៀវភ្លឺ (Light Blue)
        ctx.font = `bold 35px "${fontName}", sans-serif`; 
        ctx.fillText("website : braintest.fun", 1500, footerY + 50); 
        ctx.fillStyle = '#94A3B8'; ctx.font = `italic 25px "${fontName}", serif`; 
        ctx.fillText("Official Platform", 1500, footerY + 90); 

        const buffer = canvas.toBuffer('image/png');
        res.set('Content-Type', 'image/png');
        res.send(buffer);

    } catch (err) {
        console.error("Cert Gen Error:", err);
        res.status(500).send("Error generating certificate.");
    }
});

async function startServer() {
    if (!process.env.DATABASE_URL) return console.error("Missing DB URL");
    await initializeDatabase();
    app.listen(port, () => console.log(`Server on port ${port}`));
}

startServer();
