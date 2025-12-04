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

// Load Custom Font (ប្រសិនបើមាន Moul.ttf នៅក្នុង folder public)
try {
    const fontPath = path.join(__dirname, 'public', 'Moul.ttf');
    registerFont(fontPath, { family: 'Moul' });
    console.log("✅ Font 'Moul' loaded.");
} catch (e) {
    console.warn("⚠️ Custom font not found. Using system standard fonts.");
}

const MODEL_NAME = "gemini-1.5-flash"; 

// Tracking Variables
let totalPlays = 0;           
const uniqueVisitors = new Set();

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

        console.log("✅ Database initialized & Connected.");
        client.release();
    } catch (err) {
        console.error("❌ Database initialization error:", err.message);
    }
}

// ==========================================
// 3. RATE LIMITER & API ROUTES
// ==========================================
const limiter = rateLimit({
    windowMs: 8 * 60 * 60 * 1000, 
    max: 10, 
    keyGenerator: (req) => req.ip,
    skip: (req) => req.ip === process.env.OWNER_IP
});

app.use(express.static(path.join(__dirname, 'public'))); 

app.get('/', (req, res) => {
    res.send(`<h1 style="text-align:center; margin-top:50px;">BrainTest Backend Online 🟢</h1>`);
});

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
        res.status(500).json({ error: "AI Error" });
    }
});

app.post('/api/leaderboard/submit', async (req, res) => {
    const { username, score, difficulty } = req.body;
    try {
        const client = await pool.connect();
        await client.query('INSERT INTO leaderboard(username, score, difficulty) VALUES($1, $2, $3)', [username, score, difficulty]);
        client.release();
        res.status(201).json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/leaderboard/top', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT username, score, difficulty FROM leaderboard ORDER BY score DESC LIMIT 100');
        client.release();
        res.json(result.rows);
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/submit-request', async (req, res) => {
    const { username, score } = req.body;
    try {
        const client = await pool.connect();
        await client.query('INSERT INTO certificate_requests (username, score, request_date) VALUES ($1, $2, NOW())', [username, score]);
        client.release();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// Admin Panel
app.get('/admin/requests', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM certificate_requests ORDER BY request_date DESC LIMIT 50');
        client.release();
        let html = `<html><body style="font-family:sans-serif; padding:20px;"><h1>Certificate Requests</h1><table border="1" cellpadding="10" style="border-collapse:collapse; width:100%;"><tr><th>ID</th><th>Name</th><th>Score</th><th>Action</th></tr>`;
        result.rows.forEach(row => {
            html += `<tr><td>${row.id}</td><td>${row.username}</td><td>${row.score}</td><td><a href="/admin/generate-cert/${row.id}" target="_blank">🖨️ Print</a></td></tr>`;
        });
        html += `</table></body></html>`;
        res.send(html);
    } catch (err) { res.status(500).send("Error"); }
});

// ==========================================
// 4. CERTIFICATE GENERATION (FIXED FONTS)
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

        // Canvas Setup (2000x1414)
        const width = 2000; 
        const height = 1414;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Background
        const templatePath = path.join(__dirname, 'public', 'certificate-template.png');
        try {
            const image = await loadImage(templatePath);
            ctx.drawImage(image, 0, 0, width, height);
        } catch (e) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0,0, width, height);
        }

        ctx.textAlign = 'center';

        // NOTE: Using 'serif' and 'sans-serif' ensures it works on Linux/Render
        
        // --- 1. TITLE ---
        ctx.fillStyle = '#1e3a8a'; // Blue
        ctx.font = 'bold 110px serif'; // Use generic serif
        ctx.fillText("CERTIFICATE", width / 2, 350);
        
        ctx.fillStyle = '#ca8a04'; // Gold
        ctx.font = 'bold 45px sans-serif'; 
        ctx.letterSpacing = "15px"; 
        ctx.fillText("OF EXCELLENCE", width / 2, 430);
        ctx.letterSpacing = "0px"; 

        // --- 2. PRESENTED TO ---
        ctx.fillStyle = '#64748b'; 
        ctx.font = 'italic 40px serif'; 
        ctx.fillText("This prestigious award is presented to", width / 2, 560); 

        // --- 3. NAME (BIG & GOLD) ---
        ctx.save(); 
        const gradient = ctx.createLinearGradient(width/2 - 300, 0, width/2 + 300, 0);
        gradient.addColorStop(0, "#854d0e"); gradient.addColorStop(0.5, "#facc15"); gradient.addColorStop(1, "#854d0e");
        ctx.fillStyle = gradient;
        ctx.shadowColor = "rgba(0,0,0,0.2)"; ctx.shadowBlur = 10; ctx.shadowOffsetY = 5;
        
        // Very important: Use 'sans-serif' for bold, clean look on Linux
        ctx.font = 'bold 160px sans-serif'; 
        ctx.fillText(username.toUpperCase(), width / 2, 720);
        ctx.restore(); 

        // Line under name
        ctx.beginPath(); ctx.moveTo(width/2 - 350, 760); ctx.lineTo(width/2 + 350, 760);
        ctx.lineWidth = 4; ctx.strokeStyle = '#ca8a04'; ctx.stroke();

        // --- 4. BODY TEXT ---
        ctx.fillStyle = '#334155';
        ctx.font = '40px serif'; // Increased size again
        const bodyText = "In recognition of your outstanding intellectual acuity and exceptional performance demonstrated in the Advanced Mathematics Challenge.";
        
        // Simple manual wrap to ensure visibility
        ctx.fillText("In recognition of your outstanding intellectual acuity", width / 2, 880);
        ctx.fillText("and exceptional performance demonstrated in the", width / 2, 940);
        ctx.fillText("Advanced Mathematics Challenge.", width / 2, 1000);

        // --- 5. SCORE ---
        ctx.font = 'bold 60px sans-serif';
        ctx.fillStyle = '#dc2626'; // Red
        ctx.fillText(`ACHIEVEMENT SCORE: ${score}`, width / 2, 1120);

        // --- 6. FOOTER ---
        const footerY = 1280;
        ctx.lineWidth = 3; ctx.strokeStyle = '#0f172a';

        // LEFT
        ctx.beginPath(); ctx.moveTo(350, footerY); ctx.lineTo(650, footerY); ctx.stroke();
        ctx.font = 'bold 30px sans-serif'; ctx.fillStyle = '#0f172a';
        ctx.fillText("CHHEANG SINHSINH", 500, footerY + 50); 
        ctx.font = 'italic 25px serif'; ctx.fillStyle = '#64748b';
        ctx.fillText("Founder & Administrator", 500, footerY + 90); 

        // CENTER DATE
        ctx.font = 'bold 30px sans-serif'; ctx.fillStyle = '#475569';
        ctx.fillText(dateStr, width / 2, footerY + 50);

        // RIGHT (WEBSITE)
        ctx.beginPath(); ctx.moveTo(1350, footerY); ctx.lineTo(1650, footerY); ctx.stroke();
        ctx.font = 'bold 35px sans-serif'; ctx.fillStyle = '#2563eb'; // Blue
        
        // *** ដាក់តាមសំណើ ***
        ctx.fillText("website : braintest.fun", 1500, footerY + 50); 
        
        ctx.font = 'italic 25px serif'; ctx.fillStyle = '#64748b';
        ctx.fillText("Official Platform", 1500, footerY + 90); 

        const buffer = canvas.toBuffer('image/png');
        res.set('Content-Type', 'image/png');
        res.send(buffer);

    } catch (err) {
        console.error("Cert Error:", err);
        res.status(500).send("Error generating certificate");
    }
});

async function startServer() {
    await initializeDatabase();
    app.listen(port, () => console.log(`Server running on port ${port}`));
}
startServer();
