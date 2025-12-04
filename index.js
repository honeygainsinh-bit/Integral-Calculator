Require('dotenv').config();
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

// Load Khmer Font (Optional backup)
try {
    const fontPath = path.join(__dirname, 'public', 'Moul.ttf');
    registerFont(fontPath, { family: 'Moul' });
} catch (e) {
    console.warn("⚠️ Warning: Font 'Moul' not found (Not needed for English Cert).");
}

const MODEL_NAME = "gemini-2.5-flash"; 

// Tracking
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

        console.log("✅ Database initialized.");
        client.release();
    } catch (err) {
        console.error("❌ Database error:", err.message);
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
            <h1 style="color: #2563eb;">Backend is Running 🚀</h1>
            <p>Math Quiz Pro - English Certificate Edition</p>
            <div style="margin-top: 20px; padding: 10px; background: #f0f9ff; display: inline-block; border-radius: 8px;">
                <a href="/admin/requests" style="text-decoration: none; color: #0284c7; font-weight: bold;">👮‍♂️ Admin Panel</a>
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
            <title>Admin - Certificate Requests</title>
            <style>
                body { font-family: sans-serif; padding: 20px; background: #f8fafc; }
                h1 { color: #1e40af; }
                table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden; }
                th, td { padding: 15px; border-bottom: 1px solid #e2e8f0; text-align: left; }
                th { background: #2563eb; color: white; }
                tr:hover { background: #eff6ff; }
                .btn-gen { 
                    background: #16a34a; color: white; padding: 8px 12px; 
                    border-radius: 6px; text-decoration: none; font-weight: bold;
                }
            </style>
        </head>
        <body>
            <h1>👮‍♂️ Certificate Management</h1>
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
                <td><a href="/admin/generate-cert/${row.id}" target="_blank" class="btn-gen">🖨️ Create Certificate</a></td>
            </tr>`;
        });
        html += `</tbody></table></body></html>`;
        res.send(html);
    } catch (err) { res.status(500).send("Error loading admin."); }
});

// ==========================================
// 7. GENERATE CERTIFICATE (PREMIUM ENGLISH DESIGN) 🏆
// ==========================================
app.get('/admin/generate-cert/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests WHERE id = $1', [id]);
        client.release();

        if (result.rows.length === 0) return res.status(404).send("Not Found");

        const { username, score, request_date } = result.rows[0];

        // --- Date Format: December 4, 2024 ---
        const dateObj = new Date(request_date);
        const englishDate = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        // --- Setup Canvas ---
        const width = 2000; 
        const height = 1414;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        const templatePath = path.join(__dirname, 'public', 'certificate-template.png');
        try {
            const image = await loadImage(templatePath);
            ctx.drawImage(image, 0, 0, width, height);
        } catch (e) {
            return res.status(500).send("Error: 'certificate-template.png' not found in public folder.");
        }

        // ==========================================
        // 🎨 DESIGN EXECUTION
        // ==========================================
        ctx.textAlign = 'center';

        // 1. HEADER (TITLE)
        ctx.font = 'bold 110px "Arial", sans-serif'; 
        ctx.fillStyle = '#1e3a8a'; // Deep Navy Blue
        ctx.fillText("CERTIFICATE", width / 2, 380); 
        
        ctx.font = 'bold 50px "Arial", sans-serif';
        ctx.fillStyle = '#b45309'; // Bronze/Gold
        ctx.letterSpacing = "10px"; // Wide spacing for elegance
        ctx.fillText("OF APPRECIATION", width / 2, 460);

        // 2. INTRODUCTION TEXT
        ctx.font = 'italic 35px "Times New Roman", serif'; 
        ctx.fillStyle = '#4b5563'; // Slate Gray
        ctx.fillText("This certificate is proudly presented to", width / 2, 560);

        // 3. RECIPIENT NAME (THE HIGHLIGHT) ✨
        // Create a Luxury Gold Gradient
        const gradient = ctx.createLinearGradient(width/2 - 400, 0, width/2 + 400, 0);
        gradient.addColorStop(0, "#854d0e");   // Dark Gold
        gradient.addColorStop(0.2, "#fde047"); // Bright Yellow Gold
        gradient.addColorStop(0.5, "#ca8a04"); // Pure Gold
        gradient.addColorStop(0.8, "#fde047"); // Bright Yellow Gold
        gradient.addColorStop(1, "#854d0e");   // Dark Gold

        // Add Deep Shadow for 3D Effect
        ctx.shadowColor = "rgba(0,0,0,0.25)";
        ctx.shadowBlur = 15;
        ctx.shadowOffsetX = 8;
        ctx.shadowOffsetY = 8;
        
        // Font: Large, Italic, Serif (Times New Roman or similar)
        ctx.font = 'bold italic 150px "Times New Roman", serif'; 
        ctx.fillStyle = gradient;
        ctx.fillText(username, width / 2, 730);

        // Reset Shadow for other text
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Decorative Underline
        ctx.beginPath();
        ctx.moveTo(width / 2 - 250, 765);
        ctx.lineTo(width / 2 + 250, 765);
        ctx.strokeStyle = '#ca8a04'; 
        ctx.lineWidth = 4;
        ctx.stroke();

        // 4. SCORE DISPLAY
        ctx.font = 'bold 45px "Arial", sans-serif';
        ctx.fillStyle = '#b91c1c'; // Red Color
        ctx.fillText(`TOTAL SCORE: ${score}`, width / 2, 850);

        // 5. BODY PARAGRAPH
        ctx.fillStyle = '#1e293b'; // Dark Blue-Grey
        ctx.font = '40px "Times New Roman", serif'; 
        const lineHeight = 65; 
        let startY = 960;

        ctx.fillText("For demonstrating outstanding dedication and intellectual excellence", width / 2, startY);
        ctx.fillText("in solving advanced mathematical challenges on our platform.", width / 2, startY + lineHeight);
        ctx.fillText("Your commitment to self-improvement is truly commendable.", width / 2, startY + (lineHeight * 2));

        // ==========================================
        // ⚖️ FOOTER SECTION (Left, Center, Right)
        // ==========================================
        
        const bottomLineY = 1280;
        
        // --- LEFT: DATE ---
        const leftX = 500;
        ctx.beginPath();
        ctx.moveTo(leftX - 150, bottomLineY);
        ctx.lineTo(leftX + 150, bottomLineY);
        ctx.strokeStyle = '#64748b'; // Gray Line
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = 'bold 32px "Arial", sans-serif';
        ctx.fillStyle = '#334155';
        ctx.fillText(englishDate, leftX, bottomLineY - 15); // The Date Text
        
        ctx.font = 'italic 25px "Times New Roman", serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText("Date", leftX, bottomLineY + 35); // "Date" Label

        // --- RIGHT: ADMIN SIGNATURE (CHHEANG SINHSINH) ---
        const rightX = 1500;
        
        // Simulated Handwriting "Signature"
        ctx.font = 'italic bold 55px "Times New Roman", serif'; 
        ctx.fillStyle = '#1e40af'; // Blue Ink Color
        ctx.fillText("SinhSinh", rightX, bottomLineY - 25); 

        // The Line
        ctx.beginPath();
        ctx.moveTo(rightX - 220, bottomLineY);
        ctx.lineTo(rightX + 220, bottomLineY);
        ctx.strokeStyle = '#64748b';
        ctx.stroke();

        // Printed Name
        ctx.font = 'bold 32px "Arial", sans-serif';
        ctx.fillStyle = '#0f172a'; // Black
        ctx.fillText("CHHEANG SINHSINH", rightX, bottomLineY + 40); 
        
        // Title
        ctx.font = '22px "Arial", sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText("Founder & Admin", rightX, bottomLineY + 70); 

        // --- CENTER: WEBSITE (POP OUT) ---
        const footerY = 1360;
        
        // Background Pill for Website
        ctx.fillStyle = "#e0f2fe"; // Very Light Blue Background
        // Draw Rounded Rectangle (Simple Rect here)
        ctx.fillRect(width/2 - 280, footerY - 45, 560, 65);

        ctx.font = 'bold 45px "Courier New", monospace'; // Monospace for Tech feel
        ctx.fillStyle = '#0284c7'; // Sky Blue Dark
        ctx.fillText("WWW.BRAINTEST.FUN", width / 2, footerY);

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
