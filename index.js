/**
 * ==========================================
 *  BRAINTEST MATH QUIZ - PRO BACKEND SERVER
 *  Developed for: braintest.fun
 *  Version: 2.5 (Dark Mode & Font Fixed)
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

// កំណត់ Trust Proxy សម្រាប់ Render
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(express.json());

// 📥 FONT LOADING SYSTEM (CRITICAL FOR RENDER)
// យើងដាក់ឈ្មោះ Font ថា "CustomCertFont"
const fontName = 'CustomCertFont';
const fontPath = path.join(__dirname, 'public', 'font.ttf');

try {
    if (fs.existsSync(fontPath)) {
        registerFont(fontPath, { family: fontName });
        console.log(`✅ SUCCESS: Font loaded successfully from: ${fontPath}`);
    } else {
        console.error(`❌ CRITICAL ERROR: រកមិនឃើញ file 'font.ttf' ក្នុង folder public ទេ។`);
        console.error(`⚠️ Server នឹងប្រើ Font ធម្មតាជំនួស (អក្សរអាចនឹងតូច)។`);
    }
} catch (error) {
    console.error("⚠️ Font Loading Exception:", error.message);
}

// 🤖 AI CONFIGURATION (Gemini 2.5 Flash)
const MODEL_NAME = "gemini-2.5-flash"; 
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 📊 TRACKING VARIABLES
let totalPlays = 0;           
const uniqueVisitors = new Set();

// Logger Middleware (បង្ហាញសកម្មភាពក្នុង Console)
app.use((req, res, next) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    console.log(`[${time}] 📡 ${req.method} ${req.originalUrl} - IP: ${req.ip}`);
    next();
});

// ==========================================
// 2. DATABASE CONNECTION & INITIALIZATION
// ==========================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // សម្រាប់ Render PostgreSQL
});

// បង្កើត Table ដោយស្វ័យប្រវត្តិបើមិនទាន់មាន
async function initializeDatabase() {
    try {
        const client = await pool.connect();
        console.log("🔄 Checking Database Tables...");

        // 1. Table Leaderboard
        await client.query(`
            CREATE TABLE IF NOT EXISTS leaderboard (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                score INTEGER NOT NULL,
                difficulty VARCHAR(20) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Table Certificate Requests
        await client.query(`
            CREATE TABLE IF NOT EXISTS certificate_requests (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                score INTEGER NOT NULL,
                status VARCHAR(20) DEFAULT 'Pending',
                request_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("✅ Database: All systems operational.");
        client.release();
    } catch (err) {
        console.error("❌ Database Connection Error:", err.message);
        console.error("⚠️ សូមពិនិត្យមើល DATABASE_URL នៅក្នុង Environment Variables។");
    }
}

// ==========================================
// 3. RATE LIMITING (SECURITY)
// ==========================================
// 10 ដង ក្នុងរយៈពេល 8 ម៉ោង
const quizLimiter = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, // 8 hours
    max: 10, 
    message: { 
        error: "Rate limit exceeded", 
        message: "⚠️ អ្នកបានប្រើប្រាស់ AI អស់ចំនួនកំណត់ហើយ (10 ដង/8ម៉ោង)។" 
    },
    keyGenerator: (req) => req.ip,
    skip: (req) => req.ip === process.env.OWNER_IP 
});

// ==========================================
// 4. MAIN ROUTES
// ==========================================

// 🏠 Home Route
app.use(express.static(path.join(__dirname, 'public'))); 

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>BrainTest Backend</title>
            <style>
                body { font-family: 'Segoe UI', sans-serif; text-align: center; padding: 50px; background: #0f172a; color: white; }
                .status { color: #22c55e; font-weight: bold; font-size: 28px; }
                .card { background: #1e293b; padding: 30px; border-radius: 12px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
                .btn { 
                    display: inline-block; margin-top: 20px; padding: 12px 25px; 
                    background: #3b82f6; color: white; text-decoration: none; 
                    border-radius: 8px; font-weight: 600; transition: 0.2s;
                }
                .btn:hover { background: #2563eb; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1 class="status">🟢 System Online</h1>
                <p>BrainTest Math Quiz Backend</p>
                <p style="color: #94a3b8; font-size: 0.9rem;">Powered by Gemini ${MODEL_NAME}</p>
                <a href="/admin/requests" class="btn">👮‍♂️ Go to Admin Panel</a>
            </div>
        </body>
        </html>
    `);
});

// 📊 Stats Route
app.get('/stats', (req, res) => {
    res.json({ 
        status: "active",
        total_plays: totalPlays, 
        unique_players: uniqueVisitors.size,
        uptime: process.uptime()
    });
});

// ==========================================
// 5. API ROUTES (GAME LOGIC)
// ==========================================

// 🤖 Generate Math Problem
app.post('/api/generate-problem', quizLimiter, async (req, res) => {
    try {
        const { prompt } = req.body;
        
        // Validation
        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({ error: "Invalid prompt provided." });
        }

        totalPlays++;
        uniqueVisitors.add(req.ip);

        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const result = await model.generateContent(prompt);
        const textResponse = result.response.text();

        res.json({ text: textResponse });

    } catch (error) {
        console.error("❌ Gemini AI Error:", error);
        res.status(500).json({ error: "Failed to generate problem." });
    }
});

// 🏆 Submit Score
app.post('/api/leaderboard/submit', async (req, res) => {
    const { username, score, difficulty } = req.body;

    if (!username || score === undefined || !difficulty) {
        return res.status(400).json({ success: false, message: "Missing data." });
    }

    try {
        const client = await pool.connect();
        await client.query(
            'INSERT INTO leaderboard(username, score, difficulty) VALUES($1, $2, $3)', 
            [username.trim().substring(0, 50), score, difficulty]
        );
        client.release();
        res.status(201).json({ success: true });
    } catch (err) {
        console.error("DB Insert Error:", err);
        res.status(500).json({ success: false });
    }
});

// 📜 Get Top Scores
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

// ==========================================
// 6. CERTIFICATE REQUEST SYSTEM
// ==========================================

// 📩 ទទួលសំណើ
app.post('/api/submit-request', async (req, res) => {
    const { username, score } = req.body;

    if (!username || score === undefined) {
        return res.status(400).json({ success: false });
    }

    try {
        const client = await pool.connect();
        await client.query(
            'INSERT INTO certificate_requests (username, score, request_date) VALUES ($1, $2, NOW())', 
            [username, score]
        );
        client.release();
        console.log(`📝 New Request: ${username} (${score})`);
        res.json({ success: true });
    } catch (err) {
        console.error("Request Error:", err);
        res.status(500).json({ success: false });
    }
});

// 👮‍♂️ Admin Panel View
app.get('/admin/requests', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests ORDER BY request_date DESC LIMIT 50');
        client.release();
        
        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Admin - Requests</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { font-family: 'Segoe UI', sans-serif; padding: 30px; background: #f8fafc; color: #334155; }
                h1 { color: #1e3a8a; border-bottom: 2px solid #cbd5e1; padding-bottom: 10px; }
                table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border-radius: 8px; overflow: hidden; margin-top: 20px; }
                th, td { padding: 15px; text-align: left; border-bottom: 1px solid #e2e8f0; }
                th { background: #3b82f6; color: white; text-transform: uppercase; font-size: 0.85rem; }
                tr:hover { background: #f1f5f9; }
                .high-score { color: #16a34a; font-weight: bold; }
                .low-score { color: #dc2626; font-weight: bold; }
                .btn { 
                    background: #22c55e; color: white; text-decoration: none; 
                    padding: 8px 16px; border-radius: 5px; font-size: 0.9rem; font-weight: 500;
                    display: inline-block;
                }
                .btn:hover { background: #15803d; }
            </style>
        </head>
        <body>
            <div style="max-width: 1200px; margin: 0 auto;">
                <h1>👮‍♂️ Certificate Requests</h1>
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Candidate</th>
                            <th>Score</th>
                            <th>Date</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>`;
        
        if (result.rows.length === 0) {
            html += `<tr><td colspan="5" style="text-align:center; padding: 30px; color: #94a3b8;">No pending requests.</td></tr>`;
        } else {
            result.rows.forEach(row => {
                // Fixed Date Error
                const dateStr = new Date(row.request_date).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
                });

                html += `<tr>
                    <td>#${row.id}</td>
                    <td style="font-weight:600;">${row.username}</td>
                    <td class="${row.score >= 500 ? 'high-score' : 'low-score'}">${row.score}</td>
                    <td>${dateStr}</td>
                    <td><a href="/admin/generate-cert/${row.id}" target="_blank" class="btn">🖨️ Print</a></td>
                </tr>`;
            });
        }
        
        html += `</tbody></table></div></body></html>`;
        res.send(html);

    } catch (err) {
        res.status(500).send("Admin Error: " + err.message);
    }
});

// ==========================================
// 7. CERTIFICATE GENERATOR (DARK MODE FIX 🌑)
// ==========================================
app.get('/admin/generate-cert/:id', async (req, res) => {
    try {
        const id = req.params.id;
        
        // 1. Get Data
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests WHERE id = $1', [id]);
        client.release();

        if (result.rows.length === 0) return res.status(404).send("Not Found");

        const { username, score, request_date } = result.rows[0];
        const dateStr = new Date(request_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        // 2. Setup Canvas (2000x1414)
        const width = 2000; 
        const height = 1414;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // 3. Load Background
        const templatePath = path.join(__dirname, 'public', 'certificate-template.png');
        try {
            const image = await loadImage(templatePath);
            ctx.drawImage(image, 0, 0, width, height);
        } catch (e) {
            console.warn("⚠️ Template missing. Using Black Background for Dark Mode.");
            ctx.fillStyle = '#111827'; // Black/Dark Blue
            ctx.fillRect(0,0, width, height);
        }

        ctx.textAlign = 'center';

        // ==================================================
        // 🎨 TEXT RENDERING (COLORS FOR DARK BACKGROUND)
        // ==================================================
        
        // 🔥 ប្រើ fontName ដែលបាន register (CustomCertFont)
        
        // 1. TITLE (WHITE)
        ctx.fillStyle = '#FFFFFF'; 
        ctx.font = `bold 110px "${fontName}", serif`; 
        ctx.fillText("CERTIFICATE", width / 2, 350);
        
        // 2. SUBTITLE (GOLD)
        ctx.fillStyle = '#FACC15'; // Bright Gold
        ctx.font = `bold 45px "${fontName}", sans-serif`; 
        ctx.letterSpacing = "15px"; 
        ctx.fillText("OF EXCELLENCE", width / 2, 430);
        ctx.letterSpacing = "0px"; 

        // 3. PRESENTED TO (LIGHT GREY)
        ctx.fillStyle = '#E2E8F0'; 
        ctx.font = `italic 40px "${fontName}", serif`; 
        ctx.fillText("This prestigious award is presented to", width / 2, 560); 

        // 4. NAME (GOLD GRADIENT & GLOW)
        ctx.save();
        const gradient = ctx.createLinearGradient(width/2 - 300, 0, width/2 + 300, 0);
        gradient.addColorStop(0, "#CA8A04");    // Dark Gold
        gradient.addColorStop(0.2, "#FDE047");  // Light Gold
        gradient.addColorStop(0.5, "#FEF9C3");  // White Gold
        gradient.addColorStop(0.8, "#FDE047");  // Light Gold
        gradient.addColorStop(1, "#CA8A04");    // Dark Gold
        
        ctx.fillStyle = gradient;
        
        // Glow Effect for visibility on dark bg
        ctx.shadowColor = "rgba(250, 204, 21, 0.5)"; 
        ctx.shadowBlur = 20;

        ctx.font = `bold 160px "${fontName}", sans-serif`; 
        ctx.fillText(username.toUpperCase(), width / 2, 720);
        ctx.restore(); 

        // Underline (Gold)
        ctx.beginPath();
        ctx.moveTo(width / 2 - 350, 760);
        ctx.lineTo(width / 2 + 350, 760);
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#FACC15';
        ctx.stroke();

        // 5. BODY TEXT (OFF-WHITE)
        ctx.fillStyle = '#F1F5F9'; 
        ctx.font = `40px "${fontName}", serif`;
        
        ctx.fillText("In recognition of your outstanding intellectual acuity", width / 2, 880);
        ctx.fillText("and exceptional performance demonstrated in the", width / 2, 940);
        ctx.fillText("Advanced Mathematics Challenge.", width / 2, 1000);

        // 6. SCORE (LIGHT RED)
        ctx.fillStyle = '#F87171'; 
        ctx.font = `bold 60px "${fontName}", sans-serif`;
        ctx.fillText(`ACHIEVEMENT SCORE: ${score}`, width / 2, 1120);

        // 7. FOOTER SECTION
        const footerY = 1280;
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#FFFFFF'; // White Lines

        // -> LEFT: ADMIN
        const leftX = 500;
        ctx.beginPath(); ctx.moveTo(leftX - 150, footerY); ctx.lineTo(leftX + 150, footerY); ctx.stroke();
        
        ctx.fillStyle = '#FFFFFF'; // Name: White
        ctx.font = `bold 30px "${fontName}", sans-serif`; 
        ctx.fillText("CHHEANG SINHSINH", leftX, footerY + 50); 
        
        ctx.fillStyle = '#94A3B8'; // Title: Grey
        ctx.font = `italic 25px "${fontName}", serif`;
        ctx.fillText("Founder & Administrator", leftX, footerY + 90); 

        // -> CENTER: DATE
        ctx.fillStyle = '#CBD5E1';
        ctx.font = `bold 30px "${fontName}", sans-serif`;
        ctx.fillText(dateStr, width / 2, footerY + 50);

        // -> RIGHT: WEBSITE
        const rightX = 1500;
        ctx.beginPath(); ctx.moveTo(rightX - 150, footerY); ctx.lineTo(rightX + 150, footerY); ctx.stroke();
        
        ctx.fillStyle = '#60A5FA'; // Light Blue Link
        ctx.font = `bold 35px "${fontName}", sans-serif`; 
        ctx.fillText("website : braintest.fun", rightX, footerY + 50); 
        
        ctx.fillStyle = '#94A3B8';
        ctx.font = `italic 25px "${fontName}", serif`;
        ctx.fillText("Official Platform", rightX, footerY + 90); 

        // Output
        const buffer = canvas.toBuffer('image/png');
        res.set('Content-Type', 'image/png');
        res.send(buffer);

    } catch (err) {
        console.error("❌ Certificate Error:", err);
        res.status(500).send("Error generating certificate.");
    }
});

// ==========================================
// 8. START SERVER
// ==========================================
async function startServer() {
    if (!process.env.DATABASE_URL) {
        console.error("🛑 CRITICAL: DATABASE_URL is missing.");
        process.exit(1);
    }
    
    await initializeDatabase();

    app.listen(port, () => {
        console.log(`========================================`);
        console.log(`🚀 PRO SERVER RUNNING ON PORT ${port}`);
        console.log(`🌑 Dark Mode Certificate: ACTIVE`);
        console.log(`🔗 Admin Panel: http://localhost:${port}/admin/requests`);
        console.log(`========================================`);
    });
}

startServer();
