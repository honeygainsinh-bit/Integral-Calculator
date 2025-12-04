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

// Load Font
try {
    const fontPath = path.join(__dirname, 'public', 'Moul.ttf');
    registerFont(fontPath, { family: 'Moul' });
} catch (e) {
    console.warn("⚠️ Warning: Font 'Moul.ttf' not found.");
}

const MODEL_NAME = "gemini-2.5-flash"; 

// Tracking
let totalPlays = 0;           
const uniqueVisitors = new Set();

app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString('km-KH')}] 📡 ${req.method} ${req.path}`);
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
// 4. STATIC FILES
// ==========================================
app.use(express.static(path.join(__dirname, 'public'))); 

app.get('/', (req, res) => {
    res.status(200).send(`
        <div style="font-family: sans-serif; text-align: center; padding-top: 50px;">
            <h1 style="color: #22c55e;">Server is Online 🟢</h1>
            <p>Math Quiz Pro Backend</p>
            <div style="margin-top: 20px; padding: 10px; background: #f0f9ff; display: inline-block; border-radius: 8px;">
                <a href="/admin/requests" style="text-decoration: none; color: #0284c7; font-weight: bold;">👮‍♂️ Admin Panel</a>
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
    if (!username || typeof score !== 'number') return res.status(400).json({ success: false });
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
            <title>Admin - Certificate Requests</title>
            <style>
                body { font-family: sans-serif; padding: 20px; background: #f1f5f9; }
                table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; }
                th, td { padding: 15px; border-bottom: 1px solid #e2e8f0; text-align: left; }
                th { background: #3b82f6; color: white; }
                .btn-gen { background: #2563eb; color: white; padding: 8px 12px; border-radius: 6px; text-decoration: none; }
            </style>
        </head>
        <body>
            <h1>👮‍♂️ Admin Panel</h1>
            <table>
                <thead><tr><th>ID</th><th>Name</th><th>Score</th><th>Date</th><th>Action</th></tr></thead>
                <tbody>`;
        
        result.rows.forEach(row => {
            html += `<tr>
                <td>${row.id}</td>
                <td><b>${row.username}</b></td>
                <td>${row.score}</td>
                <td>${new Date(row.request_date).toLocaleDateString('en-US')}</td>
                <td><a href="/admin/generate-cert/${row.id}" target="_blank" class="btn-gen">Generate Certificate</a></td>
            </tr>`;
        });
        html += `</tbody></table></body></html>`;
        res.send(html);
    } catch (err) {
        res.status(500).send("Error");
    }
});

// ==========================================
// 7. GENERATE CERTIFICATE (PREMIUM & LAUDATORY)
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

        const width = 2000; 
        const height = 1414;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        const templatePath = path.join(__dirname, 'public', 'certificate-template.png');
        try {
            const image = await loadImage(templatePath);
            ctx.drawImage(image, 0, 0, width, height);
        } catch (e) {
            return res.status(500).send("Error: 'certificate-template.png' not found.");
        }

        ctx.textAlign = 'center';

        // 1. HEADER (Excellence)
        ctx.font = 'bold 90px "Times New Roman", serif'; 
        ctx.fillStyle = '#1e3a8a'; 
        ctx.fillText("CERTIFICATE OF EXCELLENCE", width / 2, 450); // Changed to Excellence

        ctx.font = 'italic 30px "Times New Roman", serif';
        ctx.fillStyle = '#64748b'; 
        ctx.fillText("IS HEREBY PROUDLY PRESENTED TO", width / 2, 530); 

        // 2. NAME (Gold & Glow)
        ctx.save();
        const gradient = ctx.createLinearGradient(width/2 - 300, 0, width/2 + 300, 0);
        gradient.addColorStop(0, "#b45309");   
        gradient.addColorStop(0.5, "#fcd34d"); 
        gradient.addColorStop(1, "#b45309");   

        ctx.shadowColor = "rgba(0,0,0,0.3)"; 
        ctx.shadowBlur = 20;
        
        ctx.font = 'bold 130px "Arial", sans-serif'; 
        ctx.fillStyle = gradient;
        ctx.fillText(username.toUpperCase(), width / 2, 700);
        ctx.restore();

        // 3. LAUDATORY BODY TEXT (Longer & More Praising)
        ctx.fillStyle = '#334155'; 
        ctx.font = '32px "Times New Roman", serif'; 
        const lineHeight = 55; 
        let startY = 850;

        // Line 1
        ctx.fillText("In recognition of your outstanding performance and intellectual acuity demonstrated", width / 2, startY);
        // Line 2
        ctx.fillText("in the Advanced Mathematics Challenge. Your ability to solve complex problems with", width / 2, startY + lineHeight);
        // Line 3
        ctx.fillText("speed and precision serves as a testament to your hard work and analytical potential.", width / 2, startY + (lineHeight * 2));
        // Line 4 (Future Wish)
        ctx.fillText("We commend your unwavering dedication to learning and academic excellence.", width / 2, startY + (lineHeight * 3));

        // 4. SCORE
        ctx.font = 'bold 40px "Arial", sans-serif';
        ctx.fillStyle = '#b91c1c'; 
        ctx.fillText(`ACHIEVEMENT SCORE: ${score}`, width / 2, startY + (lineHeight * 4) + 20);

        // 5. FOOTER
        const footerY = 1250;
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 3;

        // Left: Admin
        const leftX = 500;
        ctx.beginPath(); ctx.moveTo(leftX - 180, footerY); ctx.lineTo(leftX + 180, footerY); ctx.stroke();
        ctx.font = 'bold 28px "Arial", sans-serif'; ctx.fillStyle = '#0f172a';
        ctx.fillText("CHHEANG SINHSINH", leftX, footerY + 40);
        ctx.font = 'italic 24px "Times New Roman", serif'; ctx.fillStyle = '#64748b';
        ctx.fillText("Founder & Administrator", leftX, footerY + 75);

        // Center: Date
        ctx.font = 'bold 26px "Arial", sans-serif'; ctx.fillStyle = '#94a3b8';
        ctx.fillText(dateStr, width / 2, footerY + 40);

        // Right: Website
        const rightX = 1500;
        ctx.beginPath(); ctx.moveTo(rightX - 180, footerY); ctx.lineTo(rightX + 180, footerY); ctx.stroke();
        ctx.font = 'bold 28px "Arial", sans-serif'; ctx.fillStyle = '#0f172a';
        ctx.fillText("www.braintest.fun", rightX, footerY + 40);
        ctx.font = 'italic 24px "Times New Roman", serif'; ctx.fillStyle = '#64748b';
        ctx.fillText("Official Platform", rightX, footerY + 75);

        const buffer = canvas.toBuffer('image/png');
        res.set('Content-Type', 'image/png');
        res.send(buffer);

    } catch (err) {
        console.error("Gen Cert Error:", err);
        res.status(500).send("Failed to generate certificate.");
    }
});

async function startServer() {
    if (!process.env.DATABASE_URL) {
        console.error("🛑 DATABASE_URL missing.");
        return;
    }
    await initializeDatabase();
    app.listen(port, () => {
        console.log(`🚀 Server running on port ${port}`);
    });
}

startServer();
