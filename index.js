/**
 * ==========================================
 *  BRAINTEST MATH QUIZ - BACKEND SERVER
 *  Developed for: braintest.fun
 *  Updated: December 2025
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
const fs = require('fs'); // ប្រើសម្រាប់ឆែកមើល file

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

// 📥 FONT LOADING SYSTEM (សំខាន់ណាស់សម្រាប់ Render)
const fontName = 'CustomCertFont';
const fontPath = path.join(__dirname, 'public', 'font.ttf');

try {
    if (fs.existsSync(fontPath)) {
        registerFont(fontPath, { family: fontName });
        console.log(`✅ SUCCESS: បាន load font ពី ${fontPath} ជោគជ័យ។`);
    } else {
        console.error(`❌ CRITICAL ERROR: រកមិនឃើញ file 'font.ttf' ក្នុង folder public ទេ។ អក្សរនឹងចេញមកតូចៗ!`);
    }
} catch (error) {
    console.error("⚠️ Font Loading Error:", error.message);
}

// 🤖 AI CONFIGURATION
const MODEL_NAME = "gemini-2.5-flash"; // ប្រើតាមសំណើ
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 📊 TRACKING VARIABLES
let totalPlays = 0;           
const uniqueVisitors = new Set();

// Logger Middleware (មើលសកម្មភាពអ្នកប្រើប្រាស់)
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString('en-US')}] 📡 ${req.method} ${req.originalUrl} - IP: ${req.ip}`);
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
        console.log("🔄 កំពុងត្រួតពិនិត្យ Database...");

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

        console.log("✅ Database: Tables ទាំងអស់រួចរាល់ហើយ។");
        client.release();
    } catch (err) {
        console.error("❌ Database Connection Error:", err.message);
        console.error("⚠️ សូមពិនិត្យមើល DATABASE_URL នៅក្នុង Environment Variables។");
    }
}

// ==========================================
// 3. RATE LIMITING (ការពារការ Spam)
// ==========================================
const quizLimiter = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, // 8 ម៉ោង
    max: 15, // អនុញ្ញាតឱ្យលេង 15 ដងក្នុង 8 ម៉ោង
    message: { error: "Rate limit exceeded", message: "⚠️ អ្នកបានប្រើប្រាស់ AI ច្រើនពេកហើយ។ សូមរង់ចាំមួយរយៈ។" },
    keyGenerator: (req) => req.ip,
    skip: (req) => req.ip === process.env.OWNER_IP // លើកលែងសម្រាប់ម្ចាស់
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
                body { font-family: 'Segoe UI', sans-serif; text-align: center; padding: 50px; background: #f8fafc; }
                .status { color: #16a34a; font-weight: bold; font-size: 24px; }
                .btn { 
                    display: inline-block; margin-top: 20px; padding: 12px 24px; 
                    background: #0284c7; color: white; text-decoration: none; 
                    border-radius: 8px; font-weight: 600; transition: 0.2s;
                }
                .btn:hover { background: #0369a1; }
            </style>
        </head>
        <body>
            <h1 class="status">🟢 BrainTest System Online</h1>
            <p>Running on Node.js with Gemini ${MODEL_NAME}</p>
            <a href="/admin/requests" class="btn">👮‍♂️ Go to Admin Panel</a>
        </body>
        </html>
    `);
});

// 📊 Stats Route
app.get('/stats', (req, res) => {
    res.json({ 
        server_status: "online",
        total_plays: totalPlays, 
        unique_players: uniqueVisitors.size,
        timestamp: new Date()
    });
});

// ==========================================
// 5. API ROUTES (GAME LOGIC)
// ==========================================

// 🤖 Generate Math Problem (AI)
app.post('/api/generate-problem', quizLimiter, async (req, res) => {
    try {
        const { prompt } = req.body;
        
        // Validation
        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({ error: "Invalid prompt provided." });
        }

        totalPlays++;
        uniqueVisitors.add(req.ip);

        // Call Gemini AI
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const result = await model.generateContent(prompt);
        const textResponse = result.response.text();

        res.json({ text: textResponse });

    } catch (error) {
        console.error("❌ Gemini AI Error:", error);
        res.status(500).json({ error: "Failed to generate problem. AI busy." });
    }
});

// 🏆 Submit Score to Leaderboard
app.post('/api/leaderboard/submit', async (req, res) => {
    const { username, score, difficulty } = req.body;

    // Validation
    if (!username || score === undefined || !difficulty) {
        return res.status(400).json({ success: false, message: "Missing required fields." });
    }

    try {
        const client = await pool.connect();
        await client.query(
            'INSERT INTO leaderboard(username, score, difficulty) VALUES($1, $2, $3)', 
            [username.trim().substring(0, 50), score, difficulty]
        );
        client.release();
        res.status(201).json({ success: true, message: "Score recorded." });
    } catch (err) {
        console.error("Database Insert Error:", err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
});

// 📜 Get Top Leaderboard
app.get('/api/leaderboard/top', async (req, res) => {
    try {
        const client = await pool.connect();
        // យក Top 100 ពិន្ទុ
        const result = await client.query('SELECT username, score, difficulty FROM leaderboard ORDER BY score DESC LIMIT 100');
        client.release();
        res.json(result.rows);
    } catch (err) {
        console.error("Database Fetch Error:", err);
        res.status(500).json({ success: false, error: "Unable to fetch leaderboard" });
    }
});

// ==========================================
// 6. CERTIFICATE REQUEST SYSTEM
// ==========================================

// 📩 ទទួលសំណើធ្វើ Certificate
app.post('/api/submit-request', async (req, res) => {
    const { username, score } = req.body;

    if (!username || score === undefined) {
        return res.status(400).json({ success: false, message: "Invalid Data" });
    }

    try {
        const client = await pool.connect();
        await client.query(
            'INSERT INTO certificate_requests (username, score, request_date) VALUES ($1, $2, NOW())', 
            [username, score]
        );
        client.release();
        console.log(`📝 New Certificate Request: ${username} - Score: ${score}`);
        res.json({ success: true });
    } catch (err) {
        console.error("Cert Request Error:", err);
        res.status(500).json({ success: false });
    }
});

// 👮‍♂️ Admin Panel View
app.get('/admin/requests', async (req, res) => {
    try {
        const client = await pool.connect();
        // យកសំណើ 50 ចុងក្រោយ
        const result = await client.query('SELECT * FROM certificate_requests ORDER BY request_date DESC LIMIT 50');
        client.release();
        
        // HTML Template
        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Admin - Certificate Requests</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; background: #f1f5f9; color: #334155; }
                h1 { color: #1e3a8a; border-bottom: 3px solid #cbd5e1; padding-bottom: 10px; }
                .card { background: white; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden; }
                table { width: 100%; border-collapse: collapse; }
                th, td { padding: 15px; text-align: left; border-bottom: 1px solid #e2e8f0; }
                th { background: #3b82f6; color: white; font-weight: 600; text-transform: uppercase; font-size: 0.85rem; }
                tr:hover { background: #f8fafc; }
                .score-high { color: #16a34a; font-weight: bold; }
                .score-low { color: #dc2626; font-weight: bold; }
                .btn-print { 
                    display: inline-flex; align-items: center; gap: 5px;
                    background: #22c55e; color: white; text-decoration: none; 
                    padding: 8px 16px; border-radius: 5px; font-size: 0.9rem; font-weight: 500;
                    transition: transform 0.1s;
                }
                .btn-print:hover { background: #15803d; transform: scale(1.05); }
                .empty-state { padding: 40px; text-align: center; color: #94a3b8; }
            </style>
        </head>
        <body>
            <div style="max-width: 1200px; margin: 0 auto;">
                <h1>👮‍♂️ Certificate Requests Dashboard</h1>
                <div class="card">
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Candidate Name</th>
                                <th>Score</th>
                                <th>Date Submitted</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>`;
        
        if (result.rows.length === 0) {
            html += `<tr><td colspan="5" class="empty-state">No pending requests found.</td></tr>`;
        } else {
            result.rows.forEach(row => {
                html += `<tr>
                    <td>#${row.id}</td>
                    <td style="font-weight:600; color:#1e293b;">${row.username}</td>
                    <td class="${row.score >= 500 ? 'score-high' : 'score-low'}">${row.score}</td>
                    <td>${new Date(row.request_date).toLocaleDateString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td><a href="/admin/generate-cert/${row.id}" target="_blank" class="btn-print">🖨️ Print Certificate</a></td>
                </tr>`;
            });
        }
        
        html += `</tbody></table></div></div></body></html>`;
        res.send(html);

    } catch (err) {
        res.status(500).send("Error loading admin panel: " + err.message);
    }
});

// ==========================================
// 7. HIGH-RES CERTIFICATE GENERATOR (CANVAS)
// ==========================================
app.get('/admin/generate-cert/:id', async (req, res) => {
    try {
        const id = req.params.id;
        
        // 1. Get Data from DB
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests WHERE id = $1', [id]);
        client.release();

        if (result.rows.length === 0) return res.status(404).send("Certificate not found.");

        const { username, score, request_date } = result.rows[0];
        const dateStr = new Date(request_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        // 2. Setup Canvas (A4 Landscape: 2000x1414 pixels)
        const width = 2000; 
        const height = 1414;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // 3. Load Template Background
        const templatePath = path.join(__dirname, 'public', 'certificate-template.png');
        try {
            const image = await loadImage(templatePath);
            ctx.drawImage(image, 0, 0, width, height);
        } catch (e) {
            console.warn("⚠️ Warning: Template image missing. Using white background.");
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0,0, width, height);
        }

        // 4. Start Drawing Text
        ctx.textAlign = 'center';

        // --- TITLE SECTION ---
        // ប្រើ 'CustomCertFont' ដែលបាន register ខាងលើ
        // ប្រសិនបើ font.ttf អត់មាន វាអាចនឹងប្រើ default font
        
        ctx.fillStyle = '#1e3a8a'; // Royal Blue
        ctx.font = `bold 110px "${fontName}", serif`; 
        ctx.fillText("CERTIFICATE", width / 2, 350);
        
        ctx.fillStyle = '#ca8a04'; // Gold
        ctx.font = `bold 45px "${fontName}", sans-serif`; 
        ctx.letterSpacing = "15px"; 
        ctx.fillText("OF EXCELLENCE", width / 2, 430);
        ctx.letterSpacing = "0px"; 

        // --- PRESENTATION TEXT ---
        ctx.fillStyle = '#64748b'; // Slate
        ctx.font = `italic 40px "${fontName}", serif`; 
        ctx.fillText("This prestigious award is presented to", width / 2, 560); 

        // --- RECIPIENT NAME (HIGHLIGHT) ---
        ctx.save();
        // Create Gold Gradient
        const gradient = ctx.createLinearGradient(width/2 - 300, 0, width/2 + 300, 0);
        gradient.addColorStop(0, "#854d0e");    // Dark Bronze
        gradient.addColorStop(0.2, "#facc15");  // Bright Gold
        gradient.addColorStop(0.5, "#ffffaa");  // Shine
        gradient.addColorStop(0.8, "#facc15");  // Bright Gold
        gradient.addColorStop(1, "#854d0e");    // Dark Bronze
        
        ctx.fillStyle = gradient;
        
        // Add Shadow for Depth
        ctx.shadowColor = "rgba(0, 0, 0, 0.2)"; 
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 5;

        // Draw Name
        ctx.font = `bold 160px "${fontName}", sans-serif`; 
        ctx.fillText(username.toUpperCase(), width / 2, 720);
        ctx.restore(); 

        // Underline
        ctx.beginPath();
        ctx.moveTo(width / 2 - 350, 760);
        ctx.lineTo(width / 2 + 350, 760);
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#ca8a04';
        ctx.stroke();

        // --- BODY TEXT (ENGLISH) ---
        ctx.fillStyle = '#334155'; // Dark Grey
        ctx.font = `40px "${fontName}", serif`;
        
        // Manual Text Wrapping for Perfect Alignment
        ctx.fillText("In recognition of your outstanding intellectual acuity", width / 2, 880);
        ctx.fillText("and exceptional performance demonstrated in the", width / 2, 940);
        ctx.fillText("Advanced Mathematics Challenge.", width / 2, 1000);

        // --- SCORE DISPLAY ---
        ctx.fillStyle = '#dc2626'; // Red
        ctx.font = `bold 60px "${fontName}", sans-serif`;
        ctx.fillText(`ACHIEVEMENT SCORE: ${score}`, width / 2, 1120);

        // --- FOOTER SECTION ---
        const footerY = 1280;
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#0f172a';

        // -> LEFT: ADMIN SIGNATURE
        const leftX = 500;
        ctx.beginPath(); ctx.moveTo(leftX - 150, footerY); ctx.lineTo(leftX + 150, footerY); ctx.stroke();
        
        ctx.fillStyle = '#0f172a';
        ctx.font = `bold 30px "${fontName}", sans-serif`; 
        ctx.fillText("CHHEANG SINHSINH", leftX, footerY + 50); 
        
        ctx.fillStyle = '#64748b';
        ctx.font = `italic 25px "${fontName}", serif`;
        ctx.fillText("Founder & Administrator", leftX, footerY + 90); 

        // -> CENTER: DATE
        ctx.fillStyle = '#475569';
        ctx.font = `bold 30px "${fontName}", sans-serif`;
        ctx.fillText(dateStr, width / 2, footerY + 50);

        // -> RIGHT: WEBSITE (SPECIFIC REQUEST)
        const rightX = 1500;
        ctx.beginPath(); ctx.moveTo(rightX - 150, footerY); ctx.lineTo(rightX + 150, footerY); ctx.stroke();
        
        ctx.fillStyle = '#2563eb'; // Blue Link Color
        ctx.font = `bold 35px "${fontName}", sans-serif`; 
        // ដាក់អក្សរតាមសំណើ
        ctx.fillText("website : braintest.fun", rightX, footerY + 50); 
        
        ctx.fillStyle = '#64748b';
        ctx.font = `italic 25px "${fontName}", serif`;
        ctx.fillText("Official Platform", rightX, footerY + 90); 

        // 5. Final Output
        const buffer = canvas.toBuffer('image/png');
        res.set('Content-Type', 'image/png');
        res.send(buffer);

    } catch (err) {
        console.error("❌ Certificate Generation Failed:", err);
        res.status(500).send("Server Error: Failed to generate certificate.");
    }
});

// ==========================================
// 8. SERVER STARTUP
// ==========================================
async function startServer() {
    // Check Environment Variables
    if (!process.env.DATABASE_URL) {
        console.error("🛑 CRITICAL ERROR: DATABASE_URL is missing in .env file.");
        process.exit(1);
    }
    if (!process.env.GEMINI_API_KEY) {
        console.warn("⚠️ WARNING: GEMINI_API_KEY is missing. AI features will fail.");
    }

    // Initialize DB
    await initializeDatabase();

    // Start Listen
    app.listen(port, () => {
        console.log(`========================================`);
        console.log(`🚀 SERVER RUNNING ON PORT ${port}`);
        console.log(`🤖 AI Model: ${MODEL_NAME}`);
        console.log(`🔗 Admin Panel: http://localhost:${port}/admin/requests`);
        console.log(`========================================`);
    });
}

startServer();
