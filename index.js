require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg'); 
const { registerFont, createCanvas, loadImage } = require('canvas');

const app = express();
const port = process.env.PORT || 3000;

// ==========================================
// 1. SETUP & CONFIGURATION
// ==========================================
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

// Load Custom Font (Optional - Will fallback to System Fonts if fails)
try {
    const fontPath = path.join(__dirname, 'public', 'Moul.ttf');
    registerFont(fontPath, { family: 'Moul' });
    console.log("✅ Font 'Moul' loaded.");
} catch (e) {
    console.warn("⚠️ Note: Custom font not found, using system fonts.");
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

        console.log("✅ Database initialized & Connected.");
        client.release();
    } catch (err) {
        console.error("❌ Database initialization error:", err.message);
    }
}

// ==========================================
// 3. RATE LIMITER
// ==========================================
const limiter = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, // 8 hours
    max: 10, 
    message: { error: "Rate limit exceeded", message: "⚠️ You have reached the limit (10 times/day)." },
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
            <h1 style="color: #22c55e;">System Online 🟢</h1>
            <p>BrainTest Math Quiz Backend</p>
            <div style="margin-top: 20px;">
                <a href="/admin/requests" style="text-decoration: none; color: #0284c7; font-weight: bold; border: 1px solid #0284c7; padding: 10px 20px; border-radius: 5px;">👮‍♂️ Go to Admin Panel</a>
            </div>
        </div>
    `);
});

// ==========================================
// 5. API ROUTES
// ==========================================

app.get('/stats', (req, res) => {
    res.json({ total_plays: totalPlays, unique_players: uniqueVisitors.size });
});

// Generate Math Problem
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

// Submit Score
app.post('/api/leaderboard/submit', async (req, res) => {
    const { username, score, difficulty } = req.body;
    if (!username || typeof score !== 'number') return res.status(400).json({ success: false, message: "Invalid Data" });
    try {
        const client = await pool.connect();
        await client.query('INSERT INTO leaderboard(username, score, difficulty) VALUES($1, $2, $3)', 
            [username.trim().substring(0, 25), score, difficulty]);
        client.release();
        res.status(201).json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// Get Leaderboard
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

// Submit Certificate Request
app.post('/api/submit-request', async (req, res) => {
    const { username, score } = req.body;
    if (!username || score === undefined) return res.status(400).json({ success: false });
    try {
        const client = await pool.connect();
        await client.query('INSERT INTO certificate_requests (username, score, request_date) VALUES ($1, $2, NOW())', [username, score]);
        client.release();
        console.log(`📩 New Request: ${username} (${score})`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// Admin Panel View
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
            <title>Admin - Certificate Dashboard</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; background: #f8fafc; color: #1e293b; }
                h1 { color: #1e3a8a; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
                table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border-radius: 8px; overflow: hidden; margin-top: 20px; }
                th, td { padding: 15px; border-bottom: 1px solid #e2e8f0; text-align: left; }
                th { background: #3b82f6; color: white; text-transform: uppercase; font-size: 0.85rem; letter-spacing: 0.05em; }
                tr:hover { background: #f1f5f9; }
                .score-high { color: #16a34a; font-weight: bold; }
                .score-low { color: #dc2626; font-weight: bold; }
                .btn-gen { 
                    background: linear-gradient(to right, #2563eb, #1d4ed8); 
                    color: white; text-decoration: none; 
                    padding: 8px 16px; border-radius: 6px; font-weight: 600; font-size: 0.9rem;
                    display: inline-block; transition: transform 0.1s;
                }
                .btn-gen:hover { transform: translateY(-1px); box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            </style>
        </head>
        <body>
            <h1>👮‍♂️ Certificate Requests Panel</h1>
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Candidate Name</th>
                        <th>Score</th>
                        <th>Date Requested</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>`;

        if (result.rows.length === 0) {
            html += `<tr><td colspan="5" style="text-align:center; padding: 30px; color: #94a3b8;">No pending requests found.</td></tr>`;
        } else {
            result.rows.forEach(row => {
                const scoreClass = row.score >= 500 ? 'score-high' : 'score-low';
                html += `
                    <tr>
                        <td>#${row.id}</td>
                        <td style="font-weight:600;">${row.username}</td>
                        <td class="${scoreClass}">${row.score}</td>
                        <td>${new Date(row.request_date).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})}</td>
                        <td>
                            <a href="/admin/generate-cert/${row.id}" target="_blank" class="btn-gen">🖨️ Print Certificate</a>
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
// 6. CERTIFICATE GENERATION LOGIC (High-Res Print Ready)
// ==========================================
app.get('/admin/generate-cert/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests WHERE id = $1', [id]);
        client.release();

        if (result.rows.length === 0) return res.status(404).send("Not Found");

        const { username, score, request_date } = result.rows[0];

        // Format Date (e.g., December 04, 2025)
        const dateStr = new Date(request_date).toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });

        // Canvas Setup (A4 Landscape High Res)
        const width = 2000; 
        const height = 1414;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Load Template
        const templatePath = path.join(__dirname, 'public', 'certificate-template.png');
        try {
            const image = await loadImage(templatePath);
            ctx.drawImage(image, 0, 0, width, height);
        } catch (e) {
            // Fallback if image is missing (Just a white background)
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0,0, width, height);
            console.error("⚠️ Template image not found.");
        }

        ctx.textAlign = 'center';

        // --- 1. HEADER (Certificate of Excellence) ---
        ctx.font = 'bold 95px "Times New Roman", serif'; 
        ctx.fillStyle = '#0a2558'; // Deep Royal Blue
        ctx.fillText("CERTIFICATE", width / 2, 430);
        
        ctx.font = '55px "Times New Roman", serif';
        ctx.letterSpacing = "15px"; 
        ctx.fillText("OF EXCELLENCE", width / 2, 510);
        ctx.letterSpacing = "0px"; // Reset

        // --- 2. PRESENTATION LINE ---
        ctx.font = 'italic 32px "Times New Roman", serif'; 
        ctx.fillStyle = '#64748b'; 
        ctx.fillText("This prestigious award is hereby presented to", width / 2, 620); 

        // --- 3. RECIPIENT NAME (Gold Gradient & Glow) ---
        ctx.save(); 
        
        // Define Gold Gradient
        const gradient = ctx.createLinearGradient(width/2 - 300, 0, width/2 + 300, 0);
        gradient.addColorStop(0, "#854d0e");    // Dark Bronze
        gradient.addColorStop(0.2, "#facc15");  // Bright Yellow Gold
        gradient.addColorStop(0.5, "#fef08a");  // White/Pale Gold (Shine)
        gradient.addColorStop(0.8, "#facc15");  // Bright Yellow Gold
        gradient.addColorStop(1, "#854d0e");    // Dark Bronze

        // Add Shadow/Glow
        ctx.shadowColor = "rgba(0, 0, 0, 0.2)"; 
        ctx.shadowBlur = 15;
        ctx.shadowOffsetY = 5;
        
        // Render Name
        ctx.font = 'bold 140px "Arial", sans-serif'; 
        ctx.fillStyle = gradient;
        ctx.fillText(username.toUpperCase(), width / 2, 770);
        
        ctx.restore(); 

        // --- 4. LAUDATORY TEXT (Professional Wording) ---
        ctx.fillStyle = '#334155'; // Dark Slate
        ctx.font = '34px "Times New Roman", serif'; 
        const lineHeight = 58; 
        let startY = 900;

        // Line 1
        ctx.fillText("In recognition of your outstanding intellectual acuity and exceptional performance", width / 2, startY);
        // Line 2
        ctx.fillText("demonstrated in the Advanced Mathematics Challenge. Your ability to solve complex", width / 2, startY + lineHeight);
        // Line 3
        ctx.fillText("problems with precision serves as a testament to your analytical potential.", width / 2, startY + (lineHeight * 2));
        
        // Score Line
        ctx.font = 'bold 42px "Arial", sans-serif';
        ctx.fillStyle = '#b91c1c'; // Deep Red
        ctx.fillText(`ACHIEVEMENT SCORE: ${score}`, width / 2, startY + (lineHeight * 3) + 25);

        // --- 5. FOOTER & SIGNATURES ---
        const footerY = 1260;
        ctx.strokeStyle = '#1e293b'; 
        ctx.lineWidth = 3;

        // --- LEFT: ADMIN ---
        const leftX = 500;
        ctx.beginPath(); ctx.moveTo(leftX - 180, footerY); ctx.lineTo(leftX + 180, footerY); ctx.stroke();
        
        ctx.font = 'bold 28px "Arial", sans-serif'; 
        ctx.fillStyle = '#0f172a';
        ctx.fillText("CHHEANG SINHSINH", leftX, footerY + 45); 

        ctx.font = 'italic 24px "Times New Roman", serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText("Founder & Administrator", leftX, footerY + 80); 

        // --- CENTER: DATE ---
        ctx.font = 'bold 26px "Arial", sans-serif';
        ctx.fillStyle = '#94a3b8'; // Lighter grey for date
        ctx.fillText(dateStr, width / 2, footerY + 45); 

        // --- RIGHT: WEBSITE ---
        const rightX = 1500;
        ctx.beginPath(); ctx.moveTo(rightX - 180, footerY); ctx.lineTo(rightX + 180, footerY); ctx.stroke();
        
        ctx.font = 'bold 28px "Arial", sans-serif'; 
        ctx.fillStyle = '#0f172a';
        ctx.fillText("www.braintest.fun", rightX, footerY + 45); 

        ctx.font = 'italic 24px "Times New Roman", serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText("Official Platform", rightX, footerY + 80); 

        // Final Buffer Generation
        const buffer = canvas.toBuffer('image/png');
        res.set('Content-Type', 'image/png');
        res.send(buffer);

    } catch (err) {
        console.error("Certificate Generation Error:", err);
        res.status(500).send("Failed to generate certificate. Please check server logs.");
    }
});

// ==========================================
// 7. START SERVER
// ==========================================
async function startServer() {
    if (!process.env.DATABASE_URL) {
        console.error("🛑 CRITICAL ERROR: DATABASE_URL is missing in .env file.");
        return;
    }
    await initializeDatabase();
    app.listen(port, () => {
        console.log(`========================================`);
        console.log(`🚀 SERVER RUNNING ON PORT ${port}`);
        console.log(`🔗 Admin Panel: http://localhost:${port}/admin/requests`);
        console.log(`========================================`);
    });
}

startServer();
