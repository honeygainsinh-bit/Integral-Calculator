  require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg'); 
// នាំយក Canvas មកប្រើ
const { registerFont, createCanvas, loadImage } = require('canvas');

const app = express();
const port = process.env.PORT || 3000;

// ==========================================
// 1. SETUP & CONFIGURATION
// ==========================================
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

// ចុះឈ្មោះ Font ខ្មែរ (Moul)
try {
    const fontPath = path.join(__dirname, 'public', 'Moul.ttf');
    registerFont(fontPath, { family: 'Moul' });
    console.log("✅ Font 'Moul' loaded successfully.");
} catch (e) {
    console.warn("⚠️ Warning: រកមិនឃើញ Font 'Moul.ttf' ក្នុង folder public។");
}

const MODEL_NAME = "gemini-2.5-flash"; 

// Tracking Variables
let totalPlays = 0;           
const uniqueVisitors = new Set();

// Middleware: Log Request
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString('km-KH')}] 📡 ${req.method} ${req.path}`);
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
        console.error("❌ Database initialization error:", err.message);
    }
}

// ==========================================
// 3. RATE LIMITER
// ==========================================
const limiter = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, 
    max: 10, 
    message: { error: "Rate limit exceeded", message: "⚠️ អស់ចំនួនកំណត់ហើយ (10ដង/ថ្ងៃ)!" },
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
            <h1 style="color: #22c55e;">Server is Online 🟢</h1>
            <p>Math Quiz Pro Backend</p>
            <div style="margin-top: 20px; padding: 10px; background: #f0f9ff; display: inline-block; border-radius: 8px;">
                <a href="/admin/requests" style="text-decoration: none; color: #0284c7; font-weight: bold;">👮‍♂️ ចូលមើលសំណើសុំលិខិតសរសើរ (Admin)</a>
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

// ✅ API ទទួលសំណើ (អនុញ្ញាតឱ្យ Score 0)
app.post('/api/submit-request', async (req, res) => {
    const { username, score } = req.body;
    
    // FIX: Score អាចស្មើ 0 បាន
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

// ✅ Admin HTML View
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
            <title>Admin - សំណើសុំលិខិតសរសើរ</title>
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
            <h1>👮‍♂️ Admin Panel - សំណើសុំលិខិតសរសើរ</h1>
            <table>
                <thead>
                    <tr>
                        <th>#ID</th>
                        <th>ឈ្មោះ (Username)</th>
                        <th>ពិន្ទុ (Score)</th>
                        <th>កាលបរិច្ឆេទ</th>
                        <th>សកម្មភាព (Action)</th>
                    </tr>
                </thead>
                <tbody>`;

        if (result.rows.length === 0) {
            html += `<tr><td colspan="5" style="text-align:center; padding: 20px; color: gray;">មិនទាន់មានសំណើថ្មីៗទេ។</td></tr>`;
        } else {
            result.rows.forEach(row => {
                const isHighScore = row.score >= 500;
                html += `
                    <tr>
                        <td>${row.id}</td>
                        <td style="font-weight:bold; color: #334155;">${row.username}</td>
                        <td style="color:${isHighScore ? '#16a34a' : '#dc2626'}; font-weight:bold;">${row.score}</td>
                        <td>${new Date(row.request_date).toLocaleDateString('km-KH')}</td>
                        <td>
                            <a href="/admin/generate-cert/${row.id}" target="_blank" class="btn-gen">🖨️ បង្កើតលិខិត</a>
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
// 7. GENERATE CERTIFICATE LOGIC (FINAL STABILITY VERSION)
// ==========================================
app.get('/admin/generate-cert/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests WHERE id = $1', [id]);
        client.release();

        if (result.rows.length === 0) return res.status(404).send("Not Found");

        const { username, score, request_date } = result.rows[0];

        // --- English Date Formatting ---
        const dateObj = new Date(request_date);
        const issuedDate = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        // --- Setup Canvas (2000x1414) ---
        const width = 2000; 
        const height = 1414;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // ==========================================
        // 🎨 STEP 1: DRAW BACKGROUND & BORDER
        // ==========================================
        
        ctx.fillStyle = '#0f172a'; // Deep Navy Blue
        ctx.fillRect(0, 0, width, height);

        const goldColor = '#fcd34d'; 
        const darkGold = '#b45309'; 

        ctx.strokeStyle = goldColor;
        ctx.lineWidth = 20;
        ctx.strokeRect(50, 50, width - 100, height - 100);

        ctx.strokeStyle = darkGold;
        ctx.lineWidth = 5;
        ctx.strokeRect(80, 80, width - 160, height - 160);

        // ==========================================
        // 🎨 STEP 2: TEXT RENDERING (STABILITY FOCUS)
        // ==========================================
        
        ctx.textAlign = 'center';

        // 2.1 Main Title (No Shadow)
        ctx.font = '100px "Moul"';
        ctx.fillStyle = goldColor; 
        ctx.fillText("CERTIFICATE OF ACHIEVEMENT", width / 2, 300);

        // 2.2 Introductory Line
        ctx.font = '40px "Arial", sans-serif'; 
        ctx.fillStyle = '#cbd5e1'; 
        ctx.fillText("IS GRANTED IN RECOGNITION OF EXEMPLARY DEDICATION TO", width / 2, 450); 

        // 2.3 Recipient Name (Solid White for Maximum Visibility)
        ctx.font = 'bold 160px "Arial", sans-serif'; // Use reliable Arial/Sans-serif and BOLD
        ctx.fillStyle = '#FFFFFF'; // FORCED PURE WHITE COLOR
        ctx.fillText(username.toUpperCase(), width / 2, 650);
        
        // 2.4 ELABORATED Achievement Body Text (White)
        ctx.fillStyle = '#ffffff'; 
        ctx.font = '45px "Arial", sans-serif'; 
        const lineHeight = 75; 
        let startY = 850; 

        ctx.fillText("FOR EXHIBITING OUTSTANDING MASTERY AND UNWAVERING COMMITMENT", width / 2, startY);
        ctx.fillText("ACHIEVED THROUGH RIGOROUS EFFORT IN THE MATRICULATION LEVEL MATHEMATICS QUIZ.", width / 2, startY + lineHeight);
        
        ctx.font = 'italic 45px "Arial", sans-serif'; 
        ctx.fillStyle = '#00BFFF'; 
        ctx.fillText("THIS CERTIFICATE SERVES AS A TESTAMENT TO YOUR INTELLECTUAL PROWESS AND TRIUMPH.", width / 2, startY + (lineHeight * 2));
        
        // 2.5 Score Display
        ctx.font = 'bold 55px "Arial", sans-serif'; 
        ctx.fillStyle = '#FF4500'; 
        ctx.fillText(`TOTAL FINAL SCORE: ${score}`, width / 2, startY + (lineHeight * 3) + 80); 

        // ==========================================
        // 🎨 STEP 3: FOOTER (No Change to Footer Layout)
        // ==========================================

        const signatureLineY = 1170; 
        ctx.strokeStyle = '#94a3b8'; 
        ctx.lineWidth = 2;

        // 3.1 Date/Signature Placeholder (Left)
        ctx.textAlign = 'left';
        ctx.fillStyle = '#cbd5e1'; 
        
        ctx.beginPath();
        ctx.moveTo(150, signatureLineY); 
        ctx.lineTo(550, signatureLineY); 
        ctx.stroke();

        ctx.font = '30px "Arial", sans-serif'; 
        ctx.fillText(`Awarded on: ${issuedDate}`, 150, 1200); 
        
        ctx.font = '28px "Arial", sans-serif'; 
        ctx.fillText(`Signature / Stamp Placeholder`, 150, 1240); 

        // 3.2 Status/Verification Placeholder (Right)
        ctx.textAlign = 'right';
        ctx.fillStyle = '#22c55e'; 
        
        ctx.beginPath();
        ctx.moveTo(width - 550, signatureLineY); 
        ctx.lineTo(width - 150, signatureLineY); 
        ctx.stroke();

        ctx.font = 'bold 40px "Arial"';
        ctx.fillText("STATUS: VERIFIED", width - 150, 1200);
        
        ctx.fillStyle = '#cbd5e1'; 
        ctx.font = '28px "Arial", sans-serif'; 
        ctx.fillText(`Verification Key / Seal Area`, width - 150, 1240); 


        // 3.3 Website (Bottom Center)
        ctx.textAlign = 'center';
        ctx.font = 'bold 35px "Courier New", sans-serif';
        ctx.fillStyle = goldColor; 
        
        ctx.beginPath();
        ctx.moveTo(width / 2 - 120, 1370); 
        ctx.lineTo(width / 2 + 120, 1370); 
        ctx.strokeStyle = goldColor; 
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.fillText("braintest.fun", width / 2, 1350); 

        // Output Image (PNG)
        const buffer = canvas.toBuffer('image/png');
        res.set('Content-Type', 'image/png');
        res.send(buffer);

    } catch (err) {
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
